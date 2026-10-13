import { calculateDistance, lineIntersectsRect } from '../utils/geometry.js';
import { DEFAULT_HEARING_RADIUS, DEFAULT_EXIT_GRACE } from '../config/constants.js';

/**
 * High-performance In-Memory Geospatial Proximity Engine
 * Tracks real-time avatar positions, evaluates earshot thresholds with hysteresis,
 * checks sound-blocking obstacle obstructions, and coordinates WebRTC peer pairings.
 */
export class ProximityEngine {
  constructor(options = {}) {
    this.hearingRadius = options.hearingRadius || DEFAULT_HEARING_RADIUS;
    this.exitGrace = options.exitGrace || DEFAULT_EXIT_GRACE;
    this.exitRadius = this.hearingRadius + this.exitGrace;
    this.prewarmRadius = options.prewarmRadius || (this.hearingRadius + 40);

    // officeId -> Map<userId, { userId, socketId, displayName, avatarColor, avatarIcon, x, y, micMuted, lastMoveTime }>
    this.officeUsers = new Map();

    // officeId -> Set<string> canonical pair keys: "userIdA:userIdB" (where userIdA < userIdB)
    this.activePairs = new Map();

    // officeId -> Set<string> prewarmed pair keys approaching earshot
    this.prewarmPairs = new Map();

    // officeId -> Array<obstacle> (sound blocking walls/furniture)
    this.officeObstacles = new Map();
  }

