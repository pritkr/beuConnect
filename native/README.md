# BEUConnect — native app

The BEU student app as real native views, not a website in a box: syllabus,
results, rank, merit, result battle, PYQs, notes, notices, planner, search,
calculators, attendance, routine, holidays and settings. One TSX codebase on
[NativeShell](https://nsh.dev); Android is the shipping target and macOS is the
development host.

- **55 registered routes** across thirteen feature modules (including the
  first-run `onboarding`), plus the shell-owned `more` screen (56 destinations).
- Results work through BEU's published rosters even when BEU's JSON API is down,
  and through BEU's own result page — the captcha is solved by the student, the
  page is read on the phone, and the result is saved natively — when neither
  works. A registration number is resolved to a name and CGPA for Home without
  ever solving a captcha.
- The Android APK is **11.98 MB** (11,981,902 B) instead of the ~50 MB universal
  build, and installs the same way: `docs/ANDROID.md`.

## Three commands

```sh
source ~/.config/nsh/env.sh       # once per shell: JDK 21, SDK, NDK, adb on PATH
nsh run App.tsx                   # 1. run it — native window, hot reload
./scripts/check.sh test           # 2. prove it — types, release build, QA suite
./scripts/package-android.sh      # 3. ship it — arm64 APK in .nsh/out
```

Never call `nsh check` or `nsh test` directly. The build cache is one `.nsh/`
directory per project, so two concurrent builds corrupt each other;
`scripts/check.sh` takes a lock and always releases it. `./scripts/check.sh` is
the type/build pass alone, `test-only` skips it, and `./qa/run-tests.sh` adds the
generated push-target freshness gate before running the suite. `nsh run` is the
interactive dev loop, but still one nsh process at a time.

## What a student gets

| Area | Routes |
|---|---|
| Onboarding | `onboarding` — first run: one registration number, then the student's name and college |
| Home | `home` — greeting by resolved name, next class or last result, notices, tiles |
| Syllabus | `syllabus`, `.subject`, `.search`, `.saved`, `.gate` — 343 subjects, 2,324 topics, 30 GATE papers |
| Notes | `notes`, `.subject` — VVI topics and note PDFs per subject; a file opens in `pyqs.pdf` |
| Papers | `pyqs`, `.paper`, `.site`, `.pdf`, `.gate`, `data`, `data.table` |
| Planner | `planner` — the syllabus spread over the days left |
| Search | `search` — subjects, papers, notices, datasets and screens in one box |
| Results | `results`, `.table`, `.rank`, `.merit`, `.battle`, `.web`, `.portal` — live JSON, saved copy, published CSV, BEU's captcha page read back natively |
| Notices | `notices`, `.detail`, `.pdf`, `.announcements`, `.post`, `.search` |
| Tools | `tools`, `.calculator`, `.attendance`, `.routine`, `.holidays`, `.wifi`, `.feedback` (+ four compatibility aliases) |
| Students | `students`, `.college`, `.branch`, `.student`, `.leads` — published rosters and CGPA leaders |
| Feedback | `feedback` — a bug, wrong data or an idea, sent to the site |
| Settings | `settings`, `.profile`, `.appearance`, `.reminders`, `.storage`, `.offline`, `.about` |

Every route, with the params it reads: `docs/ARCHITECTURE.md` §4.

## Repo map

```
native/
├── App.tsx                 applies the saved appearance, then mount(Shell)
├── nsh.json                id, version, theme tokens, network/webview hosts
├── src/app/                router contract, registry, shell, tab bar, More, 404
├── src/ui/index.tsx        the design system ("Ink & Ember") — the only place with the look
├── src/lib/net.ts          fetch, timeout, cache, Storage, formatting
├── src/features/<area>/    one folder per area: routes, screens, data, state
├── assets/data/            manifest + 12 bundled JSON files, generated, never hand-edited
├── qa/                     route contract, mount sweep, unit tests
├── scripts/                check, package, size, shots, data extraction, identity check
└── docs/                   this file's neighbours: ARCHITECTURE, SITE_PARITY, ANDROID,
                            SIZE, SHOTS, A11Y_AUDIT, BUILD_SPEC
```

## Contributor rules

1. **Register the route in its own folder.** A feature exports `<area>Routes:
   RouteDef[]` from `src/features/<area>/index.tsx`; `src/app/registry.tsx`
   spreads it. Nothing else needs to change to add a screen.
2. **Names are namespaced.** Top-level `<area>`, sub-routes `<area>.<thing>`;
   params are read with `param(nav, "…")` / `numParam(nav, "…")`, never a cast.
3. **A WebView is a last resort.** The only uses are the BEU captcha page
   (`results.web`, with `results.portal` behind it) and a PDF (`pyqs.pdf`,
   `notices.pdf`); Android renders note PDFs natively instead.
4. **Data goes through `src/lib/net.ts`.** No raw `fetch`, no ad-hoc storage
   keys: `readStore` / `writeStore` add the `beu.` prefix, `putCache` adds
   `beu.cache.`, and every network call has a timeout and a last-good copy.
5. **Theme by token.** `bg-background`, `text-muted-foreground`,
   `border-border`; light and dark are the same class. No hex in a screen.
6. **Pure logic is plain TS.** Parsing, ranking and formulas live in
   `data.ts` / `engine.ts` / `parse.ts`; `index.tsx` is a route table, not a god
   file.
7. **Gate before you hand over.** `./scripts/check.sh test`, plus
   `bun scripts/contrast.ts` after a theme change, `./scripts/shots.sh` after a
   visual one, and `./scripts/size-report.sh` after adding bundled data.
8. **Do not hand-edit generated files.** `assets/data/` (`scripts/extract.py`),
   `src/features/syllabus/data/packs.ts` + `data/table/`
   (`scripts/data/build-packs.ts`), `src/features/pyqs/catalog-data.ts`
   (`features/pyqs/scripts/generate_catalog.py`),
   `src/features/pyqs/pdf-catalog.ts`,
   `src/features/students/roster-data.ts` (`bun scripts/build-students-data.mjs`)
   and `qa/push-targets.ts` (`bun qa/scan-push-targets.mjs`).

## Data and identity

Live data comes from the site (allowlisted in `nsh.json`):

- `GET /api/result?reg=<REG>&sem=<1-8>&format=json` — BEU's result, when it answers
- `GET /data/students_<batch>_all_<branch>_sem<n>.csv` — a whole branch roster
- `GET /data/wide_<batch>_<college>_<branch>_sem<n>.csv` — one student, per paper
- `GET /api/notices/important`, `/data/manifest/index.json`, `/data/notes.json`,
  `POST /api/feedback`

The one exception is the GECS attendance register, which reads its own Supabase
host in `src/features/tools/gecs.ts`.

On first run `onboarding` asks for the number once. After that it is resolved to
a name and CGPA from the saved result, then BEU's newest published roster — no
captcha, no name typed twice. Check it without the app:

```sh
bun scripts/verify-identity.ts                 # the maintainer's number
bun scripts/verify-identity.ts 24105157010 2   # same number, first semester to try
```
