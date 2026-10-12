import { spatialAudioMixer } from './spatialAudioMixer.js';

/**
 * WebRTC Peer-to-Peer Audio Service
 * Manages local microphone access, peer connections lifecycle,
 * deterministic SDP offer/answer negotiation with collision resolution (Perfect Negotiation),
 * safe ICE candidate queuing, and bounded recovery.
 */
export class WebRtcService {
  constructor() {
    this.localUserId = null;
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
    // peerId -> { makingOffer: boolean, ignoreOffer: boolean }
    this.peerFlags = new Map();
    // peerId -> socket reference
    this.peerSockets = new Map();
    // peerId -> number of ICE restart attempts
    this.restartAttempts = new Map();
    // In-memory diagnostic logs (capped at last 100 entries)
    this.diagnosticsLog = [];

    this.micMuted = false;
    this.micError = null;
    this.localAudioCtx = null;
    this.localAnalyser = null;
    this.onStateChangeCallbacks = new Set();
  }

  setLocalUserId(userId) {
    if (userId) {
      this.localUserId = String(userId);
    }
  }

  /**
   * Deterministic polite peer selection:
   * The peer with lexicographically higher ID is polite.
   * This guarantees that in any pair, exactly one peer is polite and one is impolite.
   */
  isPolite(peerId) {
    if (!this.localUserId || !peerId) return false;
    return this.localUserId > String(peerId);
  }

  getPeerFlags(peerId) {
    if (!this.peerFlags.has(peerId)) {
      this.peerFlags.set(peerId, { makingOffer: false, ignoreOffer: false });
    }
    return this.peerFlags.get(peerId);
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

  getConnectionState(peerId) {
    return this.connectionStates.get(peerId) || 'disconnected';
  }

  /**
   * Records development-safe structured diagnostics without leaking sensitive media or credentials.
   */
  logDiagnostic(peerId, event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      peerId,
      event,
      ...details
    };
    this.diagnosticsLog.push(entry);
    if (this.diagnosticsLog.length > 150) {
      this.diagnosticsLog.shift();
    }
    // console.log(`[WebRTC Diagnostic] [${peerId}] ${event}:`, details);
  }

  getDiagnostics() {
    return {
      localUserId: this.localUserId,
      hasLocalStream: Boolean(this.localStream),
      micMuted: this.micMuted,
      peers: Array.from(this.peers.keys()).map(peerId => ({
        peerId,
        connectionState: this.connectionStates.get(peerId),
        signalingState: this.peers.get(peerId)?.signalingState,
        iceConnectionState: this.peers.get(peerId)?.iceConnectionState,
        iceGatheringState: this.peers.get(peerId)?.iceGatheringState,
        restartAttempts: this.restartAttempts.get(peerId) || 0,
        isPolite: this.isPolite(peerId)
      })),
      recentEvents: this.diagnosticsLog.slice(-30)
    };
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

      // Synchronize initial mute state onto tracks
      if (this.micMuted) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }

      // Attach or replace local stream tracks on any already-created peer connections
      for (const [peerId, pc] of this.peers.entries()) {
        if (pc.signalingState === 'closed') continue;

        const senders = pc.getSenders ? pc.getSenders() : [];
        let trackNewlyAdded = false;

        this.localStream.getAudioTracks().forEach(track => {
          if (track.readyState !== 'live') return;

          const existingAudioSender = senders.find(s => (s.track && s.track.kind === 'audio') || s.kind === 'audio');
          if (existingAudioSender) {
            existingAudioSender.replaceTrack(track).catch(err => {
              console.warn(`[WebRTC] replaceTrack warning for peer ${peerId}:`, err.message);
            });
          } else {
            pc.addTrack(track, this.localStream);
            trackNewlyAdded = true;
          }
        });

        // If a track was newly added to an already stable/connected connection, renegotiate to ensure remote receives it!
        if (trackNewlyAdded && (pc.signalingState === 'stable' || pc.connectionState === 'connected')) {
          const socket = this.peerSockets.get(peerId);
          if (socket) {
            this.initiateOffer(peerId, socket);
          }
        }
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

      this.logDiagnostic('local', 'microphone_acquired', {
        tracks: this.localStream.getAudioTracks().map(t => ({ id: t.id, enabled: t.enabled, readyState: t.readyState }))
      });
      this.notifyStateChange();
      return this.localStream;
    } catch (err) {
      console.warn('[WebRTC] Microphone access denied or unavailable:', err.message);
      this.micError = err.name === 'NotAllowedError'
        ? 'Microphone permission denied. You can still navigate and listen to colleagues.'
        : `Microphone unavailable: ${err.message}`;
      this.logDiagnostic('local', 'microphone_error', { name: err.name, message: err.message });
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
      const existingPc = this.peers.get(peerId);
      if (existingPc.signalingState !== 'closed') {
        if (socket) this.peerSockets.set(peerId, socket);
        return existingPc;
      }
      // Clean up dead connection before recreating
      this.closePeer(peerId);
    }

