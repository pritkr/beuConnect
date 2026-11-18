# `pyqs` — previous papers, GATE and the data browser

The native replacement for `/pyqs/`, `/gate-pyqs/` and `/data-browser/`: a shelf
of every BEU subject, each subject's papers as native text, GATE PDFs, and every
published result table as a virtualised, searchable, sortable list.

Everything here paints from bundled data first, so the shelf and the GATE index
open with no connection. Paper pages and dataset CSVs are fetched once and kept
in Storage, so the second open is local too.

## Routes

`index.tsx` exports `pyqsRoutes`; `src/app/registry.tsx` spreads it. Params are
read only through `param` / `numParam`, and every route renders a usable state
when a param is missing.

| Route | Params | Screen |
|---|---|---|
| `pyqs` | `q?` | Shelf: branch + semester chips, search, recents, per-subject paper rows. `browse.tsx` |
| `pyqs.paper` | `slug`, `year` **required**; `code`, `variant`, `id`, `title`, `name`, `branch`, `sem`, `pdf?` | One paper: metadata, instructions, sections and questions as native text, plus "open PDF"/"open on site". `paper.tsx` |
| `pyqs.site` | `slug`, `name?`, `anchor?` | The subject's page on the site in a WebView (fallback when a paper cannot be parsed). |
| `pyqs.pdf` | `url`, `title?`, `subtitle?`, `name?`, `file?` | PDF viewer: native pages on Android (`notes/native-pdf`), WebView elsewhere; back + copy link + browser fallback. |
| `pyqs.gate` | `code?`, `q?`, or `url` + `title`/`subtitle`/`file` | One route, three states: GATE code index → one paper code's years → a paper PDF. `gate.tsx` |
| `data` | `q?` | Dataset list from `/data/manifest/index.json`, filters, search, pull-to-refresh. `data.tsx` |
| `data.table` | `batch`, `branch`, `sem`, `college` **all required** | One wide CSV: chunked parse, virtualised rows, search, column sort, expandable detail. `data-table.tsx` |

A `pyqs.paper` link should carry `year` (and `variant`, `id` when known); the
screen refuses to guess a paper without them. `data.table` renders a "pick one"
state rather than fetching with empty params.

## Files

```
index.tsx        route table (spreads the five screens' arrays)
browse.tsx       shelf: filters, debounced search, recents, GATE jump
shelf.tsx        subject row + paper list inside a shelf row
components.tsx   shared presentation: Head, Hero, chips, rows, question cards, ShareButton
paper.tsx        paper screen, site fallback, PDF route
paper-parse.ts   server-rendered subject page → ParsedPaper (no DOM)
api.ts           manifest + CSV + subject page fetch/parse/cache
csv.ts           chunked CSV reader, filter/sort/column helpers
data.tsx         dataset browser
data-table.tsx   one dataset as a virtualised table
gate.tsx         GATE index, subject years, PDF viewer
gate-index.ts    GATE catalog reads (bundled)
state.ts         recents, saved course, shelf prefs
catalog-core.ts  pure catalog decode/hydrate/search/order
catalog.ts       binds the bundled snapshot to the optional live feed
catalog-data.ts  GENERATED packed BEU catalog — never edit
pdf-catalog.ts   GENERATED index of downloaded PDFs — never edit
pdf-index.ts     PDF lookups for a subject/paper
pdf-build.ts     pure build rules: branch, dedupe, year (used by scripts/)
gate-data.ts     GENERATED GATE catalog — never edit
coverage.ts      honest coverage counts for the audit
importance.ts    shelf ranking (course, papers, credits, recency)
colleges.ts      college code → name
scripts/         generator + `audit-catalog.ts` (coverage CLI)
```

## Data sources

All requests go through `src/lib/net.ts` (`fetchText` / `fetchJson`), which adds
timeouts, in-flight dedupe and the cache. Host: `https://beu.prit.eu.org`.

| Request | Shape | Used by |
|---|---|---|
| `GET /pyqs/<slug>/` | server-rendered HTML; `paper-block`, `paper-section`, `question`, `q-text`, `opt-item`, `marks` | `api.loadPaper` → `paper-parse.parseAllPapers` |
| `GET /data/manifest/index.json` | `{ "<batch>": { "<branch>": ["<batch>/<branch>/sem<sem>_<college>.json", …] } }` | `api.loadDatasets` → one `Dataset` per row |
| `GET /data/wide_<batch>_<college>_<branch>_sem<sem>.csv` | wide CSV, one student per row; `Session,RegNo,Name,…,SGPA,CGPA,FailAny,StateRank,CollegeRank,<code>_ESE,_IA,_Total,_Grade,…` | `data-table.tsx` |

The manifest path is parsed with `sem(\d+)_([A-Za-z0-9]+)\.json$`; the dataset id
is `batch|branch|sem|college`, and the CSV URL is built from that id, never from
the manifest filename.

GATE papers and the BEU catalog are bundled (`gate-data.ts`,
`catalog-data.ts`, `pdf-catalog.ts`); no network is needed to browse them.

### PDFs

- BEU PDFs: `<SITE>/PYQPDFs/…`; GATE: `<SITE>/GATEPYQs/<code>/<file>.pdf`.
- `pyqs.pdf` checks scheme + host before loading. Allowed: `beu.prit.eu.org`,
  `beu-bih.ac.in`, `beu.ac.in` (and their subdomains). Any other host is
  explained and offered on the clipboard, never silently blanked.
