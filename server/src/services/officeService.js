import { Office } from '../models/Office.js';
import { DEFAULT_OFFICE_TEMPLATE } from '../config/constants.js';

export const HEADQUARTERS_CODE = 'hq-main';
export const HEADQUARTERS_NAME = 'ProxiSpeak Headquarters';

// In-memory cache for the canonical ProxiSpeak Headquarters layout
let cachedHeadquarters = null;

/**
 * Returns the currently cached headquarters layout, or null if not yet prewarmed.
 */
export function getCachedHeadquarters() {
  return cachedHeadquarters;
}

/**
 * Updates or invalidates the in-memory headquarters cache.
 */
export function updateHeadquartersCache(officeData) {
  if (!officeData) return;
  const plain = officeData.toObject ? officeData.toObject() : { ...officeData };
  cachedHeadquarters = plain;
}

/**
 * Clears the in-memory headquarters cache (used primarily in tests).
 */
export function clearHeadquartersCache() {
  cachedHeadquarters = null;
}

/**
 * Idempotently retrieves or creates the canonical ProxiSpeak Headquarters office.
 * Returns cached layout in <1ms if already prewarmed; otherwise queries MongoDB Atlas once.
 */
export async function getOrCreateHeadquartersOffice() {
  // 1. Fast path: return in-memory cached canonical office (<1ms, 0 DB round trips)
  if (cachedHeadquarters) {
    return cachedHeadquarters;
  }

  // 2. Look up by unique canonical code or primary name
  let hq = await Office.findOne({
    $or: [
      { code: HEADQUARTERS_CODE },
      { name: HEADQUARTERS_NAME }
    ]
  }).lean();

  if (hq) {
    // Ensure code is normalized to canonical code and layout is upgraded to 2000x1200
    const updates = {};
    if (hq.code !== HEADQUARTERS_CODE) {
      updates.code = HEADQUARTERS_CODE;
      hq.code = HEADQUARTERS_CODE;
    }
    if (!hq.width || hq.width < DEFAULT_OFFICE_TEMPLATE.width || !hq.zones || hq.zones.length < 5) {
      updates.width = DEFAULT_OFFICE_TEMPLATE.width;
      updates.height = DEFAULT_OFFICE_TEMPLATE.height;
      updates.zones = DEFAULT_OFFICE_TEMPLATE.zones;
      updates.furniture = DEFAULT_OFFICE_TEMPLATE.furniture;
      updates.walls = DEFAULT_OFFICE_TEMPLATE.walls;

      hq.width = DEFAULT_OFFICE_TEMPLATE.width;
      hq.height = DEFAULT_OFFICE_TEMPLATE.height;
      hq.zones = DEFAULT_OFFICE_TEMPLATE.zones;
      hq.furniture = DEFAULT_OFFICE_TEMPLATE.furniture;
      hq.walls = DEFAULT_OFFICE_TEMPLATE.walls;
    }
    if (Object.keys(updates).length > 0) {
      await Office.updateOne({ _id: hq._id }, { $set: updates });
    }
    cachedHeadquarters = hq;
    return hq;
  }

  // 3. Atomically upsert to prevent race conditions during concurrent server boots/joins
  try {
    hq = await Office.findOneAndUpdate(
      { code: HEADQUARTERS_CODE },
      {
        $setOnInsert: {
          name: HEADQUARTERS_NAME,
          code: HEADQUARTERS_CODE,
          width: DEFAULT_OFFICE_TEMPLATE.width,
          height: DEFAULT_OFFICE_TEMPLATE.height,
          zones: DEFAULT_OFFICE_TEMPLATE.zones,
          furniture: DEFAULT_OFFICE_TEMPLATE.furniture,
          walls: DEFAULT_OFFICE_TEMPLATE.walls
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, lean: true }
    );
  } catch {
    // If a concurrent request won the upsert race, fetch the created office
    hq = await Office.findOne({ code: HEADQUARTERS_CODE }).lean();
  }

  cachedHeadquarters = hq;
  return hq;
}

/**
 * Pre-warms the canonical Headquarters office into memory during server startup.
 */
export async function prewarmHeadquartersOffice() {
  return await getOrCreateHeadquartersOffice();
}
