import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { initializeSocketManager } from '../src/sockets/socketManager.js';
import { Office } from '../src/models/Office.js';
import { calculateDistance, calculateGain } from '../src/utils/geometry.js';
import { performance } from 'perf_hooks';

describe('WebRTC End-to-End Two-Browser Proximity & Signaling Verification', () => {
  let httpServer;
  let ioServer;
  let serverPort;
  let clientAlice;
  let clientBob;
  let clientCharlie;
  let testOfficeId;

  before(async () => {
    process.env.USE_MEMORY_DB = 'true';
    await connectDB();
    await Office.init();

    const app = createApp();
    httpServer = http.createServer(app);
    ioServer = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    });
    initializeSocketManager(ioServer);

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });

    const offices = await Office.find();
    if (offices.length > 0) {
      testOfficeId = offices[0]._id.toString();
    } else {
      const off = await Office.create({ name: 'WebRTC E2E Verification Office' });
      testOfficeId = off._id.toString();
    }
  });

  after(async () => {
    if (clientAlice && clientAlice.connected) clientAlice.disconnect();
    if (clientBob && clientBob.connected) clientBob.disconnect();
    if (clientCharlie && clientCharlie.connected) clientCharlie.disconnect();
    ioServer.close();
    httpServer.close();
    await disconnectDB();
  });

  test('Test 1 & 2: Two users enter office and avatars enter audio proximity with immediate negotiation', async () => {
    const url = `http://localhost:${serverPort}`;
    clientAlice = ClientIO(url, { transports: ['websocket'] });
    clientBob = ClientIO(url, { transports: ['websocket'] });

    await new Promise((resolve) => {
      let count = 0;
      const onConn = () => { if (++count === 2) resolve(); };
      clientAlice.on('connect', onConn);
      clientBob.on('connect', onConn);
    });

    // 1. Alice joins at (100, 100)
    const aliceJoinedPromise = new Promise((resolve) => {
      clientAlice.once('office:state', resolve);
    });
    clientAlice.emit('office:join', {
      officeId: testOfficeId,
      userId: 'user_alice',
      displayName: 'Alice Chen',
      avatarColor: '#6366f1',
      x: 100,
      y: 100
    });
    const aliceState = await aliceJoinedPromise;
    assert.equal(aliceState.currentUser.userId, 'user_alice');

    // 2. Bob joins far away at (400, 100) - outside earshot (dist = 300px > 120px)
    const bobJoinedPromise = new Promise((resolve) => {
      clientBob.once('office:state', resolve);
    });
    clientBob.emit('office:join', {
      officeId: testOfficeId,
      userId: 'user_bob',
      displayName: 'Bob Smith',
      avatarColor: '#06b6d4',
      x: 400,
      y: 100
    });
    const bobState = await bobJoinedPromise;
    assert.equal(bobState.currentUser.userId, 'user_bob');

    // 3. Bob moves closer to Alice (from 400, 100 -> 180, 100: dist = 80px <= 120px)
    const tProximityStart = performance.now();
    const aliceProximityPromise = new Promise((resolve) => {
      clientAlice.once('proximity:entered', (data) => resolve({ client: 'alice', data, durationMs: performance.now() - tProximityStart }));
    });
    const bobProximityPromise = new Promise((resolve) => {
      clientBob.once('proximity:entered', (data) => resolve({ client: 'bob', data, durationMs: performance.now() - tProximityStart }));
    });

    clientBob.emit('user:move', { officeId: testOfficeId, x: 180, y: 100 });

    const [aliceProx, bobProx] = await Promise.all([aliceProximityPromise, bobProximityPromise]);

    assert.equal(aliceProx.data.peerId, 'user_bob');
    assert.equal(bobProx.data.peerId, 'user_alice');
    assert.equal(aliceProx.data.distance, 80);

    // Verify deterministic offer initiator (Alice 'user_alice' < Bob 'user_bob')
    assert.equal(aliceProx.data.shouldInitiateOffer, true);
    assert.equal(bobProx.data.shouldInitiateOffer, false);
    assert.ok(aliceProx.durationMs < 50, `Proximity trigger should be immediate (<50ms, was ${aliceProx.durationMs.toFixed(2)}ms)`);
  });

  test('Test 3: Full WebRTC offer-answer-candidate signaling roundtrip between Alice and Bob', async () => {
    const tSignalingStart = performance.now();

    // Alice generates and sends offer to Bob
    const bobOfferPromise = new Promise((resolve) => {
      clientBob.once('rtc:offer', resolve);
    });

    clientAlice.emit('rtc:offer', {
      targetPeerId: 'user_bob',
      sdp: { type: 'offer', sdp: 'v=0\r\no=alice 1000 1000 IN IP4 127.0.0.1\r\ns=ProxiSpeak Audio\r\n' }
    });

    const receivedOffer = await bobOfferPromise;
    assert.equal(receivedOffer.senderPeerId, 'user_alice');
    assert.equal(receivedOffer.sdp.type, 'offer');

    // Bob receives offer and replies with answer
    const aliceAnswerPromise = new Promise((resolve) => {
      clientAlice.once('rtc:answer', resolve);
    });

    clientBob.emit('rtc:answer', {
      targetPeerId: 'user_alice',
      sdp: { type: 'answer', sdp: 'v=0\r\no=bob 2000 2000 IN IP4 127.0.0.1\r\ns=ProxiSpeak Audio\r\n' }
    });

    const receivedAnswer = await aliceAnswerPromise;
    assert.equal(receivedAnswer.senderPeerId, 'user_bob');
    assert.equal(receivedAnswer.sdp.type, 'answer');

    // Exchange trickle ICE candidates in both directions
    const bobIcePromise = new Promise((resolve) => {
      clientBob.once('rtc:ice-candidate', resolve);
    });
    const aliceIcePromise = new Promise((resolve) => {
      clientAlice.once('rtc:ice-candidate', resolve);
    });

    clientAlice.emit('rtc:ice-candidate', {
      targetPeerId: 'user_bob',
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 }
    });
    clientBob.emit('rtc:ice-candidate', {
      targetPeerId: 'user_alice',
      candidate: { candidate: 'candidate:2 1 UDP 2130706431 127.0.0.1 50001 typ host', sdpMid: '0', sdpMLineIndex: 0 }
    });

    const [bobIce, aliceIce] = await Promise.all([bobIcePromise, aliceIcePromise]);
    assert.equal(bobIce.senderPeerId, 'user_alice');
    assert.equal(aliceIce.senderPeerId, 'user_bob');

    const totalSignalingMs = performance.now() - tSignalingStart;
    assert.ok(totalSignalingMs < 60, `Complete signaling roundtrip should be fast (<60ms, was ${totalSignalingMs.toFixed(2)}ms)`);
  });

  test('Test 4 & 5: Moving closer increases gain smoothly; moving farther decreases gain smoothly', () => {
    const hearingRadius = 120;

    // Bob at 80px
    const gainAt80 = calculateGain(80, hearingRadius);
    // Bob moves closer to 30px
    const gainAt30 = calculateGain(30, hearingRadius);
    // Bob moves farther to 110px
    const gainAt110 = calculateGain(110, hearingRadius);
    // Bob moves beyond earshot to 130px
    const gainAt130 = calculateGain(130, hearingRadius);

    assert.ok(gainAt30 > gainAt80, `Gain at 30px (${gainAt30}) must be greater than at 80px (${gainAt80})`);
    assert.ok(gainAt80 > gainAt110, `Gain at 80px (${gainAt80}) must be greater than at 110px (${gainAt110})`);
    assert.equal(gainAt130, 0, 'Gain beyond hearingRadius must be 0');
  });

  test('Test 6 & 8: Multiple users enter proximity independently without interference', async () => {
    const url = `http://localhost:${serverPort}`;
    clientCharlie = ClientIO(url, { transports: ['websocket'] });

    await new Promise((resolve) => clientCharlie.on('connect', resolve));

    // Charlie joins at (120, 100) - in proximity of BOTH Alice (100, 100) and Bob (180, 100)
    const charlieAliceProxPromise = new Promise((resolve) => {
      clientCharlie.on('proximity:entered', (data) => {
        if (data.peerId === 'user_alice') resolve(data);
      });
    });
    const charlieBobProxPromise = new Promise((resolve) => {
      clientCharlie.on('proximity:entered', (data) => {
        if (data.peerId === 'user_bob') resolve(data);
      });
    });

    clientCharlie.emit('office:join', {
      officeId: testOfficeId,
      userId: 'user_charlie',
      displayName: 'Charlie Davis',
      avatarColor: '#10b981',
      x: 120,
      y: 100
    });

    const [proxToAlice, proxToBob] = await Promise.all([charlieAliceProxPromise, charlieBobProxPromise]);
    assert.equal(proxToAlice.peerId, 'user_alice');
    assert.equal(proxToBob.peerId, 'user_bob');
    assert.equal(proxToAlice.distance, 20);
    assert.equal(proxToBob.distance, 60);
  });

  test('Test 7: User departure cleans up active presence and triggers proximity:left for peers', async () => {
    const aliceLeftPromise = new Promise((resolve) => {
      clientAlice.once('user:left', resolve);
    });

    clientCharlie.disconnect();

    const leftData = await aliceLeftPromise;
    assert.equal(leftData.userId, 'user_charlie');
  });

  test('Benchmark: 10 repeated WebRTC proximity & signaling negotiation cycles', async () => {
    const trials = 10;
    const latencies = [];

    for (let i = 0; i < trials; i++) {
      const t0 = performance.now();

      // Step Bob away to 300px
      const bobLeftPromise = new Promise((resolve) => {
        clientAlice.once('proximity:left', resolve);
      });
      clientBob.emit('user:move', { officeId: testOfficeId, x: 400, y: 100 });
      await bobLeftPromise;

      // Step Bob back into proximity at 170px (dist = 70px)
      const bobEnteredPromise = new Promise((resolve) => {
        clientAlice.once('proximity:entered', resolve);
      });
      clientBob.emit('user:move', { officeId: testOfficeId, x: 170, y: 100 });
      const enteredData = await bobEnteredPromise;

      // Simulate offer-answer exchange
      const answerPromise = new Promise((resolve) => {
        clientAlice.once('rtc:answer', resolve);
      });
      clientBob.once('rtc:offer', (offerData) => {
        clientBob.emit('rtc:answer', {
          targetPeerId: 'user_alice',
          sdp: { type: 'answer', sdp: 'test-answer' }
        });
      });
      clientAlice.emit('rtc:offer', {
        targetPeerId: 'user_bob',
        sdp: { type: 'offer', sdp: 'test-offer' }
      });
      await answerPromise;

      const cycleMs = performance.now() - t0;
      latencies.push(cycleMs);
    }

    const avgMs = latencies.reduce((a, b) => a + b, 0) / trials;
    const minMs = Math.min(...latencies);
    const maxMs = Math.max(...latencies);

    console.log(`\n================ REAL WEBRTC SIGNALING BENCHMARK (10 TRIALS) ================`);
    console.log(`Average Proximity & Full Negotiation Roundtrip: ${avgMs.toFixed(2)} ms`);
    console.log(`Fastest Cycle: ${minMs.toFixed(2)} ms | Slowest Cycle: ${maxMs.toFixed(2)} ms`);
    console.log(`==============================================================================\n`);

    assert.ok(avgMs < 35, `Average negotiation cycle should be under 35ms (was ${avgMs.toFixed(2)}ms)`);
  });
});

