/**
 * @file src/availability/convert.ts
 * @desc Grids to and from a zone's local week, DST per slot, and the free checks. A grid with
 *       zone and week is re-anchored to the owner's clock for the week being checked.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { TimeError } from "../errors.js";
import {
  DAY_MINUTES,
  type Instant,
  MINUTE_MS,
  MONDAY_EPOCH_MS,
  mod,
  toMs,
  WEEK_MS,
  type Weekday,
  weekdayIndex,
} from "../shared.js";
import { assertTimeZone, wallToUtcMs } from "../zone/offset.js";
import { fromWallTime, toWallTime } from "../zone/wall.js";
import { type Availability, checkSlotMinutes, cleanSlots, slotsPerWeek } from "./grid.js";

const DAY_MS = DAY_MINUTES * MINUTE_MS;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Epoch ms of a local Monday's date (as UTC midnight), and its YYYY-MM-DD key. */
const localMonday = (ms: number, zone: string): { date: number; key: string } => {
  const w = toWallTime(ms, zone);
  const date = wallToUtcMs(w.year, w.month, w.day - weekdayIndex(w.weekday));
  return { date, key: new Date(date).toISOString().slice(0, 10) };
};

const wallAt = (dateMs: number, minute: number) => {
  const d = new Date(dateMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: Math.floor(minute / 60),
    minute: minute % 60,
  };
};

/**
 * @function localSlot
 * @param day {Weekday} local day
 * @param minute {number} minutes past local midnight, 0-1439
 * @param slotMinutes {number} slot length (default 60)
 * @returns {number} the local week slot: "sat" at 14:00 is 5 * 24 + 14 = 134 at 60 minutes
 * @throws {TimeError} invalid-slot for a bad minute, invalid-slot-minutes, invalid-wall-time
 */
export const localSlot = (day: Weekday, minute: number, slotMinutes = 60): number => {
  checkSlotMinutes(slotMinutes);
  if (!Number.isInteger(minute) || minute < 0 || minute >= DAY_MINUTES) {
    throw new TimeError("invalid-slot", `minute must be 0-1439: ${minute}`);
  }
  return (weekdayIndex(day) * DAY_MINUTES + minute - (minute % slotMinutes)) / slotMinutes;
};

const utcSlots = (local: Iterable<number>, zone: string, slotMinutes: number, ms: number) => {
  const monday = localMonday(ms, zone);
  const slots: number[] = [];
  const slotMs = slotMinutes * MINUTE_MS;
  const push = (instant: Date): void => {
    slots.push(Math.floor(mod(instant.getTime() - MONDAY_EPOCH_MS, WEEK_MS) / slotMs));
  };
  for (const index of cleanSlots(local, slotMinutes)) {
    const start = index * slotMinutes;
    const wall = wallAt(
      monday.date + Math.floor(start / DAY_MINUTES) * DAY_MS,
      start % DAY_MINUTES,
    );
    try {
      push(fromWallTime(wall, zone, "reject"));
    } catch (error) {
      // A spring-forward gap skips the slot; the repeated fall-back hour marks both copies.
      if ((error as TimeError).code !== "ambiguous-time") continue;
      push(fromWallTime(wall, zone, "earlier"));
      push(fromWallTime(wall, zone, "later"));
    }
  }
  return { slots: cleanSlots(slots, slotMinutes), week: monday.key };
};

const localSlots = (grid: Availability, zone: string, mondayDate: number): number[] => {
  const slotMinutes = grid.slotMinutes;
  const total = slotsPerWeek(slotMinutes);
  const perDay = DAY_MINUTES / slotMinutes;
  const start = fromWallTime(wallAt(mondayDate, 0), zone).getTime();
  const end = fromWallTime(wallAt(mondayDate + 7 * DAY_MS, 0), zone).getTime();
  const slotMs = slotMinutes * MINUTE_MS;
  const out: number[] = [];
  for (const slot of grid.slots) {
    let t = start + mod(MONDAY_EPOCH_MS + slot * slotMs - start, WEEK_MS);
    for (; t < end; t += WEEK_MS) {
      const w = toWallTime(t, zone);
      const day = Math.round((wallToUtcMs(w.year, w.month, w.day) - mondayDate) / DAY_MS);
      const index = day * perDay + Math.floor((w.hour * 60 + w.minute) / slotMinutes);
      if (index >= 0 && index < total) out.push(index);
    }
  }
  return cleanSlots(out, slotMinutes);
};

