import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRtcService } from '../services/webRtcService.js';
import { SpatialAudioMixer } from '../services/spatialAudioMixer.js';

describe('WebRTC Connection Latency, Timeline & Optimization Tests', () => {
  let aliceWebRtc;
  let bobWebRtc;
  let mockSocketAlice;
  let mockSocketBob;

  beforeEach(() => {
    aliceWebRtc = new WebRtcService();
    bobWebRtc = new WebRtcService();

    aliceWebRtc.setLocalUserId('user_alice');
    bobWebRtc.setLocalUserId('user_bob');

    // Create bidirectional mock signaling socket bridge
    mockSocketAlice = {
      emit: vi.fn((event, data) => {
        if (event === 'rtc:offer') {
          setTimeout(() => bobWebRtc.handleOffer('user_alice', data.sdp, mockSocketBob), 5);
        } else if (event === 'rtc:ice-candidate') {
          setTimeout(() => bobWebRtc.handleIceCandidate('user_alice', data.candidate), 2);
        }
      })
    };

    mockSocketBob = {
      emit: vi.fn((event, data) => {
        if (event === 'rtc:answer') {
          setTimeout(() => aliceWebRtc.handleAnswer('user_bob', data.sdp), 5);
        } else if (event === 'rtc:ice-candidate') {
          setTimeout(() => aliceWebRtc.handleIceCandidate('user_bob', data.candidate), 2);
        }
      })
    };
  });

  afterEach(() => {
    aliceWebRtc.destroy();
    bobWebRtc.destroy();
  });

  it('PRIORITY 1 & 2: accurately measures 16-stage connection timeline using monotonic clocks', async () => {
    class MockPeerConnection {
      constructor(config) {
        this.config = config;
        this.connectionState = 'new';
        this.iceConnectionState = 'new';
        this.iceGatheringState = 'new';
        this.signalingState = 'stable';
        this.localDescription = null;
        this.remoteDescription = null;
        this.senders = [];
        this.onicecandidate = null;
        this.ontrack = null;
        this.oniceconnectionstatechange = null;
        this.onconnectionstatechange = null;
      }
      addTrack(track, stream) {
        this.senders.push({ track, kind: 'audio' });
        return { track };
      }
      getSenders() { return this.senders; }
      createOffer() {
        return Promise.resolve({ type: 'offer', sdp: 'v=0\r\no=alice 1 1 IN IP4 127.0.0.1\r\n' });
      }
      createAnswer() {
        return Promise.resolve({ type: 'answer', sdp: 'v=0\r\no=bob 2 2 IN IP4 127.0.0.1\r\n' });
      }
      setLocalDescription(desc) {
        this.localDescription = desc;
        this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
        // Simulate candidate gathering
        setTimeout(() => {
          if (this.onicecandidate) {
            this.onicecandidate({
              candidate: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 50000 typ host', type: 'host' }
            });
            this.onicecandidate({ candidate: null }); // End of candidates
          }
        }, 10);
        return Promise.resolve();
      }
      setRemoteDescription(desc) {
        this.remoteDescription = desc;
        this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
        return Promise.resolve();
      }
      addIceCandidate() {
        return Promise.resolve();
      }
      close() {
        this.signalingState = 'closed';
        this.connectionState = 'closed';
      }
    }

    global.RTCPeerConnection = MockPeerConnection;
    global.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };

    // 1. Proximity detected at t0
    const t0 = performance.now();
    const aliceTimeline = aliceWebRtc.getOrCreateTimeline('user_bob', true);
    aliceTimeline.record('proximityDetected', t0);

    // 2. Alice initiates offer
    await aliceWebRtc.initiateOffer('user_bob', mockSocketAlice);
    expect(mockSocketAlice.emit).toHaveBeenCalledWith('rtc:offer', expect.anything());

    // Wait for signaling handshake to complete
    await new Promise(r => setTimeout(r, 40));

    // Simulate ICE connected and peer connected
    const alicePc = aliceWebRtc.peers.get('user_bob');
    expect(alicePc).toBeDefined();

    alicePc.iceConnectionState = 'connected';
    if (alicePc.oniceconnectionstatechange) alicePc.oniceconnectionstatechange();

    alicePc.connectionState = 'connected';
    if (alicePc.onconnectionstatechange) alicePc.onconnectionstatechange();

    // Simulate remote track arrival
    const fakeTrack = { id: 'track_bob', kind: 'audio', readyState: 'live', enabled: true };
    if (alicePc.ontrack) {
      alicePc.ontrack({ track: fakeTrack, streams: [] });
    }

    const summary = aliceWebRtc.getTimelineSummary('user_bob');
    expect(summary).toBeDefined();
    expect(summary.totalToPeerConnectedMs).toBeGreaterThanOrEqual(0);
    expect(summary.totalToTrackArrivalMs).toBeGreaterThanOrEqual(0);
    expect(summary.timestamps.offerCreated).toBeGreaterThanOrEqual(t0);
    expect(summary.timestamps.offerSent).toBeGreaterThanOrEqual(summary.timestamps.offerCreated);
    expect(summary.candidateCounts.host).toBeGreaterThanOrEqual(1);
    expect(typeof summary.largestDelayStage).toBe('string');
  });

  it('PRIORITY 2: connection reuse on re-entry eliminates renegotiation delay (0ms reconnect)', async () => {
    class MockPeerConnection {
      constructor(config) {
        this.connectionState = 'connected';
        this.signalingState = 'stable';
        this.close = vi.fn();
      }
      createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test' });
      setLocalDescription = vi.fn().mockResolvedValue(undefined);
    }
    global.RTCPeerConnection = MockPeerConnection;

    // Simulate active connected peer
    aliceWebRtc.getOrCreatePeer('user_bob', mockSocketAlice);
    aliceWebRtc.connectionStates.set('user_bob', 'connected');
    aliceWebRtc.setLifecycleState('user_bob', 'connected');

    // Avatar moves out of proximity: non-immediate close moves to dormant grace cache
    aliceWebRtc.closePeer('user_bob', { immediate: false });
    expect(aliceWebRtc.getLifecycleState('user_bob')).toBe('dormant');
    expect(aliceWebRtc.peers.has('user_bob')).toBe(true); // Connection preserved!

    // Avatar re-enters earshot: initiateOffer reuses dormant connection without renegotiating!
    const offerSpy = vi.spyOn(aliceWebRtc, 'initiateOffer');
    await aliceWebRtc.initiateOffer('user_bob', mockSocketAlice);

    expect(aliceWebRtc.getLifecycleState('user_bob')).toBe('connected');
    const summary = aliceWebRtc.getTimelineSummary('user_bob');
    expect(summary.reusedConnection).toBe(true);

    // No duplicate SDP offer was emitted to socket!
    expect(mockSocketAlice.emit).not.toHaveBeenCalledWith('rtc:offer', expect.anything());
  });

  it('PRIORITY 2: ignores redundant connection requests when already connecting or connected', async () => {
    class MockPeerConnection {
      constructor() {
        this.connectionState = 'connecting';
        this.signalingState = 'have-local-offer';
        this.close = vi.fn();
      }
      createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test' });
      setLocalDescription = vi.fn().mockResolvedValue(undefined);
    }
    global.RTCPeerConnection = MockPeerConnection;

    aliceWebRtc.getOrCreatePeer('user_bob', mockSocketAlice);
    aliceWebRtc.setLifecycleState('user_bob', 'connecting');

    // Repeated call while connecting must NOT fire another offer
    await aliceWebRtc.initiateOffer('user_bob', mockSocketAlice);
    expect(mockSocketAlice.emit).not.toHaveBeenCalledWith('rtc:offer', expect.anything());
  });

  it('PRIORITY 3 & 4: supports trickle ICE with iceCandidatePoolSize and early candidate queuing', async () => {
    let observedConfig = null;
    class MockPeerConnection {
      constructor(config) {
        observedConfig = config;
        this.connectionState = 'new';
        this.signalingState = 'stable';
        this.addIceCandidate = vi.fn().mockResolvedValue(undefined);
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockPeerConnection;

    // Verify iceCandidatePoolSize is configured for fast pre-gathering
    aliceWebRtc.getOrCreatePeer('user_bob', mockSocketAlice);
    expect(observedConfig).toBeDefined();
    expect(observedConfig.iceCandidatePoolSize).toBe(2);

    // Verify candidates arriving before remote description are safely queued
    const fakeCandidate = { candidate: 'candidate:1 1 UDP 1 127.0.0.1 5000 typ host', sdpMid: '0' };
    await aliceWebRtc.handleIceCandidate('user_charlie', fakeCandidate);
    expect(aliceWebRtc.iceQueues.get('user_charlie')).toContain(fakeCandidate);
  });

  it('PRIORITY 5: distinguishes connecting, peer-connected, track-received, playback-ready, and audio-audible milestones', () => {
    const peerId = 'user_david';

    expect(aliceWebRtc.getPeerMilestone(peerId)).toBe('idle');

    aliceWebRtc.setPeerMilestone(peerId, 'connecting');
    expect(aliceWebRtc.getPeerMilestone(peerId)).toBe('connecting');

    aliceWebRtc.setPeerMilestone(peerId, 'peer-connected');
    expect(aliceWebRtc.getPeerMilestone(peerId)).toBe('peer-connected');

    aliceWebRtc.setPeerMilestone(peerId, 'track-received');
    expect(aliceWebRtc.getPeerMilestone(peerId)).toBe('track-received');

    aliceWebRtc.setPeerMilestone(peerId, 'playback-ready');
    expect(aliceWebRtc.getPeerMilestone(peerId)).toBe('playback-ready');

    aliceWebRtc.setPeerMilestone(peerId, 'audio-audible');
    expect(aliceWebRtc.getPeerMilestone(peerId)).toBe('audio-audible');
  });

  it('PRIORITY 6: recovers from stalled signaling using bounded watchdog timer', async () => {
    vi.useFakeTimers();

    class MockPeerConnection {
      constructor() {
        this.connectionState = 'new';
        this.signalingState = 'stable';
        this.createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test' });
        this.setLocalDescription = vi.fn().mockResolvedValue(undefined);
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockPeerConnection;

    const droppedSocket = { emit: vi.fn() };
    const recoverySpy = vi.spyOn(aliceWebRtc, 'handleConnectionFailure');
    await aliceWebRtc.initiateOffer('user_bob', droppedSocket);

    expect(aliceWebRtc.watchdogTimers.has('user_bob')).toBe(true);

    // Fast-forward 5500ms without connection success -> watchdog triggers recovery
    vi.advanceTimersByTime(5500);
    expect(recoverySpy).toHaveBeenCalledWith('user_bob', droppedSocket);

    vi.useRealTimers();
  });

  it('ACCURATE UI STATES: never displays LIVE prematurely and verifies all 6 connection states', async () => {
    const peerId = 'user_charlie';

    // 1. Initial State: IDLE
    const initialStatus = aliceWebRtc.getDetailedPeerState(peerId);
    expect(initialStatus.state).toBe('IDLE');
    expect(initialStatus.isLive).toBe(false);

    // 2. Proximity Entered / Negotiation in progress: CONNECTING (never LIVE!)
    aliceWebRtc.handleProximityEntered(peerId, false, mockSocketAlice);
    const connectingStatus = aliceWebRtc.getDetailedPeerState(peerId);
    expect(connectingStatus.state).toBe('CONNECTING');
    expect(connectingStatus.label).toBe('Connecting...');
    expect(connectingStatus.isLive).toBe(false); // MUST NOT BE LIVE!

    // 3. Transport Connected: CONNECTED (still NOT LIVE if track is muted or not yet streaming)
    const pc = aliceWebRtc.peers.get(peerId);
    expect(pc).toBeDefined();
    aliceWebRtc.connectionStates.set(peerId, 'connected');
    pc.iceConnectionState = 'connected';
    pc.connectionState = 'connected';

    const connectedStatus = aliceWebRtc.getDetailedPeerState(peerId);
    expect(connectedStatus.state).toBe('CONNECTED');
    expect(connectedStatus.label).toBe('Connected');
    expect(connectedStatus.isLive).toBe(false); // MUST NOT BE LIVE YET!

    // 4. Remote track received, unmuted (RTP flowing) and playable: LIVE
    const fakeLiveTrack = { id: 'track_live', kind: 'audio', readyState: 'live', muted: false, enabled: true };
    pc.getReceivers = () => [{ track: fakeLiveTrack }];

    const liveStatus = aliceWebRtc.getDetailedPeerState(peerId);
    expect(liveStatus.state).toBe('LIVE');
    expect(liveStatus.label).toBe('Audio Live');
    expect(liveStatus.isLive).toBe(true); // VERIFIED LIVE!

    // 5. Temporary disconnection: RECONNECTING
    aliceWebRtc.connectionStates.set(peerId, 'disconnected');
    const reconnectingStatus = aliceWebRtc.getDetailedPeerState(peerId);
    expect(reconnectingStatus.state).toBe('RECONNECTING');
    expect(reconnectingStatus.isLive).toBe(false);

    // 6. Hard failure: FAILED
    aliceWebRtc.connectionStates.set(peerId, 'failed');
    const failedStatus = aliceWebRtc.getDetailedPeerState(peerId);
    expect(failedStatus.state).toBe('FAILED');
    expect(failedStatus.isLive).toBe(false);
  });

  it('TIMING DIAGNOSTICS: accurately computes total establishment, signaling exchange, ICE negotiation, and playback startup metrics', () => {
    const peerId = 'user_metrics';
    const tl = aliceWebRtc.getOrCreateTimeline(peerId, true);

    const t0 = 1000;
    tl.record('proximityThresholdCrossed', t0);
    tl.record('peerConnectionCreated', t0 + 2);
    tl.record('micStreamReady', t0 + 5);
    tl.record('sdpOfferCreated', t0 + 12);
    tl.record('offerDelivered', t0 + 15);
    tl.record('offerReceived', t0 + 25);
    tl.record('answerReceived', t0 + 45); // Signaling exchange: 45 - 15 = 30ms
    tl.record('remoteDescriptionApplied', t0 + 50);
    tl.record('firstIceCandidateGenerated', t0 + 18);
    tl.record('firstRemoteIceCandidateReceived', t0 + 35);
    tl.record('iceConnectionEstablished', t0 + 95); // ICE negotiation: 95 - 50 = 45ms
    tl.record('remoteAudioTrackReceived', t0 + 98);
    tl.record('remoteAudioPlaybackStarted', t0 + 110); // Playback startup: 110 - 98 = 12ms; Total: 110ms

    const summary = tl.getSummary();
    expect(summary.totalConnectionEstablishmentMs).toBe(110);
    expect(summary.signalingExchangeMs).toBe(30);
    expect(summary.iceNegotiationMs).toBe(45);
    expect(summary.remoteAudioPlaybackStartupMs).toBe(12);
    expect(summary.callId).toContain(peerId);
  });
});
