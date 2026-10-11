import { spatialAudioMixer } from './spatialAudioMixer.js';

/**
 * WebRTC Peer-to-Peer Audio Service
 * Manages local microphone access, peer connections lifecycle,
 * deterministic SDP offer/answer negotiation, and ICE candidate queuing.
 */
export class WebRtcService {
  constructor() {
    this.localStream = null;
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    // peerId -> RTCPeerConnection
    this.peers = new Map();
    // peerId -> Array<RTCIceCandidateInit>
    this.iceQueues = new Map();
    // peerId -> connectionState
    this.connectionStates = new Map();

    this.micMuted = false;
    this.micError = null;
    this.localAudioCtx = null;
    this.localAnalyser = null;
    this.onStateChangeCallbacks = new Set();
  }

  setIceServers(servers) {
    if (Array.isArray(servers) && servers.length > 0) {
      this.iceServers = servers;
    }
  }

  onStateChange(cb) {
    this.onStateChangeCallbacks.add(cb);
    return () => this.onStateChangeCallbacks.delete(cb);
  }

  notifyStateChange() {
    const status = {
      hasLocalAudio: Boolean(this.localStream),
      micMuted: this.micMuted,
      micError: this.micError,
      connectedPeersCount: Array.from(this.connectionStates.values()).filter(s => s === 'connected').length
    };
    for (const cb of this.onStateChangeCallbacks) {
      cb(status);
    }
  }

  /**
   * Requests local microphone access.
   */
  async initLocalMicrophone() {
    this.micError = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser or context (HTTPS/localhost required).');
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      // Attach local stream tracks to any already created peers
      for (const [peerId, pc] of this.peers.entries()) {
        const senders = pc.getSenders ? pc.getSenders() : [];
        this.localStream.getAudioTracks().forEach(track => {
          const hasTrack = senders.some(s => s.track && s.track.kind === 'audio');
          if (!hasTrack) {
            pc.addTrack(track, this.localStream);
          }
        });
      }

      // Initialize local analyzer for local voice amplitude visualization (do NOT route to destination)
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        try {
          if (!this.localAudioCtx) {
            this.localAudioCtx = new AudioCtxClass();
          }
          if (this.localAudioCtx.state === 'suspended') {
            await this.localAudioCtx.resume();
          }
          const source = this.localAudioCtx.createMediaStreamSource(this.localStream);
          this.localAnalyser = this.localAudioCtx.createAnalyser();
          this.localAnalyser.fftSize = 64;
          source.connect(this.localAnalyser);
        } catch (e) {
          console.warn('[WebRTC] Local analyser initialization skipped:', e.message);
        }
      }

