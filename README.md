# @haruhimemoe/time

Timezones, weekly availability, match slot finding, regions and `.ics` files for tournament and event tools. DST-aware IANA zones through `Intl`, availability grids stored in UTC, ranked match times with who is free, region locks from osu! country codes. No runtime dependencies; zod 4 is a peer. ESM for Node 22.12+, Bun, Deno, browsers and bundlers.

## Install

```sh
bun add @haruhimemoe/time zod
npm install @haruhimemoe/time zod
deno add npm:@haruhimemoe/time npm:zod
```

zod 4.0.16 or later. Only `/availability` (its schema) and `/region` load it; `/zone`, `/slots` and `/ics` don't.

## Quick start

Two players pick their free hours in their own zones. Find a 90-minute match on the coming Pacific weekend and put it in a calendar file.

```ts
import { fromZone, localSlot } from "@haruhimemoe/time/availability";
import { buildCalendar } from "@haruhimemoe/time/ics";
import { findSlots } from "@haruhimemoe/time/slots";
import { weeklyWindow } from "@haruhimemoe/time/zone";

// Saturday 18:00 to 21:00 in Los Angeles, and Sunday 10:00 to 13:00 in Tokyo.
const alice = fromZone([18, 19, 20].map((h) => localSlot("sat", h * 60)), "America/Los_Angeles");
const kenta = fromZone([10, 11, 12].map((h) => localSlot("sun", h * 60)), "Asia/Tokyo");

const [best] = findSlots({
  sides: [
    { id: "alice", members: [{ id: "alice", availability: alice }] },
    { id: "kenta", members: [{ id: "kenta", availability: kenta }] },
  ],
  window: weeklyWindow(new Date(), "America/Los_Angeles", { day: "fri", days: 3 }),
  lengthMinutes: 90,
});

if (best) {
  const ics = buildCalendar([
    { uid: "r1-m1@example.org", start: best.start, end: best.end, title: "Round 1: alice vs kenta" },
  ]);
}
```

In October, Saturday 18:00 in Los Angeles is Sunday 10:00 in Tokyo (01:00 UTC). Both are free for three hours, so a 90-minute match can start at 01:00 or 02:00 UTC: `best.start` is 01:00 UTC and `best.runMinutes` is 150.

## Concepts

**Instants and zones.** Every instant you pass can be a `Date` or epoch milliseconds; every instant returned is a `Date`. Zones are IANA ids (`"Asia/Tokyo"`), never fixed offsets, because an offset goes stale when DST changes. Offsets come from the runtime's `Intl` data.

**Weeks start Monday.** Day codes are strings, `"mon"` to `"sun"` (`WEEKDAYS`), so they can't be mixed up with `Date#getDay()`, which starts on Sunday at 0.

**Grids.** An `Availability` is a weekly pattern of UTC slots: `{ slotMinutes, slots }`, where slot 0 starts Monday 00:00 UTC and each slot lasts `slotMinutes` (a whole divisor of 1440, at least 5). Storing UTC means grids from different zones compare directly.

A player's 18:00 isn't the same UTC hour all year. `fromZone` converts the local week that contains `at` (default now) slot by slot, and records `zone` and `week` (that local Monday) on the grid. `isFreeAt`, `isFreeDuring`, `toZone` and `findSlots` use those two fields to move the grid with the owner's clock: a Saturday 18:00 entered in October still means Saturday 18:00 after the clocks change in November. A grid without them is a fixed UTC pattern.

Inside one week, a local slot a spring-forward gap skips is dropped, and one that happens twice at fall back marks both UTC slots. A dropped slot can't come back when the grid is moved to other weeks, so ask for availability in a week without a DST switch (the default, now, is fine on all but two weekends a year). A local slot that doesn't line up with UTC slots (Kolkata, UTC+5:30, at 60 minutes) is floored to the UTC slot containing its start, which can show someone free up to half an hour early. Use `slotMinutes: 30` for half-hour zones and `15` for Nepal (UTC+5:45) and Chatham (UTC+12:45) to avoid that. Either way, `toZone(fromZone(x, zone), zone)` gives `x` back, so loading and saving a grid never shifts it.

Treat grids as immutable: to change one, build a new `slots` array. The functions cache per `slots` array.

## API

### `@haruhimemoe/time/zone`

