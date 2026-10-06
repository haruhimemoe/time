/**
 * @file src/region/index.ts
 * @desc @haruhimemoe/time/region: the region shape, continents, country lookups and the region
 *       lock check for osu! country codes.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { TimeError } from "../errors.js";
import { isTimeZone } from "../zone/offset.js";
import {
  CONTINENT_NAMES,
  COUNTRIES_BY_CONTINENT,
  type ContinentCode,
  ZONES_BY_CONTINENT,
} from "./data.js";

export type { ContinentCode } from "./data.js";

/** A region: countries by ISO 3166-1 alpha-2 code (upper case) and the zones it uses. */
export interface Region {
  id: string;
  name: string;
  countries: string[];
  timeZones: string[];
}

/** A region as stored: non-empty id and name, upper-case country codes, valid IANA zones. */
export const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/, "an upper-case ISO 3166-1 alpha-2 code")),
  timeZones: z.array(z.string().refine(isTimeZone, "not an IANA time zone")),
});

/**
 * @function defineRegions
 * @param list {readonly Region[]} an app's regions
 * @returns {readonly Region[]} the same regions, checked and frozen
 * @throws {TimeError} invalid-region for a region the schema refuses or a repeated id
 */
export const defineRegions = (list: readonly Region[]): readonly Region[] => {
  const ids = new Set<string>();
  const out = list.map((region) => {
    const parsed = regionSchema.safeParse(region);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new TimeError(
        "invalid-region",
        `region ${JSON.stringify(region?.id)}: ${issue?.path.join(".")} ${issue?.message}`,
      );
    }
    if (ids.has(parsed.data.id)) {
      throw new TimeError("invalid-region", `region id ${parsed.data.id} is used twice`);
    }
    ids.add(parsed.data.id);
    const { id, name } = parsed.data;
    const countries = Object.freeze([...parsed.data.countries]) as string[];
    const timeZones = Object.freeze([...parsed.data.timeZones]) as string[];
    return Object.freeze({ id, name, countries, timeZones });
  });
  return Object.freeze(out);
};

/** The seven continents as regions, ids AF, AN, AS, EU, NA, OC, SA. */
export const CONTINENTS: readonly Region[] = defineRegions(
  (Object.keys(CONTINENT_NAMES) as ContinentCode[]).map((id) => ({
    id,
    name: CONTINENT_NAMES[id],
    countries: COUNTRIES_BY_CONTINENT[id].split(" "),
    timeZones: ZONES_BY_CONTINENT[id].split(" "),
  })),
);

/** Country code to continent code. */
export const CONTINENT_OF_COUNTRY: Readonly<Record<string, ContinentCode>> = Object.freeze(
  Object.fromEntries(
    CONTINENTS.flatMap((c) => c.countries.map((code) => [code, c.id as ContinentCode])),
  ),
);

const normalize = (country: string | null | undefined): string | null => {
  if (typeof country !== "string") return null;
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
};

/**
 * @function regionOfCountry
 * @param country {string | null | undefined} a country code, any case (osu!'s country_code)
 * @param regions {readonly Region[]} the regions to search (default CONTINENTS)
 * @returns {Region | undefined} the first region listing that country
 */
export const regionOfCountry = (
  country: string | null | undefined,
  regions: readonly Region[] = CONTINENTS,
): Region | undefined => {
  const code = normalize(country);
  return code ? regions.find((r) => r.countries.includes(code)) : undefined;
};

/**
 * @function checkRegionLock
 * @param country {string | null | undefined} the player's country code (osu!'s country_code)
 * @param allowed {readonly Region[]} the regions a tournament accepts
 * @returns {{ allowed: boolean; region: Region | undefined }} allowed when one of the regions
 *          lists the country. Missing, malformed and unlisted codes (osu!'s "XX") are not allowed.
 */
export const checkRegionLock = (
  country: string | null | undefined,
  allowed: readonly Region[],
): { allowed: boolean; region: Region | undefined } => {
  const region = regionOfCountry(country, allowed);
  return { allowed: region !== undefined, region };
};