    if (socket) {
      this.peerSockets.set(peerId, socket);
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    this.peers.set(peerId, pc);
    if (!this.iceQueues.has(peerId)) {
      this.iceQueues.set(peerId, []);
    }
    this.connectionStates.set(peerId, 'new');
    this.restartAttempts.set(peerId, 0);

    this.logDiagnostic(peerId, 'peer_created', {
      iceServersCount: this.iceServers.length,
      isPolite: this.isPolite(peerId)
    });

    // Add local audio tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        if (track.readyState === 'live') {
          pc.addTrack(track, this.localStream);
        }
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      const activeSocket = socket || this.peerSockets.get(peerId);
      if (event.candidate && activeSocket) {
        activeSocket.emit('rtc:ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Remote audio track received (handles both event.streams and fallback event.track)
    pc.ontrack = (event) => {
      this.logDiagnostic(peerId, 'track_received', {
        trackId: event.track?.id,
        kind: event.track?.kind,
        enabled: event.track?.enabled,
        muted: event.track?.muted
      });

      const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);
      spatialAudioMixer.addPeerStream(peerId, stream);
      this.notifyStateChange();
    };

    // ICE Connection state changes
    pc.oniceconnectionstatechange = () => {
      this.logDiagnostic(peerId, 'ice_state_change', { iceState: pc.iceConnectionState });
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.connectionStates.set(peerId, state);
      this.logDiagnostic(peerId, 'connection_state_change', { state });
      this.notifyStateChange();

      if (state === 'failed') {
        this.handleConnectionFailure(peerId, socket || this.peerSockets.get(peerId));
      } else if (state === 'closed') {
        this.closePeer(peerId);
      }
    };

    return pc;
  }

  /**
   * Initiates WebRTC offer when entering proximity or performing renegotiation.
   */
  async initiateOffer(peerId, socket, isIceRestart = false) {
    const pc = this.getOrCreatePeer(peerId, socket);
    if (!pc || pc.signalingState === 'closed') return;

    const flags = this.getPeerFlags(peerId);
    try {
      flags.makingOffer = true;
      this.logDiagnostic(peerId, 'offer_initiating', { isIceRestart });

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        iceRestart: isIceRestart
      });

      // Avoid setting local description if signalingState changed while awaiting createOffer
      if (pc.signalingState !== 'stable') {
        this.logDiagnostic(peerId, 'offer_aborted_unstable_state', { state: pc.signalingState });
        return;
      }

      await pc.setLocalDescription(offer);

