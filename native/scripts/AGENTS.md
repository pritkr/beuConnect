# `scripts` — the gate and the data pipelines

Two jobs: prove the tree before anyone ships it, and generate the data the app
bundles. A script here writes an output or checks one; nothing here is imported
by the app at runtime.

## The gate

```sh
./scripts/check.sh            # lints + feed hashes + data check + nsh check
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

`scripts/lint-rail-height.mjs` runs next to it for the same reason: a horizontal
`Scroll` that is `flex-1` inside a column sizes its own height to zero, so a
rail's chips paint nowhere while `app.texts()` still reports them.

`scripts/lint-flex-direction.mjs` follows: `display: "flex"` uses CSS's initial
row direction, so a section meant to be a column turns into a horizontal rail
that overflows the screen. The syllabus units shipped that way, and layout is
invisible to `app.texts()`. State `flexDirection: "column"` or use a `flex-col`
class.

`scripts/lint-signal-setter.mjs` runs next: a signal setter passed bare
(`onChange={query.set}`) mounts fine and then throws `not a live signal` on the
first keystroke or tap, so it is a crash no rendering test reaches. The fix is
`onChange={(value) => query.set(value)}`.

`scripts/lint-wifi-host.mjs` runs next to it: campus Wi-Fi sign-in lives in
Java, with the app closed, where `qa/` cannot reach it. A dropped receiver, a
job that stops being persisted or a missing wake lock all leave the screen
saying "on" while nothing runs, so the scan reads the host's own facts.

## Data pipelines

| Output | Command |
|---|---|
| `assets/data/*.json` | `uv run python native/scripts/extract.py` → `verify.py` |
| `assets/data/students-gecs.json`, site CSVs | `uv run python native/scripts/build-students-data.py` |
| `students/roster-data.ts` | `bun scripts/build-students-data.mjs` |
| `students/college-index.ts` | `bun scripts/build-college-index.mjs` |
| `syllabus/data/packs.ts`, `data/table/`, `data/headings.ts` | `bun scripts/data/build-packs.ts` → `verify-packs.ts` |
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
