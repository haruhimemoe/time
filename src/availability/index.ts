/**
 * @file src/availability/index.ts
 * @desc @haruhimemoe/time/availability: weekly grids in UTC slots, zone conversion, set ops, schema.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export {
  fromZone,
  isFreeAt,
  isFreeDuring,
  localSlot,
  toZone,
} from "./convert.js";
export {
  type Availability,
  countAvailability,
  createAvailability,
  intersectAvailability,
  resampleAvailability,
  slotsPerWeek,
  unionAvailability,
  weekSlotOf,
} from "./grid.js";
export { availabilitySchema } from "./schema.js";