/**
 * @function fromZone
 * @param local {Iterable<number>} local week slots (see localSlot), as the owner picked them
 * @param zone {string} the owner's IANA zone
 * @param opts {{ slotMinutes?: number; at?: Instant }} slot length (default 60) and an instant in
 *        the local ISO week the slots are for (default now)
 * @returns {Availability} UTC slots, with zone and week set. A slot that doesn't exist that week
 *          (a spring-forward gap) is dropped; one that happens twice (fall back) marks both.
 *          A local slot that doesn't line up with UTC slots (Kolkata at 60 minutes) is floored to
 *          the UTC slot containing its start.
 * @throws {TimeError} invalid-zone, invalid-slot, invalid-slot-minutes
 */
export const fromZone = (
  local: Iterable<number>,
  zone: string,
  opts: { slotMinutes?: number; at?: Instant } = {},
): Availability => {
  const slotMinutes = checkSlotMinutes(opts.slotMinutes ?? 60);
  const name = assertTimeZone(zone);
  const { slots, week } = utcSlots(local, name, slotMinutes, toMs(opts.at ?? Date.now()));
  return { slotMinutes, slots, zone: name, week };
};

const anchors = new WeakMap<Availability, Map<string, Set<number>>>();

/** The grid's UTC slots for the week of `ms`: re-anchored to the owner's clock when it can be. */
const slotsAt = (grid: Availability, ms: number): Set<number> => {
  let byWeek = anchors.get(grid);
  if (!byWeek) {
    byWeek = new Map();
    anchors.set(grid, byWeek);
  }
  const zone = grid.zone;
  const week = grid.week ? ISO_DATE.exec(grid.week) : null;
  const key = zone && week ? localMonday(ms, zone).key : "";
  const cached = byWeek.get(key);
  if (cached) return cached;
  let slots: number[] = grid.slots;
  if (zone && week && key !== grid.week) {
    const owned = wallToUtcMs(Number(week[1]), Number(week[2]), Number(week[3]));
    slots = utcSlots(localSlots(grid, zone, owned), zone, grid.slotMinutes, ms).slots;
  }
  const set = new Set(slots);
  byWeek.set(key, set);
  return set;
};

/**
 * @function toZone
 * @param grid {Availability} the grid
 * @param zone {string} the zone to show it in
 * @param opts {{ at?: Instant }} an instant in the local ISO week to show (default: the grid's
 *        own week when it was entered in this zone, else now)
 * @returns {number[]} local week slots, sorted. Floors like fromZone.
 * @throws {TimeError} invalid-zone, invalid-slot-minutes
 */
export const toZone = (grid: Availability, zone: string, opts: { at?: Instant } = {}): number[] => {
  checkSlotMinutes(grid.slotMinutes);
  const name = assertTimeZone(zone);
  const own = grid.week && grid.zone === name ? ISO_DATE.exec(grid.week) : null;
  const ms =
    opts.at !== undefined
      ? toMs(opts.at)
      : own
        ? wallToUtcMs(Number(own[1]), Number(own[2]), Number(own[3]), 12)
        : Date.now();
  const monday = localMonday(ms, name);
  const view = { ...grid, slots: [...slotsAt(grid, monday.date + 3 * DAY_MS)] };
  return localSlots(view, name, monday.date);
};

/**
 * @function isFreeAt
 * @param grid {Availability} the grid
 * @param at {Instant} an instant
 * @returns {boolean} whether the slot containing `at` is free (re-anchored when the grid has
 *          zone and week)
 * @throws {TimeError} invalid-instant, invalid-slot-minutes
 */
export const isFreeAt = (grid: Availability, at: Instant): boolean => {
  const ms = toMs(at);
  const slotMs = checkSlotMinutes(grid.slotMinutes) * MINUTE_MS;
  return slotsAt(grid, ms).has(Math.floor(mod(ms - MONDAY_EPOCH_MS, WEEK_MS) / slotMs));
};

/**
 * @function isFreeDuring
 * @param grid {Availability} the grid
 * @param start {Instant} start, inclusive
 * @param end {Instant} end, exclusive
 * @returns {boolean} whether every slot touching [start, end) is free
 * @throws {TimeError} invalid-window when end is not after start; invalid-instant
 */
export const isFreeDuring = (grid: Availability, start: Instant, end: Instant): boolean => {
  const from = toMs(start);
  const to = toMs(end);
  if (to <= from) throw new TimeError("invalid-window", "end must be after start");
  const slotMs = checkSlotMinutes(grid.slotMinutes) * MINUTE_MS;
  const first = Math.floor((from - MONDAY_EPOCH_MS) / slotMs);
  const last = Math.floor((to - 1 - MONDAY_EPOCH_MS) / slotMs);
  const total = WEEK_MS / slotMs;
  for (let i = first; i <= last; i += 1) {
    const t = Math.max(from, MONDAY_EPOCH_MS + i * slotMs);
    if (!slotsAt(grid, t).has(mod(i, total))) return false;
  }
  return true;
};
