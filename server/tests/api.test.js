import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB, maskMongoUri } from '../src/config/db.js';
import { getOrCreateHeadquartersOffice, getCachedHeadquarters } from '../src/services/officeService.js';
import { Office } from '../src/models/Office.js';
import { PositionSnapshot } from '../src/models/PositionSnapshot.js';

describe('REST API & Geospatial Integration Tests', () => {
  let app;

  before(async () => {
    process.env.USE_MEMORY_DB = 'true';
    await connectDB();
    await PositionSnapshot.init();
    await Office.init();
    app = createApp();
  });

  after(async () => {
    await disconnectDB();
  });

  test('GET /health returns healthy status and database connection details', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.database, 'connected');
  });

  test('GET /api/warmup returns readiness and database status for frontend pre-warming', async () => {
    const res = await request(app).get('/api/warmup');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.database, 'connected');
  });

  test('GET /api/offices auto-seeds default office if empty', async () => {
    const res = await request(app).get('/api/offices');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert(Array.isArray(res.body.data));
    assert(res.body.data.length >= 1);
    assert.equal(res.body.data[0].name, 'ProxiSpeak Headquarters');
  });

  test('POST /api/users/session creates unique session identity', async () => {
    const res = await request(app).post('/api/users/session').send({
      displayName: 'Alice Developer',
      avatarColor: '#10b981',
      avatarIcon: 'code'
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert(res.body.data.userId.startsWith('pxs_'));
    assert.equal(res.body.data.displayName, 'Alice Developer');
  });

  test('Planar Geospatial Query: POST /api/offices/:id/snapshot & GET /nearby', async () => {
    const offices = await Office.find();
    const officeId = offices[0]._id.toString();

    // Insert Alice at (200, 200)
    await request(app).post(`/api/offices/${officeId}/snapshot`).send({
      userId: 'user-alice',
      displayName: 'Alice',
      x: 200,
      y: 200
    });

    // Insert Bob at (250, 200) -> distance = 50px
    await request(app).post(`/api/offices/${officeId}/snapshot`).send({
      userId: 'user-bob',
      displayName: 'Bob',
      x: 250,
      y: 200
    });

    // Insert Charlie at (900, 900) -> distance > 700px (far away)
    await request(app).post(`/api/offices/${officeId}/snapshot`).send({
      userId: 'user-charlie',
      displayName: 'Charlie',
      x: 900,
      y: 900
    });

    // Query planar $near from (200, 200) with radius 100
    const nearbyRes = await request(app)
      .get(`/api/offices/${officeId}/nearby?x=200&y=200&radius=100`);

    assert.equal(nearbyRes.status, 200);
    assert.equal(nearbyRes.body.success, true);
    assert.equal(nearbyRes.body.query.coordinateSystem, 'planar-2d');

    // Should include Alice (0 distance) and Bob (50px distance), but NOT Charlie
    const userIds = nearbyRes.body.data.map(u => u.userId);
    assert(userIds.includes('user-alice'));
    assert(userIds.includes('user-bob'));
    assert(!userIds.includes('user-charlie'));
  });

  test('Security: maskMongoUri redacts credentials from logs', () => {
    const rawAtlas = 'mongodb+srv://admin_user:SuperSecretPassword123@cluster0.mongodb.net/proxispeak?retryWrites=true';
    const masked = maskMongoUri(rawAtlas);
    assert(!masked.includes('SuperSecretPassword123'));
    assert(!masked.includes('admin_user'));
    assert.equal(masked, 'mongodb+srv://***:***@cluster0.mongodb.net/proxispeak?retryWrites=true');

    const standardUri = 'mongodb://user:pass@127.0.0.1:27017/proxispeak';
    assert.equal(maskMongoUri(standardUri), 'mongodb://***:***@127.0.0.1:27017/proxispeak');
  });

  test('Headquarters in-memory cache returns office layout with zero database round-trip', async () => {
    const hq = await getOrCreateHeadquartersOffice();
    assert.equal(hq.name, 'ProxiSpeak Headquarters');

    const cached = getCachedHeadquarters();
    assert.ok(cached);
    assert.equal(cached.name, 'ProxiSpeak Headquarters');

    // Repeated call returns identical cached reference in 0ms
    const repeated = await getOrCreateHeadquartersOffice();
    assert.equal(repeated, cached);
  });
});
