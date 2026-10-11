import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistance,
  calculatePan,
  calculateGain,
  lineSegmentsIntersect,
  lineIntersectsRect,
  circleCollidesWithRect
} from '../src/utils/geometry.js';

describe('Geometry & Spatial Audio Utilities', () => {
  test('calculateDistance calculates exact Euclidean distance', () => {
    assert.equal(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.equal(calculateDistance({ x: 10, y: 20 }, { x: 10, y: 20 }), 0);
    assert.equal(calculateDistance({ x: -10, y: 0 }, { x: 10, y: 0 }), 20);
    assert.equal(calculateDistance(null, { x: 0, y: 0 }), Infinity);
  });

  test('calculatePan maps relative horizontal position correctly', () => {
    const radius = 100;
    // Local is at 200
    // Remote at 200 -> center (0)
    assert.equal(calculatePan(200, 200, radius), 0);
    // Remote at 300 -> fully right (1)
    assert.equal(calculatePan(200, 300, radius), 1);
    // Remote at 100 -> fully left (-1)
    assert.equal(calculatePan(200, 100, radius), -1);
    // Remote at 250 -> half right (0.5)
    assert.equal(calculatePan(200, 250, radius), 0.5);
    // Remote at 400 -> clamped to 1
    assert.equal(calculatePan(200, 400, radius), 1);
    // Remote at 0 -> clamped to -1
    assert.equal(calculatePan(200, 0, radius), -1);
  });

  test('calculateGain follows quadratic attenuation curve and drops to 0 at/beyond boundary', () => {
    const radius = 100;
    // Distance 0 -> gain 1
    assert.equal(calculateGain(0, radius), 1);
    // Distance 50 (halfway) -> (1 - 0.5)^2 = 0.25
    assert.equal(calculateGain(50, radius), 0.25);
    // Distance 100 (at boundary) -> 0
    assert.equal(calculateGain(100, radius), 0);
    // Distance 150 (beyond boundary) -> 0
    assert.equal(calculateGain(150, radius), 0);
    // Negative distance or invalid radius -> 0
    assert.equal(calculateGain(-10, radius), 0);
    assert.equal(calculateGain(20, 0), 0);
  });

  test('lineSegmentsIntersect detects crossing segments', () => {
    const s1A = { x: 0, y: 5 };
    const s1B = { x: 10, y: 5 };
    const s2A = { x: 5, y: 0 };
    const s2B = { x: 5, y: 10 };
    assert.equal(lineSegmentsIntersect(s1A, s1B, s2A, s2B), true);

    const s3A = { x: 0, y: 0 };
    const s3B = { x: 2, y: 2 };
    const s4A = { x: 5, y: 5 };
    const s4B = { x: 7, y: 7 };
    assert.equal(lineSegmentsIntersect(s3A, s3B, s4A, s4B), false);
  });

  test('lineIntersectsRect detects ray obstruction through sound blocking obstacles', () => {
    const obstacle = { x: 100, y: 100, width: 200, height: 20 };
    // Ray crossing the obstacle vertically
    const p1 = { x: 150, y: 50 };
    const p2 = { x: 150, y: 150 };
    assert.equal(lineIntersectsRect(p1, p2, obstacle), true);

    // Ray completely clear of the obstacle
    const clearP1 = { x: 50, y: 50 };
    const clearP2 = { x: 50, y: 150 };
    assert.equal(lineIntersectsRect(clearP1, clearP2, obstacle), false);
  });

  test('circleCollidesWithRect detects avatar circle collision with walls', () => {
    const wall = { x: 100, y: 100, width: 200, height: 20 };
    const avatarTouching = { x: 100, y: 90, radius: 15 };
    assert.equal(circleCollidesWithRect(avatarTouching, wall), true);

    const avatarFar = { x: 100, y: 50, radius: 15 };
    assert.equal(circleCollidesWithRect(avatarFar, wall), false);
  });
});
