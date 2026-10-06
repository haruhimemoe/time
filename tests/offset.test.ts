/**
 * @file tests/offset.test.ts
 * @desc Zone checks and offsets: DST in both hemispheres, zones without DST, half and three-
 *       quarter hour zones, UTC+13/+14, and offset text in both styles.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { TimeError } from "../src/errors.js";
import {
  assertTimeZone,
  formatOffset,
  isTimeZone,
  listTimeZones,
  offsetMinutes,
  offsetZone,
  parseOffset,
  zoneOffset,
} from "../src/zone/index.js";

const at = (iso: string): Date => new Date(iso);

describe("isTimeZone", () => {
  it.each(["UTC", "Asia/Tokyo", "America/Los_Angeles", "Etc/GMT+7", "asia/tokyo"])("%s", (z) => {
    expect(isTimeZone(z)).toBe(true);
  });

  it.each(["", "Mars/Olympus", "+09:00", "-0700", "Asia/Tokyo ", " UTC"])("rejects %j", (z) => {
    expect(isTimeZone(z)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isTimeZone(9 as unknown as string)).toBe(false);
  });

  it("assertTimeZone fixes case and throws on junk", () => {
    expect(assertTimeZone("asia/tokyo")).toBe("Asia/Tokyo");
    expect(() => assertTimeZone("Nope/Zone")).toThrow(TimeError);
    try {
      assertTimeZone("Nope/Zone");
    } catch (error) {
      expect((error as TimeError).code).toBe("invalid-zone");
    }
  });

  it("lists zones", () => {
    const zones = listTimeZones();
    expect(zones).toContain("Asia/Tokyo");
    expect(zones.every(isTimeZone)).toBe(true);
  });

  it("lists nothing where Intl can't", () => {
    const original = Intl.supportedValuesOf;
    try {
      (Intl as { supportedValuesOf?: unknown }).supportedValuesOf = undefined;
      expect(listTimeZones()).toEqual([]);
    } finally {
      Intl.supportedValuesOf = original;
    }
  });
});

describe("offsetMinutes", () => {
  it.each([
    ["UTC", "2026-07-01T00:00:00Z", 0],
    ["Asia/Tokyo", "2026-01-15T00:00:00Z", 540],
    ["Asia/Shanghai", "2026-07-01T00:00:00Z", 480],
    ["Asia/Kolkata", "2026-07-01T00:00:00Z", 330],
    ["Asia/Kathmandu", "2026-07-01T00:00:00Z", 345],
    ["Pacific/Kiritimati", "2026-07-01T00:00:00Z", 840],
    ["Pacific/Tongatapu", "2026-01-15T00:00:00Z", 780],
    ["Pacific/Apia", "2026-01-15T00:00:00Z", 780],
    ["Pacific/Chatham", "2026-01-15T00:00:00Z", 825],
    ["Pacific/Chatham", "2026-07-01T00:00:00Z", 765],
    ["America/Phoenix", "2026-07-01T00:00:00Z", -420],
    ["America/Phoenix", "2026-01-15T00:00:00Z", -420],
    ["Australia/Sydney", "2026-01-15T00:00:00Z", 660],
    ["Australia/Sydney", "2026-07-01T00:00:00Z", 600],
    ["America/St_Johns", "2026-01-15T00:00:00Z", -210],
    ["Etc/GMT+7", "2026-01-15T00:00:00Z", -420],
  ])("%s at %s is %d", (zone, iso, minutes) => {
    expect(offsetMinutes(zone, at(iso))).toBe(minutes);
  });

  it("follows the US switches on 2026-03-08 and 2026-11-01", () => {
    const la = "America/Los_Angeles";
    // Spring forward at 02:00 PST = 10:00Z; fall back at 02:00 PDT = 09:00Z.
    expect(offsetMinutes(la, at("2026-03-08T09:59:59Z"))).toBe(-480);
    expect(offsetMinutes(la, at("2026-03-08T10:00:00Z"))).toBe(-420);
    expect(offsetMinutes(la, at("2026-11-01T08:59:59Z"))).toBe(-420);
    expect(offsetMinutes(la, at("2026-11-01T09:00:00Z"))).toBe(-480);
    const ny = "America/New_York";
    expect(offsetMinutes(ny, at("2026-03-08T06:59:59Z"))).toBe(-300);
    expect(offsetMinutes(ny, at("2026-03-08T07:00:00Z"))).toBe(-240);
  });

  it("follows the EU switches at 01:00Z on 2026-03-29 and 2026-10-25", () => {
    for (const [zone, winter] of [
      ["Europe/London", 0],
      ["Europe/Berlin", 60],
      ["Europe/Helsinki", 120],
    ] as const) {
      expect(offsetMinutes(zone, at("2026-03-29T00:59:59Z"))).toBe(winter);
      expect(offsetMinutes(zone, at("2026-03-29T01:00:00Z"))).toBe(winter + 60);
      expect(offsetMinutes(zone, at("2026-10-25T00:59:59Z"))).toBe(winter + 60);
      expect(offsetMinutes(zone, at("2026-10-25T01:00:00Z"))).toBe(winter);
    }
  });

  it("takes epoch milliseconds and ignores sub-second parts", () => {
    const ms = Date.parse("2026-11-01T08:59:59.999Z");
    expect(offsetMinutes("America/Los_Angeles", ms)).toBe(-420);
    expect(offsetMinutes("America/Los_Angeles", -1)).toBe(-480);
  });

  it("works for early years and before year 1", () => {
    expect(offsetMinutes("UTC", Date.UTC(-50, 0, 1))).toBe(0);
    const early = new Date(0);
    early.setUTCFullYear(50, 5, 1);
    expect(offsetMinutes("Asia/Tokyo", early)).not.toBeNaN();
  });

  it("defaults to now", () => {
    expect(offsetMinutes("UTC")).toBe(0);
    expect(zoneOffset("UTC")).toBe("UTC");
  });

  it("throws on bad zones and instants", () => {
    expect(() => offsetMinutes("Nope/Zone", 0)).toThrow(TimeError);
    expect(() => offsetMinutes("UTC", new Date(Number.NaN))).toThrow(/instant/);
    expect(() => offsetMinutes("UTC", Number.POSITIVE_INFINITY)).toThrow(TimeError);
  });
});

describe("formatOffset", () => {
  it.each([
    [540, "UTC+9", "+09:00"],
    [-420, "UTC-7", "-07:00"],
    [330, "UTC+5:30", "+05:30"],
    [345, "UTC+5:45", "+05:45"],
    [-210, "UTC-3:30", "-03:30"],
    [840, "UTC+14", "+14:00"],
    [0, "UTC", "+00:00"],
    [-0, "UTC", "+00:00"],
    [329.6, "UTC+5:30", "+05:30"],
  ])("%d", (minutes, utc, iso) => {
    expect(formatOffset(minutes)).toBe(utc);
    expect(formatOffset(minutes, "iso")).toBe(iso);
  });

  it.each([Number.NaN, 1440, -1440, Number.POSITIVE_INFINITY])("throws on %d", (m) => {
    expect(() => formatOffset(m)).toThrow(TimeError);
  });

  it("zoneOffset formats a zone at an instant", () => {
    expect(zoneOffset("America/Los_Angeles", at("2026-07-01T00:00:00Z"))).toBe("UTC-7");
    expect(zoneOffset("America/Los_Angeles", at("2026-12-01T00:00:00Z"), "iso")).toBe("-08:00");
    expect(zoneOffset("Asia/Kolkata", 0, "utc")).toBe("UTC+5:30");
  });
});

describe("parseOffset", () => {
  it.each([
    ["+09:00", 540],
    ["-07:00", -420],
    ["-0730", -450],
    ["+5", 300],
    ["UTC+9", 540],
    ["utc-7", -420],
    ["GMT-7", -420],
    ["UTC-3:30", -210],
    ["UTC +5:45", 345],
    ["−07:00", -420],
    ["Z", 0],
    ["UTC", 0],
    ["gmt", 0],
    [" +00:00 ", 0],
    ["-00:00", 0],
  ])("%j", (text, minutes) => {
    expect(parseOffset(text)).toBe(minutes);
  });

  it.each(["", "9", "+24:00", "+09:60", "UTC+", "Asia/Tokyo", "+9:0", "++09"])(
    "null for %j",
    (t) => {
      expect(parseOffset(t)).toBeNull();
    },
  );

  it("null for non-strings", () => {
    expect(parseOffset(undefined as unknown as string)).toBeNull();
  });

  it("round trips with formatOffset", () => {
    for (let m = -720; m <= 840; m += 15) {
      expect(parseOffset(formatOffset(m))).toBe(m);
      expect(parseOffset(formatOffset(m, "iso"))).toBe(m);
    }
  });
});

describe("offsetZone", () => {
  it.each([
    [-420, "Etc/GMT+7"],
    [540, "Etc/GMT-9"],
    [0, "UTC"],
    [840, "Etc/GMT-14"],
    [-720, "Etc/GMT+12"],
  ])("%d is %s, with that offset", (minutes, zone) => {
    expect(offsetZone(minutes)).toBe(zone);
    expect(offsetMinutes(zone as string, 0)).toBe(minutes);
  });

  it.each([330, 900, -780, 1.5, Number.NaN])("null for %d", (m) => {
    expect(offsetZone(m)).toBeNull();
  });
});
