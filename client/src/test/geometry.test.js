import { describe, it, expect } from 'vitest';
import {
  calculateDistance,
  calculatePan,
  calculateGain,
  lineSegmentsIntersect,
  lineIntersectsRect,
  circleCollidesWithRect
} from '../utils/geometry.js';

describe('Client Geometry & Audio Calculations', () => {
  it('calculates Euclidean distance accurately', () => {
    expect(calculateDistance({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(50);
    expect(calculateDistance({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(0);
    expect(calculateDistance(null, { x: 0, y: 0 })).toBe(Infinity);
  });

  it('calculates horizontal stereo pan correctly', () => {
    const radius = 100;
    expect(calculatePan(200, 200, radius)).toBe(0);     // Center
    expect(calculatePan(200, 300, radius)).toBe(1);     // Full Right
    expect(calculatePan(200, 100, radius)).toBe(-1);    // Full Left
    expect(calculatePan(200, 250, radius)).toBe(0.5);   // Mid Right
    expect(calculatePan(200, 500, radius)).toBe(1);     // Clamped
  });

  it('calculates quadratic gain attenuation curve and zero beyond hearing radius', () => {
    const radius = 120;
    expect(calculateGain(0, radius)).toBe(1);
    expect(calculateGain(60, radius)).toBe(0.25);
    expect(calculateGain(120, radius)).toBe(0);
    expect(calculateGain(150, radius)).toBe(0);
  });

  it('detects ray intersection through sound-blocking partitions', () => {
    const wall = { x: 200, y: 100, width: 20, height: 300 };
    // Ray crossing the wall
    expect(lineIntersectsRect({ x: 100, y: 250 }, { x: 300, y: 250 }, wall)).toBe(true);
    // Ray not crossing the wall
    expect(lineIntersectsRect({ x: 100, y: 50 }, { x: 300, y: 50 }, wall)).toBe(false);
  });

  it('detects circle vs rectangle collision', () => {
    const obstacle = { x: 100, y: 100, width: 80, height: 60 };
    expect(circleCollidesWithRect({ x: 95, y: 120, radius: 15 }, obstacle)).toBe(true);
    expect(circleCollidesWithRect({ x: 50, y: 50, radius: 15 }, obstacle)).toBe(false);
  });
});
