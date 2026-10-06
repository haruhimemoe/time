/**
 * @file src/zone/wall.ts
 * @desc Wall clock time in a zone and back, with Temporal's rules for DST gaps and overlaps,
 *       plus weeklyWindow (the recurring window, like a tournament weekend, around an instant).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { TimeError } from "../errors.js";
import { type Instant, mod, toMs, WEEKDAYS, type Weekday, weekdayIndex } from "../shared.js";
import { offsetMs, wallFields, wallToUtcMs, zoneFormatter } from "./offset.js";

/** A wall clock reading. `month` is 1 to 12. `second` defaults to 0. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

/** A wall clock reading in a zone, with its day of the week. */
export interface ZonedWallTime extends Required<WallTime> {
  weekday: Weekday;
}

/**
 * What to do with a wall time a DST switch skips (a gap) or repeats (an overlap). Temporal's
 * names: "compatible" is "later" in a gap and "earlier" in an overlap.
 */
export type Disambiguation = "compatible" | "earlier" | "later" | "reject";

const DAY_MS = 86_400_000;

/**
 * @function toWallTime
 * @param at {Instant} the instant
 * @param zone {string} IANA zone id
 * @returns {ZonedWallTime} what a clock in that zone shows at that instant
 * @throws {TimeError} invalid-zone, invalid-instant
 */
export const toWallTime = (at: Instant, zone: string): ZonedWallTime => {
  const w = wallFields(zone, toMs(at));
  const weekday = WEEKDAYS[mod(new Date(wallToUtcMs(w.year, w.month, w.day)).getUTCDay() - 1, 7)];
  return { ...w, weekday: weekday as Weekday };
};

const isInt = (n: unknown, min: number, max: number): boolean =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

const checkWall = (wall: WallTime): void => {
  const second = wall?.second ?? 0;
  const ok =
    wall !== null &&
    typeof wall === "object" &&
    isInt(wall.year, -271_820, 275_759) &&
    isInt(wall.month, 1, 12) &&
    isInt(wall.hour, 0, 23) &&
    isInt(wall.minute, 0, 59) &&
    isInt(second, 0, 59);
  const days = ok ? new Date(wallToUtcMs(wall.year, wall.month + 1, 0)).getUTCDate() : 0;
  if (!ok || !isInt(wall.day, 1, days)) {
    throw new TimeError("invalid-wall-time", `not a wall time: ${JSON.stringify(wall)}`);
  }
};

/**
 * @function fromWallTime
 * @param wall {WallTime} the wall clock reading
 * @param zone {string} IANA zone id
 * @param disambiguation {Disambiguation} for a time a DST switch skips or repeats (default
 *        "compatible": skipped times move forward by the gap, repeated times take the first)
 * @returns {Date} the instant a clock in that zone shows that reading
 * @throws {TimeError} invalid-zone, invalid-wall-time; nonexistent-time (gap) or ambiguous-time
 *         (overlap) with "reject"
 */
export const fromWallTime = (
  wall: WallTime,
  zone: string,
  disambiguation: Disambiguation = "compatible",
): Date => {
  zoneFormatter(zone);
  checkWall(wall);
  const local = wallToUtcMs(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second ?? 0,
  );
  const before = offsetMs(zone, local - DAY_MS);
  const after = offsetMs(zone, local + DAY_MS);
  const found = [...new Set([before, after])]
    .map((offset) => local - offset)
    .filter((ms) => local - ms === offsetMs(zone, ms))
    .sort((a, b) => a - b);
  const first = found[0];
  const last = found[found.length - 1];
  if (first !== undefined && last !== undefined) {
    if (first === last) return new Date(first);
    if (disambiguation === "reject") {
      throw new TimeError("ambiguous-time", `${JSON.stringify(wall)} happens twice in ${zone}`);
    }
    return new Date(disambiguation === "later" ? last : first);
  }
  if (disambiguation === "reject") {
    throw new TimeError("nonexistent-time", `${JSON.stringify(wall)} doesn't exist in ${zone}`);
  }
  return new Date(local - (disambiguation === "earlier" ? after : before));
};

/** The window's options: it opens on `day` at `minute` past midnight and lasts `days` days. */
export interface WeeklyWindowOptions {
  day: Weekday;
  minute?: number;
  days: number;
}

/**
 * @function weeklyWindow
 * @param at {Instant} the reference instant
 * @param zone {string} the zone the window is reckoned in
 * @param opts {WeeklyWindowOptions} for a Fri-Sun weekend: { day: "fri", days: 3 }
 * @returns {{ start: Date; end: Date }} the window that contains `at`, or else the next one to
 *          open. Edges are wall times in the zone, so a window over a DST switch is an hour
 *          shorter or longer. `end` is exclusive.
 * @throws {TimeError} invalid-window for days outside 1-7 or minute outside 0-1439; invalid-zone
 */
export const weeklyWindow = (
  at: Instant,
  zone: string,
  opts: WeeklyWindowOptions,
): { start: Date; end: Date } => {
  const minute = opts.minute ?? 0;
  if (!isInt(opts.days, 1, 7) || !isInt(minute, 0, 1439)) {
    throw new TimeError("invalid-window", `bad weekly window: ${JSON.stringify(opts)}`);
  }
  const ms = toMs(at);
  const now = toWallTime(ms, zone);
  const back = mod(weekdayIndex(now.weekday) - weekdayIndex(opts.day), 7);
  const edge = (dayShift: number): Date => {
    const date = new Date(wallToUtcMs(now.year, now.month, now.day + dayShift));
    return fromWallTime(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: Math.floor(minute / 60),
        minute: minute % 60,
      },
      zone,
    );
  };
  let open = -back;
  if (edge(open).getTime() > ms) open -= 7;
  if (edge(open + opts.days).getTime() <= ms) open += 7;
  return { start: edge(open), end: edge(open + opts.days) };
};
