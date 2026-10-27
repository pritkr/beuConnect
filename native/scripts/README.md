# Native offline data

Pre-parsed copies of the website's syllabus, GATE, holiday, grading, and result-coverage data for the native app. Everything here is generated — do not edit the JSON by hand.

## Regenerate

From the repository root:

```sh
uv run python native/scripts/extract.py
uv run python native/scripts/verify.py
```

`extract.py` uses only the Python standard library and is safe to rerun. It rewrites all `native/assets/data/*.json` files plus `manifest.json`. Set `SOURCE_DATE_EPOCH` for a reproducible `generatedAt`:

```sh
SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) uv run python native/scripts/extract.py
```

`verify.py` checks manifest counts, per-file counts, unique IDs, branch summaries, dates, grade thresholds, and documented gaps. It exits non-zero on failure.

## Files

| File | Entries | Contents |
|---|---:|---|
| `branches.json` | 6 branches | branch names, semesters, syllabus coverage, counts |
| `subjects-civil.json` | 71 subjects | Civil Engineering, semesters 1–6 |
| `subjects-cse.json` | 72 subjects | Computer Science, semesters 1–6 |
| `subjects-ece.json` | 42 subjects | ECE, semesters 1–5 |
| `subjects-ee.json` | 54 subjects | Electrical Engineering, semesters 1–5 |
| `subjects-eee.json` | 47 subjects | EEE, semesters 1,2,3,6 |
| `subjects-mech.json` | 57 subjects | Mechanical, semesters 1–6 |
| `gate.json` | 30 papers | 232 sections, 504 topics |
| `holidays.json` | 39 holidays | 2026 calendar |
| `grading.json` | 7 grades | BEU 10-point scale and pass rules |
| `colleges.json` | 52 colleges | 209 college/branch pairs, batches 21–25 |
| `manifest.json` | 11 datasets | paths, counts, timestamps, sources, gaps |

Totals: **343 subjects · 1,405 units · 2,324 topics · 19 subject stubs**.

## Shapes

Subject/unit/topic (`subjects-cse.json`):

```json
{"id":"cse-s1-100110","semester":1,"code":"100110","name":"Engineering Physics","type":"Theory","credits":3,"source":"src/assets/data/branches/cse.json","confidence":"high","unitCount":6,"topicCount":12,"units":[{"id":"cse-s1-100110-u1","number":1,"title":"Unit 1","topics":[{"id":"cse-s1-100110-u1-t1","title":"Frame of Reference","text":"Non-Inertial frame of reference, rotating coordinate system, …","hours":2}]}]}
```

GATE paper/section/topic:

```json
{"code":"CS","name":"Computer Science & Information Technology","source":"src/assets/data/gate/CS.json","confidence":"high","sectionCount":10,"topicCount":16,"sections":[{"id":"gate-cs-s1","number":1,"title":"Engineering Mathematics","topics":[{"id":"gate-cs-s1-t1","title":"Discrete Mathematics","text":"Propositional and first order logic. Sets, relations, …"}]}]}
```

Holiday:

```json
{"id":1,"name":"नव वर्ष","start":"2026-01-01","category":"festival","source":"src/pages/holidays-calendar.astro","confidence":"high"}
```

College/branch coverage:

```json
{"code":"102","name":"Vidya Vihar Institute of Technology, Purnea","source":"src/data/colleges.json","branches":[{"code":"105","name":"Computer Science & Engineering","slug":"cse","confidence":"high","source":"public/data/manifest/index.json; public/data/students_*.csv","batches":{"21":[8],"22":[5,6],"23":[3,4],"24":[1,2]}}]}
```

`manifest.json` entry:

```json
{"dataset":"subjects","branch":"cse","path":"subjects-cse.json","count":72,"generatedAt":"…","source":"src/assets/data/branches/cse.json"}
```

## Sources

- **Syllabus** — `src/assets/data/config.json`; `src/assets/data/branches/{civil,cse,ece,ee,eee,mech}.json`. `sylpy/*.json` is used only when a semester is absent from the branch file or a subject has no content; it is marked `confidence: "medium"`.
- **GATE** — `src/assets/data/gate-papers.json`; `src/assets/data/gate/*.json`; fallback `gatextract/gate/*.json` (including the combined `XE/XH/XL-2026.json` papers).
- **Holidays** — `src/pages/holidays-calendar.astro` (`holidays2026` array).
- **Grading** — `src/lib/calculator/engine.ts` (`BEU_GRADES`, marks split, ESE minimum).
- **Colleges** — `src/data/colleges.json`; `src/lib/beuReg.ts` (`collegeMap`, `branchMap`); `public/data/manifest/index.json`; live `https://beu.prit.eu.org/data/manifest/index.json`; `public/data/students_*.csv`; `public/data/wide_*.csv`.
- **Routine** — `src/pages/routine.astro` proxies a per-registration timetable; no static dataset was emitted.

Confidence: `high` = parsed directly from the primary source; `medium` = filled from the `sylpy` fallback; `none` = source has no syllabus text (subject stub or GATE paper with empty sections).

## Gaps and limitations

- **16 missing syllabus semesters**: CSE 7–8; ECE 6–8; EE 6–8; Mechanical 7–8; Civil 7–8; EEE 4,5,7,8. Branch records still advertise semesters 1–8.
- **19 subject stubs**: CSE 2, EE 8, Mechanical 5, Civil 3, EEE 1. These have `confidence: "none"`, `stub: true`, and `units: []` — no invented syllabus text.
- **26 topics are heading-only** (empty `text`); **18 subjects have no code** in the source (`code: "-"`). Credits are present for every subject.
- **8 GATE papers have no sections**: BM, DA, GE, GG, MA, PE, ST, XH. Their source PDFs are font-subset and the checked-in JSON has `sections: []`; each is listed in `manifest.gaps`. No PDF dependency was added.
- **Holidays**: only 2026 is machine-readable. The 2025 calendar exists only as `src/assets/holidays2025.png`.
- **Routine**: live per-student timetable, not stored.
- **CSV nit**: `public/data/students_*_sem0.csv` files are ignored because semester 0 is not a valid BEU semester.
- **Colleges**: 52 colleges from `src/data/colleges.json`; 8 extra `collegeMap` codes (115, 121, 168, 171–175) have no result rows and are omitted. `branchMap` also lists 106 (IT) and 107 (Leather) with no result rows, so they are absent from coverage. Branch 161 (EEE specialization) appears only for college 157, batch 25; its display name falls back to “Electrical & Electronics Engineering (161)”.
- **Source quality**: `src/assets/data/branches/ee.json` and `eee.json` contain an internal `branch: "ece"` value, but their subjects are EE/EEE. `src/assets/data/branches/cse copy.json` is ignored (no semesters). Neither source file was edited.
- **Live manifest**: merged when reachable; failure is recorded as a gap and does not fail generation.

## Validation

`verify.py` currently reports: **343 subjects · 1,405 units · 2,324 topics · 19 stubs · 30 GATE papers · 232 sections · 504 topics · 39 holidays · 7 grades · 52 colleges · 209 college-branches**, with all checks passing. Expected warnings: 26 heading-only topics and 18 subjects without a source code.
