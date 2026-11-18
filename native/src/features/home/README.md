# Home — the front door

Home answers one question on launch: **what does this student do next?** It is
not a directory of every screen; it is four blocks in the order a day runs:

```
Today    the next class, the closest break or exam, one action
Study    syllabus · notes · previous papers · calculator · planner
Results  result · table · rank · merit · battle
Campus   notice strip · attendance · routine · holidays
```

A door with nothing to say says nothing: every number is read back from a store
another area wrote, never defaulted or invented. The notice strip is the only
part of Home that touches the network, and it shows the last copy it has when
offline.

## Files

| File | Owns |
|---|---|
| `index.tsx` | greeting, search door, the Today action, the route table |
| `tiles.tsx` | the Study / Results / Campus directory blocks |
| `pager.tsx` | the important-notice strip (auto-advance + refresh) |
| `state.ts` | reads the saved profile, course, routine, attendance, planner, result |
| `home.test.ts` | route, clock parsing and branch lookup |

## Routes

| Name | Params | Screen |
|---|---|---|
| `home` | — | `HomeScreen` |

Home is a tab root. It pushes, never embeds, other screens:

| Door | Target |
|---|---|
| Search | `search` (owned by `features/search`) |
| Syllabus | `syllabus` |
| Notes & VVI | `notes` with `{ branch, sem }` when a course is saved |
| Previous papers | `pyqs` |
| Calculator | `tools.calculator` |
| Study planner | `planner` with `{ branch, sem }` when known |
| Your result | `results` with `{ reg, sem }` of the newest saved result |
| Result table | `results.table` with `{ batch, branch, sem, reg }` read from the saved registration |
| University rank | `results.rank` with the same params |
| Merit list | `results.merit` with `{ branch, sem }` |
| Result battle | `results.battle` |
| Notice strip | `notices.detail` with `{ id }`; "All notices" → `notices` |
| Attendance | `tools.attendance` |
| Routine | `tools.routine` |
| Holidays | `tools.holidays` |
| Next action | its own route: `tools.routine`, `planner`, `results`, or `settings.profile` |

## Data

Home owns no endpoint. `state.ts` reads (async, hydrated once per refresh):

| Store key | Used for |
|---|---|
| `beu.profile` | name, registration number, course |
| `beu.syllabus.course` | fallback course |
| `beu.syllabus.studied` | topics ticked off for the saved course |
| `beu.tools.routine` | today's classes and whether a routine exists |
| `beu.tools.attendance` | the attendance percentage |
| `beu.planner` | the saved exam date |
| `beu.results.recent` (via `readRecent`) + `beu.cache.result:<reg>:<sem>` | the saved result and SGPA |
| `beu.cache.identity:<reg>` (via `cachedIdentity`) | the student's name from the roster |

The holiday countdown uses the bundled `assets/data/holidays.json`, so it works
with no connection. The notice strip is `features/notices/api.ts`, which fetches
`/api/notices/important?limit=20` and `/notices/` and caches both.

## States

- **First paint** — the greeting waits for the local reads (`ready()`), the
  action card shows a skeleton, and the strip shows three skeleton rows.
- **Ready** — each door's value is the live fact, or blank.
- **Error** — the strip keeps any rows it has and appends a retry; with no rows
  at all it shows the failure and a Try again button.
- **Empty** — no notices yet reads as "The board is quiet", not as a broken list.
- **Offline** — cached rows stay; the strip says "Offline copy · …" with a retry.

Pull-to-refresh on the page body refreshes the local reads and forces the notice
board fetch. The strip advances every five seconds until the student touches it,
then stays put for the visit. There is no background polling.

Returning to the app from the background re-reads the local stores and refreshes
the board only once it is past `BOARD_TTL` (five minutes, `features/notices/api.ts`);
a return inside that window does nothing, and a failed one keeps the rows on
screen with no error of its own — pull-to-refresh is what reports a failure.

## Notes

- **No tip line.** A rotating tip is filler the screen does not need; the
  holiday/exam countdown occupies that space with a real date.
- **No hero image.** The greeting uses type, the ember avatar and the saved
  name; nothing to download, nothing to crop at 320 pt.
- **Search is shared.** Home only opens `search`; notices and announcements are
  searched there too.

## Test

```sh
./scripts/check.sh test-only src/features/home/home.test.ts
```

> Repo convention puts tests in `qa/`; this suite lives here because the brief
> for this area asked for tests inside the feature folder. It is pure logic and
> imports only `index.tsx` / `state.ts`.
