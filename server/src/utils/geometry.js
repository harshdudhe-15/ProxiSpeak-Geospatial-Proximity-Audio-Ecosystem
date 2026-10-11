/**
 * Core Geometric & Spatial Audio Calculations for ProxiSpeak
 */

/**
 * Calculates Euclidean distance between two 2D points.
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @returns {number}
 */
export function calculateDistance(p1, p2) {
  if (!p1 || !p2 || typeof p1.x !== 'number' || typeof p1.y !== 'number' ||
      typeof p2.x !== 'number' || typeof p2.y !== 'number') {
    return Infinity;
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates stereo panning [-1, 1] based on relative horizontal distance.
 * -1 = hard left, 0 = center, 1 = hard right.
 * @param {number} localX
 * @param {number} remoteX
 * @param {number} hearingRadius
 * @returns {number}
 */
export function calculatePan(localX, remoteX, hearingRadius) {
  if (!hearingRadius || hearingRadius <= 0) return 0;
  const relX = remoteX - localX;
  const pan = relX / hearingRadius;
  return Math.max(-1, Math.min(1, Number(pan.toFixed(3))));
}

/**
 * Calculates audio volume gain [0, 1] using quadratic attenuation.
 * gain = max(0, 1 - (distance / hearingRadius))^2
 * When distance >= hearingRadius, gain is 0.
 * @param {number} distance
 * @param {number} hearingRadius
 * @returns {number}
 */
export function calculateGain(distance, hearingRadius) {
  if (typeof distance !== 'number' || distance < 0 || !hearingRadius || hearingRadius <= 0) {
    return 0;
  }
  if (distance >= hearingRadius) {
    return 0;
  }
  const normalizedDistance = Math.min(1, Math.max(0, distance / hearingRadius));
  const gain = Math.pow(1 - normalizedDistance, 2);
  return Math.max(0, Math.min(1, Number(gain.toFixed(4))));
}

/**
 * Checks if 2D line segment (p1->p2) intersects another line segment (p3->p4).
 */
export function lineSegmentsIntersect(p1, p2, p3, p4) {
  const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

/**
 * Checks if a point is inside an axis-aligned rectangle.
 * @param {{x: number, y: number}} point
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {boolean}
 */
export function isPointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Checks if line of sight between p1 and p2 is blocked by an obstacle rectangle.
 * Useful for sound-blocking walls/partitions.
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {boolean}
 */
export function lineIntersectsRect(p1, p2, rect) {
  if (isPointInRect(p1, rect) || isPointInRect(p2, rect)) {
    return true;
  }

  const rLeft = rect.x;
  const rRight = rect.x + rect.width;
  const rTop = rect.y;
  const rBottom = rect.y + rect.height;

  const topLeft = { x: rLeft, y: rTop };
  const topRight = { x: rRight, y: rTop };
  const bottomLeft = { x: rLeft, y: rBottom };
  const bottomRight = { x: rRight, y: rBottom };

  return (
    lineSegmentsIntersect(p1, p2, topLeft, topRight) ||
    lineSegmentsIntersect(p1, p2, topRight, bottomRight) ||
    lineSegmentsIntersect(p1, p2, bottomRight, bottomLeft) ||
    lineSegmentsIntersect(p1, p2, bottomLeft, topLeft)
  );
}

/**
 * Circle vs Axis-Aligned Bounding Box (AABB) collision test.
 * Used for avatar sliding against desks, walls, and furniture.
 * @param {{x: number, y: number, radius: number}} circle
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {boolean}
 */
export function circleCollidesWithRect(circle, rect) {
  // Find closest point on rectangle to circle center
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;

  const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
  return distanceSquared < (circle.radius * circle.radius);
}
