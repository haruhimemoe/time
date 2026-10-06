/**
 * @file src/slots/find.ts
 * @desc findSlots: walk a window in steps, record who is free for each whole match span,
 *       keep starts with enough ready sides and staff, merge runs, rank.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { isFreeDuring } from "../availability/convert.js";
import { type Availability, checkSlotMinutes } from "../availability/grid.js";
import { TimeError } from "../errors.js";
import { MINUTE_MS, MONDAY_EPOCH_MS, toMs } from "../shared.js";
import { compareSlots, type Member, type SlotCandidate, type SlotQuery } from "./types.js";

/** findSlots refuses windows with more starts than this. */
export const MAX_STARTS = 20_000;

const hasData = (m: Member): boolean => !!m.availability && m.availability.slots.length > 0;

const count = (value: number | undefined, fallback: number, max: number, name: string): number => {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new TimeError("invalid-query", `${name} must be a whole number from 0 to ${max}: ${n}`);
  }
  return n;
};

const slotSize = (members: readonly Member[]): number => {
  const sizes = new Set(members.filter(hasData).map((m) => m.availability?.slotMinutes));
  if (sizes.size > 1) {
    throw new TimeError("mismatched-slot-minutes", `grids of ${[...sizes].join(", ")} minutes`);
  }
  return checkSlotMinutes([...sizes][0] ?? 60);
};

const freeIds = (members: readonly Member[], start: number, end: number): string[] =>
  members
    .filter((m) => hasData(m) && isFreeDuring(m.availability as Availability, start, end))
    .map((m) => m.id);

/**
 * @function findSlots
 * @param query {SlotQuery} sides, optional staff, the window, match length and ranking options
 * @returns {SlotCandidate[]} the best match starts, best first, at most `limit`
 * @throws {TimeError} invalid-window (end not after start, or more than MAX_STARTS starts),
 *         invalid-query (no sides, bad lengths, counts or limit), mismatched-slot-minutes
 */
export const findSlots = (query: SlotQuery): SlotCandidate[] => {
  const { sides } = query;
  if (sides.length === 0) throw new TimeError("invalid-query", "a match needs at least one side");
  const staff = query.staff ?? [];
  const from = toMs(query.window.start);
  const to = toMs(query.window.end);
  if (to <= from) throw new TimeError("invalid-window", "window end must be after its start");
  const length = count(query.lengthMinutes, 0, 7 * 1440, "lengthMinutes");
  const slotMinutes = slotSize([...sides.flatMap((s) => s.members), ...staff]);
  const step = count(query.stepMinutes, slotMinutes, 7 * 1440, "stepMinutes");
  if (length === 0 || step === 0) {
    throw new TimeError("invalid-query", "lengthMinutes and stepMinutes must be positive");
  }
  const minReady = count(query.minReadySides, sides.length, sides.length, "minReadySides");
  const staffNeed = count(query.staffNeed, 0, staff.length, "staffNeed");
  const limit = count(query.limit, 10, Number.MAX_SAFE_INTEGER, "limit");
  const stepMs = step * MINUTE_MS;
  const lengthMs = length * MINUTE_MS;
  const first = MONDAY_EPOCH_MS + Math.ceil((from - MONDAY_EPOCH_MS) / stepMs) * stepMs;
  const starts = first + lengthMs > to ? 0 : Math.floor((to - lengthMs - first) / stepMs) + 1;
  if (starts > MAX_STARTS) {
    throw new TimeError("invalid-window", `${starts} starts; the most is ${MAX_STARTS}`);
  }

  const kept: { candidate: SlotCandidate; key: string }[] = [];
  for (let i = 0; i < starts; i += 1) {
    const start = first + i * stepMs;
    const end = start + lengthMs;
    const sideFree = sides.map((side) => {
      const total = side.members.filter(hasData).length;
      const need = count(side.need, total, Number.MAX_SAFE_INTEGER, `need of ${side.id}`);
      const free = freeIds(side.members, start, end);
      return { id: side.id, free, total, need, ready: total > 0 && free.length >= need };
    });
    const staffFree = freeIds(staff, start, end);
    const readySides = sideFree.filter((s) => s.ready).length;
    if (readySides < minReady || staffFree.length < staffNeed) continue;
    const key = JSON.stringify([sideFree.map((s) => s.free), staffFree]);
    const last = kept[kept.length - 1];
    if (
      query.collapse !== false &&
      step <= length &&
      last?.key === key &&
      last.candidate.start.getTime() + last.candidate.runMinutes * MINUTE_MS - lengthMs ===
        start - stepMs
    ) {
      last.candidate.runMinutes += step;
      continue;
    }
    kept.push({
      key,
      candidate: {
        start: new Date(start),
        end: new Date(end),
        runMinutes: length,
        readySides,
        sides: sideFree,
        staff: staffFree,
      },
    });
  }

  const { filter, tiebreak } = query;
  return kept
    .map((k) => k.candidate)
    .filter((c) => (filter ? filter(c) : true))
    .sort((a, b) => b.readySides - a.readySides || tiebreak?.(a, b) || compareSlots(a, b))
    .slice(0, limit);
};
