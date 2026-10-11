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

  it('attaches HTMLAudioElement anchor and builds Web Audio graph in SpatialAudioMixer', async () => {
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
    expect(peerGroup.audioEl).toBeDefined(); // HTMLAudioElement anchor exists
    expect(peerGroup.audioEl.muted).toBe(true); // Muted to prevent raw leak

    // Verify spatial update
    mixer.updatePeerSpatial('peer_789', { x: 100, y: 100 }, { x: 140, y: 100 });
    expect(mockGainParam.setTargetAtTime).toHaveBeenCalled();

    // Verify cleanup
    mixer.removePeer('peer_789');
    expect(mixer.peerNodes.has('peer_789')).toBe(false);
    expect(mockGainNode.disconnect).toHaveBeenCalled();
  });
});
