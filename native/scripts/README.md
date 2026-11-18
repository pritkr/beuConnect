# Scripts

Every script here either writes an output or checks one. None is imported by
the app at runtime.

This page is the inventory: what each file is for. The rules that govern them
(serialised gate, generated files never hand-edited, PII stays out of output,
data changes pay the size gate) are in [`AGENTS.md`](./AGENTS.md); the
per-pipeline detail is in [`../docs/NOTES.md`](../docs/NOTES.md),
[`../docs/STUDENTS_DATA.md`](../docs/STUDENTS_DATA.md),
[`../docs/SYLLABUS_PARITY.md`](../docs/SYLLABUS_PARITY.md),
[`../docs/OFFLINE.md`](../docs/OFFLINE.md) and the `beu-data` skill.

## The gate

| File | Does |
|---|---|
| `check.sh` | The only way to run `nsh check` / `nsh test`. Takes the `.nsh` lock, waits for the holder, always releases. `check`, `test`, `test-only [file…]`. Before the build it runs the list-height lint, the icon-font check and the feed-hash check. |
| `lint-list-height.mjs` | Fails a `<List>` that has no height to inherit — it would paint nothing, and no rendering test can see that. |
| `icons/verify.mjs` | Reads `assets/fonts/boxicons.ttf`'s own `cmap` and fails when it and `src/ui/icons.tsx` disagree in either direction. |
| `data/publish-feed.ts --check` | Fails when the bundled feed hashes are stale, which would make every phone re-download bytes it already has. |
| `../qa/run-tests.sh` | Push-target freshness scan, then `check.sh test-only`. |

## Ship

| File | Does |
|---|---|
| `package-android.sh` | The phone build. Compile gate → `build-android-host.sh` → `.nsh/out/BEUConnect.apk`. Optional ABI argument (`arm64-v8a` default, `x86_64`, `all`), `INSTALL=1` to install and launch, keystore overrides via `KEYSTORE` / `KEY_ALIAS` / `KEY_PASS`. |
| `build-android-host.sh` | BEUConnect's own Android host: `aapt2` + `javac` + `d8` against `android/` and `nsh.aar`, no Gradle. Adds `PdfPage` (native PDF pages) and `AskAi` to the stock runtime. This is the APK that ships; `package-android.sh` calls it. |
| `bundle-android.sh` | The Play artifact: an AAB from `App.play.tsx` (no off-Play update path), `aapt2 --proto-format` + `bundletool`, no Gradle. `--install` builds and installs the split APKs to prove they launch. |
| `signing.sh` | Creates or shows the release identity in `~/.config/beuconnect/signing.env`. One key per app, never in git. |
| `release.sh` | Check + tests → package → size gate → verify → `dist/`. `--skip-tests` for a fast package. |
| `size-report.sh` | APK and bundle byte breakdown, budget check (default 12,300,000 B APK / 2,350,000 B bundle), `--record` appends to `../docs/size-history.json`. `APK=` reports on another file; `--no-build` skips the build. |
| `android.sh` | Device helpers: `run` (stock `nsh package --run`), `install`, `slim`, `shot`, `emulator`, `log`. |
| `axml-extract-native-libs.mjs` | Patches a compiled (binary XML) manifest so `android:extractNativeLibs="true"`, which is what allows the runtime to be deflated instead of stored. Standalone: `bun scripts/axml-extract-native-libs.mjs <AndroidManifest.xml>`. The current host manifest sets the flag at source, so the build does not call it. |
| `icons/build-launcher.sh` | Generates the adaptive launcher icon layers into `android/res/mipmap-*` from the source art. |

## Look and verify

| File | Does |
|---|---|
| `shots.sh` | Screenshot sweep on macOS into `.nsh/shots/`. `--only`, `--scheme light\|dark\|both`, `--width`, `--height`, `--dark`, `--light`, `--offline`, `--list`, `--mode`. |
| `contrast.ts` | WCAG contrast over the theme tokens, every measured pair. `--quiet` failures only, `--json` machine-readable; non-zero exit on a fail. |
| `verify-identity.ts` | Repeats the identity path without the app: registration number → batch/branch/college → published roster → name and CGPA. Optional arg: `<reg>` (the newest three published semesters are tried in order). |
| `accent-ink-sweep.sh` | One-off cross-feature class/token substitution recorded in `../docs/A11Y_AUDIT.md`; kept so the sweep is reproducible, not for routine use. |

## Data

Run Python with `uv`, JS with `bun`. Every generator has a `--check` mode;
none of the files it writes may be edited by hand.

