/**
 * @file tests/availability.test.ts
 * @desc Grid math: slot indices from the Monday epoch, create, union, intersect, count,
 *       resample and the schema.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  type Availability,
  availabilitySchema,
  countAvailability,
  createAvailability,
  intersectAvailability,
  resampleAvailability,
  slotsPerWeek,
  unionAvailability,
  weekSlotOf,
} from "../src/availability/index.js";
import type { TimeError } from "../src/errors.js";

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as TimeError).code;
  }
  return "none";
};

describe("slots", () => {
  it("counts slots per week", () => {
    expect(slotsPerWeek(60)).toBe(168);
    expect(slotsPerWeek(30)).toBe(336);
    expect(slotsPerWeek(1440)).toBe(7);
  });

  it.each([0, 4, 7, 45.5, 2880, Number.NaN])("rejects %d minute slots", (m) => {
    expect(code(() => slotsPerWeek(m))).toBe("invalid-slot-minutes");
  });

  it("starts the week Monday 00:00 UTC", () => {
    expect(weekSlotOf(new Date("2026-10-05T00:00:00Z"))).toBe(0); // a Monday
    expect(weekSlotOf(new Date("2026-10-04T23:59:59Z"))).toBe(167); // Sunday
    expect(weekSlotOf(new Date("2026-10-10T14:30:00Z"))).toBe(5 * 24 + 14);
    expect(weekSlotOf(new Date("2026-10-10T14:30:00Z"), 30)).toBe(2 * (5 * 24 + 14) + 1);
    expect(weekSlotOf(0)).toBe(3 * 24); // 1970-01-01 was a Thursday
    expect(weekSlotOf(Date.UTC(1969, 11, 31, 23))).toBe(2 * 24 + 23);
  });
});

describe("createAvailability", () => {
  it("sorts and dedupes", () => {
    expect(createAvailability([5, 1, 5, 3])).toEqual({ slotMinutes: 60, slots: [1, 3, 5] });
    expect(createAvailability(new Set([335]), 30).slots).toEqual([335]);
  });

  it.each([[-1], [168], [1.5], [Number.NaN]])("rejects slot %d", (slot) => {
    expect(code(() => createAvailability([slot]))).toBe("invalid-slot");
  });
});

describe("set operations", () => {
  const a = createAvailability([1, 2, 3]);
  const b = createAvailability([2, 3, 4]);
  const c = createAvailability([3, 9]);

  it("unions, intersects and counts", () => {
    expect(unionAvailability([a, b, c]).slots).toEqual([1, 2, 3, 4, 9]);
    expect(intersectAvailability([a, b, c]).slots).toEqual([3]);
    expect([...countAvailability([a, b, c])].sort((x, y) => x[0] - y[0])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 1],
      [9, 1],
    ]);
  });

  it("counts a repeated slot once per grid", () => {
    const messy: Availability = { slotMinutes: 60, slots: [2, 2] };
    expect(countAvailability([messy]).get(2)).toBe(1);
  });

  it("gives an empty 60-minute grid for no grids", () => {
    expect(unionAvailability([])).toEqual({ slotMinutes: 60, slots: [] });
    expect(intersectAvailability([])).toEqual({ slotMinutes: 60, slots: [] });
  });

  it("keeps zone and week only when every grid shares them", () => {
    const tagged = { ...a, zone: "Asia/Tokyo", week: "2026-10-05" };
    expect(unionAvailability([tagged, { ...b, zone: "Asia/Tokyo", week: "2026-10-05" }])).toEqual({
      slotMinutes: 60,
      slots: [1, 2, 3, 4],
      zone: "Asia/Tokyo",
      week: "2026-10-05",
    });
    expect(unionAvailability([tagged, b]).zone).toBeUndefined();
    expect(intersectAvailability([b, tagged]).zone).toBeUndefined();
  });

  it("refuses mixed slot sizes", () => {
    expect(code(() => unionAvailability([a, createAvailability([1], 30)]))).toBe(
      "mismatched-slot-minutes",
    );
  });
});

describe("resampleAvailability", () => {
  it("splits each slot when going finer", () => {
    expect(resampleAvailability(createAvailability([0, 5]), 30).slots).toEqual([0, 1, 10, 11]);
  });

  it("needs every fine slot when going coarser", () => {
    const fine = createAvailability([0, 1, 2, 5], 30);
    expect(resampleAvailability(fine, 60).slots).toEqual([0]);
  });

  it("covers sizes that don't divide each other", () => {
    // 20-minute slots 0-2 cover 00:00-01:00; the 30-minute slots inside are 0 and 1.
    const grid = createAvailability([0, 1, 2], 20);
    expect(resampleAvailability(grid, 30).slots).toEqual([0, 1]);
    expect(resampleAvailability(createAvailability([0, 1], 30), 20).slots).toEqual([0, 1, 2]);
  });

  it("keeps zone and week", () => {
    const grid = { ...createAvailability([0]), zone: "UTC", week: "2026-10-05" };
    expect(resampleAvailability(grid, 30)).toEqual({
      slotMinutes: 30,
      slots: [0, 1],
      zone: "UTC",
      week: "2026-10-05",
    });
  });

  it("checks both sizes", () => {
    expect(code(() => resampleAvailability(createAvailability([0]), 7))).toBe(
      "invalid-slot-minutes",
    );
    expect(code(() => resampleAvailability({ slotMinutes: 7, slots: [] }, 60))).toBe(
      "invalid-slot-minutes",
    );
  });
});

describe("availabilitySchema", () => {
  it.each([
    { slotMinutes: 60, slots: [] },
    { slotMinutes: 60, slots: [0, 167] },
    { slotMinutes: 15, slots: [671] },
    { slotMinutes: 60, slots: [1], zone: "America/Los_Angeles", week: "2026-10-05" },
  ])("accepts %j", (grid) => {
    expect(availabilitySchema.safeParse(grid).success).toBe(true);
  });

  it.each([
    { slotMinutes: 7, slots: [] },
    { slotMinutes: 60, slots: [168] },
    { slotMinutes: 60, slots: [3, 3] },
    { slotMinutes: 60, slots: [4, 3] },
    { slotMinutes: 60, slots: [-1] },
    { slotMinutes: 60, slots: [], zone: "Mars/Base", week: "2026-10-05" },
    { slotMinutes: 60, slots: [], zone: "UTC" },
    { slotMinutes: 60, slots: [], week: "2026-10-05" },
    { slotMinutes: 60, slots: [], zone: "UTC", week: "2026-10-06" },
    { slotMinutes: 60, slots: [], zone: "UTC", week: "2026-02-30" },
  ])("rejects %j", (grid) => {
    expect(availabilitySchema.safeParse(grid).success).toBe(false);
  });

  it("matches the Availability type", () => {
    const parsed = availabilitySchema.parse({ slotMinutes: 60, slots: [1] });
    const grid: Availability = { slotMinutes: parsed.slotMinutes, slots: parsed.slots };
    expect(grid.slots).toEqual([1]);
  });
});
