/**
 * @file tests/ics.test.ts
 * @desc iCalendar output: escaping, control characters, folding by UTF-8 octets (ASCII,
 *       Japanese, emoji), CRLF, required properties and refused events.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import type { TimeError } from "../src/errors.js";
import { buildCalendar, escapeText, foldLine } from "../src/ics/index.js";

const bytes = (s: string): number => new TextEncoder().encode(s).length;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const unfold = (s: string): string => s.replace(/\r\n /g, "");
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as TimeError).code;
  }
  return "none";
};
const stamp = Date.parse("2026-10-06T00:00:00Z");
const match = {
  uid: "egc-r1-m4@evergreencup.org",
  start: new Date("2026-10-10T19:00:00Z"),
  end: Date.parse("2026-10-10T20:30:00Z"),
  title: "Round 1, match 4: Team A vs Team B",
};

describe("escapeText", () => {
  it.each([
    ["plain", "plain"],
    ["a,b;c\\d", "a\\,b\\;c\\\\d"],
    ["one\ntwo\r\nthree\rfour", "one\\ntwo\\nthree\\nfour"],
    ["tab\tkept", "tab\tkept"],
    ["bell\u0007gone\u007f\u0000", "bellgone"],
    ["\\n literal", "\\\\n literal"],
  ])("%j", (input, output) => {
    expect(escapeText(input)).toBe(output);
  });
});

describe("foldLine", () => {
  it("leaves 75 octets alone and folds the 76th", () => {
    expect(foldLine("a".repeat(75))).toBe("a".repeat(75));
    expect(foldLine("a".repeat(76))).toBe(`${"a".repeat(75)}\r\n a`);
    expect(foldLine("")).toBe("");
  });

  it.each([
    ["ascii", `SUMMARY:${"x".repeat(300)}`],
    ["japanese", `SUMMARY:${"日本語のタイトル".repeat(20)}`],
    ["emoji", `SUMMARY:${"🎵🥁".repeat(60)}`],
    ["mixed", `SUMMARY:${"a日🎵".repeat(50)}`],
  ])("keeps every %s line at 75 octets or less without splitting characters", (_name, line) => {
    const folded = foldLine(line);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const [i, part] of physical.entries()) {
      expect(bytes(part)).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(" ")).toBe(true);
      expect(part).not.toContain("�");
      expect(part).not.toMatch(LONE_SURROGATE);
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe("buildCalendar", () => {
  it("writes a complete calendar", () => {
    const ics = buildCalendar(
      [{ ...match, url: "https://evergreencup.org/matches/4", location: "osu!, #mp_1" }],
      { name: "EGC, Season 1", stamp },
    );
    expect(ics.split("\r\n")).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//haruhime//time//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "NAME:EGC\\, Season 1",
      "X-WR-CALNAME:EGC\\, Season 1",
      "BEGIN:VEVENT",
      "UID:egc-r1-m4@evergreencup.org",
      "DTSTAMP:20261006T000000Z",
      "DTSTART:20261010T190000Z",
      "DTEND:20261010T203000Z",
      "SUMMARY:Round 1\\, match 4: Team A vs Team B",
      "LOCATION:osu!\\, #mp_1",
      "URL:https://evergreencup.org/matches/4",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });

  it("uses CRLF only and folds long descriptions", () => {
    const ics = buildCalendar(
      [{ ...match, description: `Lobby rules:\n${"Be on time, ".repeat(20)}` }],
      { prodId: "-//Evergreen Cup//Schedule//EN", stamp },
    );
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(bytes(line)).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain("DESCRIPTION:Lobby rules:\\nBe on time\\, Be on time\\, ");
    expect(ics).toContain("PRODID:-//Evergreen Cup//Schedule//EN");
  });

  it("writes an empty calendar and defaults DTSTAMP to now", () => {
    expect(buildCalendar([])).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//haruhime//time//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n",
    );
    expect(buildCalendar([match])).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it.each([
    [{ uid: "" }],
    [{ uid: "  " }],
    [{ end: match.start }],
    [{ end: Date.parse("2026-10-10T18:00:00Z") }],
    [{ start: new Date(Number.NaN) }],
    [{ url: "https://x.org/a b" }],
    [{ url: "https://x.org/\r\nX-EVIL:1" }],
    [{ start: Date.UTC(10000, 0, 1), end: Date.UTC(10000, 0, 2) }],
  ])("refuses %j", (patch) => {
    expect(code(() => buildCalendar([{ ...match, ...patch }], { stamp }))).toBe("invalid-event");
  });

  it("refuses repeated uids and a bad stamp", () => {
    expect(code(() => buildCalendar([match, match], { stamp }))).toBe("invalid-event");
    expect(code(() => buildCalendar([match], { stamp: Number.NaN }))).toBe("invalid-event");
  });
});
