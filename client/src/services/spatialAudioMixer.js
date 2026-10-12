import { calculateDistance, calculatePan, calculateGain } from '../utils/geometry.js';

/**
 * Web Audio API Spatial Audio Mixer
 * Manages dynamic 2D soundstage, quadratic volume attenuation, stereo panning,
 * obstacle muffling, and audio level visualization for remote WebRTC audio streams.
 */
export class SpatialAudioMixer {
  constructor() {
    this.audioCtx = null;
    // peerId -> { stream, audioEl, sourceNode, gainNode, pannerNode, analyserNode, isObstructed, micMuted, lastComputedGain, lastTargetGain, lastTargetPan }
    this.peerNodes = new Map();
    this.hearingRadius = 120;
    this.masterMuted = false;
    this.isAutoplayBlocked = false;
    this.autoplayListeners = new Set();
  }

  onAutoplayBlockedChange(cb) {
    this.autoplayListeners.add(cb);
    return () => this.autoplayListeners.delete(cb);
  }

  setAutoplayBlocked(blocked) {
    const next = Boolean(blocked);
    if (this.isAutoplayBlocked !== next) {
      this.isAutoplayBlocked = next;
      for (const cb of this.autoplayListeners) {
        cb(this.isAutoplayBlocked);
      }
    }
  }

