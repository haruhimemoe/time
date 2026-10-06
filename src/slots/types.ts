/**
 * @file src/slots/types.ts
 * @desc The slot finder's input and output shapes, and the default candidate order.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Availability } from "../availability/grid.js";
import type { Instant } from "../shared.js";

/** A player or staff member. `availability` null or with no slots means no data: skipped. */
export interface Member {
  id: string;
  availability: Availability | null;
}

/** One side of a match: a team, or a player in 1v1. */
export interface Side {
  id: string;
  members: readonly Member[];
  /** Members (with data) who must be free. Default: all of them. */
  need?: number;
}

export interface SlotQuery {
  sides: readonly Side[];
  /** Referees, streamers, commentators. Reported for every candidate. */
  staff?: readonly Member[];
  /** Staff who must be free. Default 0: reported, not required. */
  staffNeed?: number;
  /** Starts are searched in [start, end); every match must end by `end`. */
  window: { start: Instant; end: Instant };
  /** Match length. The whole span must be free. */
  lengthMinutes: number;
  /** Minutes between candidate starts, aligned from Monday 00:00 UTC. Default: the grids' slot. */
  stepMinutes?: number;
  /** Sides that must be ready. Default: every side. */
  minReadySides?: number;
  /** Merge back-to-back starts with the same free players and staff. Default true. */
  collapse?: boolean;
  /** Drop candidates. Runs after collapse, before sorting. */
  filter?: (candidate: SlotCandidate) => boolean;
  /** Orders candidates with as many ready sides; 0 falls through to the default order. */
  tiebreak?: (a: SlotCandidate, b: SlotCandidate) => number;
  /** Most candidates returned. Default 10. */
  limit?: number;
}

/** Who on one side is free for the whole span. */
export interface SideFree {
  id: string;
  /** Ids of members free for the whole span. */
  free: string[];
  /** Members with data. */
  total: number;
  need: number;
  /** At least `need` free, and at least one member with data. */
  ready: boolean;
}

export interface SlotCandidate {
  start: Date;
  end: Date;
  /** Minutes from `start` while the same people stay free (with collapse); else the length. */
  runMinutes: number;
  readySides: number;
  sides: SideFree[];
  /** Ids of staff free for the whole span. */
  staff: string[];
}

const freeCount = (c: SlotCandidate): number => c.sides.reduce((n, s) => n + s.free.length, 0);

/**
 * @function compareSlots
 * @param a {SlotCandidate} a candidate
 * @param b {SlotCandidate} another
 * @returns {number} the default order: more ready sides, more free players, more free staff,
 *          a longer run, then the earlier start
 */
export const compareSlots = (a: SlotCandidate, b: SlotCandidate): number =>
  b.readySides - a.readySides ||
  freeCount(b) - freeCount(a) ||
  b.staff.length - a.staff.length ||
  b.runMinutes - a.runMinutes ||
  a.start.getTime() - b.start.getTime();