      // console.log('[WebRTC] Local microphone stream acquired successfully.');
      this.notifyStateChange();
      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC] Microphone access denied or unavailable:', err.message);
      this.micError = err.name === 'NotAllowedError'
        ? 'Microphone permission denied. You can still navigate and listen to colleagues.'
        : `Microphone unavailable: ${err.message}`;
      this.notifyStateChange();
      return null;
    }
  }

  /**
   * Samples current local microphone audio amplitude level [0, 100].
   */
  getLocalAudioLevel() {
    if (!this.localAnalyser || this.micMuted) return 0;
    try {
      const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
      this.localAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      return Math.min(100, Math.round((avg / 255) * 100));
    } catch {
      return 0;
    }
  }

  /**
   * Toggles microphone mute state.
   */
  setMicMuted(isMuted) {
    this.micMuted = Boolean(isMuted);
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.micMuted;
      });
    }
    this.notifyStateChange();
    return this.micMuted;
  }

  /**
   * Creates or retrieves an existing RTCPeerConnection for a peer.
   */
  getOrCreatePeer(peerId, socket) {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId);
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    this.peers.set(peerId, pc);
    this.iceQueues.set(peerId, []);
    this.connectionStates.set(peerId, 'new');

    // Add local audio tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('rtc:ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Remote audio track received
    pc.ontrack = (event) => {
      // console.log(`[WebRTC] Received remote audio track from peer: ${peerId}`);
      if (event.streams && event.streams[0]) {
        spatialAudioMixer.addPeerStream(peerId, event.streams[0]);
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      // console.log(`[WebRTC] Peer ${peerId} state: ${pc.connectionState}`);
      this.connectionStates.set(peerId, pc.connectionState);
      this.notifyStateChange();

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId);
      }
    };

    return pc;
  }

  /**
   * Initiates WebRTC offer when entering proximity if designated as offerer.
   */
  async initiateOffer(peerId, socket) {
    try {
      const pc = this.getOrCreatePeer(peerId, socket);

      // Create and set local description
      const offer = await pc.createOffer({
        offerToReceiveAudio: true
      });
      await pc.setLocalDescription(offer);

      socket.emit('rtc:offer', {
        targetPeerId: peerId,
        sdp: pc.localDescription
      });
      // console.log(`[WebRTC] Dispatched offer to peer: ${peerId}`);
    } catch (err) {
      console.error(`[WebRTC] Error initiating offer to ${peerId}:`, err);
    }
  }

  /**
   * Handles incoming SDP offer from a peer.
   */
  async handleOffer(senderPeerId, sdp, socket) {
    try {
      const pc = this.getOrCreatePeer(senderPeerId, socket);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushIceQueue(senderPeerId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('rtc:answer', {
        targetPeerId: senderPeerId,
        sdp: pc.localDescription
      });
      // console.log(`[WebRTC] Dispatched answer to peer: ${senderPeerId}`);
    } catch (err) {
      console.error(`[WebRTC] Error handling offer from ${senderPeerId}:`, err);
    }
  }

  /**
   * Handles incoming SDP answer from a peer.
   */
  async handleAnswer(senderPeerId, sdp) {
    try {
      const pc = this.peers.get(senderPeerId);
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushIceQueue(senderPeerId, pc);
      // console.log(`[WebRTC] Set remote description answer for peer: ${senderPeerId}`);
    } catch (err) {
      console.error(`[WebRTC] Error handling answer from ${senderPeerId}:`, err);
    }
  }

  /**
   * Handles incoming ICE candidate. Queues candidate if remote description is not ready yet.
   */
  async handleIceCandidate(senderPeerId, candidate) {
    try {
      const pc = this.peers.get(senderPeerId);
      if (!pc || !pc.remoteDescription) {
        // Queue candidate until setRemoteDescription completes
        const queue = this.iceQueues.get(senderPeerId) || [];
        queue.push(candidate);
        this.iceQueues.set(senderPeerId, queue);
        return;
      }

      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`[WebRTC] Error adding ICE candidate from ${senderPeerId}:`, err);
    }
  }

  /**
   * Flushes queued ICE candidates after remote description is established.
   */
  async flushIceQueue(peerId, pc) {
    const queue = this.iceQueues.get(peerId);
    if (!queue || !queue.length) return;

    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[WebRTC] Error flushing candidate for ${peerId}:`, err);
      }
    }
  }

  /**
   * Closes connection with a peer who moved away or left office.
   */
  closePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (err) {
        console.warn(`[WebRTC] Warning closing peer ${peerId}:`, err);
      }
      this.peers.delete(peerId);
    }

    this.iceQueues.delete(peerId);
    this.connectionStates.delete(peerId);
    spatialAudioMixer.removePeer(peerId);
    this.notifyStateChange();
  }

  /**
   * Tears down all active connections and releases microphone tracks.
   */
  destroy() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.localAudioCtx && this.localAudioCtx.state !== 'closed') {
      try {
        this.localAudioCtx.close();
      } catch (err) {
        console.warn('[WebRTC] Error closing local AudioContext:', err);
      }
      this.localAudioCtx = null;
    }
    this.localAnalyser = null;

    spatialAudioMixer.destroy();
    this.notifyStateChange();
  }
}

export const webRtcService = new WebRtcService();