  /**
   * Initializes or resumes the AudioContext on user interaction.
   */
  async ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('[SpatialAudio] Web Audio API is not supported in this browser.');
        return null;
      }
      this.audioCtx = new AudioContextClass();
    }

    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
        this.setAutoplayBlocked(false);
      } catch (err) {
        console.warn('[SpatialAudio] Failed to resume AudioContext:', err);
      }
    } else if (this.audioCtx.state === 'running') {
      this.setAutoplayBlocked(false);
    }

    return this.audioCtx;
  }

  /**
   * Resumes AudioContext and attempts to play all peer audio sinks.
   * Useful when browser autoplay policy blocks initial audio until a user gesture.
   */
  async resumeAllAudio() {
    await this.ensureAudioContext();

    for (const [peerId, nodeGroup] of this.peerNodes.entries()) {
      if (nodeGroup.audioEl) {
        try {
          const p = nodeGroup.audioEl.play();
          if (p !== undefined) {
            await p;
          }
        } catch (err) {
          console.warn(`[SpatialAudio] Resume playback failed for peer ${peerId}:`, err.message);
        }
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.setAutoplayBlocked(false);
    }
  }

  setHearingRadius(radius) {
    if (radius && radius > 0) {
      this.hearingRadius = radius;
    }
  }

  setMasterMute(isMuted) {
    this.masterMuted = Boolean(isMuted);
    for (const [peerId, nodeGroup] of this.peerNodes.entries()) {
      if (this.audioCtx && nodeGroup.gainNode) {
        const targetGain = this.masterMuted ? 0 : nodeGroup.lastComputedGain || 0;
        nodeGroup.gainNode.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.05);
      }
    }
  }

  /**
   * Registers a remote peer's MediaStream into the Web Audio spatial pipeline.
   */
  async addPeerStream(peerId, stream, initialLocalPos = null, initialRemotePos = null) {
    await this.ensureAudioContext();
    if (!this.audioCtx) return;

    // Clean up any existing nodes for this peer to prevent duplicate audio
    this.removePeer(peerId);

    try {
      // Workaround for Chromium WebRTC WebAudio bug:
      // In Chromium, remote MediaStreams do not emit samples into createMediaStreamSource
      // unless played by an active HTMLAudioElement.
      //
      // CRITICAL CHROME BUG FIX:
      // In Chromium, audioEl.muted = true can mute the underlying MediaStreamTrack at the
      // renderer level, silencing Web Audio API's createMediaStreamSource(stream)!
      // Therefore, we keep audioEl.muted = false, but set audioEl.volume = 0.
      // Setting volume = 0 mutes the raw element output to prevent echo/double audio,
      // while allowing Chrome's WebRTC decoder to decode audio packets for Web Audio API!
      let audioEl = null;
      if (typeof document !== 'undefined') {
        try {
          let container = document.getElementById('proxispeak-audio-sinks');
          if (!container && document.body) {
            container = document.createElement('div');
            container.id = 'proxispeak-audio-sinks';
            container.style.position = 'fixed';
            container.style.left = '-9999px';
            container.style.top = '-9999px';
            container.style.width = '0';
            container.style.height = '0';
            container.style.overflow = 'hidden';
            container.setAttribute('aria-hidden', 'true');
            document.body.appendChild(container);
          }

          audioEl = document.createElement('audio');
          audioEl.id = `remote-audio-${peerId}`;
          audioEl.srcObject = stream;
          audioEl.muted = false; // NOT muted, so track decoder stays active in Chromium
          audioEl.volume = 0;    // Zero volume prevents raw un-spatialized audio from leaking
          audioEl.playsInline = true;
          audioEl.autoplay = true;

          if (container) {
            container.appendChild(audioEl);
          }

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              console.warn(`[SpatialAudio] HTMLAudioElement play blocked for ${peerId}:`, err.message);
              if (err.name === 'NotAllowedError') {
                this.setAutoplayBlocked(true);
              }
            });
          }
        } catch (e) {
          console.warn(`[SpatialAudio] Could not create audio element anchor:`, e.message);
        }
      }

      // Compute immediate initial spatial parameters so peer is audible without waiting for render loop
      let initialGain = 1.0;
      let initialPan = 0;
      if (initialLocalPos && initialRemotePos) {
        const distance = calculateDistance(initialLocalPos, initialRemotePos);
        initialGain = calculateGain(distance, this.hearingRadius);
        initialPan = calculatePan(initialLocalPos.x, initialRemotePos.x, this.hearingRadius);
      }
      if (this.masterMuted) {
        initialGain = 0;
      }

      const sourceNode = this.audioCtx.createMediaStreamSource(stream);
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = initialGain;

      let pannerNode = null;
      if (this.audioCtx.createStereoPanner) {
        pannerNode = this.audioCtx.createStereoPanner();
        pannerNode.pan.value = initialPan;
      }

      // Analyser node for live voice visualizer / audio meter
      const analyserNode = this.audioCtx.createAnalyser();
      analyserNode.fftSize = 64;

      // Pipeline routing: Source -> Gain -> Panner (if available) -> Analyser -> Destination
      sourceNode.connect(gainNode);

      if (pannerNode) {
        gainNode.connect(pannerNode);
        pannerNode.connect(analyserNode);
      } else {
        gainNode.connect(analyserNode);
      }

      analyserNode.connect(this.audioCtx.destination);

      this.peerNodes.set(peerId, {
        stream,
        audioEl,
        sourceNode,
        gainNode,
        pannerNode,
        analyserNode,
        isObstructed: false,
        micMuted: false,
        lastComputedGain: initialGain,
        lastTargetGain: initialGain,
        lastTargetPan: initialPan
      });

      console.log(`[SpatialAudio] Spatial pipeline initialized for peer: ${peerId} (initialGain: ${initialGain})`);
    } catch (err) {
      console.error(`[SpatialAudio] Error setting up audio pipeline for peer ${peerId}:`, err);
    }
  }

  /**
   * Updates spatial parameters (gain & stereo pan) between local user and remote peer.
   * Uses AudioParam.setTargetAtTime for smooth, click-free audio transitions.
   */
  updatePeerSpatial(peerId, localPos, remotePos, isObstructed = false) {
    const nodeGroup = this.peerNodes.get(peerId);
    if (!nodeGroup || !this.audioCtx) return;

    nodeGroup.isObstructed = isObstructed;

    const distance = calculateDistance(localPos, remotePos);
    let targetGain = calculateGain(distance, this.hearingRadius);
    const targetPan = calculatePan(localPos.x, remotePos.x, this.hearingRadius);

    // If an acoustic wall or sound-blocking obstacle obstructs line of sight, muffle audio by 85%
    if (isObstructed && targetGain > 0) {
      targetGain *= 0.15;
    }

    // If peer is muted or master is muted, silence
    if (nodeGroup.micMuted || this.masterMuted) {
      targetGain = 0;
    }

    nodeGroup.lastComputedGain = targetGain;

    const now = this.audioCtx.currentTime;
    const timeConstant = 0.05; // 50ms exponential smoothing

    if (nodeGroup.gainNode) {
      if (nodeGroup.lastTargetGain == null || Math.abs(nodeGroup.lastTargetGain - targetGain) > 0.001) {
        nodeGroup.lastTargetGain = targetGain;
        nodeGroup.gainNode.gain.setTargetAtTime(targetGain, now, timeConstant);
      }
    }

    if (nodeGroup.pannerNode) {
      if (nodeGroup.lastTargetPan == null || Math.abs(nodeGroup.lastTargetPan - targetPan) > 0.005) {
        nodeGroup.lastTargetPan = targetPan;
        nodeGroup.pannerNode.pan.setTargetAtTime(targetPan, now, timeConstant);
      }
    }
  }

  /**
   * Sets mute status for a specific peer.
   */
  setPeerMuteState(peerId, isMuted) {
    const nodeGroup = this.peerNodes.get(peerId);
    if (nodeGroup) {
      nodeGroup.micMuted = Boolean(isMuted);
      if (this.audioCtx && nodeGroup.gainNode) {
        const targetGain = nodeGroup.micMuted ? 0 : (nodeGroup.lastComputedGain || 0);
        nodeGroup.lastTargetGain = targetGain;
        nodeGroup.gainNode.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.05);
      }
    }
  }

  /**
   * Returns true if peer audio stream is active, Web Audio is running, and gain > 0.
   */
  isPeerAudible(peerId) {
    const nodeGroup = this.peerNodes.get(peerId);
    if (!nodeGroup || !this.audioCtx) return false;
    if (this.audioCtx.state !== 'running') return false;
    if (this.masterMuted || nodeGroup.micMuted) return false;
    return (nodeGroup.lastComputedGain || 0) > 0;
  }

  hasPeerStream(peerId) {
    return this.peerNodes.has(peerId);
  }

  /**
   * Samples current audio amplitude level [0, 100] for visualizer waves.
   */
  getPeerAudioLevel(peerId) {
    const nodeGroup = this.peerNodes.get(peerId);
    if (!nodeGroup || !nodeGroup.analyserNode || nodeGroup.micMuted) return 0;

    const dataArray = new Uint8Array(nodeGroup.analyserNode.frequencyBinCount);
    nodeGroup.analyserNode.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    return Math.min(100, Math.round((avg / 255) * 100));
  }

  /**
   * Disconnects and cleans up all audio nodes for a departed peer.
   */
  removePeer(peerId) {
    const nodeGroup = this.peerNodes.get(peerId);
    if (!nodeGroup) return;

    try {
      if (nodeGroup.audioEl) {
        nodeGroup.audioEl.pause();
        nodeGroup.audioEl.srcObject = null;
        if (nodeGroup.audioEl.parentNode) {
          nodeGroup.audioEl.parentNode.removeChild(nodeGroup.audioEl);
        }
      }
      if (nodeGroup.gainNode) nodeGroup.gainNode.disconnect();
      if (nodeGroup.pannerNode) nodeGroup.pannerNode.disconnect();
      if (nodeGroup.analyserNode) nodeGroup.analyserNode.disconnect();
      if (nodeGroup.sourceNode) nodeGroup.sourceNode.disconnect();
    } catch (err) {
      console.warn(`[SpatialAudio] Cleanup warning for ${peerId}:`, err);
    }

    this.peerNodes.delete(peerId);
  }

  /**
   * Tears down entire audio mixer on logout / unmount.
   */
  destroy() {
    for (const peerId of Array.from(this.peerNodes.keys())) {
      this.removePeer(peerId);
    }
    const container = typeof document !== 'undefined' ? document.getElementById('proxispeak-audio-sinks') : null;
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (err) {
        console.warn('[SpatialAudio] Error closing AudioContext:', err);
      }
      this.audioCtx = null;
    }
  }
}

export const spatialAudioMixer = new SpatialAudioMixer();
