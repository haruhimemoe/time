/**
 * @file src/ics/index.ts
 * @desc @haruhimemoe/time/ics: an iCalendar (RFC 5545) file from events, with text escaping and
 *       75-octet line folding.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { TimeError } from "../errors.js";
import { type Instant, toMs } from "../shared.js";

/** One calendar event. Times are written in UTC. */
export interface CalendarEvent {
  /** Stable and unique: re-importing a file updates events with the same uid. */
  uid: string;
  start: Instant;
  end: Instant;
  title: string;
  url?: string;
  description?: string;
  location?: string;
}

export interface CalendarOptions {
  /** PRODID. Default "-//haruhime//time//EN". */
  prodId?: string;
  /** Calendar name (NAME and X-WR-CALNAME). */
  name?: string;
  /** DTSTAMP for every event. Default now. */
  stamp?: Instant;
}

// Control characters other than tab are not allowed in iCalendar text.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// biome-ignore lint/suspicious/noControlCharactersInRegex: a url may hold no space or control
const URL_BAD = /[\u0000-\u0020\u007f]/;

/**
 * @function escapeText
 * @param text {string} plain text
 * @returns {string} the text as an iCalendar TEXT value: backslash, semicolon and comma escaped,
 *          line breaks (CRLF, CR or LF) as \n, other control characters except tab removed
 */
export const escapeText = (text: string): string =>
  text
    .replace(/\r\n|\r|\n/g, "\n")
    .replace(CONTROL, "")
    .replace(/[\\;,\n]/g, (c) => (c === "\n" ? "\\n" : `\\${c}`));

const octets = (codePoint: number): number =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

/**
 * @function foldLine
 * @param line {string} one content line, already escaped
 * @returns {string} the line folded so each physical line is at most 75 UTF-8 octets before its
 *          CRLF; continuation lines start with a space. Characters are never split.
 */
export const foldLine = (line: string): string => {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const n = octets(char.codePointAt(0) ?? 0);
    if (size + n > 75) {
      out.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += n;
  }
  out.push(current);
  return out.join("\r\n");
};

const stampOf = (ms: number): string => {
  const iso = new Date(ms).toISOString();
  if (iso.length !== 24) throw new TimeError("invalid-event", `year out of range: ${iso}`);
  return `${iso.slice(0, 19).replace(/[-:]/g, "")}Z`;
};

const timeOf = (at: Instant, what: string): number => {
  try {
    return toMs(at);
  } catch {
    throw new TimeError("invalid-event", `${what} is not a valid instant`);
  }
};

/**
 * @function buildCalendar
 * @param events {readonly CalendarEvent[]} the events
 * @param opts {CalendarOptions} PRODID, calendar name and DTSTAMP
 * @returns {string} a complete VCALENDAR, CRLF line endings, folded, ending in CRLF
 * @throws {TimeError} invalid-event for an empty or repeated uid, a bad instant, an end not after
 *         its start, or a url with spaces or control characters
 */
export const buildCalendar = (
  events: readonly CalendarEvent[],
  opts: CalendarOptions = {},
): string => {
  const stamp = stampOf(timeOf(opts.stamp ?? Date.now(), "stamp"));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${escapeText(opts.prodId ?? "-//haruhime//time//EN")}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (opts.name !== undefined) {
    lines.push(`NAME:${escapeText(opts.name)}`, `X-WR-CALNAME:${escapeText(opts.name)}`);
  }
  const uids = new Set<string>();
  for (const event of events) {
    if (typeof event.uid !== "string" || event.uid.trim() === "" || uids.has(event.uid)) {
      throw new TimeError("invalid-event", `empty or repeated uid: ${JSON.stringify(event.uid)}`);
    }
    uids.add(event.uid);
    const start = timeOf(event.start, `start of ${event.uid}`);
    const end = timeOf(event.end, `end of ${event.uid}`);
    if (end <= start) throw new TimeError("invalid-event", `${event.uid} ends before it starts`);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${stampOf(start)}`,
      `DTEND:${stampOf(end)}`,
      `SUMMARY:${escapeText(event.title)}`,
    );
    if (event.description !== undefined) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location !== undefined) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url !== undefined) {
      if (URL_BAD.test(event.url)) {
        throw new TimeError("invalid-event", `${event.uid} has a url with spaces or controls`);
      }
      lines.push(`URL:${event.url}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};
