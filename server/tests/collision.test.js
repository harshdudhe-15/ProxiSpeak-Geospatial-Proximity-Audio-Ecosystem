import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionService } from '../src/services/collisionService.js';

describe('CollisionService & Boundary Clamping', () => {
  test('clampToBounds clamps position inside width and height', () => {
    const width = 1000;
    const height = 800;
    const radius = 20;

    // Out-of-bounds negative
    const p1 = CollisionService.clampToBounds({ x: -10, y: -5 }, width, height, radius);
    assert.equal(p1.x, radius);
    assert.equal(p1.y, radius);

    // Out-of-bounds excessive
    const p2 = CollisionService.clampToBounds({ x: 1200, y: 900 }, width, height, radius);
    assert.equal(p2.x, width - radius);
    assert.equal(p2.y, height - radius);

    // Inside bounds unchanged
    const p3 = CollisionService.clampToBounds({ x: 300, y: 400 }, width, height, radius);
    assert.equal(p3.x, 300);
    assert.equal(p3.y, 400);
  });

  test('resolveMovement enables sliding along walls when one axis is free', () => {
    // Wall from x: 100 to 300, y: 100 to 120
    const obstacles = [{ x: 100, y: 100, width: 200, height: 20 }];
    const oldPos = { x: 150, y: 70 };
    // Trying to move down into the wall at (160, 105)
    const proposedPos = { x: 160, y: 105 };

    const resolved = CollisionService.resolveMovement(proposedPos, oldPos, obstacles, 1000, 800);

    // Should slide along X (x: 160) and keep old Y (y: 70)
    assert.equal(resolved.x, 160);
    assert.equal(resolved.y, 70);
  });
});
