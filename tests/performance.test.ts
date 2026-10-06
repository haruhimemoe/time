/**
 * @file tests/performance.test.ts
 * @desc Bounded cost: a full week of 5-minute starts for two teams of six and three staff stays
 *       fast, and a window past MAX_STARTS is refused instead of run.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { fromZone } from "../src/availability/index.js";
import { findSlots, MAX_STARTS, type Member } from "../src/slots/index.js";

const zones = ["America/Los_Angeles", "Europe/Berlin", "Asia/Tokyo", "Asia/Kolkata"];
const at = Date.parse("2026-10-07T12:00:00Z");
const people = (prefix: string, n: number): Member[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    availability: fromZone(
      Array.from({ length: 168 }, (_, s) => s).filter((s) => (s * 7 + i) % 5 !== 0),
      zones[i % zones.length] as string,
      { at },
    ),
  }));

describe("findSlots cost", () => {
  it("searches a week at 5-minute steps quickly", () => {
    const began = performance.now();
    const result = findSlots({
      sides: [
        { id: "a", members: people("a", 6), need: 3 },
        { id: "b", members: people("b", 6), need: 3 },
      ],
      staff: people("s", 3),
      window: {
        start: Date.parse("2026-10-12T00:00:00Z"),
        end: Date.parse("2026-10-19T00:00:00Z"),
      },
      lengthMinutes: 90,
      stepMinutes: 5,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(performance.now() - began).toBeLessThan(3000);
  });

  it("refuses more than MAX_STARTS starts", () => {
    expect(MAX_STARTS).toBe(20_000);
    expect(() =>
      findSlots({
        sides: [{ id: "a", members: people("a", 1) }],
        window: { start: 0, end: (MAX_STARTS + 1) * 300_000 },
        lengthMinutes: 5,
        stepMinutes: 5,
      }),
    ).toThrow(/starts/);
  });
});