      const activeSocket = socket || this.peerSockets.get(peerId);
      if (activeSocket) {
        activeSocket.emit('rtc:offer', {
          targetPeerId: peerId,
          sdp: pc.localDescription || offer
        });
        this.logDiagnostic(peerId, 'offer_sent', { type: pc.localDescription?.type || offer?.type, isIceRestart });
      }
    } catch (err) {
      console.error(`[WebRTC] Error initiating offer to ${peerId}:`, err);
      this.logDiagnostic(peerId, 'offer_initiate_error', { message: err.message });
    } finally {
      flags.makingOffer = false;
    }
  }

  /**
   * Handles incoming SDP offer with Perfect Negotiation collision resolution.
   */
  async handleOffer(senderPeerId, sdp, socket) {
    if (!sdp || !senderPeerId) return;

    try {
      this.logDiagnostic(senderPeerId, 'offer_received', { sdpType: sdp.type });
      const pc = this.getOrCreatePeer(senderPeerId, socket);
      if (!pc || pc.signalingState === 'closed') return;

      const isPolite = this.isPolite(senderPeerId);
      const flags = this.getPeerFlags(senderPeerId);
      const offerCollision = (pc.signalingState !== 'stable') || flags.makingOffer;

      flags.ignoreOffer = !isPolite && offerCollision;
      if (flags.ignoreOffer) {
        this.logDiagnostic(senderPeerId, 'offer_collision_ignored', {
          isPolite: false,
          state: pc.signalingState,
          makingOffer: flags.makingOffer
        });
        return;
      }

      if (offerCollision) {
        this.logDiagnostic(senderPeerId, 'offer_collision_rollback', {
          isPolite: true,
          state: pc.signalingState
        });
        await pc.setLocalDescription({ type: 'rollback' });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushIceQueue(senderPeerId, pc);

      const answer = await pc.createAnswer({
        offerToReceiveAudio: true
      });
      await pc.setLocalDescription(answer);

      const activeSocket = socket || this.peerSockets.get(senderPeerId);
      if (activeSocket) {
        activeSocket.emit('rtc:answer', {
          targetPeerId: senderPeerId,
          sdp: pc.localDescription || answer
        });
        this.logDiagnostic(senderPeerId, 'answer_sent', { type: pc.localDescription?.type || answer?.type });
      }
    } catch (err) {
      console.error(`[WebRTC] Error handling offer from ${senderPeerId}:`, err);
      this.logDiagnostic(senderPeerId, 'offer_handle_error', { message: err.message });
    }
  }

  /**
   * Handles incoming SDP answer from a peer safely.
   */
  async handleAnswer(senderPeerId, sdp) {
    if (!sdp || !senderPeerId) return;

    try {
      this.logDiagnostic(senderPeerId, 'answer_received', { sdpType: sdp.type });
      const pc = this.peers.get(senderPeerId);
      if (!pc || pc.signalingState === 'closed') return;

      // Only apply answer if we are awaiting one (signalingState is 'have-local-offer')
      if (pc.signalingState !== 'have-local-offer') {
        this.logDiagnostic(senderPeerId, 'answer_ignored_unexpected_state', { state: pc.signalingState });
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushIceQueue(senderPeerId, pc);
      this.logDiagnostic(senderPeerId, 'answer_applied_stable', { state: pc.signalingState });
    } catch (err) {
      console.error(`[WebRTC] Error handling answer from ${senderPeerId}:`, err);
      this.logDiagnostic(senderPeerId, 'answer_handle_error', { message: err.message });
    }
  }

  /**
   * Handles incoming ICE candidate with safe queuing if remote description is not ready yet.
   */
  async handleIceCandidate(senderPeerId, candidate) {
    if (!candidate) return;

    try {
      const pc = this.peers.get(senderPeerId);
      // Queue candidate if peer connection not yet ready or remote description not yet set
      if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
        const queue = this.iceQueues.get(senderPeerId) || [];
        queue.push(candidate);
        this.iceQueues.set(senderPeerId, queue);
        return;
      }

      if (pc.signalingState === 'closed') return;

      // Ignore end-of-candidate indicators with empty candidate string
      if (candidate.candidate) {
        const iceCandidate = typeof RTCIceCandidate !== 'undefined' ? new RTCIceCandidate(candidate) : candidate;
        await pc.addIceCandidate(iceCandidate);
      }
    } catch (err) {
      console.warn(`[WebRTC] Error adding ICE candidate from ${senderPeerId}:`, err.message);
    }
  }

  /**
   * Flushes queued ICE candidates after remote description is established.
   */
  async flushIceQueue(peerId, pc) {
    const queue = this.iceQueues.get(peerId);
    if (!queue || !queue.length) return;

    const candidates = queue.splice(0, queue.length);
    for (const candidate of candidates) {
      try {
        if (candidate && candidate.candidate && pc.signalingState !== 'closed') {
          const iceCandidate = typeof RTCIceCandidate !== 'undefined' ? new RTCIceCandidate(candidate) : candidate;
          await pc.addIceCandidate(iceCandidate);
        }
      } catch (err) {
        console.warn(`[WebRTC] Error flushing candidate for ${peerId}:`, err.message);
      }
    }
  }

  /**
   * Handles connection failure with bounded ICE restart (max 2 attempts).
   */
  handleConnectionFailure(peerId, socket) {
    const attempts = this.restartAttempts.get(peerId) || 0;
    if (attempts < 2 && socket) {
      this.restartAttempts.set(peerId, attempts + 1);
      this.logDiagnostic(peerId, 'attempting_ice_restart', { attempt: attempts + 1 });
      this.initiateOffer(peerId, socket, true);
    } else {
      this.logDiagnostic(peerId, 'connection_failed_closing', { attempts });
      this.closePeer(peerId);
    }
  }

  /**
   * Closes connection with a peer who moved away or left office.
   */
  closePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch (err) {
        console.warn(`[WebRTC] Warning closing peer ${peerId}:`, err);
      }
      this.peers.delete(peerId);
    }

    this.iceQueues.delete(peerId);
    this.connectionStates.delete(peerId);
    this.peerFlags.delete(peerId);
    this.peerSockets.delete(peerId);
    this.restartAttempts.delete(peerId);
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
      this.localStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // ignore
        }
      });
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
