/**
 * @file src/index.ts
 * @desc @haruhimemoe/time: everything from ./zone, ./availability, ./slots, ./region and ./ics,
 *       plus TimeError.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export * from "./availability/index.js";
export { TimeError, type TimeErrorCode } from "./errors.js";
export * from "./ics/index.js";
export * from "./region/index.js";
export * from "./slots/index.js";
export * from "./zone/index.js";
