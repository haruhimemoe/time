/**
 * @file tests/region.test.ts
 * @desc Regions: the continent data is complete and valid, lookups and the region lock with
 *       osu! country codes, and defineRegions for app regions.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import type { TimeError } from "../src/errors.js";
import {
  CONTINENT_OF_COUNTRY,
  CONTINENTS,
  checkRegionLock,
  defineRegions,
  type Region,
  regionOfCountry,
  regionSchema,
} from "../src/region/index.js";
import { isTimeZone } from "../src/zone/index.js";

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as TimeError).code;
  }
  return "none";
};

describe("continent data", () => {
  it("lists every country once, each a real code", () => {
    const all = CONTINENTS.flatMap((c) => c.countries);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(250); // 249 ISO 3166-1 codes plus XK
    const names = new Intl.DisplayNames("en", { type: "region" });
    for (const country of all) expect(names.of(country)).not.toBe(country);
    expect(Object.keys(CONTINENT_OF_COUNTRY)).toHaveLength(250);
  });

  it("lists only valid zones", () => {
    for (const continent of CONTINENTS) {
      expect(continent.timeZones.length).toBeGreaterThan(0);
      expect(continent.timeZones.every(isTimeZone)).toBe(true);
    }
  });

  it.each([
    ["US", "NA"],
    ["JP", "AS"],
    ["RU", "EU"],
    ["TR", "AS"],
    ["EG", "AF"],
    ["AU", "OC"],
    ["BR", "SA"],
    ["AQ", "AN"],
    ["XK", "EU"],
  ])("puts %s in %s", (country, continent) => {
    expect(CONTINENT_OF_COUNTRY[country]).toBe(continent);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(CONTINENTS)).toBe(true);
    expect(Object.isFrozen(CONTINENTS[0])).toBe(true);
    expect(Object.isFrozen(CONTINENTS[0]?.countries)).toBe(true);
    expect(Object.isFrozen(CONTINENT_OF_COUNTRY)).toBe(true);
  });
});

describe("regionOfCountry and checkRegionLock", () => {
  const oceania = CONTINENTS.filter((c) => c.id === "OC");

  it("finds a country's region in any case", () => {
    expect(regionOfCountry("jp")?.id).toBe("AS");
    expect(regionOfCountry(" nz ", oceania)?.id).toBe("OC");
    expect(regionOfCountry("US", oceania)).toBeUndefined();
  });

  it.each([
    ["AU", true],
    ["nz", true],
    ["US", false],
    ["XX", false],
    ["", false],
    ["AUS", false],
    [null, false],
    [undefined, false],
  ])("locks %j: %s", (country, allowed) => {
    const result = checkRegionLock(country, oceania);
    expect(result.allowed).toBe(allowed);
    expect(result.region?.id).toBe(allowed ? "OC" : undefined);
  });
});

describe("defineRegions", () => {
  const pnw: Region[] = [
    { id: "WA", name: "Washington", countries: [], timeZones: ["America/Los_Angeles"] },
    { id: "BC", name: "British Columbia", countries: [], timeZones: ["America/Vancouver"] },
  ];

  it("accepts app regions, sub-national ones included", () => {
    const regions = defineRegions(pnw);
    expect(regions.map((r) => r.id)).toEqual(["WA", "BC"]);
    expect(Object.isFrozen(regions[0])).toBe(true);
    expect(checkRegionLock("US", regions).allowed).toBe(false);
  });

  it("does not freeze the caller's arrays", () => {
    const input: Region = { id: "x", name: "X", countries: ["JP"], timeZones: [] };
    defineRegions([input]);
    expect(Object.isFrozen(input.countries)).toBe(false);
  });

  it.each([
    [{ id: "", name: "x", countries: [], timeZones: [] }],
    [{ id: "x", name: "x", countries: ["jp"], timeZones: [] }],
    [{ id: "x", name: "x", countries: [], timeZones: ["Mars/Base"] }],
    [null as unknown as Region],
  ])("rejects %j", (region) => {
    expect(code(() => defineRegions([region]))).toBe("invalid-region");
  });

  it("rejects a repeated id", () => {
    expect(code(() => defineRegions([...pnw, ...pnw]))).toBe("invalid-region");
  });

  it("exposes the schema", () => {
    expect(regionSchema.safeParse(pnw[0]).success).toBe(true);
  });
});
