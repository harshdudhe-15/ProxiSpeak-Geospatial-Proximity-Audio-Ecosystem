import mongoose from 'mongoose';

/**
 * Planar 2D Position Snapshot Model
 * Demonstrates MongoDB planar geospatial operations ($near, $geoWithin)
 * in pixel space without spherical lat/long distortion.
 */
const positionSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    displayName: {
      type: String,
      default: 'Anonymous'
    },
    officeId: {
      type: String,
      required: true,
      index: true
    },
    // Planar coordinate pair [x, y] in pixels
    location: {
      type: [Number],
      required: true,
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length === 2 && !isNaN(val[0]) && !isNaN(val[1]);
        },
        message: 'Location must be a 2D planar coordinate array [x, y]'
      }
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Explicit 2D planar index for Euclidean pixel boundaries (0 to 10,000 pixels)
positionSnapshotSchema.index({ location: '2d' }, { min: -1000, max: 10000 });
positionSnapshotSchema.index({ location: '2d', officeId: 1 }, { min: -1000, max: 10000 });

export const PositionSnapshot = mongoose.model('PositionSnapshot', positionSnapshotSchema);
