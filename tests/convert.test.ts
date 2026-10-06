/**
 * @file tests/convert.test.ts
 * @desc Grids to and from zones: week wraps, the US switch week, gaps and repeated hours,
 *       half and three-quarter hour zones, UTC+14, re-anchoring across DST, and free checks.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  createAvailability,
  fromZone,
  isFreeAt,
  isFreeDuring,
  localSlot,
  toZone,
} from "../src/availability/index.js";
import type { TimeError } from "../src/errors.js";

const H = 24;
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as TimeError).code;
  }
  return "none";
};

describe("localSlot", () => {
  it("counts from local Monday 00:00", () => {
    expect(localSlot("mon", 0)).toBe(0);
    expect(localSlot("sat", 14 * 60)).toBe(5 * H + 14);
    expect(localSlot("sat", 14 * 60 + 30)).toBe(5 * H + 14);
    expect(localSlot("mon", 90, 30)).toBe(3);
    expect(localSlot("sun", 1439, 15)).toBe(671);
  });

  it("rejects bad input", () => {
    expect(code(() => localSlot("sat", 1440))).toBe("invalid-slot");
    expect(code(() => localSlot("sat", 1.5))).toBe("invalid-slot");
    expect(code(() => localSlot("sat", 0, 7))).toBe("invalid-slot-minutes");
    expect(code(() => localSlot("xyz" as "sat", 0))).toBe("invalid-wall-time");
  });
});

describe("fromZone", () => {
  const oct = { at: new Date("2026-10-07T12:00:00Z") };

  it("wraps Tokyo's Monday morning into the UTC Sunday", () => {
    const grid = fromZone([0, localSlot("sun", 23 * 60)], "Asia/Tokyo", oct);
    expect(grid).toEqual({
      slotMinutes: 60,
      slots: [6 * H + 14, 6 * H + 15],
      zone: "Asia/Tokyo",
      week: "2026-10-05",
    });
  });

  it("follows Los Angeles DST by the week given", () => {
    const pick = [0, localSlot("sat", 18 * 60)];
    const july = fromZone(pick, "America/Los_Angeles", { at: Date.parse("2026-07-08T12:00:00Z") });
    const dec = fromZone(pick, "America/Los_Angeles", { at: Date.parse("2026-12-09T12:00:00Z") });
    expect(july.slots).toEqual([7, 6 * H + 1]);
    expect(dec.slots).toEqual([8, 6 * H + 2]);
    expect([july.week, dec.week]).toEqual(["2026-07-06", "2026-12-07"]);
  });

  it("uses each day's own offset in the US switch week", () => {
    const at = { at: Date.parse("2026-03-04T12:00:00Z") };
    const sat = localSlot("sat", 12 * 60);
    const sun = localSlot("sun", 12 * 60);
    expect(fromZone([sat, sun], "America/Los_Angeles", at).slots).toEqual([5 * H + 20, 6 * H + 19]);
  });

  it("drops the hour spring forward skips and marks both copies of the repeated hour", () => {
    const gap = fromZone([localSlot("sun", 120)], "America/Los_Angeles", {
      at: Date.parse("2026-03-04T12:00:00Z"),
    });
    expect(gap.slots).toEqual([]);
    const repeat = fromZone([localSlot("sun", 60)], "America/Los_Angeles", {
      at: Date.parse("2026-10-28T12:00:00Z"),
    });
    expect(repeat.slots).toEqual([6 * H + 8, 6 * H + 9]);
    const berlin = fromZone([localSlot("sun", 120)], "Europe/Berlin", {
      at: Date.parse("2026-10-21T12:00:00Z"),
    });
    expect(berlin.slots).toEqual([6 * H, 6 * H + 1]);
  });

  it("floors Kolkata at 60 minutes and lines up at 30", () => {
    const sat18 = localSlot("sat", 18 * 60);
    expect(fromZone([sat18], "Asia/Kolkata", oct).slots).toEqual([5 * H + 12]);
    const sat18half = localSlot("sat", 18 * 60, 30);
    expect(fromZone([sat18half], "Asia/Kolkata", { ...oct, slotMinutes: 30 }).slots).toEqual([
      5 * 48 + 25,
    ]);
  });

  it("lines up Kathmandu at 15 minutes", () => {
    const slot = localSlot("sat", 18 * 60, 15);
    expect(fromZone([slot], "Asia/Kathmandu", { ...oct, slotMinutes: 15 }).slots).toEqual([
      5 * 96 + 49,
    ]);
  });

  it("moves Kiritimati's Monday into the UTC Sunday before", () => {
    expect(fromZone([10], "Pacific/Kiritimati", oct).slots).toEqual([6 * H + 20]);
  });

  it("defaults to this week and 60 minutes", () => {
    const grid = fromZone([0], "UTC");
    expect(grid.slots).toEqual([0]);
    expect(grid.slotMinutes).toBe(60);
  });

  it("rejects bad zones and slots", () => {
    expect(code(() => fromZone([0], "Nope/Zone"))).toBe("invalid-zone");
    expect(code(() => fromZone([168], "UTC"))).toBe("invalid-slot");
    expect(code(() => fromZone([0], "UTC", { slotMinutes: 7 }))).toBe("invalid-slot-minutes");
  });
});

describe("toZone", () => {
  const oct = { at: Date.parse("2026-10-07T12:00:00Z") };

  it.each([
    ["Asia/Tokyo", 60],
    ["America/Los_Angeles", 60],
    ["Asia/Kolkata", 30],
    ["Asia/Kathmandu", 15],
    ["Pacific/Kiritimati", 60],
    ["America/St_Johns", 30],
  ])("round trips %s at %d minutes", (zone, slotMinutes) => {
    const per = (7 * 1440) / slotMinutes;
    const local = [0, 1, Math.floor(per / 2), per - 2, per - 1];
    const grid = fromZone(local, zone, { ...oct, slotMinutes });
    expect(toZone(grid, zone)).toEqual(local);
    expect(toZone(grid, zone, oct)).toEqual(local);
  });

  it("survives load and save cycles in half-hour zones", () => {
    let local = [0, 1];
    for (let i = 0; i < 4; i += 1) {
      local = toZone(fromZone(local, "Asia/Kolkata", oct), "Asia/Kolkata", oct);
    }
    expect(local).toEqual([0, 1]);
    const nepal = fromZone([0], "Asia/Kathmandu", { ...oct, slotMinutes: 30 });
    expect(toZone(nepal, "Asia/Kathmandu")).toEqual([0]);
  });

  it("shows a UTC grid in another zone", () => {
    const grid = createAvailability([0, 6 * H + 15]);
    expect(toZone(grid, "Asia/Tokyo", oct)).toEqual([0, 9]);
  });

  it("shows a Tokyo pick in Los Angeles and moves it with LA's clock, not Tokyo's", () => {
    const grid = fromZone([localSlot("sun", 10 * 60)], "Asia/Tokyo", oct);
    expect(toZone(grid, "America/Los_Angeles", oct)).toEqual([5 * H + 18]);
    const dec = { at: Date.parse("2026-12-09T12:00:00Z") };
    expect(toZone(grid, "America/Los_Angeles", dec)).toEqual([5 * H + 17]);
  });

  it("re-anchors an LA pick when shown for a winter week", () => {
    const grid = fromZone([localSlot("sat", 18 * 60)], "America/Los_Angeles", oct);
    const dec = { at: Date.parse("2026-12-09T12:00:00Z") };
    expect(toZone(grid, "America/Los_Angeles", dec)).toEqual([5 * H + 18]);
    expect(toZone(grid, "UTC", dec)).toEqual([6 * H + 2]);
  });
});

describe("isFreeAt and isFreeDuring", () => {
  it("re-anchors to the owner's clock across DST", () => {
    // Saturday 18:00 picked in October (PDT, 01:00Z Sunday).
    const grid = fromZone([localSlot("sat", 18 * 60)], "America/Los_Angeles", {
      at: Date.parse("2026-10-07T12:00:00Z"),
    });
    expect(isFreeAt(grid, Date.parse("2026-10-11T01:30:00Z"))).toBe(true);
    // November 7 is after fall back: Saturday 18:00 PST is 02:00Z.
    expect(isFreeAt(grid, Date.parse("2026-11-08T02:30:00Z"))).toBe(true);
    expect(isFreeAt(grid, Date.parse("2026-11-08T01:30:00Z"))).toBe(false);
    // The same slots without zone and week are a fixed UTC pattern.
    const plain = { slotMinutes: 60, slots: grid.slots };
    expect(isFreeAt(plain, Date.parse("2026-11-08T01:30:00Z"))).toBe(true);
    expect(isFreeAt(plain, Date.parse("2026-11-08T02:30:00Z"))).toBe(false);
  });

  it("checks every slot a span touches, across the week end", () => {
    const grid = createAvailability([6 * H + 23, 0]);
    const sun = Date.parse("2026-10-11T23:00:00Z");
    expect(isFreeDuring(grid, sun, sun + 2 * 3_600_000)).toBe(true);
    expect(isFreeDuring(grid, sun, sun + 2 * 3_600_000 + 1)).toBe(false);
    expect(isFreeDuring(grid, sun + 1_800_000, sun + 5_400_000)).toBe(true);
    expect(isFreeDuring(grid, sun - 1, sun + 60_000)).toBe(false);
    expect(isFreeDuring(grid, new Date(sun), new Date(sun + 1))).toBe(true);
  });

  it("follows the owner's clock inside one long span", () => {
    const grid = fromZone([localSlot("sun", 0), localSlot("sun", 60)], "America/Los_Angeles", {
      at: Date.parse("2026-10-07T12:00:00Z"),
    });
    // Sunday Nov 1, 00:00 PDT (07:00Z) to 02:00 PST (10:00Z): three real hours, local 00-01.
    expect(
      isFreeDuring(grid, Date.parse("2026-11-01T07:00:00Z"), Date.parse("2026-11-01T10:00:00Z")),
    ).toBe(true);
  });

  it("reads a replaced slots array, not a stale cache", () => {
    const grid = fromZone([0], "UTC", { at: Date.parse("2026-10-07T12:00:00Z") });
    const later = Date.parse("2026-12-07T01:30:00Z");
    expect(isFreeAt(grid, later)).toBe(false);
    grid.slots = [1];
    expect(isFreeAt(grid, later)).toBe(true);
    const plain = createAvailability([0]);
    plain.slots.push(1);
    expect(isFreeAt(plain, Date.parse("2026-10-05T01:30:00Z"))).toBe(true);
  });

  it("rejects empty spans", () => {
    const grid = createAvailability([0]);
    expect(code(() => isFreeDuring(grid, 10, 10))).toBe("invalid-window");
    expect(code(() => isFreeAt(grid, Number.NaN))).toBe("invalid-instant");
  });
});