| Export | Does |
| --- | --- |
| `isTimeZone(zone)` | Whether the runtime knows the zone. Offset strings like `"+09:00"` are not zones. |
| `assertTimeZone(zone)` | The zone as `Intl` names it (`"asia/tokyo"` gives `"Asia/Tokyo"`), or throws `invalid-zone`. Old aliases can resolve differently between runtimes. |
| `listTimeZones()` | Every zone the runtime supports, for pickers. `[]` where `Intl.supportedValuesOf` is missing. |
| `offsetMinutes(zone, at?)` | Minutes east of UTC at an instant, DST included: `-420` for Los Angeles in July, `330` for Kolkata. |
| `formatOffset(minutes, style?)` | `"utc"` (default): `"UTC+9"`, `"UTC-7"`, `"UTC+5:30"`, `"UTC"` at zero. `"iso"`: `"+09:00"`, `"-07:00"`, `"+00:00"`. Throws `invalid-offset` for a day or more. |
| `parseOffset(text)` | Minutes from `"+09:00"`, `"-0730"`, `"+5"`, `"UTC+9"`, `"GMT-7"`, `"UTC-3:30"`, `"Z"`, `"UTC"`; `null` otherwise. |
| `zoneOffset(zone, at?, style?)` | `formatOffset(offsetMinutes(zone, at), style)`. |
| `offsetZone(minutes)` | The fixed-offset IANA zone for a whole-hour offset: `-420` gives `"Etc/GMT+7"` (IANA inverts the sign), `0` gives `"UTC"`. `null` for anything else. For migrating stored offsets. |
| `toWallTime(at, zone)` | What a clock in the zone shows: `{ year, month, day, hour, minute, second, weekday }`, month 1 to 12. |
| `fromWallTime(wall, zone, disambiguation?)` | The instant a clock in the zone shows `wall`. See below. Throws `invalid-wall-time` for impossible fields (Feb 30, hour 24). |
| `weeklyWindow(at, zone, { day, minute?, days })` | `{ start, end }` of the weekly window that contains `at`, or else the next one. A Friday to Sunday weekend is `{ day: "fri", days: 3 }`. Edges are wall times, so a window over a DST switch is an hour shorter or longer. |
| `WEEKDAYS` | `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`, frozen. |

`disambiguation` decides what happens to a wall time a DST switch skips (a gap) or repeats (an overlap), with Temporal's names:

| `disambiguation` | Gap (02:30 on 2026-03-08 in Los Angeles) | Overlap (01:30 on 2026-11-01 in Los Angeles) |
| --- | --- | --- |
| `"compatible"` (default) | moves forward: 03:30 PDT | the first: 01:30 PDT |
| `"earlier"` | 01:30 PST | 01:30 PDT |
| `"later"` | 03:30 PDT | 01:30 PST |
| `"reject"` | throws `nonexistent-time` | throws `ambiguous-time` |

Types: `Instant`, `Weekday`, `WallTime`, `ZonedWallTime`, `Disambiguation`, `WeeklyWindowOptions`.

### `@haruhimemoe/time/availability`

| Export | Does |
| --- | --- |
| `localSlot(day, minute, slotMinutes?)` | A local week slot: `localSlot("sat", 14 * 60)` is `134` at 60 minutes. For building the slot list a grid UI hands to `fromZone`. |
| `fromZone(local, zone, { slotMinutes?, at? })` | Local week slots to a UTC grid, with `zone` and `week` set. Defaults: 60 minutes, this week. |
| `toZone(grid, zone, { at? })` | A grid as local week slots in any zone, for showing it. Defaults to the grid's own week when `zone` is the grid's zone, else this week. |
| `createAvailability(slots, slotMinutes?)` | A plain UTC grid from slot numbers: sorted, deduplicated, checked. |
| `unionAvailability(grids)` | Free where anyone is. |
| `intersectAvailability(grids)` | Free where everyone is. |
| `countAvailability(grids)` | `Map` of slot to how many grids are free there. |
| `resampleAvailability(grid, slotMinutes)` | The same pattern in other slots. A new slot is free only when every old slot it overlaps is free. |
| `isFreeAt(grid, at)` | Whether the slot containing `at` is free. |
| `isFreeDuring(grid, start, end)` | Whether every slot touching `[start, end)` is free. |
| `slotsPerWeek(slotMinutes)`, `weekSlotOf(at, slotMinutes?)` | Slot math: `168` at 60 minutes; the UTC week slot containing an instant. |
| `availabilitySchema` | zod schema for a stored grid. Slots must be strictly increasing; `zone` and `week` come together, and `week` must be a Monday. The parsed `zone` is the name `Intl` gives it. |

Union, intersect and count need one slot size (else `mismatched-slot-minutes`); they keep `zone` and `week` only when every grid shares them. An empty list gives an empty 60-minute grid.

