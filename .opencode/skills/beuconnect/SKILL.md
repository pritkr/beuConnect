---
name: BEUConnect
description: "BEUConnect repo context: the Astro/Cloudflare site at beu.prit.eu.org, its data APIs, and the NativeShell app in native/. Use when working anywhere in beuconnectaw, choosing which project skill or AGENTS.md to load, or wiring site data into the app."
---

# BEUConnect

Student hub for Bihar Engineering University (BEU): syllabus, PYQs, results,
rank, merit, result battle, notices, calculators, attendance, routine, holidays.
It replaces Apna BEU and beubih.vercel.app.

## Two halves, one repo

| Path | What | Stack |
|---|---|---|
| `src/`, `public/`, `scripts/` | the live site, https://beu.prit.eu.org | Astro SSR on Cloudflare Workers (`@astrojs/cloudflare`), Pico.css, bun, Python/uv scrapers, CSV + JSON data (no database) |
| `native/` | the native app (Android ships, macOS is the dev host) | NativeShell TSX on QuickJS, real platform views. **No `package.json` and no dependencies.** |

The repo is ~5.3 GB of PDFs, CSVs and screenshots with many local
modifications. It is not a clean tree.

## Load the right skill

| Task | Skill |
|---|---|
| Build or change a native screen | `beu-native` |
| Run or extend the native test suite | `beu-qa` |
| Package, release or size-check the APK | `beu-release` |
| Regenerate data (syllabus, PYQs, roster, notes) | `beu-data` |
| Work on the Astro site | this skill + the relevant `AGENTS.md` |

`AGENTS.md` is recursive: the root file, then `native/AGENTS.md`, then the
nearest one to the file you are editing (`src/app`, `src/ui`, `src/lib`,
`src/features`, `qa`, `scripts`, `docs`, `assets/data`, `android`). Read the
nearest one before editing; deeper ones are discovered as you read files.

## Non-negotiables

- **Never clone over the repo.** Run `git status` first. Never
  `git reset --hard`, `git clean -fd`, or bulk-delete untracked artifacts.
- **Bun for JS/TS, uv for Python.** No npm/node path, no `package-lock.json`.
- **The live site stays up.** `bun check` and `bun test` before deploying.
- **The APK stays green.** `./scripts/check.sh test`; never call `nsh check`,
  `nsh test` or `nsh run` directly (one `.nsh/` cache is shared).
- **Data honesty.** Never invent a paper, notice, result, date or rank. An empty
  state that explains itself beats a fabricated row.
- **Generated files are outputs.** See the list below; regenerate, never edit.

## Commands

Site (repo root):

```sh
bun install
bun dev                 # cf dev
bun run build           # cf build
bun run deploy          # cf deploy
bun check               # typecheck
bun test                # vitest
```

Native (from `native/`):

```sh
source ~/.config/nsh/env.sh       # once per shell
nsh run App.tsx                   # dev loop, one nsh process at a time
./scripts/check.sh test           # the gate: lint, types, build, suite
./qa/run-tests.sh                 # push-target freshness + suite
./scripts/package-android.sh      # arm64 APK in .nsh/out
./scripts/release.sh              # check, package, size gate, verify, dist/
```

## Generated files (never hand-edit)

| Output | Regenerate with |
|---|---|
| `native/assets/data/*.json` | `uv run python native/scripts/extract.py`, then `verify.py` |
| `native/src/features/syllabus/data/packs.ts`, `data/table/` | `bun scripts/data/build-packs.ts` |
| `native/src/features/pyqs/catalog-data.ts` | `src/features/pyqs/scripts/generate_catalog.py`, then `bun scripts/pack-pyq-catalog.mjs` |
| `native/src/features/pyqs/pdf-catalog.ts`, `public/data/pyq-pdfs.json`, `public/PYQPDFs/` | `bun scripts/build-pyq-pdfs.mjs` |
| `native/src/features/students/roster-data.ts` | `bun scripts/build-students-data.mjs` |
| `native/qa/push-targets.ts` | `bun qa/scan-push-targets.mjs` |
| `public/data/notes.json` | `uv run native/scripts/notes/build-notes.py` |
| `native/docs/size-history.json` | append-only, written by `./scripts/size-report.sh --record` |

## Where the truth lives

- Route, state and data contract: `native/docs/ARCHITECTURE.md`
- Screen contract and definition of done: `native/docs/BUILD_SPEC.md`
- Site endpoints and payloads: `references/endpoints.md`
- Design system: `native/src/ui/index.tsx` (Ink & Ember)
- Offline behaviour: `native/docs/OFFLINE.md`; APK bytes: `native/docs/SIZE.md`
- Android host and install: `native/docs/ANDROID.md`
- Screenshots: `native/docs/SHOTS.md`; accessibility: `native/docs/A11Y_AUDIT.md`
- Competitors and parity: `native/docs/COMPETITORS.md`, `SITE_PARITY.md`
