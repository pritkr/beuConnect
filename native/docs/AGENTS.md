# `docs` — the contract, not marketing

Docs here describe what the app does and why. If a doc and the code disagree,
the code wins — then fix the doc in the same change.

## Ownership

| File | Owns | Update when |
|---|---|---|
| `ARCHITECTURE.md` | routing, state, data layers, the route table | a route, key, cache entry or data source changes |
| `BUILD_SPEC.md` | the screen contract and definition of done | the contract changes |
| `SITE_PARITY.md` | what the app owes the site | a feature is added or dropped |
| `COMPETITORS.md` | the market matrix | a competitor changes |
| `OFFLINE.md` | offline tiers, cache keys, budgets | a cache key or pack changes |
| `SIZE.md` | APK bytes and the floor | a release moves the number |
| `ANDROID.md` | host, packaging, install, device debugging | the host or toolchain changes |
| `SHOTS.md` | screenshot QA | the sweep or route set changes |
| `A11Y_AUDIT.md` | contrast, touch, small screens | a finding is fixed or added |
| `NOTES.md`, `STUDENTS_DATA.md`, `SYLLABUS_PARITY.md` | data pipelines and gaps | the pipeline or source changes |
| `RELEASE.md` | the release sequence | a step changes |
| `size-history.json` | append-only size runs | written by `size-report.sh --record`, never by hand |

## Rules

- **Counts drift; the registry and QA are the truth.** Route, subject and
  student counts appear in several docs and have disagreed before. Re-count from
  `src/app/registry.tsx`, a generated header or `verify.py`; do not carry a
  number forward, and never add a third copy of it.
- **No invented data.** A gap is documented as a gap, with its source.
- **No marketing copy.** State the behaviour, the limit, the file.
- **Dates are absolute** (`2026-10-27`), never "today" or "recently".
- **Link to the source, do not duplicate it.** `AGENTS.md`, source headers and
  the scripts are the source for commands and rules.
- **A new route** gets a row in `ARCHITECTURE.md` §4 and a line in
  `SITE_PARITY.md`; a new screen gets a `SHOTS.md` / `scripts/shots.sh` entry.
- **Generated docs are outputs.** `size-history.json` is append-only; do not
  restate its numbers in prose.

## Where to read next

- Screen contract: `BUILD_SPEC.md`; routing/state: `ARCHITECTURE.md`.
- App entry and non-negotiables: `../AGENTS.md`.
- Data commands: the `beu-data` skill and `../scripts/AGENTS.md`.
