import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProximityEngine } from '../src/services/proximityEngine.js';

describe('ProximityEngine Behavior & Hysteresis', () => {
  test('detects proximity entry within hearingRadius and designates deterministic initiator', () => {
    const engine = new ProximityEngine({ hearingRadius: 100, exitGrace: 20 });
    const officeId = 'office-test-1';

    // User A at (100, 100)
    engine.addUser(officeId, { userId: 'alice', socketId: 's_alice', x: 100, y: 100 });

    // User B at (180, 100) -> distance = 80 <= 100 (in range)
    const res = engine.addUser(officeId, { userId: 'bob', socketId: 's_bob', x: 180, y: 100 });

    assert.equal(res.enteredPairs.length, 1);
    assert.equal(res.leftPairs.length, 0);

    const pair = res.enteredPairs[0];
    assert.equal(pair.distance, 80);
    // 'alice' < 'bob', so alice must be deterministic initiator
    assert.equal(pair.initiatorId, 'alice');
  });

  test('applies hysteresis grace period to prevent jitter at boundary', () => {
    // hearingRadius = 100, exitGrace = 20 -> exitRadius = 120
    const engine = new ProximityEngine({ hearingRadius: 100, exitGrace: 20 });
    const officeId = 'office-test-2';

    engine.addUser(officeId, { userId: 'alice', socketId: 's_alice', x: 100, y: 100 });
    // Bob enters at distance 90
    engine.addUser(officeId, { userId: 'bob', socketId: 's_bob', x: 190, y: 100 });

    // Bob moves to (210, 100) -> distance = 110
    // 110 > 100 (hearing radius), BUT 110 <= 120 (within hysteresis grace!)
    // Bob should NOT exit yet!
    const move1 = engine.updatePosition(officeId, 'bob', 210, 100);
    assert.equal(move1.leftPairs.length, 0);
    assert.equal(move1.currentNeighbors.length, 1);

    // Bob moves further to (230, 100) -> distance = 130 > 120
    // Now Bob crosses the exit grace boundary -> leftPairs must trigger!
    const move2 = engine.updatePosition(officeId, 'bob', 230, 100);
    assert.equal(move2.leftPairs.length, 1);
    assert.equal(move2.leftPairs[0].peerB, 'alice');
    assert.equal(move2.currentNeighbors.length, 0);
  });

  test('cleans up pairs and notifies active peers when a user departs', () => {
    const engine = new ProximityEngine({ hearingRadius: 100, exitGrace: 20 });
    const officeId = 'office-test-3';

    engine.addUser(officeId, { userId: 'alice', socketId: 's_alice', x: 100, y: 100 });
    engine.addUser(officeId, { userId: 'bob', socketId: 's_bob', x: 150, y: 100 });

    const departedPeers = engine.removeUser(officeId, 'alice');
    assert.deepEqual(departedPeers, ['bob']);

    // Check office users remaining
    const remaining = engine.getOfficeUsers(officeId);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].userId, 'bob');
  });
});