| File | Writes | Command |
|---|---|---|
| `extract.py` | `assets/data/*.json` + `manifest.json` | `uv run python native/scripts/extract.py [--check] [--offline]` |
| `verify.py` | — (validates the above) | `uv run python native/scripts/verify.py` |
| `build-students-data.py` | `assets/data/students-gecs.json`, site CSVs | `uv run python native/scripts/build-students-data.py [--check] [--source …]` |
| `build-students-data.mjs` | `src/features/students/roster-data.ts` | `bun scripts/build-students-data.mjs [--check]` |
| `data/build-packs.ts` | `src/features/syllabus/data/packs.ts`, `data/table/`, `data/headings.ts` | `bun scripts/data/build-packs.ts [--check] [--from-site]` |
| `data/verify-packs.ts` | — (decodes and compares to `packs-snapshot.json`) | `bun scripts/data/verify-packs.ts [--capture]` |
| `pack-pyq-catalog.mjs` | `src/features/pyqs/catalog-data.ts` | `bun scripts/pack-pyq-catalog.mjs [--check]` |
| `build-pyq-pdfs.mjs` | `src/features/pyqs/pdf-catalog.ts`, `public/PYQPDFs/`, `public/data/pyq-pdfs.json` | `bun scripts/build-pyq-pdfs.mjs [--check]` |
| `notes/build-notes.py` | `public/data/notes.json` | `uv run python native/scripts/notes/build-notes.py [--check]` |
| `notes/add-pdf.sh` | one handwritten PDF + the rebuilt manifest | `./native/scripts/notes/add-pdf.sh <file.pdf> <branch> <sem> <code> "<Subject>" [kind]` |
| `data/publish-feed.ts` | `src/features/data-feed/bundled.ts`, `public/data/app/` | `bun scripts/data/publish-feed.ts --site` then `--check` |
| `icons/build-boxicons.py` | `assets/fonts/boxicons.ttf` | `uv run scripts/icons/build-boxicons.py [--check]` |

### Offline data (`assets/data`)

`extract.py` first, then the roster builder (it appends its own manifest entry),
then the verifier:

```sh
SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) uv run python native/scripts/extract.py
uv run python native/scripts/build-students-data.py
uv run python native/scripts/verify.py
```

`--check` regenerates in memory and compares bytes with the shipped files; it
writes nothing and exits non-zero when anything is stale. It reuses the shipped
`generatedAt` unless `SOURCE_DATE_EPOCH` is set, so an unchanged tree passes.
`--offline` skips the live manifest fetch; it changes nothing except a recorded
fetch-failure gap. Regeneration carries the roster pipeline's
`students` entry in `manifest.json` forward, so `extract.py` can be re-run after
`build-students-data.py` without dropping it.

Where the data comes from (`manifest.json` names the exact files):

- **Syllabus** — `src/assets/data/config.json` and `branches/*.json`; `sylpy/*.json`
  only fills a semester or subject the branch file lacks (`confidence: "medium"`).
- **GATE** — `src/assets/data/gate-papers.json`, `gate/*.json`, then
  `gatextract/gate/*.json`.
- **Holidays** — the `holidays2026` array in `src/pages/holidays-calendar.astro`.
- **Grading** — `BEU_GRADES`, mark split and pass rules in
  `src/lib/calculator/engine.ts`.
- **Colleges** — `src/data/colleges.json`, `src/lib/beuReg.ts`, the public result
  manifest (local copy plus the live URL when reachable) and the
  `public/data/students_*.csv` / `wide_*.csv` filenames.

Every entry carries its `source`; dataset-level sources and the 33 recorded gaps
(missing semesters, subject stubs, 8 empty GATE papers, 2025 holidays PNG-only,
live-only routine) are in `manifest.json`. Current: **343 subjects · 1,405 units ·
2,324 topics · 19 stubs · 30 GATE papers (232 sections, 504 topics) · 39 holidays
· 7 grades · 52 colleges · 209 college/branch pairs · 1,323 students**. Rules and
the full file table: [`../assets/data/AGENTS.md`](../assets/data/AGENTS.md).

Support files, not pipelines:

- `data/wire-lib.ts` — the string table, phrase dictionary and literal renderer
  behind `build-packs.ts`; `../src/features/syllabus/data/decode.ts` is the
  runtime half of the same format.
- `data/legacy/build-packs-fixes.ts`, `data/legacy/extract-gate.py` — the
  one-time 2026-10-26 merge of `patches.json` and the GATE text recovered from
  the official 2026 PDFs. Their output is baked into `packs.ts`; kept so the
  repairs can be audited, not part of any routine run.

## Where the detail lives

- Rules and failure modes: [`AGENTS.md`](./AGENTS.md).
- Data gaps and sources: `../docs/NOTES.md`, `../docs/STUDENTS_DATA.md`,
  `../docs/SYLLABUS_PARITY.md`, `../docs/OFFLINE.md`.
- Bytes: `../docs/SIZE.md`. Android host and install: `../docs/ANDROID.md`.
- Screenshot QA: `../docs/SHOTS.md`.
