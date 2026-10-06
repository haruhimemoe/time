/**
 * @file src/shared.ts
 * @desc Weekday codes (Monday first), the Instant input type and its conversion to epoch milliseconds.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { TimeError } from "./errors.js";

/** Day codes, Monday first (ISO 8601). Strings, so nobody mixes them up with `getDay()`. */
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** The seven day codes, Monday first. Index = day of the week in every grid. */
export const WEEKDAYS: readonly Weekday[] = Object.freeze([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

/** An instant: a `Date` or epoch milliseconds. Functions return `Date`. */
export type Instant = Date | number;

export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 1440;
export const WEEK_MINUTES = 7 * DAY_MINUTES;
export const WEEK_MS = WEEK_MINUTES * MINUTE_MS;
/** 1970-01-05 was a Monday: week slot 0 starts here, and every 7 days after. */
export const MONDAY_EPOCH_MS = 4 * DAY_MINUTES * MINUTE_MS;

/**
 * @function toMs
 * @param at {Instant} a Date or epoch milliseconds
 * @returns {number} epoch milliseconds
 * @throws {TimeError} invalid-instant for an invalid Date or a non-finite number
 */
export const toMs = (at: Instant): number => {
  const ms = typeof at === "number" ? at : at.getTime();
  if (!Number.isFinite(ms)) throw new TimeError("invalid-instant", `not a valid instant: ${at}`);
  return ms;
};

/**
 * @function weekdayIndex
 * @param day {Weekday} a day code
 * @returns {number} 0 for Monday through 6 for Sunday
 * @throws {TimeError} invalid-wall-time for anything that isn't a day code
 */
export const weekdayIndex = (day: Weekday): number => {
  const index = WEEKDAYS.indexOf(day);
  if (index < 0) throw new TimeError("invalid-wall-time", `not a weekday: ${day}`);
  return index;
};

/** Floor modulo: always in [0, n). */
export const mod = (value: number, n: number): number => ((value % n) + n) % n;
