/**
 * @file tests/slots.test.ts
 * @desc findSlots: readiness, need, staff, windows over midnight, the week end and DST, steps,
 *       collapse, filter and tiebreak (the EGC higher-seed case), limits and bad queries.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { createAvailability, fromZone, localSlot } from "../src/availability/index.js";
import type { TimeError } from "../src/errors.js";
import { compareSlots, findSlots, type Member, type SlotCandidate } from "../src/slots/index.js";
import { toWallTime, weeklyWindow } from "../src/zone/index.js";

const HOUR = 3_600_000;
const MON = Date.parse("2026-10-05T00:00:00Z");
const utc = (...slots: number[]): Member["availability"] => createAvailability(slots);
const member = (id: string, ...slots: number[]): Member => ({ id, availability: utc(...slots) });
const iso = (c: SlotCandidate): string => c.start.toISOString();
const week = { start: MON, end: MON + 7 * 24 * HOUR };
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as TimeError).code;
  }
  return "none";
};

describe("findSlots", () => {
  it("finds where both sides are fully free and merges the run", () => {
    const result = findSlots({
      sides: [
        { id: "a", members: [member("a1", 10, 11, 12), member("a2", 11, 12, 13)] },
        { id: "b", members: [member("b1", 11, 12, 14)] },
      ],
      window: week,
      lengthMinutes: 60,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      start: new Date("2026-10-05T11:00:00Z"),
      end: new Date("2026-10-05T12:00:00Z"),
      runMinutes: 120,
      readySides: 2,
      sides: [
        { id: "a", free: ["a1", "a2"], total: 2, need: 2, ready: true },
        { id: "b", free: ["b1"], total: 1, need: 1, ready: true },
      ],
      staff: [],
    });
  });

  it("needs the whole match span free", () => {
    const sides = [
      { id: "a", members: [member("a1", 10, 11, 12)] },
      { id: "b", members: [member("b1", 10, 11, 13)] },
    ];
    const long = findSlots({ sides, window: week, lengthMinutes: 90, collapse: false });
    expect(long.map(iso)).toEqual(["2026-10-05T10:00:00.000Z"]);
    expect(long[0]?.runMinutes).toBe(90);
  });

  it("skips members with no data and honours need", () => {
    const sides = [
      {
        id: "a",
        need: 2,
        members: [
          member("a1", 5),
          member("a2", 5),
          member("a3", 6),
          { id: "a4", availability: null },
          { id: "a5", availability: utc() },
        ],
      },
      { id: "b", members: [member("b1", 5, 6)] },
    ];
    const [best, ...rest] = findSlots({ sides, window: week, lengthMinutes: 60 });
    expect(iso(best as SlotCandidate)).toBe("2026-10-05T05:00:00.000Z");
    expect(best?.sides[0]).toEqual({ id: "a", free: ["a1", "a2"], total: 3, need: 2, ready: true });
    expect(rest).toEqual([]);
  });

  it("never readies a side with no data", () => {
    const sides = [
      { id: "a", members: [{ id: "a1", availability: null }], need: 0 },
      { id: "b", members: [member("b1", 5)] },
    ];
    expect(findSlots({ sides, window: week, lengthMinutes: 60 })).toEqual([]);
    expect(findSlots({ sides, window: week, lengthMinutes: 60, minReadySides: 1 })).toHaveLength(1);
  });

  it("requires and reports staff", () => {
    const sides = [
      { id: "a", members: [member("a1", 1, 2, 3)] },
      { id: "b", members: [member("b1", 1, 2, 3)] },
    ];
    const staff = [member("ref", 2), member("streamer", 2, 3)];
    const reported = findSlots({ sides, staff, window: week, lengthMinutes: 60 });
    expect(reported.map((c) => [iso(c), c.staff])).toEqual([
      ["2026-10-05T02:00:00.000Z", ["ref", "streamer"]],
      ["2026-10-05T03:00:00.000Z", ["streamer"]],
      ["2026-10-05T01:00:00.000Z", []],
    ]);
    const required = findSlots({ sides, staff, staffNeed: 2, window: week, lengthMinutes: 60 });
    expect(required.map(iso)).toEqual(["2026-10-05T02:00:00.000Z"]);
  });

  it("crosses UTC midnight and the Sunday to Monday week edge", () => {
    const sides = [
      { id: "a", members: [member("a1", 167, 0, 1)] },
      { id: "b", members: [member("b1", 167, 0)] },
    ];
    const window = {
      start: Date.parse("2026-10-11T22:00:00Z"),
      end: Date.parse("2026-10-12T03:00:00Z"),
    };
    const merged = findSlots({ sides, window, lengthMinutes: 60 });
    expect(merged.map((c) => [iso(c), c.runMinutes])).toEqual([["2026-10-11T23:00:00.000Z", 120]]);
    const span = findSlots({ sides, window, lengthMinutes: 120 });
    expect(span.map(iso)).toEqual(["2026-10-11T23:00:00.000Z"]);
  });

  it("aligns starts to the step from Monday 00:00 UTC and keeps matches inside the window", () => {
    const all = Array.from({ length: 168 }, (_, i) => i);
    const sides = [{ id: "a", members: [member("a1", ...all)] }];
    const window = { start: MON + 10 * 60_000, end: MON + 2 * HOUR };
    const starts = findSlots({
      sides,
      window,
      lengthMinutes: 30,
      stepMinutes: 30,
      collapse: false,
    });
    expect(starts.map(iso)).toEqual([
      "2026-10-05T00:30:00.000Z",
      "2026-10-05T01:00:00.000Z",
      "2026-10-05T01:30:00.000Z",
    ]);
    expect(
      findSlots({ sides, window: { start: MON, end: MON + HOUR }, lengthMinutes: 61 }),
    ).toEqual([]);
  });

  it("follows each player's clock across a DST switch", () => {
    // Both pick Saturday 18:00 local in October; the window is the weekend after fall back.
    const oct = { at: Date.parse("2026-10-07T12:00:00Z") };
    const la = fromZone([localSlot("sat", 18 * 60)], "America/Los_Angeles", oct);
    const ny = fromZone([localSlot("sat", 21 * 60)], "America/New_York", oct);
    const window = weeklyWindow(Date.parse("2026-11-04T12:00:00Z"), "America/Los_Angeles", {
      day: "fri",
      days: 3,
    });
    const result = findSlots({
      sides: [
        { id: "la", members: [{ id: "p1", availability: la }] },
        { id: "ny", members: [{ id: "p2", availability: ny }] },
      ],
      window,
      lengthMinutes: 60,
    });
    expect(result.map(iso)).toEqual(["2026-11-08T02:00:00.000Z"]);
  });

  it("filters and tiebreaks like EGC's higher-seed fallback", () => {
    // Seed 1 (side 0) and seed 2 (side 1), three players each, Pacific weekend.
    const zone = "America/Los_Angeles";
    const oct = { at: Date.parse("2026-10-07T12:00:00Z") };
    const pick = (...hours: [string, number][]) =>
      fromZone(
        hours.map(([d, h]) => localSlot(d as "sat", h * 60)),
        zone,
        oct,
      );
    const team = (id: string, grids: Member["availability"][]) => ({
      id,
      members: grids.map((availability, i) => ({ id: `${id}${i}`, availability })),
    });
    const top = team("top", [
      pick(["sat", 14], ["sat", 15], ["sun", 9]),
      pick(["sat", 14], ["sat", 15], ["sun", 9]),
      pick(["sat", 14], ["sat", 15], ["sun", 9], ["fri", 20]),
    ]);
    const low = team("low", [pick(["sat", 15], ["fri", 20]), pick(["sat", 15], ["fri", 20])]);
    const lowOnly = team("low", [pick(["fri", 20]), pick(["fri", 20])]);
    const dayRank: Record<string, number> = { sat: 2, sun: 1, fri: 0 };
    const local = (c: SlotCandidate) => toWallTime(c.start, zone);
    const result = findSlots({
      sides: [top, low],
      window: weeklyWindow(oct.at, zone, { day: "fri", days: 3 }),
      lengthMinutes: 60,
      minReadySides: 1,
      filter: (c) => c.sides[0]?.ready === true,
      tiebreak: (a, b) =>
        Math.min(b.runMinutes, 180) - Math.min(a.runMinutes, 180) ||
        (dayRank[local(b).weekday] ?? 0) - (dayRank[local(a).weekday] ?? 0),
    });
    expect(result.map((c) => [local(c).weekday, local(c).hour, c.readySides])).toEqual([
      ["sat", 15, 2],
      ["sat", 14, 1],
      ["sun", 9, 1],
    ]);
    // Friday 20:00 only has the lower seed ready plus one of top's three: filtered out.
    const lowFirst = findSlots({
      sides: [top, lowOnly],
      window: weeklyWindow(oct.at, zone, { day: "fri", days: 3 }),
      lengthMinutes: 60,
      minReadySides: 1,
    });
    expect(lowFirst.some((c) => !c.sides[0]?.ready)).toBe(true);
  });

  it("orders by the default comparator and limits", () => {
    const sides = [
      { id: "a", members: [member("a1", 1, 3, 5), member("a2", 3)], need: 1 },
      { id: "b", members: [member("b1", 1, 3, 5)] },
    ];
    const result = findSlots({ sides, window: week, lengthMinutes: 60, limit: 2 });
    expect(result.map(iso)).toEqual(["2026-10-05T03:00:00.000Z", "2026-10-05T01:00:00.000Z"]);
    const sorted = [...result].reverse().sort(compareSlots);
    expect(sorted.map(iso)).toEqual(result.map(iso));
    expect(findSlots({ sides, window: week, lengthMinutes: 60, limit: 0 })).toEqual([]);
  });

  it("needs at least one side", () => {
    expect(code(() => findSlots({ sides: [], window: week, lengthMinutes: 60 }))).toBe(
      "invalid-query",
    );
  });

  it.each([
    [{ window: { start: MON, end: MON } }, "invalid-window"],
    [{ window: { start: MON, end: MON + 365 * 24 * HOUR }, stepMinutes: 5 }, "invalid-window"],
    [{ lengthMinutes: 0 }, "invalid-query"],
    [{ lengthMinutes: 1.5 }, "invalid-query"],
    [{ stepMinutes: 0 }, "invalid-query"],
    [{ minReadySides: 3 }, "invalid-query"],
    [{ staffNeed: 1 }, "invalid-query"],
    [{ limit: -1 }, "invalid-query"],
  ])("rejects %j", (patch, expected) => {
    const base = {
      sides: [{ id: "a", members: [member("a1", 1)] }],
      window: week,
      lengthMinutes: 60,
    };
    expect(code(() => findSlots({ ...base, ...patch }))).toBe(expected);
  });

  it("rejects mixed slot sizes and a bad need", () => {
    const sides = [
      { id: "a", members: [member("a1", 1)] },
      { id: "b", members: [{ id: "b1", availability: createAvailability([1], 30) }] },
    ];
    expect(code(() => findSlots({ sides, window: week, lengthMinutes: 60 }))).toBe(
      "mismatched-slot-minutes",
    );
    const bad = [{ id: "a", members: [member("a1", 1)], need: -1 }];
    expect(code(() => findSlots({ sides: bad, window: week, lengthMinutes: 60 }))).toBe(
      "invalid-query",
    );
  });
});
