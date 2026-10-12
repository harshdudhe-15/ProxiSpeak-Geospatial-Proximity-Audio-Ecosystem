import { Office } from '../models/Office.js';
import { DEFAULT_OFFICE_TEMPLATE } from '../config/constants.js';

export const HEADQUARTERS_CODE = 'hq-main';
export const HEADQUARTERS_NAME = 'ProxiSpeak Headquarters';

/**
 * Idempotently retrieves or creates the canonical ProxiSpeak Headquarters office.
 * Guarantees that all users and sessions share the exact same persistent office layout.
 */
export async function getOrCreateHeadquartersOffice() {
  // 1. Look up by unique canonical code or primary name
  let hq = await Office.findOne({
    $or: [
      { code: HEADQUARTERS_CODE },
      { name: HEADQUARTERS_NAME }
    ]
  });

  if (hq) {
    // Ensure code is normalized to canonical code
    if (hq.code !== HEADQUARTERS_CODE) {
      hq.code = HEADQUARTERS_CODE;
      await hq.save();
    }
    return hq;
  }

  // 2. Atomically upsert to prevent race conditions during concurrent server boots/joins
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
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch {
    // If a concurrent request won the upsert race, fetch the created office
    hq = await Office.findOne({ code: HEADQUARTERS_CODE });
  }

  return hq;
}
