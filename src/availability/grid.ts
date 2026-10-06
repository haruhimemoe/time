/**
 * @file src/availability/grid.ts
 * @desc The weekly availability grid: UTC slots counted from Monday 00:00 UTC. Slot math, union,
 *       intersection, counts and resampling. Zone conversion is in convert.ts.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { TimeError } from "../errors.js";
import { type Instant, MINUTE_MS, MONDAY_EPOCH_MS, mod, toMs, WEEK_MINUTES } from "../shared.js";

/**
 * A weekly availability pattern. `slots` are sorted, unique UTC week slots: slot 0 starts Monday
 * 00:00 UTC and each lasts `slotMinutes`. `zone` and `week` (the local Monday, YYYY-MM-DD) are
 * set by `fromZone`: they say which week's DST the slots were entered under, so checks for
 * other weeks can follow the owner's clock.
 */
export interface Availability {
  slotMinutes: number;
  slots: number[];
  zone?: string;
  week?: string;
}

/**
 * @function checkSlotMinutes
 * @param slotMinutes {number} candidate slot length
 * @returns {number} the same number when it is a whole divisor of a day, 5 minutes or longer
 * @throws {TimeError} invalid-slot-minutes
 */
export const checkSlotMinutes = (slotMinutes: number): number => {
  if (
    !Number.isInteger(slotMinutes) ||
    slotMinutes < 5 ||
    slotMinutes > 1440 ||
    1440 % slotMinutes !== 0
  ) {
    throw new TimeError(
      "invalid-slot-minutes",
      `slotMinutes must divide 1440 and be at least 5: ${slotMinutes}`,
    );
  }
  return slotMinutes;
};

/**
 * @function slotsPerWeek
 * @param slotMinutes {number} slot length
 * @returns {number} slots in a week: 168 at 60 minutes, 336 at 30
 * @throws {TimeError} invalid-slot-minutes
 */
export const slotsPerWeek = (slotMinutes: number): number =>
  WEEK_MINUTES / checkSlotMinutes(slotMinutes);

/**
 * @function weekSlotOf
 * @param at {Instant} an instant
 * @param slotMinutes {number} slot length (default 60)
 * @returns {number} the UTC week slot containing it: 0 for Monday 00:00-00:59 UTC at 60 minutes
 * @throws {TimeError} invalid-slot-minutes, invalid-instant
 */
export const weekSlotOf = (at: Instant, slotMinutes = 60): number => {
  const slotMs = checkSlotMinutes(slotMinutes) * MINUTE_MS;
  return Math.floor(mod(toMs(at) - MONDAY_EPOCH_MS, WEEK_MINUTES * MINUTE_MS) / slotMs);
};

/** Sorted unique slots, each checked against the week. */
export const cleanSlots = (slots: Iterable<number>, slotMinutes: number): number[] => {
  const total = slotsPerWeek(slotMinutes);
  const set = new Set<number>();
  for (const slot of slots) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= total) {
      throw new TimeError("invalid-slot", `slot ${slot} is outside a ${slotMinutes}-minute week`);
    }
    set.add(slot);
  }
  return [...set].sort((a, b) => a - b);
};

/**
 * @function createAvailability
 * @param slots {Iterable<number>} UTC week slots, any order, repeats allowed
 * @param slotMinutes {number} slot length (default 60)
 * @returns {Availability} a plain UTC grid with sorted, unique slots
 * @throws {TimeError} invalid-slot-minutes, invalid-slot
 */
export const createAvailability = (slots: Iterable<number>, slotMinutes = 60): Availability => ({
  slotMinutes,
  slots: cleanSlots(slots, slotMinutes),
});

const sameSize = (list: readonly Availability[]): number => {
  const first = list[0]?.slotMinutes ?? 60;
  checkSlotMinutes(first);
  for (const grid of list) {
    if (grid.slotMinutes !== first) {
      throw new TimeError(
        "mismatched-slot-minutes",
        `grids of ${first} and ${grid.slotMinutes} minutes; resampleAvailability first`,
      );
    }
  }
  return first;
};

/** zone and week, kept only when every grid shares them. */
const sharedAnchor = (list: readonly Availability[]): Pick<Availability, "zone" | "week"> => {
  const first = list[0];
  if (!first?.zone || !first.week) return {};
  return list.every((g) => g.zone === first.zone && g.week === first.week)
    ? { zone: first.zone, week: first.week }
    : {};
};

/**
 * @function countAvailability
 * @param list {readonly Availability[]} grids of one slot size
 * @returns {Map<number, number>} slot to the number of grids free there; slots nobody has are absent
 * @throws {TimeError} mismatched-slot-minutes
 */
export const countAvailability = (list: readonly Availability[]): Map<number, number> => {
  sameSize(list);
  const counts = new Map<number, number>();
  for (const grid of list) {
    for (const slot of new Set(grid.slots)) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  return counts;
};

/**
 * @function unionAvailability
 * @param list {readonly Availability[]} grids of one slot size
 * @returns {Availability} slots where anyone is free. zone and week survive only when shared.
 *          An empty list gives an empty 60-minute grid.
 * @throws {TimeError} mismatched-slot-minutes
 */
export const unionAvailability = (list: readonly Availability[]): Availability => {
  const slotMinutes = sameSize(list);
  const slots = cleanSlots([...countAvailability(list).keys()], slotMinutes);
  return { slotMinutes, slots, ...sharedAnchor(list) };
};

/**
 * @function intersectAvailability
 * @param list {readonly Availability[]} grids of one slot size
 * @returns {Availability} slots where everyone is free. zone and week survive only when shared.
 *          An empty list gives an empty 60-minute grid.
 * @throws {TimeError} mismatched-slot-minutes
 */
export const intersectAvailability = (list: readonly Availability[]): Availability => {
  const slotMinutes = sameSize(list);
  const all = [...countAvailability(list)].filter(([, n]) => n === list.length).map(([s]) => s);
  return { slotMinutes, slots: cleanSlots(all, slotMinutes), ...sharedAnchor(list) };
};

/**
 * @function resampleAvailability
 * @param grid {Availability} the grid
 * @param slotMinutes {number} the new slot length
 * @returns {Availability} the same pattern in new slots. A new slot is free only when every old
 *          slot it overlaps is free, so going coarser never invents free time.
 * @throws {TimeError} invalid-slot-minutes
 */
export const resampleAvailability = (grid: Availability, slotMinutes: number): Availability => {
  const from = checkSlotMinutes(grid.slotMinutes);
  const total = slotsPerWeek(slotMinutes);
  const free = new Set(grid.slots);
  const slots: number[] = [];
  for (let slot = 0; slot < total; slot += 1) {
    const first = Math.floor((slot * slotMinutes) / from);
    const last = Math.floor(((slot + 1) * slotMinutes - 1) / from);
    let ok = true;
    for (let old = first; ok && old <= last; old += 1) ok = free.has(old);
    if (ok) slots.push(slot);
  }
  const anchor = grid.zone && grid.week ? { zone: grid.zone, week: grid.week } : {};
  return { slotMinutes, slots, ...anchor };
};
