# Changelog

All notable changes to `@haruhimemoe/time` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on 0.x, a change to slot numbering, the default candidate order or a stored shape is a minor version.

## [Unreleased]

### Changed

- CI runs CodeQL and a gitleaks scan of the full git history, and Dependabot covers dependencies and pinned actions. Dependencies are on their latest versions.

## [0.1.0] - 2026-10-06

### Added

- `@haruhimemoe/time/zone`: `isTimeZone`, `assertTimeZone`, `listTimeZones`, `offsetMinutes`, `formatOffset`, `parseOffset`, `zoneOffset`, `offsetZone`, `toWallTime`, `fromWallTime` (Temporal's gap and overlap rules), `weeklyWindow` and `WEEKDAYS`.
- `@haruhimemoe/time/availability`: weekly grids in UTC slots with `fromZone`, `toZone`, `localSlot`, `createAvailability`, `unionAvailability`, `intersectAvailability`, `countAvailability`, `resampleAvailability`, `isFreeAt`, `isFreeDuring`, `slotsPerWeek`, `weekSlotOf` and `availabilitySchema`. Grids made by `fromZone` follow their owner's clock across DST.
- `@haruhimemoe/time/slots`: `findSlots` (ranked match starts with who is free, staff, `need`, `filter`, `tiebreak`, run merging), `compareSlots` and `MAX_STARTS`.
- `@haruhimemoe/time/region`: `Region`, `regionSchema`, `defineRegions`, `CONTINENTS`, `CONTINENT_OF_COUNTRY`, `regionOfCountry` and `checkRegionLock`.
- `@haruhimemoe/time/ics`: `buildCalendar`, `escapeText` and `foldLine` (RFC 5545).
- `TimeError` with a `code` for every refusal.

[Unreleased]: https://github.com/haruhimemoe/time/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/haruhimemoe/time/releases/tag/v0.1.0