  /**
   * Generates a canonical pair key between two user IDs.
   */
  getPairKey(userA, userB) {
    return userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`;
  }

  /**
   * Sets or updates obstacles (walls/furniture) for an office.
   */
  setOfficeObstacles(officeId, obstacles = []) {
    this.officeObstacles.set(officeId, obstacles);
  }

  /**
   * Registers a user in an office.
   */
  addUser(officeId, user) {
    if (!this.officeUsers.has(officeId)) {
      this.officeUsers.set(officeId, new Map());
      this.activePairs.set(officeId, new Set());
      this.prewarmPairs.set(officeId, new Set());
    }

    const usersMap = this.officeUsers.get(officeId);
    usersMap.set(user.userId, {
      ...user,
      x: Number(user.x) || 100,
      y: Number(user.y) || 100,
      micMuted: Boolean(user.micMuted),
      lastMoveTime: Date.now()
    });

    return this.evaluateUserProximity(officeId, user.userId);
  }

  /**
   * Removes a user from an office and cleans up all active pairs.
   * Returns list of affected peer IDs who lost proximity.
   */
  removeUser(officeId, userId) {
    const usersMap = this.officeUsers.get(officeId);
    const pairsSet = this.activePairs.get(officeId);
    const prewarmSet = this.prewarmPairs.get(officeId);
    const departedPeers = [];

    if (!usersMap || !usersMap.has(userId)) {
      return departedPeers;
    }

    usersMap.delete(userId);

    if (pairsSet) {
      for (const pairKey of Array.from(pairsSet)) {
        const [u1, u2] = pairKey.split(':');
        if (u1 === userId || u2 === userId) {
          pairsSet.delete(pairKey);
          const peerId = u1 === userId ? u2 : u1;
          departedPeers.push(peerId);
        }
      }
    }

    if (prewarmSet) {
      for (const pairKey of Array.from(prewarmSet)) {
        const [u1, u2] = pairKey.split(':');
        if (u1 === userId || u2 === userId) {
          prewarmSet.delete(pairKey);
        }
      }
    }

    if (usersMap.size === 0) {
      this.officeUsers.delete(officeId);
      this.activePairs.delete(officeId);
      this.prewarmPairs.delete(officeId);
      this.officeObstacles.delete(officeId);
    }

    return departedPeers;
  }

  /**
   * Updates a user's position and calculates proximity transitions.
   * Returns:
   *  - enteredPairs: Array<{ peerA, peerB, distance, isObstructed }>
   *  - leftPairs: Array<{ peerA, peerB, distance }>
   *  - currentNeighbors: Array<{ peerId, distance, isObstructed }>
   */
  updatePosition(officeId, userId, newX, newY) {
    const usersMap = this.officeUsers.get(officeId);
    if (!usersMap || !usersMap.has(userId)) {
      return { enteredPairs: [], leftPairs: [], currentNeighbors: [] };
    }

    const user = usersMap.get(userId);
    user.x = newX;
    user.y = newY;
    user.lastMoveTime = Date.now();

    return this.evaluateUserProximity(officeId, userId);
  }

  /**
   * Checks line-of-sight obstruction between two users in an office.
   */
  isObstructed(officeId, p1, p2) {
    const obstacles = this.officeObstacles.get(officeId);
    if (!obstacles || !obstacles.length) return false;

    for (const obstacle of obstacles) {
      if (obstacle.soundBlocking && lineIntersectsRect(p1, p2, obstacle)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluates proximity between a specified user and all other users in the office.
   */
  evaluateUserProximity(officeId, userId) {
    const usersMap = this.officeUsers.get(officeId);
    const pairsSet = this.activePairs.get(officeId);
    const prewarmSet = this.prewarmPairs.get(officeId);

    if (!usersMap || !pairsSet || !usersMap.has(userId)) {
      return { enteredPairs: [], leftPairs: [], currentNeighbors: [], prewarmPairs: [] };
    }

    const targetUser = usersMap.get(userId);
    const enteredPairs = [];
    const leftPairs = [];
    const currentNeighbors = [];
    const prewarmPairs = [];

    for (const [otherId, otherUser] of usersMap.entries()) {
      if (otherId === userId) continue;

      const dist = calculateDistance(
        { x: targetUser.x, y: targetUser.y },
        { x: otherUser.x, y: otherUser.y }
      );

      const pairKey = this.getPairKey(userId, otherId);
      const isCurrentlyConnected = pairsSet.has(pairKey);
      const obstructed = this.isObstructed(
        officeId,
        { x: targetUser.x, y: targetUser.y },
        { x: otherUser.x, y: otherUser.y }
      );

      if (isCurrentlyConnected) {
        // Hysteresis exit check: only leave if distance exceeds exitRadius
        if (dist > this.exitRadius) {
          pairsSet.delete(pairKey);
          leftPairs.push({
            peerA: userId,
            peerB: otherId,
            distance: dist
          });
        } else {
          currentNeighbors.push({
            peerId: otherId,
            distance: dist,
            isObstructed: obstructed
          });
        }
      } else {
        // Enter check: enter if within hearingRadius
        if (dist <= this.hearingRadius) {
          pairsSet.add(pairKey);
          if (prewarmSet) prewarmSet.delete(pairKey);
          enteredPairs.push({
            peerA: userId,
            peerB: otherId,
            distance: dist,
            isObstructed: obstructed,
            // Designated offer initiator: peer with lexicographically smaller ID
            initiatorId: userId < otherId ? userId : otherId
          });
          currentNeighbors.push({
            peerId: otherId,
            distance: dist,
            isObstructed: obstructed
          });
        } else if (dist <= this.prewarmRadius) {
          // Bounded prewarm zone: user is approaching earshot
          if (prewarmSet && !prewarmSet.has(pairKey)) {
            prewarmSet.add(pairKey);
            prewarmPairs.push({
              peerA: userId,
              peerB: otherId,
              distance: dist,
              isObstructed: obstructed,
              initiatorId: userId < otherId ? userId : otherId
            });
          }
        } else if (prewarmSet && prewarmSet.has(pairKey) && dist > this.prewarmRadius + this.exitGrace) {
          prewarmSet.delete(pairKey);
        }
      }
    }

    return { enteredPairs, leftPairs, currentNeighbors, prewarmPairs };
  }

  /**
   * Returns list of all active users in an office.
   */
  getOfficeUsers(officeId) {
    const usersMap = this.officeUsers.get(officeId);
    if (!usersMap) return [];
    return Array.from(usersMap.values());
  }

  /**
   * Returns single user state.
   */
  getUser(officeId, userId) {
    const usersMap = this.officeUsers.get(officeId);
    return usersMap ? usersMap.get(userId) : null;
  }

  /**
   * Updates user mic mute status.
   */
  updateAudioState(officeId, userId, micMuted) {
    const usersMap = this.officeUsers.get(officeId);
    if (usersMap && usersMap.has(userId)) {
      const user = usersMap.get(userId);
      user.micMuted = Boolean(micMuted);
      return user;
    }
    return null;
  }
}

// Export singleton instance configured with defaults
export const proximityEngine = new ProximityEngine();
