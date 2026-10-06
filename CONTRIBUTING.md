# Contributing

## Setup

You need [Bun](https://bun.sh) (the repo pins 1.4.2 in `packageManager`) and Node 22.12 or later (`.nvmrc` has 24).

```sh
bun install
```

Read [AGENTS.md](./AGENTS.md) first. It has the rules this package keeps and the file layout.

## Checks

```sh
bun run check && bun run typecheck && bun run test && bun run test:dist
```

| Script | What it does |
| --- | --- |
| `bun run check` | Biome lint and format check. `bun run check:fix` applies fixes. |
| `bun run typecheck` | `tsc --noEmit` over `src/`, `tests/` and `vitest.config.ts`. |
| `bun run test` | Vitest. `bun run test:watch` keeps it running. |
| `bun run test:coverage` | Vitest with a 95% coverage floor on `src/`. CI runs this one. |
| `bun run test:dist` | Builds `dist/` and imports every subpath through the exports map in Node (`scripts/smoke.mjs`). |
| `bun run check:consumer <zod version>` | Packs the package, installs it with that zod version in a temp project, then typechecks and runs a strict consumer. |

## Making a change

1. Branch from `main` (`feat/<topic>`, `fix/<topic>`).
2. Write a failing test in `tests/`, make it pass, keep commits small and [Conventional](https://www.conventionalcommits.org/en/v1.0.0/).
3. Run the checks above.
4. Add a line to `CHANGELOG.md` under `## [Unreleased]`, in the right [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) section (Added, Changed, Deprecated, Removed, Fixed, Security).
5. Open a PR. CI must be green before merge.

Found a wrong offset, a slot an hour off or a calendar file an app refuses? Open an issue with the zone, the instant or wall time, what you got and what you expected.

Releases are cut by the maintainers.
