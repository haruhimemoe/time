/**
 * @file src/slots/index.ts
 * @desc @haruhimemoe/time/slots: ranked match start times with who is free.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export { findSlots, MAX_STARTS } from "./find.js";
export {
  compareSlots,
  type Member,
  type Side,
  type SideFree,
  type SlotCandidate,
  type SlotQuery,
} from "./types.js";
