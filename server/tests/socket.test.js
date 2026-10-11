import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { initializeSocketManager } from '../src/sockets/socketManager.js';
import { Office } from '../src/models/Office.js';

describe('Real-Time Socket.IO Signaling & Movement Integration', () => {
  let httpServer;
  let ioServer;
  let serverPort;
  let clientAlice;
  let clientBob;
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
      const off = await Office.create({ name: 'Signaling Test Office' });
      testOfficeId = off._id.toString();
    }
  });

  after(async () => {
    if (clientAlice && clientAlice.connected) clientAlice.disconnect();
    if (clientBob && clientBob.connected) clientBob.disconnect();
    ioServer.close();
    httpServer.close();
    await disconnectDB();
  });

  test('connects two clients, joins office, and verifies initial state sync', async () => {
    const url = `http://localhost:${serverPort}`;

    clientAlice = ClientIO(url, { transports: ['websocket'] });
    clientBob = ClientIO(url, { transports: ['websocket'] });

    await new Promise((resolve) => {
      let connectedCount = 0;
      const check = () => {
        connectedCount++;
        if (connectedCount === 2) resolve();
      };
      clientAlice.on('connect', check);
      clientBob.on('connect', check);
    });

    assert.equal(clientAlice.connected, true);
    assert.equal(clientBob.connected, true);

    // Alice joins office at (100, 100)
    const aliceStatePromise = new Promise((resolve) => {
      clientAlice.once('office:state', resolve);
    });

    clientAlice.emit('office:join', {
      officeId: testOfficeId,
      userId: 'user-alice',
      displayName: 'Alice',
      avatarColor: '#6366f1',
      x: 100,
      y: 100
    });

    const aliceState = await aliceStatePromise;
    assert.equal(aliceState.officeId, testOfficeId);
    assert.equal(aliceState.currentUser.userId, 'user-alice');
    assert.equal(aliceState.currentUser.displayName, 'Alice');
    assert.equal(aliceState.hearingRadius, 120);
  });

  test('triggers proximity:entered when Bob joins within earshot with deterministic initiator', async () => {
    // Bob joins at (180, 100) -> distance = 80px <= 120px
    const bobProximityPromise = new Promise((resolve) => {
      clientBob.once('proximity:entered', resolve);
    });
    const aliceProximityPromise = new Promise((resolve) => {
      clientAlice.once('proximity:entered', resolve);
    });

    clientBob.emit('office:join', {
      officeId: testOfficeId,
      userId: 'user-bob',
      displayName: 'Bob',
      avatarColor: '#10b981',
      x: 180,
      y: 100
    });

    const [bobProx, aliceProx] = await Promise.all([bobProximityPromise, aliceProximityPromise]);

    assert.equal(bobProx.peerId, 'user-alice');
    assert.equal(bobProx.distance, 80);
    // user-alice < user-bob, so Bob should NOT initiate, Alice SHOULD initiate
    assert.equal(bobProx.shouldInitiateOffer, false);

    assert.equal(aliceProx.peerId, 'user-bob');
    assert.equal(aliceProx.distance, 80);
    assert.equal(aliceProx.shouldInitiateOffer, true);
  });

  test('relays WebRTC offer, answer, and ice-candidate between peers', async () => {
    // Alice sends offer to Bob
    const bobOfferPromise = new Promise((resolve) => {
      clientBob.once('rtc:offer', resolve);
    });

    clientAlice.emit('rtc:offer', {
      targetPeerId: 'user-bob',
      sdp: { type: 'offer', sdp: 'fake-offer-sdp' }
    });

    const receivedOffer = await bobOfferPromise;
    assert.equal(receivedOffer.senderPeerId, 'user-alice');
    assert.equal(receivedOffer.sdp.sdp, 'fake-offer-sdp');

    // Bob sends answer back to Alice
    const aliceAnswerPromise = new Promise((resolve) => {
      clientAlice.once('rtc:answer', resolve);
    });

    clientBob.emit('rtc:answer', {
      targetPeerId: 'user-alice',
      sdp: { type: 'answer', sdp: 'fake-answer-sdp' }
    });

    const receivedAnswer = await aliceAnswerPromise;
    assert.equal(receivedAnswer.senderPeerId, 'user-bob');
    assert.equal(receivedAnswer.sdp.sdp, 'fake-answer-sdp');

    // Alice sends ICE candidate to Bob
    const bobIcePromise = new Promise((resolve) => {
      clientBob.once('rtc:ice-candidate', resolve);
    });

    clientAlice.emit('rtc:ice-candidate', {
      targetPeerId: 'user-bob',
      candidate: { candidate: 'candidate:test', sdpMid: '0', sdpMLineIndex: 0 }
    });

    const receivedIce = await bobIcePromise;
    assert.equal(receivedIce.senderPeerId, 'user-alice');
    assert.equal(receivedIce.candidate.candidate, 'candidate:test');
  });

  test('synchronizes microphone mute/unmute state broadcast', async () => {
    const bobMutePromise = new Promise((resolve) => {
      clientBob.once('audio:state-changed', resolve);
    });

    clientAlice.emit('audio:state', {
      officeId: testOfficeId,
      micMuted: true
    });

    const muteData = await bobMutePromise;
    assert.equal(muteData.userId, 'user-alice');
    assert.equal(muteData.micMuted, true);
  });

  test('synchronizes movement and triggers proximity:left when moving beyond hysteresis', async () => {
    // Bob moves to (300, 100) -> distance = 200px > 145px (120 + 25 grace)
    const aliceMovedPromise = new Promise((resolve) => {
      clientAlice.once('user:moved', resolve);
    });
    const aliceLeftPromise = new Promise((resolve) => {
      clientAlice.once('proximity:left', resolve);
    });

    clientBob.emit('user:move', {
      officeId: testOfficeId,
      x: 300,
      y: 100
    });

    const movedData = await aliceMovedPromise;
    assert.equal(movedData.userId, 'user-bob');
    assert.equal(movedData.x, 300);
    assert.equal(movedData.y, 100);

    const leftData = await aliceLeftPromise;
    assert.equal(leftData.peerId, 'user-bob');
    assert.equal(leftData.distance, 200);
  });

  test('handles user departure and cleans up presence state', async () => {
    const aliceDeparturePromise = new Promise((resolve) => {
      clientAlice.once('user:left', resolve);
    });

    clientBob.emit('office:leave');

    const departed = await aliceDeparturePromise;
    assert.equal(departed.userId, 'user-bob');
  });
});
