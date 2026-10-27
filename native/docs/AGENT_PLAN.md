# Parallel work — file ownership

Ten agents work in the same tree. Each one owns a folder; nobody edits another
agent's folder, `src/app/registry.tsx`, `src/app/shell.tsx`, `src/app/tabbar.tsx`,
`src/ui/index.tsx`, or `nsh.json`. The orchestrator wires new routes, the More
list, the route contract and the release.

| Agent | Owns | Must not touch |
| --- | --- | --- |
| competitor-research | `docs/COMPETITORS.md`, `docs/competitor-shots/` | `src/`, `public/` |
| home-layout | `src/features/home/**`, `src/app/more.tsx` | every other feature, registry |
| notes-content | `notes-src/vvi/**`, `public/data/notes.json` | `src/features/notes/**` |
| pyq-catalog | `src/features/pyqs/**` | other features |
| search | `src/features/search/**` | other features |
| planner | `src/features/planner/**` | other features |
| results | `src/features/results/**` except `identity.ts`, `data.ts` | other features |
| notices | `src/features/notices/**` | other features |
| syllabus | `src/features/syllabus/**` | other features |
| tools | `src/features/tools/**` | other features |

## House rules every agent follows

- **Read first**: `AGENTS.md` at the repo root, `native/docs/BUILD_SPEC.md`,
  `native/docs/ARCHITECTURE.md`, and the header comment of the feature you own.
- **Design language**: Ink & Ember — paper `#FBF8F4`, ink `#17130F`, ember
  `#E4572E`, teal `#0E6B5C`; hairline `border-border`; radii 20–28; tabular
  numerals; no emoji, no exclamation marks, no gradients-for-decoration.
- **Touch targets** are at least 44 pt. Lay out for a 320 pt phone first.
- **Reactivity rule**: a component body runs once. Read a signal inside JSX
  (or through `computed`) — never in a top-of-body `const`, or the value freezes.
- **No new routes** unless the module already exports them. If you must add
  one, register it inside your own feature's `*Routes` and say so in your report.
- **Tests**: add or extend `qa/` only for behaviour you changed. The whole suite
  must stay green.
- **Commands**: `./scripts/check.sh` for types/build, `./scripts/check.sh test`
  for the suite. Never call `nsh` directly — the lock serialises parallel agents.
- **Data honesty**: never invent a paper, notice, result, date or PDF. An empty
  state that explains itself beats a fabricated row.
- **Progress**: work in small edits and keep the tree compiling. If you run out
  of time, leave a short `STATUS:` note at the end of your report listing what is
  done, what is half-done, and the next exact step.

## Baseline

260 tests passing, `nsh check` green. Notes feature shipped (`notes`,
`notes.subject`, `notes.file`), planner rebuilt as a day-by-day `scheduleFor`
plan, search results reactive, Home doors repaired. Docs that describe the
current tree: `ARCHITECTURE.md` (routes, state, data layers, and the
no-system-browser limitation), `COMPETITORS.md` (feature matrix and gaps),
`SITE_PARITY.md`, `SIZE.md`, `BUILD_SPEC.md`.

A note on subagent models: the free tier rotates. A model can be deprecated or
the endpoint can fail mid-run, so a plan that depends on six agents finishing is
a plan that half-fails. Every task below must be worth finishing solo.
