# Result → Rank

Where a student's CGPA places them, shown on the page where they look up a
result. It is the one number BEU never gives a student, and the reason a
shared result link is worth more than a screenshot.

---

## What a student sees

On `/result`, the moment a registration number resolves, a band appears
**above** the result frame:

```
Batch 2023 · by CGPA 8.85                        Top 1%
Branch  #2  of 1,674        University  #27  of 5,422        ›
```

- It is one link — the whole band opens `/rank?reg=…`.
- The rank comes from our own CSVs, so it usually lands in a few hundred
  milliseconds, long before BEU answers (the result iframe can take 8–20s).
- No band is better than a wrong band: when there is no stored CGPA for that
  batch and semester, nothing renders and nothing is said.

---

## Where the numbers come from

`public/data/students_{batch}_all_{branch}_sem{n}.csv` — one file per branch,
every college, written by the scrapers in `pythonscripts/`.

```
Session,RegNo,Name,SGPA,Cur. CGPA,CollegeCode,CollegeName
2023-2027,23101108080,KUMAR ADITYANATH,9.49,8.85,108,"Government Engineering College, Sheikhpura"
```

7 branch files exist today: `101` civil, `102` mech, `103` ee, `104` ece,
`105` cse, `110` eee, `161` eee (a second eee code). A missing file is ignored,
never an error.

### Ranking rule

1. Drop rows whose `Cur. CGPA` is `N/A` — that is a student with no published
   result, not a student in last place. They are out of the ranking *and* out
   of the denominator (they are 44% of the roster; counting them would inflate
   every "of N").
2. Sort by CGPA desc, then SGPA desc, then registration number.
3. Competition ranking — equal CGPA holds the same position, and the next
   distinct CGPA takes its index + 1 (`8.85, 8.85, 8.80` → `1, 1, 3`).

This is the rule `/rank` already used. It now lives in one place, so the page
and the band cannot quote different numbers.

### One real limitation

The scrapers write the roster for **every** semester but fill `Cur. CGPA` only
for the batch's **current** one. Batch 23 sits in semester 4, so
`students_23_all_105_sem3.csv` exists with 5,151 rows and every CGPA is `N/A`.

Consequence, and it is the honest one: a rank is answerable only for the
semester the batch is actually in. Asking for an older semester returns
`no_data`, the band stays hidden, and `/rank` says "we don't have your data".
Do not "fix" this by reusing the current CGPA for an old semester — that would
rank a sem-8 CGPA against a sem-3 cohort.

---

## Code map

| File | Role |
| --- | --- |
| `src/lib/rank/lookup.ts` | The only ranking implementation. Parses the CSVs, caches per file, assigns ranks, returns `RankData`. |
| `src/pages/api/rank.ts` | `GET /api/rank?reg=&sem=` → JSON. Thin wrapper over `lookupRank`. |
| `src/pages/result.astro` | The band: markup, styles, `refreshRank()`, `renderRank()`. |
| `src/pages/rank.astro` | The full page. Picks the semester from the register, renders `lookupRank`. |
| `public/swwe.js` | Caches `/api/rank` with `/data/` (stale-while-revalidate), so a shared link opened offline still shows the rank. |

### Endpoint

```
GET /api/rank?reg=23101108080&sem=4
```

```jsonc
// GET /api/rank?reg=23101108080&sem=4  (real output, 2026-10)
{
  "status": 200,
  "data": {
    "reg": "23101108080",
    "name": "KUMAR ADITYANATH",
    "branchCode": "101",
    "branchName": "Civil Engineering",
    "branchShort": "Civil",
    "branchSlug": "civil",
    "collegeCode": "108",
    "collegeName": "Bhagalpur College of Engineering, Bhagalpur",
    "semester": 4,
    "batch": "23",
    "cgpa": 8.85,
    "sgpa": 8.5,
    "branchRank": 2,
    "branchTotal": 1674,
    "universityRank": 27,
    "universityTotal": 5422,
    "branchTopPercent": 1
  }
}
```

1,674 Civil students have a CGPA for batch 23 sem 4; 5,422 across all seven
branches. That first call parses seven CSVs (≈157 ms cold, ≈35 ms warm on the
dev machine); after that the file cache answers.

- `400` — register or semester unusable.
- `404` — `not_found` (register absent from the tables) or `no_data` (semester
  has no CGPA yet). Both are normal; the UI hides the band.
- `cache-control: public, max-age=300, s-maxage=3600`.

### Client behaviour

`loadResult()` calls `refreshRank(reg, selectedSem)` in parallel with the
result fetch. Every call takes a token (`rankRequest`); a response whose token
is stale is dropped, so typing quickly never leaves the previous student's rank
on screen. A short register (`< 8` digits) clears the band.

### Adding a batch

`SEMESTER_BY_BATCH` in `src/pages/rank.astro` maps the first two digits of the
register to the semester the batch is in:

```ts
const SEMESTER_BY_BATCH = { "21": 8, "22": 6, "23": 4, "24": 2, "25": 1 };
```

A 2026 batch needs `"26": 2` (or `1` when it starts) plus its CSVs from the
scraper. `/result` needs no change — it passes the semester the student picked.

---

## Verifying

```sh
BUN_COMPAT=off bunx astro build            # type + route check
curl -s 'localhost:4321/api/rank?reg=23101108080&sem=4' | python3 -m json.tool
```

Then open `localhost:4321/result?reg=23101108080&sem=4` and compare the band
with `localhost:4321/rank?reg=23101108080` — the two must read the same.

Anything about a **phone** (band wrapping at 360px, tap target, hover) still
has to be checked on real hardware, not a resized desktop window.

---

## Design notes

- The band sits **above** the result frame on purpose. Below it would be a
  scroll past a `min(90dvh, 1300px)` iframe — a payoff nobody reaches.
- Numbers use `--font-display` (Instrument Serif), the same serif numerals as
  `/rank`'s `.rank-stats`, so the two read as one feature.
- The percentile pill (`Top 1%`) is `--accent` on `--accent-soft`; it is the
  only saturated element in the band.
- `:hover` is gated behind `(hover: hover) and (pointer: fine)` so a tap on a
  phone never leaves a stuck hover state.
- The link carries an `aria-label` with the full sentence; the visible text is
  `#2` / `of 1,674`, which a screen reader would read badly on its own.
- **Astro trap:** the band is filled by `renderRank()`, so its children do not
  carry the scoped `data-astro-cid-*` attribute and plain `.rank-stat { … }`
  never matches them. Every inner selector is written
  `.rank-band :global(.rank-stat)`. Forget one and the element renders at the
  SVG/UA default — the first build of this card was 402 px tall because of it.
- Under 520 px the two stats become an aligned two-row table (labels share a
  column, numbers share an edge) instead of a wrapped flex line, and the
  chevron is dropped.
