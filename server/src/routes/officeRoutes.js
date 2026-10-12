import express from 'express';
import { Office } from '../models/Office.js';
import { DEFAULT_OFFICE_TEMPLATE } from '../config/constants.js';
import { GeospatialService } from '../services/geospatialService.js';
import { proximityEngine } from '../services/proximityEngine.js';
import { getOrCreateHeadquartersOffice } from '../services/officeService.js';

const router = express.Router();

/**
 * GET /api/offices/headquarters
 * Returns the canonical ProxiSpeak Headquarters office layout.
 */
router.get('/headquarters', async (req, res, next) => {
  try {
    const hq = await getOrCreateHeadquartersOffice();
    res.json({
      success: true,
      data: hq
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/offices
 * Returns list of all available offices with canonical headquarters first.
 */
router.get('/', async (req, res, next) => {
  try {
    const hq = await getOrCreateHeadquartersOffice();
    const otherOffices = await Office.find({ _id: { $ne: hq._id } }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: [hq, ...otherOffices]
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/offices
 * Creates a new office layout.
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, width, height, zones, furniture, walls, code } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: 'Office name must be at least 2 characters long' }
      });
    }

    const office = await Office.create({
      name: name.trim(),
      code: code ? code.trim().toLowerCase() : `office-${Date.now().toString(36)}`,
      width: Number(width) || DEFAULT_OFFICE_TEMPLATE.width,
      height: Number(height) || DEFAULT_OFFICE_TEMPLATE.height,
      zones: zones || DEFAULT_OFFICE_TEMPLATE.zones,
      furniture: furniture || DEFAULT_OFFICE_TEMPLATE.furniture,
      walls: walls || DEFAULT_OFFICE_TEMPLATE.walls
    });

    res.status(201).json({
      success: true,
      data: office
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/offices/:id
 * Fetches office details.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let office = null;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      office = await Office.findById(id);
    } else {
      office = await Office.findOne({ code: id });
    }

    if (!office) {
      return res.status(404).json({
        success: false,
        error: { message: 'Office not found' }
      });
    }

    res.json({
      success: true,
      data: office
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/offices/:id/layout
 * Retrieves office layout specifically.
 */
router.get('/:id/layout', async (req, res, next) => {
  try {
    const { id } = req.params;
    let office = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      office = await Office.findById(id).select('name width height zones furniture walls');
    } else {
      office = await Office.findOne({ code: id }).select('name width height zones furniture walls');
    }

    if (!office) {
      return res.status(404).json({
        success: false,
        error: { message: 'Office not found' }
      });
    }

    res.json({
      success: true,
      data: office
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/offices/:id/layout
 * Saves or updates office layout (walls, furniture, zones).
 */
router.put('/:id/layout', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { zones, furniture, walls, width, height } = req.body;

    const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { code: id };
    const updateData = {};
    if (zones) updateData.zones = zones;
    if (furniture) updateData.furniture = furniture;
    if (walls) updateData.walls = walls;
    if (width) updateData.width = Number(width);
    if (height) updateData.height = Number(height);

    const updatedOffice = await Office.findOneAndUpdate(
      query,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedOffice) {
      return res.status(404).json({
        success: false,
        error: { message: 'Office not found' }
      });
    }

    // Refresh proximity engine obstacles in-memory
    proximityEngine.setOfficeObstacles(id, [
      ...(updatedOffice.walls || []),
      ...(updatedOffice.furniture || [])
    ]);

    res.json({
      success: true,
      data: updatedOffice
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/offices/:id/nearby
 * Demonstrates MongoDB 2D Planar Geospatial Query ($near)
 */
router.get('/:id/nearby', async (req, res, next) => {
  try {
    const { id } = req.params;
    const x = Number(req.query.x);
    const y = Number(req.query.y);
    const radius = Number(req.query.radius) || 120;

    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Query parameters x and y must be valid numbers' }
      });
    }

    const nearbyUsers = await GeospatialService.findNearbyUsersPlanar(id, x, y, radius);

    res.json({
      success: true,
      query: { x, y, radius, coordinateSystem: 'planar-2d' },
      count: nearbyUsers.length,
      data: nearbyUsers
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/offices/:id/snapshot
 * Persists an avatar planar coordinate snapshot manually.
 */
router.post('/:id/snapshot', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, displayName, x, y } = req.body;

    if (!userId || isNaN(Number(x)) || isNaN(Number(y))) {
      return res.status(400).json({
        success: false,
        error: { message: 'userId, x, and y are required numbers' }
      });
    }

    const snapshot = await GeospatialService.recordSnapshot(
      id,
      userId,
      displayName || 'Anonymous',
      Number(x),
      Number(y)
    );

    res.json({
      success: true,
      data: snapshot
    });
  } catch (err) {
    next(err);
  }
});

export default router;
