# `scripts` — the gate and the data pipelines

Two jobs: prove the tree before anyone ships it, and generate the data the app
bundles. A script here writes an output or checks one; nothing here is imported
by the app at runtime.

## The gate

```sh
./scripts/check.sh            # list-height lint + data hashes + nsh check
./scripts/check.sh test       # the above + nsh test (the gate)
./scripts/check.sh test-only  # nsh test only
./scripts/check.sh test-only qa/unit/data-feed.test.ts   # one file, still locked
./qa/run-tests.sh             # push-target freshness + check.sh test-only
```

`check.sh` exists because the `.nsh/` build cache is one directory per project.
It takes a lock, waits for the holder (up to 15 min), and always releases it.
**Never call `nsh check` / `nsh test` directly in this repo.**

`scripts/lint-list-height.mjs` runs first: a `<List>` without a height paints
nothing, and no rendering test can see it. Do not remove that step.

## Data pipelines

| Output | Command |
|---|---|
| `assets/data/*.json` | `uv run python native/scripts/extract.py` → `verify.py` |
| `assets/data/students-gecs.json`, site CSVs | `uv run python native/scripts/build-students-data.py` |
| `students/roster-data.ts` | `bun scripts/build-students-data.mjs` |
| `syllabus/data/packs.ts`, `data/table/` | `bun scripts/data/build-packs.ts` → `verify-packs.ts` |
| `pyqs/catalog-data.ts` | `generate_catalog.py` → `bun scripts/pack-pyq-catalog.mjs` |
| `pyqs/pdf-catalog.ts`, `public/PYQPDFs/` | `bun scripts/build-pyq-pdfs.mjs` |
| `public/data/notes.json` | `uv run native/scripts/notes/build-notes.py` |
| `data-feed/bundled.ts`, `public/data/app/` | `bun scripts/data/publish-feed.ts --site` → `--check` |
| `assets/fonts/boxicons.ttf` | `uv run python native/scripts/icons/build-boxicons.py` (subset from `src/ui/icons.tsx`; `bun scripts/icons/verify.mjs` checks it) |
| `qa/push-targets.ts` | `bun qa/scan-push-targets.mjs` |

Full flags and order: the `beu-data` skill (`references/pipelines.md`).
Python via `uv`, JS via `bun`; no npm/node path.

## Release and verification

| Script | Does |
|---|---|
| `package-android.sh` | compiles, builds the custom host, slim arm64, align, sign |
| `signing.sh` | the release identity, plus `--upload` for the Play upload key |
| `build-android-host.sh` | the Android host with `PdfPage` and Ask AI |
| `build-nsh-from-source.sh` | the same host built from an nsh checkout, no `~/.nsh` binaries |
| `bundle-android.sh` | the Play AAB: `App.play.tsx`, proto resources, bundletool |
| `store-assets.sh` | the Play listing images from `icon.png`, measured to spec |
| `release.sh` | check → package → size gate → verify → `dist/` |
| `size-report.sh` | APK/bundle budgets, byte breakdown, `--record` |
| `shots.sh` | 20-screen macOS screenshot sweep |
| `contrast.ts` | WCAG contrast over the theme tokens |
| `verify-identity.ts` | live reg → name/CGPA check, no app runtime |
| `android.sh` | `install` / `shot` / `emulator` / `log` helpers |

## Rules

- **Generated outputs are never hand-edited** (the table above). Fix the
  pipeline and re-run it.
- **Every generator verifies before writing.** Keep the `--check` mode and the
  round-trip/row-count assertion when editing one.
- **PII stays out of output.** Register dumps are read, never echoed.
- **A new script names its failure.** Exit non-zero with the step that failed;
  no silent success.
- **Data changes pay the size gate.** `./scripts/size-report.sh` after any new
  bundled asset.
