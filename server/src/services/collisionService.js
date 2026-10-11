import { circleCollidesWithRect } from '../utils/geometry.js';
import { AVATAR_RADIUS } from '../config/constants.js';

/**
 * Validates and clamps movement to office boundaries and obstacle collisions.
 */
export class CollisionService {
  /**
   * Clamps avatar position strictly inside office boundaries.
   * @param {{x: number, y: number}} pos
   * @param {number} officeWidth
   * @param {number} officeHeight
   * @param {number} [radius=AVATAR_RADIUS]
   * @returns {{x: number, y: number}}
   */
  static clampToBounds(pos, officeWidth, officeHeight, radius = AVATAR_RADIUS) {
    const minX = radius;
    const maxX = Math.max(minX, officeWidth - radius);
    const minY = radius;
    const maxY = Math.max(minY, officeHeight - radius);

    return {
      x: Math.max(minX, Math.min(maxX, pos.x)),
      y: Math.max(minY, Math.min(maxY, pos.y))
    };
  }

  /**
   * Checks if an avatar at a proposed position collides with any solid walls or furniture.
   * @param {{x: number, y: number}} pos
   * @param {Array} obstacles - list of walls/furniture with { x, y, width, height }
   * @param {number} [radius=AVATAR_RADIUS]
   * @returns {boolean}
   */
  static isColliding(pos, obstacles = [], radius = AVATAR_RADIUS) {
    if (!obstacles || !obstacles.length) return false;
    const circle = { x: pos.x, y: pos.y, radius };

    for (const obstacle of obstacles) {
      if (circleCollidesWithRect(circle, obstacle)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validates and resolves position, preventing wall clipping.
   * If colliding, attempts axis sliding (x-only or y-only), otherwise keeps old position.
   * @param {{x: number, y: number}} newPos
   * @param {{x: number, y: number}} oldPos
   * @param {Array} obstacles
   * @param {number} officeWidth
   * @param {number} officeHeight
   * @returns {{x: number, y: number}}
   */
  static resolveMovement(newPos, oldPos, obstacles = [], officeWidth = 1400, officeHeight = 900) {
    const clampedNew = this.clampToBounds(newPos, officeWidth, officeHeight);

    if (!this.isColliding(clampedNew, obstacles)) {
      return clampedNew;
    }

    // Try sliding horizontally
    const slideX = this.clampToBounds({ x: clampedNew.x, y: oldPos.y }, officeWidth, officeHeight);
    if (!this.isColliding(slideX, obstacles)) {
      return slideX;
    }

    // Try sliding vertically
    const slideY = this.clampToBounds({ x: oldPos.x, y: clampedNew.y }, officeWidth, officeHeight);
    if (!this.isColliding(slideY, obstacles)) {
      return slideY;
    }

    // Completely blocked, retain old position
    return oldPos;
  }
}
