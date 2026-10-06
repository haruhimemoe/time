/**
 * @file src/zone/offset.ts
 * @desc IANA zone checks and UTC offsets at an instant, read from Intl.DateTimeFormat so DST
 *       follows the runtime's tz data. Offset text in both styles: "UTC+9" and "+09:00".
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { TimeError } from "../errors.js";
import { type Instant, MINUTE_MS, toMs } from "../shared.js";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Rejects offset-style ids ("+09:00"), which newer Intl versions accept as zones. */
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

const formatterFor = (zone: string): Intl.DateTimeFormat | null => {
  const cached = formatters.get(zone);
  if (cached) return cached;
  if (typeof zone !== "string" || !ZONE_SHAPE.test(zone)) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, formatter);
    return formatter;
  } catch {
    return null;
  }
};

/** The formatter for a zone, or a TimeError. */
export const zoneFormatter = (zone: string): Intl.DateTimeFormat => {
  const formatter = formatterFor(zone);
  if (!formatter) throw new TimeError("invalid-zone", `not an IANA time zone: ${String(zone)}`);
  return formatter;
};

/** Epoch milliseconds of a wall clock reading taken as if it were UTC. Handles years 0 to 99. */
export const wallToUtcMs = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number => {
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
};

/** The wall clock fields a zone shows at an instant (era-aware, so year 0 and earlier work). */
export const wallFields = (
  zone: string,
  ms: number,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } => {
  const fields: Record<string, number> = {};
  let bc = false;
  for (const part of zoneFormatter(zone).formatToParts(ms)) {
    if (part.type === "era") bc = /^B/i.test(part.value);
    else if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  const year = fields.year ?? 0;
  return {
    year: bc ? 1 - year : year,
    month: fields.month ?? 1,
    day: fields.day ?? 1,
    hour: (fields.hour ?? 0) % 24,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
  };
};

/** Offset in milliseconds (whole seconds) east of UTC at an instant. */
export const offsetMs = (zone: string, ms: number): number => {
  const second = ms - (((ms % 1000) + 1000) % 1000);
  const w = wallFields(zone, second);
  return wallToUtcMs(w.year, w.month, w.day, w.hour, w.minute, w.second) - second;
};

/**
 * @function isTimeZone
 * @param zone {string} candidate IANA zone id, like "Asia/Tokyo" or "UTC"
 * @returns {boolean} true when the runtime knows the zone. Offset strings ("+09:00") are not zones.
 */
export const isTimeZone = (zone: string): boolean => formatterFor(zone) !== null;

/**
 * @function assertTimeZone
 * @param zone {string} candidate IANA zone id
 * @returns {string} the zone id as Intl names it (fixes case: "asia/tokyo" gives "Asia/Tokyo")
 * @throws {TimeError} invalid-zone
 */
export const assertTimeZone = (zone: string): string =>
  zoneFormatter(zone).resolvedOptions().timeZone;

/**
 * @function listTimeZones
 * @returns {string[]} every zone id the runtime supports, or [] where Intl can't list them
 */
export const listTimeZones = (): string[] =>
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

/**
 * @function offsetMinutes
 * @param zone {string} IANA zone id
 * @param at {Instant} the instant (default now)
 * @returns {number} minutes east of UTC at that instant, DST included: -420 for Los Angeles in
 *          July, 330 for Kolkata. Local mean time before about 1900 can give a fraction.
 * @throws {TimeError} invalid-zone, invalid-instant
 */
export const offsetMinutes = (zone: string, at: Instant = Date.now()): number =>
  offsetMs(zone, toMs(at)) / MINUTE_MS;

/**
 * @function formatOffset
 * @param minutes {number} minutes east of UTC (rounded to a whole minute)
 * @param style {"utc" | "iso"} "utc" gives "UTC+9", "UTC-7", "UTC+5:30" and "UTC" for zero;
 *        "iso" gives "+09:00", "-07:00", "+00:00"
 * @returns {string} the offset as text
 * @throws {TimeError} invalid-offset when not finite or a day or more
 */
export const formatOffset = (minutes: number, style: "utc" | "iso" = "utc"): string => {
  const total = Math.round(minutes);
  if (!Number.isFinite(total) || Math.abs(total) >= 1440) {
    throw new TimeError("invalid-offset", `offset out of range: ${minutes}`);
  }
  const sign = total < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(total) / 60);
  const rest = Math.abs(total) % 60;
  const mm = rest.toString().padStart(2, "0");
  if (style === "iso") return `${sign}${hours.toString().padStart(2, "0")}:${mm}`;
  if (total === 0) return "UTC";
  return rest === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${mm}`;
};

const OFFSET_TEXT = /^(?:UTC|GMT)?\s*([+\-−])(\d{1,2})(?::?(\d{2}))?$/i;

/**
 * @function parseOffset
 * @param text {string} "+09:00", "-0730", "+5", "UTC+9", "GMT-7", "UTC-3:30", "Z", "UTC" or "GMT"
 * @returns {number | null} minutes east of UTC, or null when the text isn't an offset (hours over
 *          23 or minutes over 59 included)
 */
export const parseOffset = (text: string): number | null => {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (/^(?:Z|UTC|GMT)$/i.test(trimmed)) return 0;
  const match = OFFSET_TEXT.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  if (hours > 23 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return match[1] === "+" || total === 0 ? total : -total;
};

/**
 * @function zoneOffset
 * @param zone {string} IANA zone id
 * @param at {Instant} the instant (default now)
 * @param style {"utc" | "iso"} see formatOffset
 * @returns {string} the zone's offset at that instant as text, like "UTC-7" or "-07:00"
 * @throws {TimeError} invalid-zone, invalid-instant
 */
export const zoneOffset = (
  zone: string,
  at: Instant = Date.now(),
  style: "utc" | "iso" = "utc",
): string => formatOffset(offsetMinutes(zone, at), style);

/**
 * @function offsetZone
 * @param minutes {number} a fixed offset east of UTC, like -420 for a stored "-07:00"
 * @returns {string | null} the IANA fixed-offset zone ("Etc/GMT+7": the sign is inverted by
 *          IANA's convention), "UTC" for zero, or null when no such zone exists (not a whole hour,
 *          or outside -12 to +14 hours)
 */
export const offsetZone = (minutes: number): string | null => {
  if (!Number.isInteger(minutes) || minutes % 60 !== 0) return null;
  const hours = minutes / 60;
  if (hours < -12 || hours > 14) return null;
  if (hours === 0) return "UTC";
  return hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${-hours}`;
};
