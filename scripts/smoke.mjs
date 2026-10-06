/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package through its own exports map, the way Node consumers will
 *       (every subpath), and checks one result per subpath. Run by `bun run test:dist`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const { TimeError, findSlots: rootFind } = await import("@haruhimemoe/time");
const { offsetMinutes, fromWallTime, formatOffset } = await import("@haruhimemoe/time/zone");
const { fromZone, localSlot } = await import("@haruhimemoe/time/availability");
const { findSlots } = await import("@haruhimemoe/time/slots");
const { checkRegionLock, CONTINENTS } = await import("@haruhimemoe/time/region");
const { buildCalendar } = await import("@haruhimemoe/time/ics");

assert.equal(offsetMinutes("America/Los_Angeles", Date.parse("2026-07-01T00:00:00Z")), -420);
assert.equal(formatOffset(330), "UTC+5:30");
const wall = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };
assert.equal(fromWallTime(wall, "America/Los_Angeles").toISOString(), "2026-03-08T10:30:00.000Z");
const at = Date.parse("2026-10-07T12:00:00Z");
const grid = fromZone([localSlot("sat", 18 * 60)], "Asia/Tokyo", { at });
assert.deepEqual(grid.slots, [5 * 24 + 9]);
const start = Date.parse("2026-10-10T09:00:00Z");
const result = findSlots({
  sides: [{ id: "a", members: [{ id: "p", availability: grid }] }],
  window: { start, end: start + 3_600_000 },
  lengthMinutes: 60,
});
assert.equal(result.length, 1);
assert.equal(rootFind, findSlots);
assert.equal(checkRegionLock("jp", CONTINENTS).region.id, "AS");
assert.match(buildCalendar([], { stamp: 0 }), /^BEGIN:VCALENDAR\r\n/);
assert.throws(() => offsetMinutes("Nope/Zone"), TimeError);
for (const sub of [
  "index",
  "zone/index",
  "availability/index",
  "slots/index",
  "region/index",
  "ics/index",
]) {
  assert.ok(
    existsSync(new URL(`../dist/${sub}.d.ts`, import.meta.url)),
    `dist/${sub}.d.ts missing`,
  );
}
console.log("smoke: ok");
