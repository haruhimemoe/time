/**
 * @file tests/api.test.ts
 * @desc The public surface per subpath (an added or removed export is a visible semver
 *       question), the exports map, and that src/ stays browser-safe, dependency-free and small.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as availability from "../src/availability/index.js";
import * as ics from "../src/ics/index.js";
import * as root from "../src/index.js";
import * as region from "../src/region/index.js";
import * as slots from "../src/slots/index.js";
import * as zone from "../src/zone/index.js";

const ZONE = [
  "WEEKDAYS",
  "assertTimeZone",
  "formatOffset",
  "fromWallTime",
  "isTimeZone",
  "listTimeZones",
  "offsetMinutes",
  "offsetZone",
  "parseOffset",
  "toWallTime",
  "weeklyWindow",
  "zoneOffset",
];
const AVAILABILITY = [
  "availabilitySchema",
  "countAvailability",
  "createAvailability",
  "fromZone",
  "intersectAvailability",
  "isFreeAt",
  "isFreeDuring",
  "localSlot",
  "resampleAvailability",
  "slotsPerWeek",
  "toZone",
  "unionAvailability",
  "weekSlotOf",
];
const SLOTS = ["MAX_STARTS", "compareSlots", "findSlots"];
const REGION = [
  "CONTINENTS",
  "CONTINENT_OF_COUNTRY",
  "checkRegionLock",
  "defineRegions",
  "regionOfCountry",
  "regionSchema",
];
const ICS = ["buildCalendar", "escapeText", "foldLine"];

describe("exports", () => {
  it.each([
    [".", root, [...ZONE, ...AVAILABILITY, ...SLOTS, ...REGION, ...ICS, "TimeError"]],
    ["./zone", zone, ZONE],
    ["./availability", availability, AVAILABILITY],
    ["./slots", slots, SLOTS],
    ["./region", region, REGION],
    ["./ics", ics, ICS],
  ])("%s exports exactly its API", (_path, mod, names) => {
    expect(Object.keys(mod).sort()).toEqual([...names].sort());
  });

  it("maps every subpath in package.json and has no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(pkg.exports)).toEqual([
      ".",
      "./zone",
      "./availability",
      "./slots",
      "./region",
      "./ics",
      "./package.json",
    ]);
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies)).toEqual(["zod"]);
  });

  it("freezes the weekday list, Monday first", () => {
    expect(zone.WEEKDAYS).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(Object.isFrozen(zone.WEEKDAYS)).toBe(true);
  });

  it("names its errors", () => {
    const error = new root.TimeError("invalid-zone", "x");
    expect([error.name, error.code, error instanceof Error]).toEqual([
      "TimeError",
      "invalid-zone",
      true,
    ]);
  });
});

describe("src", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );

  it.each(files("src"))("%s is browser-safe, headed and under 250 lines", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from "node:|require\(|process\.|Buffer\b/);
    expect(source.startsWith(`/**\n * @file ${file}\n`)).toBe(true);
    expect(source).not.toMatch(/\\n \*/);
    expect(source.split("\n").length).toBeLessThan(250);
  });

  it.each(files("src"))("%s imports only zod and its own files", (file) => {
    const imports = [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) expect(spec === "zod" || spec?.startsWith(".")).toBe(true);
  });

  it("loads zod only in ./availability and ./region", () => {
    const users = files("src").filter((f) => readFileSync(f, "utf8").includes('from "zod"'));
    expect(users.sort()).toEqual(["src/availability/schema.ts", "src/region/index.ts"]);
  });
});