### `@haruhimemoe/time/slots`

`findSlots(query)` walks a window in steps and returns the best match starts, best first.

| Query field | Meaning |
| --- | --- |
| `sides` | At least one `{ id, members, need? }`. A member is `{ id, availability }`; `null` or an empty grid means no data, and that member is skipped. `need` is how many members with data must be free (default: all of them); a need above that count leaves the side never ready. |
| `staff`, `staffNeed` | Referees, streamers, commentators. Free staff are listed on every candidate; `staffNeed` (default 0) makes some required. |
| `window` | `{ start, end }`. Every match starts and ends inside it. |
| `lengthMinutes` | Match length. The whole span must be free. |
| `stepMinutes` | Minutes between starts, counted from Monday 00:00 UTC. Default: the grids' slot size. |
| `minReadySides` | Sides that must be ready. Default: all. |
| `collapse` | Default `true`: back-to-back starts with the same free players and staff become one candidate with a longer `runMinutes`. Only when `stepMinutes` is at most `lengthMinutes`. |
| `filter(candidate)` | Drop candidates. |
| `tiebreak(a, b)` | Orders candidates with the same number of ready sides, before the default order. |
| `limit` | Default 10. |

Each candidate is `{ start, end, runMinutes, readySides, sides, staff }`, where `sides` lists `{ id, free, total, need, ready }` and `staff` lists free staff ids. A side is ready when at least `need` of its members with data are free, and it has at least one. The default order (`compareSlots`) is more ready sides, then more free players, more free staff, a longer run, and the earlier start.

A higher seed's fallback (accept slots where only the better seed is fully free) is `minReadySides: 1` with `filter: (c) => c.sides[0].ready`. Preferences such as "Saturday before Sunday" or "not before 10:00 local" go in `tiebreak`, using `toWallTime(c.start, zone)`.

`findSlots` throws `invalid-window` for an empty window or more than `MAX_STARTS` (20,000) starts, `invalid-query` for bad counts or lengths, and `mismatched-slot-minutes` for grids of different sizes.

### `@haruhimemoe/time/region`

| Export | Does |
| --- | --- |
| `Region` | `{ id, name, countries, timeZones }`. Countries are upper-case ISO 3166-1 alpha-2 codes, as osu! uses. |
| `regionSchema` | zod schema for a region. |
| `defineRegions(list)` | Checks and freezes your regions; throws `invalid-region` for a bad region or a repeated id. Sub-national regions (a state) can have no countries and just zones. |
| `CONTINENTS` | The seven continents (`AF`, `AN`, `AS`, `EU`, `NA`, `OC`, `SA`) with every country and a few common zones each. Countries on two continents follow the UN's grouping: Russia is in Europe; Turkey, Cyprus, Georgia, Armenia, Azerbaijan and Kazakhstan in Asia; Egypt in Africa. `XK` (Kosovo) is included. |
| `CONTINENT_OF_COUNTRY` | Country code to continent code. |
| `regionOfCountry(country, regions?)` | The first region listing a country, any case. Default regions: `CONTINENTS`. |
| `checkRegionLock(country, allowed)` | `{ allowed, region }`. Missing, malformed and unlisted codes (osu!'s `"XX"`) are not allowed. |

### `@haruhimemoe/time/ics`

| Export | Does |
| --- | --- |
| `buildCalendar(events, { prodId?, name?, stamp? })` | A complete iCalendar file: CRLF line endings, lines folded at 75 octets, UTC times. Each event is `{ uid, start, end, title, url?, description?, location? }`. `stamp` is every event's `DTSTAMP` (default now). Times are whole seconds. No events gives an empty calendar, which calendar apps accept for subscription feeds. Throws `invalid-event` for an empty or repeated uid, a bad instant, an end not after its start, or a url with spaces or control characters. |
| `escapeText(text)` | iCalendar text escaping: `\`, `;` and `,` escaped, line breaks as `\n`, other control characters except tab removed. |
| `foldLine(line)` | Folds one line so each physical line is at most 75 UTF-8 octets; never splits a character. |

Serve the file as `text/calendar; charset=utf-8`.

### `@haruhimemoe/time`

Everything above, plus `TimeError` with `code`: `"invalid-zone" | "invalid-wall-time" | "nonexistent-time" | "ambiguous-time" | "invalid-instant" | "invalid-offset" | "invalid-slot-minutes" | "mismatched-slot-minutes" | "invalid-slot" | "invalid-window" | "invalid-query" | "invalid-region" | "invalid-event"`.

## License

MIT
