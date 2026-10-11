import { calculateDistance, calculatePan, calculateGain } from '../utils/geometry.js';

/**
 * Web Audio API Spatial Audio Mixer
 * Manages dynamic 2D soundstage, quadratic volume attenuation, stereo panning,
 * obstacle muffling, and audio level visualization for remote WebRTC audio streams.
 */
export class SpatialAudioMixer {
  constructor() {
    this.audioCtx = null;
    // peerId -> { stream, sourceNode, gainNode, pannerNode, analyserNode, isObstructed, micMuted }
    this.peerNodes = new Map();
    this.hearingRadius = 120;
    this.masterMuted = false;
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
        // console.log('[SpatialAudio] AudioContext resumed successfully.');
      } catch (err) {
        console.warn('[SpatialAudio] Failed to resume AudioContext:', err);
      }
    }

    return this.audioCtx;
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
  async addPeerStream(peerId, stream) {
    await this.ensureAudioContext();
    if (!this.audioCtx) return;

    // Clean up any existing nodes for this peer to prevent duplicate audio
    this.removePeer(peerId);

    try {
      // Workaround for Chromium bug: Remote WebRTC MediaStreams remain silent in Web Audio API
      // unless anchored to an active playing HTMLAudioElement.
      let audioEl = null;
      if (typeof document !== 'undefined') {
        try {
          audioEl = document.createElement('audio');
          audioEl.srcObject = stream;
          audioEl.muted = true; // Muted so raw un-spatialized audio does not bypass Web Audio graph
          audioEl.playsInline = true;
          audioEl.autoplay = true;
          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              console.warn(`[SpatialAudio] HTMLAudioElement anchor play warning for ${peerId}:`, err.message);
            });
          }
        } catch (e) {
          console.warn(`[SpatialAudio] Could not create audio element anchor:`, e.message);
        }
      }

      const sourceNode = this.audioCtx.createMediaStreamSource(stream);
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.value = 0; // Starts silent until position is evaluated

      let pannerNode = null;
      if (this.audioCtx.createStereoPanner) {
        pannerNode = this.audioCtx.createStereoPanner();
        pannerNode.pan.value = 0;
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
        lastComputedGain: 0,
        lastTargetGain: null,
        lastTargetPan: null
      });

      console.log(`[SpatialAudio] Spatial pipeline initialized for peer: ${peerId}`);
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
