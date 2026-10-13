import { spatialAudioMixer } from './spatialAudioMixer.js';

/**
 * Connection Timeline Tracker
 * Records high-resolution monotonic timestamps (performance.now())
 * across all 16 connection and media milestones.
 */
class ConnectionTimeline {
  constructor(peerId, isInitiator = false, isPrewarm = false) {
    this.callId = `call_${peerId}_${Date.now()}`;
    this.peerId = peerId;
    this.isInitiator = isInitiator;
    this.isPrewarm = isPrewarm;
    this.reusedConnection = false;
    this.createdAt = performance.now();
    this.timestamps = {
      proximityDetected: null,
      connectionRequested: null,
      requestReceived: null,
      mediaAcquisitionStart: null,
      mediaAcquisitionEnd: null,
      peerCreated: null,
      offerCreated: null,
      offerSent: null,
      offerReceived: null,
      remoteDescApplied: null,
      answerCreated: null,
      answerSent: null,
      answerReceived: null,
      answerApplied: null,
      iceGatheringStart: null,
      iceCandidateFirst: null,
      iceGatheringComplete: null,
      iceConnected: null,
      peerConnected: null,
      trackArrived: null,
      playbackStarted: null,
      audioAudible: null
    };
    this.candidateCounts = { host: 0, srflx: 0, relay: 0 };
    this.errors = [];
  }

  record(event, now = performance.now()) {
    if (this.timestamps[event] == null) {
      this.timestamps[event] = now;
    }
  }

  recordCandidate(candidateType) {
    if (this.timestamps.iceCandidateFirst == null) {
      this.timestamps.iceCandidateFirst = performance.now();
    }
    const type = candidateType || 'host';
    if (this.candidateCounts[type] != null) {
      this.candidateCounts[type]++;
    } else {
      this.candidateCounts[type] = 1;
    }
  }

  getSummary() {
    const t = this.timestamps;
    const baseTime = t.proximityDetected || t.connectionRequested || this.createdAt;

    const totalToPeerConnectedMs = t.peerConnected != null ? Math.round(t.peerConnected - baseTime) : null;
    const totalToTrackArrivalMs = t.trackArrived != null ? Math.round(t.trackArrived - baseTime) : null;
    const totalToPlaybackMs = t.playbackStarted != null ? Math.round(t.playbackStarted - baseTime) : null;
    const totalToAudibleMs = t.audioAudible != null ? Math.round(t.audioAudible - baseTime) : null;

    const offerCreationMs = (t.offerCreated && (t.peerCreated || t.connectionRequested))
      ? Math.round(t.offerCreated - (t.peerCreated || t.connectionRequested)) : null;

    const signalingRoundTripMs = (t.answerReceived && t.offerSent)
      ? Math.round(t.answerReceived - t.offerSent) : null;

    const answerCreationMs = (t.answerCreated && t.offerReceived)
      ? Math.round(t.answerCreated - t.offerReceived) : null;

    const iceGatheringMs = (t.iceGatheringComplete && t.iceGatheringStart)
      ? Math.round(t.iceGatheringComplete - t.iceGatheringStart) : null;

    const icePairingMs = (t.iceConnected && (t.answerApplied || t.remoteDescApplied))
      ? Math.round(t.iceConnected - (t.answerApplied || t.remoteDescApplied)) : null;

    const trackToPlaybackMs = (t.playbackStarted && t.trackArrived)
      ? Math.round(t.playbackStarted - t.trackArrived) : null;

    // Determine largest bottleneck stage
    const stages = [
      { name: 'offer_creation', duration: offerCreationMs },
      { name: 'signaling_roundtrip', duration: signalingRoundTripMs },
      { name: 'answer_creation', duration: answerCreationMs },
      { name: 'ice_gathering', duration: iceGatheringMs },
      { name: 'ice_pairing', duration: icePairingMs },
      { name: 'track_to_playback', duration: trackToPlaybackMs }
    ].filter(s => typeof s.duration === 'number' && s.duration > 0);

    stages.sort((a, b) => b.duration - a.duration);
    const largestDelayStage = stages[0] ? stages[0].name : 'none';

    return {
      callId: this.callId,
      peerId: this.peerId,
      isInitiator: this.isInitiator,
      isPrewarm: this.isPrewarm,
      reusedConnection: this.reusedConnection,
      totalToPeerConnectedMs,
      totalToTrackArrivalMs,
      totalToPlaybackMs,
      totalToAudibleMs,
      offerCreationMs,
      signalingRoundTripMs,
      answerCreationMs,
      iceGatheringMs,
      icePairingMs,
      trackToPlaybackMs,
      largestDelayStage,
      candidateCounts: { ...this.candidateCounts },
      errorsCount: this.errors.length,
      timestamps: { ...this.timestamps }
    };
  }
}

