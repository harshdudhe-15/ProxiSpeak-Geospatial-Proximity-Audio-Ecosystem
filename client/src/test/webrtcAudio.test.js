import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebRtcService } from '../services/webRtcService.js';
import { SpatialAudioMixer } from '../services/spatialAudioMixer.js';

describe('WebRTC & Spatial Audio Pipeline Unit Tests', () => {
  let webRtc;
  let mixer;

  beforeEach(() => {
    webRtc = new WebRtcService();
    mixer = new SpatialAudioMixer();
  });

  it('preserves early ICE candidates when received before getOrCreatePeer is invoked', async () => {
    const peerId = 'peer_user_123';
    const fakeCandidate = { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };

    // 1. Candidate arrives before RTCPeerConnection exists
    await webRtc.handleIceCandidate(peerId, fakeCandidate);
    expect(webRtc.iceQueues.get(peerId)).toHaveLength(1);
    expect(webRtc.iceQueues.get(peerId)[0]).toBe(fakeCandidate);

    // 2. Mock RTCPeerConnection constructor class
    const mockAddIceCandidate = vi.fn().mockResolvedValue(undefined);
    class MockRTCPeerConnection {
      constructor(config) {
        this.config = config;
        this.connectionState = 'new';
        this.iceConnectionState = 'new';
        this.signalingState = 'stable';
        this.addTrack = vi.fn();
        this.addIceCandidate = mockAddIceCandidate;
        this.createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'fake-sdp' });
        this.setLocalDescription = vi.fn().mockResolvedValue(undefined);
        this.setRemoteDescription = vi.fn().mockResolvedValue(undefined);
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockRTCPeerConnection;

    // 3. Peer connection created (must NOT overwrite iceQueues)
    const pc = webRtc.getOrCreatePeer(peerId, null);
    expect(webRtc.iceQueues.get(peerId)).toHaveLength(1);

    // 4. Flush queue
    await webRtc.flushIceQueue(peerId, pc);
    expect(mockAddIceCandidate).toHaveBeenCalledTimes(1);
    expect(webRtc.iceQueues.get(peerId)).toHaveLength(0);
  });

  it('delivers remote track via fallback MediaStream when event.streams is empty', () => {
    const peerId = 'peer_user_456';
    const fakeTrack = { kind: 'audio', id: 'track_1', stop: vi.fn() };

    class MockRTCPeerConnection {
      constructor() {
        this.connectionState = 'new';
        this.signalingState = 'stable';
        this.addTrack = vi.fn();
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockRTCPeerConnection;

    const mediaStreamSpy = vi.fn();
    class MockMediaStream {
      constructor(tracks) {
        this.tracks = tracks;
        mediaStreamSpy(tracks);
      }
      getTracks() { return this.tracks || []; }
      getAudioTracks() { return this.tracks || []; }
    }
    global.MediaStream = MockMediaStream;

    const pc = webRtc.getOrCreatePeer(peerId, null);
    expect(pc).toBeDefined();

    // Trigger ontrack with empty event.streams but valid event.track
    const fakeEvent = { streams: [], track: fakeTrack };
    pc.ontrack(fakeEvent);

    // Verify fallback MediaStream was created with event.track
    expect(mediaStreamSpy).toHaveBeenCalledWith([fakeTrack]);
  });

  it('attaches HTMLAudioElement anchor with volume 0 and muted false to prevent Chromium silencing bug', async () => {
    // Mock AudioContext and nodes
    const mockGainParam = { value: 0, setTargetAtTime: vi.fn() };
    const mockGainNode = { gain: mockGainParam, connect: vi.fn(), disconnect: vi.fn() };
    const mockAnalyserNode = { fftSize: 64, connect: vi.fn(), disconnect: vi.fn(), frequencyBinCount: 32, getByteFrequencyData: vi.fn() };
    const mockSourceNode = { connect: vi.fn(), disconnect: vi.fn() };

    const mockAudioContext = {
      state: 'running',
      currentTime: 10,
      destination: {},
      createMediaStreamSource: vi.fn().mockReturnValue(mockSourceNode),
      createGain: vi.fn().mockReturnValue(mockGainNode),
      createAnalyser: vi.fn().mockReturnValue(mockAnalyserNode),
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    };

    mixer.audioCtx = mockAudioContext;

    const fakeStream = { id: 'stream_abc', getTracks: () => [] };
    await mixer.addPeerStream('peer_789', fakeStream);

    const peerGroup = mixer.peerNodes.get('peer_789');
    expect(peerGroup).toBeDefined();
    expect(peerGroup.sourceNode).toBe(mockSourceNode);
    expect(peerGroup.gainNode).toBe(mockGainNode);
    expect(peerGroup.audioEl).toBeDefined();
    // Chromium fix: muted must be FALSE so browser audio decoder does not halt RTP frames
    expect(peerGroup.audioEl.muted).toBe(false);
    // Volume must be 0 so raw un-spatialized audio does not bypass Web Audio graph
    expect(peerGroup.audioEl.volume).toBe(0);

    // Verify spatial update
    mixer.updatePeerSpatial('peer_789', { x: 100, y: 100 }, { x: 140, y: 100 });
    expect(mockGainParam.setTargetAtTime).toHaveBeenCalled();

    // Verify cleanup
    mixer.removePeer('peer_789');
    expect(mixer.peerNodes.has('peer_789')).toBe(false);
    expect(mockGainNode.disconnect).toHaveBeenCalled();
  });

  it('resolves offer collision: polite peer rolls back while impolite peer ignores collision', async () => {
    // Test polite peer behavior
    webRtc.setLocalUserId('user_zzz'); // zzz > aaa -> isPolite = true
    expect(webRtc.isPolite('user_aaa')).toBe(true);

    const mockSetLocalDescription = vi.fn().mockResolvedValue(undefined);
    const mockSetRemoteDescription = vi.fn().mockResolvedValue(undefined);
    const mockCreateAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'fake-answer' });

    class MockPoliteRTCPeerConnection {
      constructor() {
        this.connectionState = 'new';
        this.signalingState = 'have-local-offer'; // Collision! Incoming offer while having local offer
        this.setLocalDescription = mockSetLocalDescription;
        this.setRemoteDescription = mockSetRemoteDescription;
        this.createAnswer = mockCreateAnswer;
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockPoliteRTCPeerConnection;
    global.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };

    const mockSocket = { emit: vi.fn() };
    await webRtc.handleOffer('user_aaa', { type: 'offer', sdp: 'remote-offer' }, mockSocket);

    // Polite peer rolls back local description then accepts incoming offer
    expect(mockSetLocalDescription).toHaveBeenCalledWith({ type: 'rollback' });
    expect(mockSetRemoteDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
    expect(mockCreateAnswer).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('rtc:answer', expect.anything());

    // Test impolite peer behavior
    webRtc.setLocalUserId('user_aaa'); // aaa < zzz -> isPolite = false
    expect(webRtc.isPolite('user_zzz')).toBe(false);

    const impoliteSetLocalDesc = vi.fn();
    const impoliteSetRemoteDesc = vi.fn();
    class MockImpoliteRTCPeerConnection {
      constructor() {
        this.connectionState = 'new';
        this.signalingState = 'have-local-offer'; // Collision!
        this.setLocalDescription = impoliteSetLocalDesc;
        this.setRemoteDescription = impoliteSetRemoteDesc;
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockImpoliteRTCPeerConnection;

    const impoliteSocket = { emit: vi.fn() };
    await webRtc.handleOffer('user_zzz', { type: 'offer', sdp: 'remote-offer' }, impoliteSocket);

    // Impolite peer ignores colliding offer
    expect(impoliteSetLocalDesc).not.toHaveBeenCalled();
    expect(impoliteSetRemoteDesc).not.toHaveBeenCalled();
    expect(impoliteSocket.emit).not.toHaveBeenCalled();
  });

  it('triggers bounded ICE restart on connection failure', () => {
    class MockFailingRTCPeerConnection {
      constructor() {
        this.connectionState = 'new';
        this.signalingState = 'stable';
        this.createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'restart-offer' });
        this.setLocalDescription = vi.fn().mockResolvedValue(undefined);
        this.close = vi.fn();
      }
    }
    global.RTCPeerConnection = MockFailingRTCPeerConnection;

    const mockSocket = { emit: vi.fn() };
    const pc = webRtc.getOrCreatePeer('peer_fail', mockSocket);

    expect(webRtc.restartAttempts.get('peer_fail')).toBe(0);

    // Simulate connection failure
    pc.connectionState = 'failed';
    pc.onconnectionstatechange();

    // Verify first restart attempt incremented
    expect(webRtc.restartAttempts.get('peer_fail')).toBe(1);
  });
});
