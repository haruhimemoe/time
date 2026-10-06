/**
 * @file tests/wall.test.ts
 * @desc Wall time in a zone and back: US and EU gaps and overlaps under each disambiguation,
 *       the date line, a seeded round trip, and weeklyWindow around DST and week edges.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TimeError } from "../src/errors.js";
import {
  type Disambiguation,
  fromWallTime,
  toWallTime,
  type WallTime,
  weeklyWindow,
} from "../src/zone/index.js";

const iso = (d: Date): string => d.toISOString();
const wall = (y: number, mo: number, d: number, h: number, mi = 0): WallTime => ({
  year: y,
  month: mo,
  day: d,
  hour: h,
  minute: mi,
});

describe("toWallTime", () => {
  it("reads the clock in a zone, weekday included", () => {
    expect(toWallTime(new Date("2026-10-10T19:00:00Z"), "America/Los_Angeles")).toEqual({
      year: 2026,
      month: 10,
      day: 10,
      hour: 12,
      minute: 0,
      second: 0,
      weekday: "sat",
    });
    expect(toWallTime(Date.parse("2026-10-11T23:59:59Z"), "UTC").weekday).toBe("sun");
    expect(toWallTime(Date.parse("2026-10-12T00:00:00Z"), "UTC").weekday).toBe("mon");
  });

  it("crosses the date line at UTC+14", () => {
    const w = toWallTime(new Date("2025-12-31T10:00:00Z"), "Pacific/Kiritimati");
    expect([w.year, w.month, w.day, w.hour, w.weekday]).toEqual([2026, 1, 1, 0, "thu"]);
  });

  it("shows half-hour zones", () => {
    const w = toWallTime(new Date("2026-10-10T12:30:00Z"), "Asia/Kolkata");
    expect([w.hour, w.minute]).toEqual([18, 0]);
  });

  it("handles midnight as hour 0, never 24", () => {
    expect(toWallTime(new Date("2026-10-10T07:00:00Z"), "America/Los_Angeles").hour).toBe(0);
  });
});

describe("fromWallTime", () => {
  it.each([
    ["America/Los_Angeles", wall(2026, 10, 10, 12), "2026-10-10T19:00:00.000Z"],
    ["America/Los_Angeles", wall(2026, 12, 10, 12), "2026-12-10T20:00:00.000Z"],
    ["Asia/Kolkata", wall(2026, 10, 10, 18), "2026-10-10T12:30:00.000Z"],
    ["Asia/Kathmandu", wall(2026, 10, 10, 18), "2026-10-10T12:15:00.000Z"],
    ["Pacific/Kiritimati", wall(2026, 1, 1, 0), "2025-12-31T10:00:00.000Z"],
    ["Pacific/Tongatapu", wall(2026, 1, 1, 0), "2025-12-31T11:00:00.000Z"],
    ["UTC", { ...wall(2026, 2, 28, 23, 59), second: 59 }, "2026-02-28T23:59:59.000Z"],
  ])("%s %j", (zone, w, expected) => {
    expect(iso(fromWallTime(w, zone))).toBe(expected);
  });

  const cases: [string, WallTime, Record<Disambiguation, string | "throws">][] = [
    [
      "America/Los_Angeles",
      wall(2026, 3, 8, 2, 30),
      {
        compatible: "2026-03-08T10:30:00.000Z",
        later: "2026-03-08T10:30:00.000Z",
        earlier: "2026-03-08T09:30:00.000Z",
        reject: "throws",
      },
    ],
    [
      "America/Los_Angeles",
      wall(2026, 11, 1, 1, 30),
      {
        compatible: "2026-11-01T08:30:00.000Z",
        earlier: "2026-11-01T08:30:00.000Z",
        later: "2026-11-01T09:30:00.000Z",
        reject: "throws",
      },
    ],
    [
      "Europe/Berlin",
      wall(2026, 3, 29, 2, 30),
      {
        compatible: "2026-03-29T01:30:00.000Z",
        later: "2026-03-29T01:30:00.000Z",
        earlier: "2026-03-29T00:30:00.000Z",
        reject: "throws",
      },
    ],
    [
      "Europe/Berlin",
      wall(2026, 10, 25, 2, 30),
      {
        compatible: "2026-10-25T00:30:00.000Z",
        earlier: "2026-10-25T00:30:00.000Z",
        later: "2026-10-25T01:30:00.000Z",
        reject: "throws",
      },
    ],
  ];

  it.each(cases)("%s %j by disambiguation", (zone, w, expected) => {
    for (const [mode, want] of Object.entries(expected) as [Disambiguation, string][]) {
      if (want === "throws") {
        expect(() => fromWallTime(w, zone, mode)).toThrow(TimeError);
      } else {
        expect(iso(fromWallTime(w, zone, mode))).toBe(want);
      }
    }
  });

  it("names the gap and the overlap in its errors", () => {
    const code = (fn: () => unknown): string => {
      try {
        fn();
      } catch (error) {
        return (error as TimeError).code;
      }
      return "none";
    };
    expect(code(() => fromWallTime(wall(2026, 3, 8, 2, 30), "America/Los_Angeles", "reject"))).toBe(
      "nonexistent-time",
    );
    expect(
      code(() => fromWallTime(wall(2026, 11, 1, 1, 30), "America/Los_Angeles", "reject")),
    ).toBe("ambiguous-time");
    expect(code(() => fromWallTime(wall(2026, 1, 1, 0), "Bad/Zone"))).toBe("invalid-zone");
  });

  it.each([
    wall(2026, 13, 1, 0),
    wall(2026, 2, 29, 0),
    wall(2026, 4, 31, 0),
    wall(2026, 1, 0, 0),
    wall(2026, 1, 1, 24),
    wall(2026, 1, 1, 0, 60),
    { ...wall(2026, 1, 1, 0), second: 60 },
    wall(2026.5, 1, 1, 0),
    null as unknown as WallTime,
    { year: 2026, month: 1 } as WallTime,
  ])("rejects %j", (w) => {
    expect(() => fromWallTime(w, "UTC")).toThrow(TimeError);
  });

  it("accepts leap days", () => {
    expect(iso(fromWallTime(wall(2028, 2, 29, 0), "UTC"))).toBe("2028-02-29T00:00:00.000Z");
  });

  it("round trips any instant through its wall time (seeded)", () => {
    const zones = [
      "America/Los_Angeles",
      "Europe/Berlin",
      "Asia/Kolkata",
      "Australia/Sydney",
      "Pacific/Chatham",
      "Pacific/Kiritimati",
      "America/St_Johns",
    ];
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(1990, 0, 1), max: Date.UTC(2040, 0, 1) }),
        fc.constantFrom(...zones),
        (ms, zone) => {
          const second = ms - (ms % 1000);
          const w = toWallTime(ms, zone);
          const options = [
            fromWallTime(w, zone, "earlier").getTime(),
            fromWallTime(w, zone, "later").getTime(),
          ];
          expect(options).toContain(second);
        },
      ),
      { seed: 20261006, numRuns: 400 },
    );
  });
});

describe("weeklyWindow", () => {
  const weekend = { day: "fri", days: 3 } as const;
  const la = "America/Los_Angeles";

  it.each([
    ["Wednesday", "2026-10-07T19:00:00Z"],
    ["Thursday 23:59", "2026-10-09T06:59:59Z"],
    ["Friday 00:00", "2026-10-09T07:00:00Z"],
    ["Saturday", "2026-10-10T19:00:00Z"],
    ["Sunday 23:59", "2026-10-12T06:59:59Z"],
  ])("EGC weekend from %s", (_label, at) => {
    const w = weeklyWindow(new Date(at), la, weekend);
    expect([iso(w.start), iso(w.end)]).toEqual([
      "2026-10-09T07:00:00.000Z",
      "2026-10-12T07:00:00.000Z",
    ]);
  });

  it("moves to the next weekend at Monday 00:00", () => {
    const w = weeklyWindow(Date.parse("2026-10-12T07:00:00Z"), la, weekend);
    expect(iso(w.start)).toBe("2026-10-16T07:00:00.000Z");
  });

  it("is 73 hours over the US fall-back weekend and 71 over spring forward", () => {
    const fall = weeklyWindow(Date.parse("2026-10-28T12:00:00Z"), la, weekend);
    expect([iso(fall.start), iso(fall.end)]).toEqual([
      "2026-10-30T07:00:00.000Z",
      "2026-11-02T08:00:00.000Z",
    ]);
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(73);
    const spring = weeklyWindow(Date.parse("2026-03-04T12:00:00Z"), la, weekend);
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(71);
  });

  it("opens at a minute past midnight and wraps the week", () => {
    const opts = { day: "sun", minute: 20 * 60, days: 2 } as const;
    // Sunday 19:00 UTC: before today's opening, after last week's window closed.
    const before = weeklyWindow(Date.parse("2026-10-11T19:00:00Z"), "UTC", opts);
    expect(iso(before.start)).toBe("2026-10-11T20:00:00.000Z");
    // Monday 10:00: inside the window that opened Sunday.
    const inside = weeklyWindow(Date.parse("2026-10-12T10:00:00Z"), "UTC", opts);
    expect([iso(inside.start), iso(inside.end)]).toEqual([
      "2026-10-11T20:00:00.000Z",
      "2026-10-13T20:00:00.000Z",
    ]);
  });

  it("takes a full week", () => {
    const w = weeklyWindow(Date.parse("2026-10-07T00:00:00Z"), "Asia/Tokyo", {
      day: "mon",
      days: 7,
    });
    expect([iso(w.start), iso(w.end)]).toEqual([
      "2026-10-04T15:00:00.000Z",
      "2026-10-11T15:00:00.000Z",
    ]);
  });

  it.each([
    { day: "fri", days: 0 },
    { day: "fri", days: 8 },
    { day: "fri", days: 1.5 },
    { day: "fri", days: 1, minute: 1440 },
    { day: "fri", days: 1, minute: -1 },
  ] as const)("rejects %j", (opts) => {
    expect(() => weeklyWindow(0, "UTC", opts)).toThrow(TimeError);
  });

  it("rejects a bad day code", () => {
    expect(() => weeklyWindow(0, "UTC", { day: "fry" as "fri", days: 1 })).toThrow(TimeError);
  });
});
