# `results` — the data-heavy, highest-risk area

Results are the feature students judge the app by. Almost every bug here is a
data-provenance bug, not a layout bug.

## Four sources, one model

`ResultData` carries `source: "live" | "cache" | "csv"`; the UI says where a
number came from.

| Source | Path | Rule |
|---|---|---|
| Live JSON | `GET /api/result?reg=…&sem=…&format=json` | accept `{ status: 200, data }`; retry once only on `status 0`, never on 4xx/5xx |
| Saved copy | `beu.cache.result:<digits>:<sem>` | any age; a copy younger than 10 min skips the network |
| Published CSV | `students_<batch>_all_<branch>_sem<n>.csv`, `wide_<batch>_<college>_<branch>_sem<n>.csv` | roster = table/rank/merit; wide = one student, last resort |
| BEU captcha page | `results.web` in a WebView | the student solves it; the app reads the markup once and saves it |

`COVERAGE` in `data.ts` is the only list of real batch/branch/semester
combinations. Offer nothing outside it.

## Identity

`identity.ts` turns a registration number into a person, cheapest first:

1. `beu.cache.identity:<digits>` (permanent)
2. any saved result for that number, semester 8 down to 1
3. BEU's published roster for the batch + branch, newest three semesters

No match → the profile name or a nameless greeting. Never guess a name.

## Semester

**Derive, do not remember.** `currentSemester()` counts sessions from the
batch's admission (odd from July, even from January; the 2024 batch started in
January 2025). `defaultSem()` is a different question — the newest published
roster — and must never be a screen's default.

## Captcha rules

- The captcha is solved by the student in the page.
- The app never solves, bypasses, replays or outsources it.
- `results.web` injects a watcher that opens the semester row, fills `#reg`,
  waits for `app-result-three`, and posts the markup once via
  `window.nsh.postMessage`.
- A direct `/result-three` load is empty: the data is in Angular router state,
  so the watcher must walk the page.
- `parseResultHtml()` reads the markup without a DOM; `saveParsedResult()`
  writes the same cache key as the fast path.
- `results.portal` is the older JSON capture; keep it working, do not extend it
  unless the portal changes.

## Rank, merit, battle, table

- All four read the same roster/wide model; do not fork the maths.
- `ranking.ts` and `data.ts` are the pure functions; test them in `qa/unit/`.
- Never invent a rank, a tie-break or a CGPA. A missing row is missing.
- `results.table` prefs and `results.recent` are persisted — keep the keys.

## Files

| File | Owns |
|---|---|
| `data.ts` | URLs, coverage, fetch/normalise, cache, recent |
| `identity.ts` | reg → name/CGPA, cache |
| `parse-html.ts` | BEU's result page reader (no DOM) |
| `ranking.ts`, `trend.ts`, `verdict.ts` | pure ranking / trend / pass logic |
| `lookup.tsx`, `table.tsx`, `rank.tsx`, `merit.tsx`, `battle.tsx` | screens |
| `web.tsx`, `portal.tsx` | the two WebView captures |
| `colleges.ts`, `components.tsx`, `shared.tsx` | names and shared UI |

## Gate

`./scripts/check.sh test` plus `qa/results.test.tsx`, `qa/screens.test.tsx`
(the saved result opens offline) and `qa/unit/result-parse.test.ts`. A change to
a URL, a cache key or the parser is a contract change: update the tests in the
same commit.
