import { PositionSnapshot } from '../models/PositionSnapshot.js';

/**
 * MongoDB Geospatial Service (Planar 2D Coordinates)
 *
 * ARCHITECTURAL DISTINCTION:
 * 1. In-Memory Proximity Engine (ProximityEngine):
 *    - Operates at 20-60 updates/sec in server RAM with sub-millisecond latency.
 *    - Ideal for real-time WebRTC audio connection triggers and instant spatial panning.
 *
 * 2. MongoDB Geospatial Service (GeospatialService):
 *    - Persists periodic snapshots or queries historical presence data.
 *    - Uses MongoDB's legacy coordinate pairs [x, y] with a '2d' index on the Euclidean plane.
 *    - Executes planar queries ($near, $geoWithin with $box) using pure Cartesian distance,
 *      avoiding spherical radian distortion on pixel maps.
 */
export class GeospatialService {
  /**
   * Saves or updates a user's planar position snapshot.
   * Throttled to avoid overwhelming the database during 60 FPS motion.
   */
  static async recordSnapshot(officeId, userId, displayName, x, y) {
    try {
      const snapshot = await PositionSnapshot.findOneAndUpdate(
        { officeId, userId },
        {
          officeId,
          userId,
          displayName,
          location: [Math.round(x), Math.round(y)],
          lastUpdated: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return snapshot;
    } catch (err) {
      console.error('[GeospatialService] Error recording snapshot:', err.message);
      return null;
    }
  }

  /**
   * Finds nearby users within a planar pixel radius using MongoDB's $near operator.
   * @param {string} officeId
   * @param {number} x
   * @param {number} y
   * @param {number} maxDistance (radius in pixels)
   */
  static async findNearbyUsersPlanar(officeId, x, y, maxDistance = 120) {
    try {
      const results = await PositionSnapshot.find({
        officeId,
        location: {
          $near: [x, y],
          $maxDistance: maxDistance
        }
      }).lean();

      return results.map(doc => ({
        userId: doc.userId,
        displayName: doc.displayName,
        x: doc.location[0],
        y: doc.location[1],
        lastUpdated: doc.lastUpdated
      }));
    } catch (err) {
      console.error('[GeospatialService] Error executing $near query:', err.message);
      return [];
    }
  }

  /**
   * Finds all users inside an axis-aligned bounding box using MongoDB's $geoWithin + $box.
   * @param {string} officeId
   * @param {[number, number]} bottomLeft [x1, y1]
   * @param {[number, number]} topRight [x2, y2]
   */
  static async findUsersInBoundingBox(officeId, bottomLeft, topRight) {
    try {
      const results = await PositionSnapshot.find({
        officeId,
        location: {
          $geoWithin: {
            $box: [bottomLeft, topRight]
          }
        }
      }).lean();

      return results.map(doc => ({
        userId: doc.userId,
        displayName: doc.displayName,
        x: doc.location[0],
        y: doc.location[1],
        lastUpdated: doc.lastUpdated
      }));
    } catch (err) {
      console.error('[GeospatialService] Error executing $geoWithin query:', err.message);
      return [];
    }
  }
}