/**
 * WebRTC Peer-to-Peer Audio Service
 * Manages local microphone access, peer connection lifecycles,
 * deterministic Perfect Negotiation, safe ICE candidate queuing,
 * bounded connection prewarming, dormant connection reuse with hysteresis,
 * and end-to-end monotonic timeline measurement.
 */
export class WebRtcService {
  constructor() {
    this.localUserId = null;
    this.localStream = null;
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];

    // peerId -> RTCPeerConnection
    this.peers = new Map();
    // peerId -> Array<RTCIceCandidateInit>
    this.iceQueues = new Map();
    // peerId -> RTCPeerConnection.connectionState ('new'|'connecting'|'connected'|'disconnected'|'failed'|'closed')
    this.connectionStates = new Map();
    // peerId -> High-level Lifecycle state ('idle'|'preparing'|'connecting'|'connected'|'dormant'|'failed'|'closed')
    this.peerLifecycles = new Map();
    // peerId -> Connection milestone ('idle'|'connecting'|'peer-connected'|'track-received'|'playback-ready'|'audio-audible')
    this.peerMilestones = new Map();
    // peerId -> { makingOffer: boolean, ignoreOffer: boolean }
    this.peerFlags = new Map();
    // peerId -> socket reference
    this.peerSockets = new Map();
    // peerId -> number of ICE restart attempts
    this.restartAttempts = new Map();
    // peerId -> ConnectionTimeline
    this.timelines = new Map();
    // peerId -> setTimeout timer ID for dormant connection teardown grace
    this.dormantTimers = new Map();
    // peerId -> setTimeout timer ID for signaling watchdog recovery
    this.watchdogTimers = new Map();
    // In-memory diagnostic logs (capped at last 150 entries)
    this.diagnosticsLog = [];

    this.micMuted = false;
    this.micError = null;
    this.localAudioCtx = null;
    this.localAnalyser = null;
    this.onStateChangeCallbacks = new Set();

    // Hook spatial audio mixer playback and audible milestone notifications
    spatialAudioMixer.onPlaybackStart((peerId) => {
      this.setPeerMilestone(peerId, 'playback-ready');
      const timeline = this.timelines.get(peerId);
      if (timeline) timeline.record('playbackStarted');
      this.logDiagnostic(peerId, 'playback_started', {
        audible: spatialAudioMixer.isPeerAudible(peerId)
      });
      this.notifyStateChange();
    });

