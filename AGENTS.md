# AGENTS.md

`@haruhimemoe/time`: one job. Time zones, weekly availability, match slot finding, regions and `.ics` output for the haruhime.moe tools and tournament sites. Tourney rules (rounds, reschedule limits), storage and UI live elsewhere. Keep it that way.

## Rules

- **No runtime dependencies.** zod 4 is the only peer, and only `src/availability/schema.ts` and `src/region/index.ts` import it. Time math uses `Intl` and `Date`, never a date library. No network, no DOM, no Node-only APIs in `src/`. `tests/api.test.ts` checks imports, `process` and `Buffer`.
- **Zones, not offsets.** Anything stored or passed around is an IANA zone id. Offsets are computed at an instant.
- **DST is tested, not assumed.** A change to `src/zone/` or `src/availability/convert.ts` needs cases on both sides of a US and an EU switch, a zone without DST, a half-hour zone and UTC+13/+14. The seeded round trip in `tests/wall.test.ts` must keep passing.
- **Stored shapes are stable.** Slot 0 is Monday 00:00 UTC. Changing slot numbering, `availabilitySchema`, `regionSchema` or the default order of `compareSlots` is a minor version on 0.x.
- **Bounded cost.** `findSlots` refuses more than `MAX_STARTS` starts. `tests/performance.test.ts` keeps a week of 5-minute steps fast.
- **Public API is pinned** by `tests/api.test.ts`, per subpath. Adding or removing an export is a semver decision: say so in `CHANGELOG.md`. Keep the README's API section in step with `src/`.
- **Test first.** A behavior change starts as a failing case in the matching test file.
- **Changelog.** A change users can see gets a line under `## [Unreleased]` in `CHANGELOG.md` ([Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)). Never rewrite a released entry.
- **Releases are cut by the maintainers.** Don't bump the version, tag, push or publish unless a maintainer asks.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Functions exported from a file in `src/` get a JSDoc block with `@function`, `@param` and `@returns` (and `@throws`). Keep files under 250 lines (`tests/api.test.ts` checks).
- Imports inside `src/` use `.js` extensions (Node ESM).
- Docs are for their readers: `README.md` for users, `CONTRIBUTING.md` for contributors, this file for agents. No maintainer notes in any of them.

## Layout

| Path | What's there |
| --- | --- |
| `src/index.ts` | The root: every subpath plus `TimeError`. |
| `src/errors.ts` | `TimeError` and its codes. |
| `src/shared.ts` | `Weekday`, `WEEKDAYS`, `Instant`, `toMs`, week constants (`MONDAY_EPOCH_MS`). |
| `src/zone/` | `./zone`: `offset.ts` (zone checks, offsets, offset text, the cached `Intl` formatters), `wall.ts` (`toWallTime`, `fromWallTime`, `weeklyWindow`). |
| `src/availability/` | `./availability`: `grid.ts` (slot math, set operations, resampling), `convert.ts` (`fromZone`, `toZone`, re-anchoring, free checks), `schema.ts`. |
| `src/slots/` | `./slots`: `types.ts` (query and candidate shapes, `compareSlots`), `find.ts` (`findSlots`). |
| `src/region/` | `./region`: `data.ts` (countries and zones by continent), `index.ts`. |
| `src/ics/` | `./ics`: `buildCalendar`, `escapeText`, `foldLine`. |
| `tests/` | Vitest: `offset`, `wall`, `availability`, `convert`, `slots`, `region`, `ics`, `api`, `performance`. |
| `scripts/smoke.mjs` | Imports the built package through its exports map (`bun run test:dist`). |
| `scripts/check-consumer.mjs` | Packs the package, installs it with a given zod version in a temp project, then typechecks and runs a strict consumer (`bun run check:consumer <zod version>`). |
| `.github/workflows/` | `ci.yml` (checks, coverage, dist on Node 22.12 and 24, consumer with zod 4.0.16 and latest) and `release.yml` (publishes on a GitHub release). |

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test && bun run test:dist
```

CI also runs `bun run test:coverage` (95% floor on `src/`) and `bun run check:consumer 4.0.16`.