- Android's WebView cannot paint PDFs, so `lib/pdf.ts` hands the file to
  Google's viewer there; iOS/macOS/Windows/web load it directly.
- On Android the native PDF screen draws pages and can save the file; the
  WebView is the fallback.

## Storage

Prefixes come from `src/lib/net.ts` and `src/lib/cache.ts`; nothing here writes
a key directly.

| Key | Content | Lifetime |
|---|---|---|
| `beu.cache.pyqs.papers.v2.<slug>` | parsed papers for one subject (~6 KB each), keyed `<code>-<year>`, with an `at` stamp | refreshed in the background after 30 days; old copy still served |
| `beu.cache.pyqs.manifest.v1` | dataset index | revalidated on open; last copy used offline |
| `beu.cache.pyqs.csv.<batch\|branch\|sem\|college>` | one wide CSV | never expires — a published batch does not change |
| `beu.pyqs.recents.v1` | 12 recently opened papers (BEU + GATE), deduped by key | until cleared from the shelf |
| `beu.pyqs.prefs.v1` | shelf branch/semester when the student overrides their course | until changed |

Raw subject HTML is **never** stored: one page is a few MB, while its parsed
papers average ~6 KB each. Opening a second paper of the same subject is a
Storage read with no network.

`cachedPapers()` / `cachedPaperCount()` / `cachedPaperSlugs()` expose the offline
paper set; the shelf uses the slug set for its "on device" badges, and one scan
serves every row.

The download/clear UI is not in this folder: `src/features/offline/packs.ts`
(route `settings.offline`) lists cached subject bundles, downloads one subject
at a time through `prefetchSubject`, and clears `pyqs.papers.v2.*`,
`pyqs.csv.*` and `pyqs.manifest.v1` when the student asks.

## Screen rules this area follows

- One `List` per screen, `class="flex-1"`, reactive `each`, `Cell` for recycled
  rows. Never a `List` inside a `Scroll`.
- Four states everywhere: loading, ready, empty (with a reason and an action),
  error with retry. Offline shows the cached copy, labelled by source.
- Parsed papers are read in the JSX or a `computed`, never into a body `const`.
- Data honesty: no invented paper, year, marks, duration, answer key or row.
  A subject with no paper says "No papers yet"; a paper the parser cannot read
  offers the site page and the syllabus instead of a fake question list.
- `Gate` data has no answer keys today; the screen does not claim one exists.
  If `gate-data` grows a key field, add the indicator in `GateSubjectScreen`.

## Generation

The three catalog snapshots are generated; edit the generator or the source
data, never a row.

```sh
bun src/features/pyqs/scripts/generate_catalog.py   # or the repo pipeline
bun scripts/pack-pyq-catalog.mjs --check            # packed output must decode identically
bun scripts/build-pyq-pdfs.mjs --check              # PDF index mirrors the dataset
bun src/features/pyqs/scripts/audit-catalog.ts --coverage
```

`pack-pyq-catalog.mjs` refuses to write unless `decode(output)` matches the
input. `build-pyq-pdfs.mjs` removes stale files and writes nothing when
unchanged.

## Capabilities (`nsh.json`)

| Capability | Entries this area needs |
|---|---|
| `network.hosts` | `beu.prit.eu.org` |
| `webview.hosts` | `beu.prit.eu.org`, `beu-bih.ac.in`, `beu.ac.in` (+ `www.` variants) |
| `webview.hosts` (Android PDF viewer) | `docs.google.com`, `docs.googleusercontent.com`, `www.google.com`, `www.gstatic.com`, `ssl.gstatic.com` |
| `clipboard` | copy a paper/PDF/CSV link when a host or app cannot open it |
| `openUrl.schemes` | `https` (open the original in a browser) |

All of these are already declared. The BEU captcha hosts belong to `results`,
not here.

## Tests

Tests live in `qa/` (the repo rule), not in this folder:

- `qa/registry.test.ts` — every route name, title and push target resolves,
  including all seven here: `pyqs`, `pyqs.paper`, `pyqs.site`, `pyqs.pdf`,
  `pyqs.gate`, `data`, `data.table`.
- `qa/data.test.ts` — catalog hydration, shelf coverage per branch/semester,
  paper totals, PDF URLs.

```sh
./scripts/check.sh test-only qa/data.test.ts
./scripts/check.sh test-only qa/registry.test.ts
```

`bun src/features/pyqs/scripts/audit-catalog.ts --coverage` prints the real
coverage gap (subjects with no paper) without touching the UI.

## Known gaps

- **No share API in NSH.** Datasets cannot be exported as a file or shared with
  an intent; the public CSV URL is the export. Adding a `Clipboard` copy action
  to `data.table` is the next best step when that screen is next touched.
- **No answer keys in GATE data**, so no indicator is rendered.
- **CSV parsing has no unit test of its own** in `qa/`; it is exercised by the
  running screen. A second-quote/newline fixture belongs in `qa/`.
- **GATE is PDF-only** — `gate-data.ts` has no structured questions, so there is
  nothing to render natively beyond the year list.
- **Universal search** (`src/features/search/`) indexes syllabus subjects (the
  same names and codes as the PYQ shelf), GATE codes and datasets; it does not
  index individual paper years.
- **Live data feed** (`src/features/data-feed/pyqs.ts`) can replace the bundled
  catalog/PDF/GATE snapshots without a rebuild; a corrupt feed falls back to the
  bundled copy.
