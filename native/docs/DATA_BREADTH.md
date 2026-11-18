# Data breadth — the shipped shape

Status: **shipped in `1.3.3` (2026-11-18)**. §1–§2 are
the measured case (kept from the 2026-10-31 pass). §3 replaces the "college
pack" plan with what actually ships: a bundled index plus the site's
already-published CSVs, fetched on demand and cached.

## 1. What the data says

Counted from `public/data/` on 2026-10-31:

| | Count | Size |
|---|---|---|
| Result tables (`wide_*.csv`, 56 columns) | 1,308 files | 13 MB |
| Rosters (`students_*.csv`, ranked rows) | 1,452 files | 8.5 MB |
| College-specific rosters (`students_<batch>_<college>_<branch>_sem<n>.csv`) | 1,345 files | — |
| College codes | 53 (52 colleges + `all`) | — |
| Branch codes | 7 (`101`–`105`, `110`, `161`) | — |
| Batches | 5 (`21`–`25`) | — |

The app bundles one roster: GEC Sheikhpura, 1,323 students
(`assets/data/students-gecs.json`). Every other college's directory, college
rank and merit list had nothing to rank, even though the site publishes the rows.

**This is not a scraping problem. It is a delivery problem.**

## 2. Why it cannot be bundled

APK headroom is ≈746 KB against the 18.5 MB ceiling (`docs/SIZE.md`). The
college-specific rosters alone are 1,345 files. Even one college's full set is
larger than the headroom. Breadth has exactly one shape: an index in the APK,
the rows on demand, the rows stay cached.

## 3. The shipped shape — index + published CSV

Do **not** invent a pack format. The site already serves the exact files the
directory needs:

```
SITE/data/students_{batch}_{college}_{branch}_sem{n}.csv   # 5 cols: Session,RegNo,Name,SGPA,Cur. CGPA
SITE/data/students_{batch}_all_{branch}_sem{n}.csv         # 7 cols, +CollegeCode,CollegeName
SITE/data/wide_{batch}_{college}_{branch}_sem{n}.csv       # 56 cols, papers + ranks
```

### 3.1 The index

`scripts/build-college-index.mjs` reads the repo root's `public/data` and writes
`src/features/students/college-index.ts` (**generated — never hand-edited**).
It is a TS module, not a file in `assets/data`, so it is bundled by the compiler
with the students feature and needs no runtime JSON parse:

```ts
export const COLLEGE_INDEX_SNAPSHOT = "2026-11-18";
export const COLLEGE_INDEX_SKIPPED = 6;
export const COLLEGE_INDEX = {
  "107": { "21": { "101": [8], "102": [8] } },
};
```

- Built by listing `public/data/students_*.csv`, dropping `_all_`, and parsing
  `students_<batch>_<college>_<branch>_sem<n>.csv`. A malformed name is skipped
  and counted in `COLLEGE_INDEX_SKIPPED`; it never becomes a URL.
- `sem0` is skipped, not indexed: the six such files are the enrolment register
  (`Session,RegNo,Name,Branch`, no SGPA), not a result.
- Sorted keys, integer semesters, no whitespace. Written only when the content
  changes, so a re-run is idempotent; `--check` diffs everything except the date.
- Measured 2026-11-18: **1,339 files → 704 (college, batch, branch) pairs,
  52 colleges, 9,721 B raw / 462 B gzip**. The budget is **24 KB gzipped**; the
  script prints both numbers and fails above it.
- `scripts/check.sh` runs `--check` before the build, like the live-feed hashes.

`scripts/package-android.sh` is unchanged: the module compiles into the bundle
and shows up in `size-report.sh` with the rest of the bytecode.

### 3.2 The reader

`src/features/students/remote.ts` — the index is a map, never data:

- `batchesFor(college)`, `branchesFor(college, batch)`, `semsFor(college, batch,
  branch)` — straight out of `college-index.ts`. An empty list is the honest
  answer: "BEU has not published a roster for this combination."
- `hasRosters(college)` / `branchesOfCollege(college)` — what the directory row
  and the screen's branch rail are built from.
- `rosterUrl(...)` — `null` unless the index names the combination, so the app
  never builds a URL that 404s on a student.
- `loadRoster(...)` — `fetchText` on
  `SITE/data/students_<batch>_<college>_<branch>_sem<s>.csv` with
  `cacheKey: roster:<batch>:<college>:<branch>:<sem>`, 20 s timeout,
  `cacheMaxAge: 7 days`. It parses with `src/lib/csv.ts` (`csvRecords`) and does
  **not** re-rank from raw marks: the file already carries `SGPA` and
  `Cur. CGPA`, and a blank cell stays `null` and sorts last.
- `parseRoster` / `rankRoster` / `cgpaCount` are pure and unit-tested in
  `qa/college-index.test.ts`.

A `students_<batch>_all_<branch>_sem<n>.csv` fetch stays in `results/`, for
branch rank, exactly as before.

### 3.3 The screens

`students.colleges` lists every BEU college; what opens depends on the index:

1. **Named college, indexed** — `students.college` renders
   `remote-college.tsx`: batch chips → branch chips → semester chips, all driven
   by the index, then a virtualised `List` of the ranked roster with a local
   name/registration filter. A combination that was never published cannot be
   selected; a lookup that fails shows the error and its retry, and a fetch the
   cache already answered paints before the network.
2. **Named college, not indexed** — "No roster for college N", one line on what
   BEU has published, and a button back to the directory. No spinner.
3. **GEC Sheikhpura** — keeps its bundled register as the offline first paint
   (`college.tsx`); the index path is what every other code opens.
4. **The directory row** — a college with rosters is tappable, carries a
   "Roster" badge and its batch count; one without says "No roster" and is not a
   button.

## 4. Acceptance

| Check | Pass |
|---|---|
| `bun scripts/build-college-index.mjs --check` | exit 0 |
| gzip of the index | ≤ 24 KB, printed by the script (measured 462 B) |
| `./scripts/check.sh test` | green |
| `./scripts/size-report.sh` | APK still under its budget, delta recorded by the script |
| A college with an index (e.g. `107`) | roster loads, ranks, caches; second open paints before the network |
| A college with no index | explains itself, no spinner, no fabricated rows |
| Airplane mode after one successful load | the same roster still paints |

## 5. Not in scope

- Downloading 23 MB of data or a "download all" button.
- A pack format, a manifest of manifests, or per-college deltas.
- Scraping. The rows are already published; the work is delivery.
