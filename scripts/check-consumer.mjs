/**
 * @file scripts/check-consumer.mjs
 * @desc Installs the packed package with a given zod version into a throwaway project, then
 *       typechecks a consumer strictly (no skipLibCheck, so broken .d.ts can't hide as `any`) and
 *       runs it. Proves the zod peer range's floor. Usage: node scripts/check-consumer.mjs <zod
 *       version> (after `bun run build`). Needs the npm registry.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const zod = process.argv[2];
if (!zod) throw new Error("usage: node scripts/check-consumer.mjs <zod version>");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = mkdtempSync(path.join(tmpdir(), "time-consumer-"));
const run = (command, args, cwd = dir) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  const tarball = run("npm", ["pack", "--silent", "--pack-destination", dir], root).trim();
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module", private: true }));
  run("npm", [
    "install",
    "--silent",
    "--no-audit",
    "--no-fund",
    path.join(dir, tarball),
    `zod@${zod}`,
  ]);
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: false,
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "ES2023",
        lib: ["ES2023", "DOM"],
        types: [],
      },
      files: ["consumer.ts"],
    }),
  );
  writeFileSync(
    path.join(dir, "consumer.ts"),
    `import { type Availability, availabilitySchema, fromZone, localSlot } from "@haruhimemoe/time/availability";
import { findSlots, type SlotCandidate } from "@haruhimemoe/time/slots";
import { type Region, checkRegionLock, defineRegions } from "@haruhimemoe/time/region";
import { buildCalendar, type CalendarEvent } from "@haruhimemoe/time/ics";
import { fromWallTime, type WallTime, type Weekday, zoneOffset } from "@haruhimemoe/time/zone";
import { TimeError, type TimeErrorCode } from "@haruhimemoe/time";

const day: Weekday = "sat";
const grid: Availability = fromZone([localSlot(day, 18 * 60)], "America/Los_Angeles", { at: Date.parse("2026-10-07T12:00:00Z") });
const parsed: Availability = availabilitySchema.parse(grid) as Availability;
const start = Date.parse("2026-10-11T01:00:00Z");
const found: SlotCandidate[] = findSlots({
  sides: [{ id: "a", members: [{ id: "p", availability: parsed }] }],
  window: { start, end: start + 3_600_000 },
  lengthMinutes: 60,
});
if (found.length !== 1) throw new Error("slots");
const wall: WallTime = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
if (fromWallTime(wall, "America/Los_Angeles", "later").toISOString() !== "2026-11-01T09:30:00.000Z") throw new Error("wall");
if (zoneOffset("Asia/Kolkata", 0) !== "UTC+5:30") throw new Error("offset");
const regions: readonly Region[] = defineRegions([{ id: "jp", name: "Japan", countries: ["JP"], timeZones: ["Asia/Tokyo"] }]);
if (!checkRegionLock("JP", regions).allowed) throw new Error("region");
const event: CalendarEvent = { uid: "m1", start, end: start + 3_600_000, title: "Match" };
if (!buildCalendar([event]).includes("UID:m1")) throw new Error("ics");
// @ts-expect-error an unknown code must not typecheck (it would if types were any)
const bad: TimeErrorCode = "nonsense";
void [bad, TimeError];
console.log("consumer: ok");
`,
  );
  run(path.join(root, "node_modules", ".bin", "tsc"), ["-p", dir]);
  run(process.execPath, ["--experimental-strip-types", "--no-warnings", "consumer.ts"]);
  console.log(`zod ${zod}: ok`);
} catch (error) {
  console.error(`zod ${zod}: FAILED\n${error.stdout ?? ""}${error.stderr ?? error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
