---
name: BEU Data
description: "Regenerate or verify BEUConnect data: syllabus packs, PYQ catalog and PDFs, student rosters, notes, and bundled offline assets. Use when data looks stale, counts disagree, a screen shows a gap, or a scraper/pipeline needs a change."
---

# BEU Data

Everything a student reads offline is generated. The app ships the output; the
source is the site's JSON, the PYQ archive, the college register, or uploaded
notes. **Never hand-edit a generated file** — fix the pipeline and re-run it.

## The one rule

Every generator verifies its own output before writing (round-trip decode,
row-for-row comparison, or a `--check` mode). If a write would lose a row, the
script exits non-zero. Do not bypass that with an editor.

## Pipelines

Run from the repo root unless noted. Details and flags: `references/pipelines.md`.

| Output | Command |
|---|---|
| `native/assets/data/*.json` | `uv run python native/scripts/extract.py` |
| validate the above | `uv run python native/scripts/verify.py` |
| `native/assets/data/students-gecs.json` + site CSVs | `uv run python native/scripts/build-students-data.py` |
| `native/src/features/syllabus/data/packs.ts` | `bun scripts/data/build-packs.ts` (from `native/`) |
| verify packs | `bun scripts/data/verify-packs.ts` (from `native/`) |
| `native/src/features/pyqs/catalog-data.ts` | `uv run python native/src/features/pyqs/scripts/generate_catalog.py`, then `bun scripts/pack-pyq-catalog.mjs` |
| `native/src/features/pyqs/pdf-catalog.ts` + `public/PYQPDFs/` | `bun scripts/build-pyq-pdfs.mjs` |
| `native/src/features/students/roster-data.ts` | `bun scripts/build-students-data.mjs` |
| `public/data/notes.json` | `uv run native/scripts/notes/build-notes.py` |
| `native/qa/push-targets.ts` | `bun qa/scan-push-targets.mjs` |
| live identity check | `bun scripts/verify-identity.ts [reg] [sem]` (from `native/`) |

## Order that avoids stale output

1. `extract.py` rewrites `manifest.json` and knows nothing about the student
   register. If both changed, run `build-students-data.py` **after** it.
2. `generate_catalog.py` produces readable JSON; `pack-pyq-catalog.mjs` turns it
   into the shipped wire form. Re-pack after every catalog change.
3. `build-packs.ts` re-packs what ships. Use `--from-site` only when importing
   newer site data, and `--write` to keep the result.

## Data honesty

- No invented paper, subject, notice, date, result, mark or rank.
- A subject with no syllabus text is a stub (`confidence: "none"`, `units: []`),
  not made-up prose.
- A missing student row is missing; never default a CGPA or a rank.
- Student registers and dumps contain personal data. Read them; never echo PII
  into logs, tests, screenshots or docs.

## After regenerating

- `./scripts/check.sh test` — the app still compiles and the contracts hold.
- `./scripts/size-report.sh` — bundled data counts against the APK budget.
- Update the snapshot date only if the generator did not.
- `native/docs/OFFLINE.md`, `native/docs/STUDENTS_DATA.md`, `native/docs/NOTES.md`
  explain ownership and gaps; update them when the shape or the source changes.
