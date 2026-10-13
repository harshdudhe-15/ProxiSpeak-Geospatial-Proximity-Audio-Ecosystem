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
});