    spatialAudioMixer.onAudibleChange((peerId, gain) => {
      if (gain > 0) {
        this.setPeerMilestone(peerId, 'audio-audible');
        const timeline = this.timelines.get(peerId);
        if (timeline) timeline.record('audioAudible');
        this.notifyStateChange();
      }
    });
  }

  setLocalUserId(userId) {
    if (userId) {
      this.localUserId = String(userId);
    }
  }

  /**
   * Deterministic polite peer selection:
   * The peer with lexicographically higher ID is polite.
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

  getLifecycleState(peerId) {
    return this.peerLifecycles.get(peerId) || 'idle';
  }

  setLifecycleState(peerId, state) {
    this.peerLifecycles.set(peerId, state);
    this.logDiagnostic(peerId, 'lifecycle_state_change', { state });
  }

  getPeerMilestone(peerId) {
    return this.peerMilestones.get(peerId) || 'idle';
  }

  setPeerMilestone(peerId, milestone) {
    this.peerMilestones.set(peerId, milestone);
  }

  getOrCreateTimeline(peerId, isInitiator = false, isPrewarm = false) {
    if (!this.timelines.has(peerId)) {
      this.timelines.set(peerId, new ConnectionTimeline(peerId, isInitiator, isPrewarm));
    }
    return this.timelines.get(peerId);
  }

  getTimelineSummary(peerId) {
    const timeline = this.timelines.get(peerId);
    return timeline ? timeline.getSummary() : null;
  }

  getAllTimelineSummaries() {
    return Array.from(this.timelines.entries()).map(([peerId, tl]) => tl.getSummary());
  }

  /**
   * Records development-safe structured diagnostics without leaking sensitive media or credentials.
   */
  logDiagnostic(peerId, event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      monotonicMs: Math.round(performance.now()),
      peerId,
      event,
      ...details
    };
    this.diagnosticsLog.push(entry);
    if (this.diagnosticsLog.length > 150) {
      this.diagnosticsLog.shift();
    }
  }

  getDiagnostics() {
    return {
      localUserId: this.localUserId,
      hasLocalStream: Boolean(this.localStream),
      micMuted: this.micMuted,
      peers: Array.from(this.peers.keys()).map(peerId => ({
        peerId,
        lifecycle: this.getLifecycleState(peerId),
        milestone: this.getPeerMilestone(peerId),
        connectionState: this.connectionStates.get(peerId),
        signalingState: this.peers.get(peerId)?.signalingState,
        iceConnectionState: this.peers.get(peerId)?.iceConnectionState,
        iceGatheringState: this.peers.get(peerId)?.iceGatheringState,
        restartAttempts: this.restartAttempts.get(peerId) || 0,
        isPolite: this.isPolite(peerId),
        timeline: this.getTimelineSummary(peerId)
      })),
      recentEvents: this.diagnosticsLog.slice(-30)
    };
  }

  /**
   * Requests local microphone access.
   */
  async initLocalMicrophone() {
    this.micError = null;
    const mediaStart = performance.now();
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

      const mediaEnd = performance.now();
      for (const tl of this.timelines.values()) {
        tl.record('mediaAcquisitionStart', mediaStart);
        tl.record('mediaAcquisitionEnd', mediaEnd);
      }

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

        // Renegotiate only if a track was newly added and signaling is stable
        if (trackNewlyAdded && pc.signalingState === 'stable') {
          const socket = this.peerSockets.get(peerId);
          if (socket) {
            this.initiateOffer(peerId, socket);
          }
        }
      }

      // Initialize local analyzer for local voice amplitude visualization
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
        durationMs: Math.round(mediaEnd - mediaStart),
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
   * Prewarms peer connection when approaching near earshot (bounded prewarming).
   */
  prewarmPeer(peerId, socket, shouldInitiateOffer = false) {
    if (!peerId) return;

    // If connection already exists and healthy/connecting, do not recreate
    const currentLifecycle = this.getLifecycleState(peerId);
    if (currentLifecycle === 'connected' || currentLifecycle === 'connecting' || currentLifecycle === 'dormant') {
      return;
    }

    this.logDiagnostic(peerId, 'prewarm_initiated', { shouldInitiateOffer });
    const timeline = this.getOrCreateTimeline(peerId, shouldInitiateOffer, true);
    timeline.record('connectionRequested');

    this.setLifecycleState(peerId, 'preparing');
    const pc = this.getOrCreatePeer(peerId, socket);

    if (shouldInitiateOffer && pc && pc.signalingState === 'stable') {
      this.initiateOffer(peerId, socket, false, true);
    }
  }

  /**
   * Creates or retrieves an existing RTCPeerConnection for a peer.
   */
  getOrCreatePeer(peerId, socket) {
    // If dormant timer is running for this peer, cancel it immediately (connection reused!)
    if (this.dormantTimers.has(peerId)) {
      clearTimeout(this.dormantTimers.get(peerId));
      this.dormantTimers.delete(peerId);
    }

    if (this.peers.has(peerId)) {
      const existingPc = this.peers.get(peerId);
      if (existingPc.signalingState !== 'closed') {
        if (socket) this.peerSockets.set(peerId, socket);
        return existingPc;
      }
      this.closePeer(peerId, { immediate: true });
    }

    if (socket) {
      this.peerSockets.set(peerId, socket);
    }

    // Configure RTCPeerConnection with STUN servers and candidate pooling
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 2 // Pre-gathers candidates so STUN doesn't delay negotiation
    });

    this.peers.set(peerId, pc);
    if (!this.iceQueues.has(peerId)) {
      this.iceQueues.set(peerId, []);
    }
    this.connectionStates.set(peerId, 'new');
    this.restartAttempts.set(peerId, 0);

    const timeline = this.getOrCreateTimeline(peerId);
    timeline.record('peerCreated');

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

    // ICE Candidate handler (Trickle ICE)
    pc.onicecandidate = (event) => {
      const activeSocket = socket || this.peerSockets.get(peerId);
      if (event && event.candidate) {
        timeline.recordCandidate(event.candidate.type);
        if (activeSocket) {
          activeSocket.emit('rtc:ice-candidate', {
            targetPeerId: peerId,
            candidate: event.candidate
          });
        }
      } else {
        // End of candidates
        timeline.record('iceGatheringComplete');
        this.logDiagnostic(peerId, 'ice_gathering_complete');
      }
    };

    if (pc.addEventListener) {
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'gathering') {
          timeline.record('iceGatheringStart');
        } else if (pc.iceGatheringState === 'complete') {
          timeline.record('iceGatheringComplete');
        }
        this.logDiagnostic(peerId, 'ice_gathering_state_change', { gatheringState: pc.iceGatheringState });
      });

      pc.addEventListener('icecandidateerror', (event) => {
        this.logDiagnostic(peerId, 'ice_candidate_error', {
          errorCode: event.errorCode,
          errorText: event.errorText,
          url: event.url
        });
      });
    }

    // Remote audio track received
    pc.ontrack = (event) => {
      timeline.record('trackArrived');
      this.setPeerMilestone(peerId, 'track-received');

      this.logDiagnostic(peerId, 'track_received', {
        trackId: event.track?.id,
        kind: event.track?.kind,
        enabled: event.track?.enabled,
        muted: event.track?.muted
      });

      const stream = (event.streams && event.streams[0]) ||
        (typeof MediaStream !== 'undefined' ? new MediaStream([event.track]) : { id: 'fallback-stream', getTracks: () => [event.track] });
      spatialAudioMixer.addPeerStream(peerId, stream);
      this.notifyStateChange();
    };

    // ICE Connection state changes
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      this.logDiagnostic(peerId, 'ice_state_change', { iceState });
      if (iceState === 'connected' || iceState === 'completed') {
        timeline.record('iceConnected');
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.connectionStates.set(peerId, state);
      this.logDiagnostic(peerId, 'connection_state_change', { state });

      if (state === 'connected') {
        this.clearWatchdog(peerId);
        timeline.record('peerConnected');
        this.setLifecycleState(peerId, 'connected');
        this.setPeerMilestone(peerId, 'peer-connected');
        this.notifyStateChange();
      } else if (state === 'failed') {
        this.clearWatchdog(peerId);
        this.setLifecycleState(peerId, 'failed');
        this.handleConnectionFailure(peerId, socket || this.peerSockets.get(peerId));
      } else if (state === 'closed') {
        this.clearWatchdog(peerId);
        this.closePeer(peerId, { immediate: true });
      }
    };

    return pc;
  }

  /**
   * Arm watchdog timer to catch stalled signaling or negotiation hangs.
   */
  armWatchdog(peerId, socket, timeoutMs = 5000) {
    this.clearWatchdog(peerId);
    const timer = setTimeout(() => {
      const state = this.getConnectionState(peerId);
      const lifecycle = this.getLifecycleState(peerId);
      if (state !== 'connected' && lifecycle === 'connecting') {
        this.logDiagnostic(peerId, 'watchdog_timeout_triggering_recovery', { state, lifecycle });
        this.handleConnectionFailure(peerId, socket || this.peerSockets.get(peerId));
      }
    }, timeoutMs);
    this.watchdogTimers.set(peerId, timer);
  }

  clearWatchdog(peerId) {
    if (this.watchdogTimers.has(peerId)) {
      clearTimeout(this.watchdogTimers.get(peerId));
      this.watchdogTimers.delete(peerId);
    }
  }

  /**
   * Initiates WebRTC offer when entering proximity or performing renegotiation.
   */
  async initiateOffer(peerId, socket, isIceRestart = false, isPrewarm = false) {
    // 1. Check if healthy connection already exists (connection reuse)
    const existingLifecycle = this.getLifecycleState(peerId);
    if (!isIceRestart) {
      if (existingLifecycle === 'connected') {
        this.logDiagnostic(peerId, 'offer_skipped_already_connected_reused');
        return;
      }
      if (existingLifecycle === 'dormant') {
        // Reactivate healthy dormant connection immediately!
        this.reactivateDormantPeer(peerId);
        return;
      }
      if (existingLifecycle === 'connecting') {
        this.logDiagnostic(peerId, 'offer_skipped_negotiation_in_flight');
        return;
      }
    }

    const timeline = this.getOrCreateTimeline(peerId, true, isPrewarm);
    timeline.record('connectionRequested');
    this.setLifecycleState(peerId, 'connecting');
    this.setPeerMilestone(peerId, 'connecting');

    const pc = this.getOrCreatePeer(peerId, socket);
    if (!pc || pc.signalingState === 'closed') return;

    const flags = this.getPeerFlags(peerId);
    try {
      flags.makingOffer = true;
      this.logDiagnostic(peerId, 'offer_initiating', { isIceRestart, isPrewarm });

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        iceRestart: isIceRestart
      });
      timeline.record('offerCreated');

      // Avoid setting local description if signalingState changed while awaiting createOffer
      if (pc.signalingState !== 'stable') {
        this.logDiagnostic(peerId, 'offer_aborted_unstable_state', { state: pc.signalingState });
        return;
      }

      await pc.setLocalDescription(offer);

      const activeSocket = socket || this.peerSockets.get(peerId);
      if (activeSocket) {
        timeline.record('offerSent');
        activeSocket.emit('rtc:offer', {
          targetPeerId: peerId,
          sdp: pc.localDescription || offer,
          callId: timeline.callId
        });
        this.logDiagnostic(peerId, 'offer_sent', { type: pc.localDescription?.type || offer?.type, isIceRestart });
        this.armWatchdog(peerId, activeSocket, 5000);
      }
    } catch (err) {
      console.error(`[WebRTC] Error initiating offer to ${peerId}:`, err);
      this.logDiagnostic(peerId, 'offer_initiate_error', { message: err.message });
      timeline.errors.push(err.message);
    } finally {
      flags.makingOffer = false;
    }
  }

  /**
   * Handles incoming SDP offer with Perfect Negotiation collision resolution.
   */
  async handleOffer(senderPeerId, sdp, socket) {
    if (!sdp || !senderPeerId) return;

    const timeline = this.getOrCreateTimeline(senderPeerId, false);
    timeline.record('offerReceived');

    try {
      this.logDiagnostic(senderPeerId, 'offer_received', { sdpType: sdp.type });
      this.setLifecycleState(senderPeerId, 'connecting');
      this.setPeerMilestone(senderPeerId, 'connecting');

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
      timeline.record('remoteDescApplied');
      await this.flushIceQueue(senderPeerId, pc);

      const answer = await pc.createAnswer({
        offerToReceiveAudio: true
      });
      timeline.record('answerCreated');
      await pc.setLocalDescription(answer);

      const activeSocket = socket || this.peerSockets.get(senderPeerId);
      if (activeSocket) {
        timeline.record('answerSent');
        activeSocket.emit('rtc:answer', {
          targetPeerId: senderPeerId,
          sdp: pc.localDescription || answer,
          callId: timeline.callId
        });
        this.logDiagnostic(senderPeerId, 'answer_sent', { type: pc.localDescription?.type || answer?.type });
        this.armWatchdog(senderPeerId, activeSocket, 5000);
      }
    } catch (err) {
      console.error(`[WebRTC] Error handling offer from ${senderPeerId}:`, err);
      this.logDiagnostic(senderPeerId, 'offer_handle_error', { message: err.message });
      timeline.errors.push(err.message);
    }
  }

  /**
   * Handles incoming SDP answer from a peer safely.
   */
  async handleAnswer(senderPeerId, sdp) {
    if (!sdp || !senderPeerId) return;

    const timeline = this.getOrCreateTimeline(senderPeerId);
    timeline.record('answerReceived');

    try {
      this.logDiagnostic(senderPeerId, 'answer_received', { sdpType: sdp.type });
      const pc = this.peers.get(senderPeerId);
      if (!pc || pc.signalingState === 'closed') return;

      if (pc.signalingState !== 'have-local-offer') {
        this.logDiagnostic(senderPeerId, 'answer_ignored_unexpected_state', { state: pc.signalingState });
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      timeline.record('answerApplied');
      await this.flushIceQueue(senderPeerId, pc);
      this.logDiagnostic(senderPeerId, 'answer_applied_stable', { state: pc.signalingState });
    } catch (err) {
      console.error(`[WebRTC] Error handling answer from ${senderPeerId}:`, err);
      this.logDiagnostic(senderPeerId, 'answer_handle_error', { message: err.message });
      timeline.errors.push(err.message);
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
   * Reactivates healthy dormant connection without renegotiation (0ms reconnect).
   */
  reactivateDormantPeer(peerId) {
    if (this.dormantTimers.has(peerId)) {
      clearTimeout(this.dormantTimers.get(peerId));
      this.dormantTimers.delete(peerId);
    }

    const timeline = this.getOrCreateTimeline(peerId);
    timeline.reusedConnection = true;
    timeline.record('peerConnected');
    timeline.record('trackArrived');

    this.setLifecycleState(peerId, 'connected');
    this.setPeerMilestone(peerId, 'peer-connected');
    spatialAudioMixer.setPeerMuteState(peerId, false);

    this.logDiagnostic(peerId, 'dormant_peer_reactivated_reused');
    this.notifyStateChange();
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
      this.closePeer(peerId, { immediate: true });
    }
  }

  /**
   * Closes connection with a peer.
   * If immediate is false and connection is healthy, moves to dormant cache with a 10s grace timer.
   */
  closePeer(peerId, { immediate = false } = {}) {
    this.clearWatchdog(peerId);

    const pc = this.peers.get(peerId);
    const connState = this.connectionStates.get(peerId);

    // Teardown Hysteresis Grace:
    // If not immediate and the connection is currently connected and healthy,
    // keep it dormant in cache so rapid boundary re-entry is instant (0ms delay)!
    if (!immediate && pc && pc.signalingState !== 'closed' && connState === 'connected') {
      if (this.dormantTimers.has(peerId)) {
        clearTimeout(this.dormantTimers.get(peerId));
      }

      this.setLifecycleState(peerId, 'dormant');
      this.setPeerMilestone(peerId, 'idle');
      spatialAudioMixer.setPeerMuteState(peerId, true);

      // Bounded 10s grace timer before true teardown
      const timer = setTimeout(() => {
        this.dormantTimers.delete(peerId);
        this.logDiagnostic(peerId, 'dormant_grace_expired_closing');
        this.closePeer(peerId, { immediate: true });
      }, 10000);

      this.dormantTimers.set(peerId, timer);
      this.logDiagnostic(peerId, 'peer_moved_to_dormant_cache', { graceMs: 10000 });
      return;
    }

    // Immediate teardown
    if (this.dormantTimers.has(peerId)) {
      clearTimeout(this.dormantTimers.get(peerId));
      this.dormantTimers.delete(peerId);
    }

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
    this.peerLifecycles.delete(peerId);
    this.peerMilestones.delete(peerId);
    this.peerFlags.delete(peerId);
    this.peerSockets.delete(peerId);
    this.restartAttempts.delete(peerId);
    spatialAudioMixer.removePeer(peerId);
    this.logDiagnostic(peerId, 'peer_closed_resources_released');
    this.notifyStateChange();
  }

  /**
   * Tears down all active connections and releases microphone tracks.
   */
  destroy() {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId, { immediate: true });
    }

    for (const timer of this.dormantTimers.values()) {
      clearTimeout(timer);
    }
    this.dormantTimers.clear();

    for (const timer of this.watchdogTimers.values()) {
      clearTimeout(timer);
    }
    this.watchdogTimers.clear();

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
