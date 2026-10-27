# Architecture

How a screen becomes a native view, where state lives, and how data reaches it.
Read this before adding a feature folder.

- App root: `native/` · entry: `App.tsx` → `mount(Shell)`
- Framework: NativeShell (TSX on QuickJS, real platform views)
- Routes registered: **55** in `ALL_ROUTES` (thirteen modules, including the
  first-run `onboarding`), plus the shell-owned `more` screen (**56
  destinations**). Count verified against `src/app/registry.tsx` and every
  `src/features/*/index.tsx`, 2026-10-27.

## 1. The shape, in one picture

```
App.tsx ── apply saved appearance ── mount(Shell)
                                        │
┌──────────────── src/app/shell.tsx ────▼───────────────────────────────────┐
│ const stack = createNavStack<Route>([{ name: "home", params: {} }])        │
│                                                                           │
│ <NavStack state={stack} testID="root-stack">                              │
│   per route:  <NavPage title={title} header={<PageHeader …/>}>            │
│                  title    → Android / iOS system header                   │
│                  header   → app-drawn bar on macOS / Windows / Linux      │
│                  body     → definition.render(nav)  … or <NotFound/>      │
│               </NavPage>                                                  │
│ </NavStack>                                                               │
│                                                                           │
│ if the stack is at its root and no keyboard is up:                        │
│   <TabBar active={root} onSelect={setRoutes([{ name }])} />               │
└───────────────────────────────────────────────────────────────────────────┘
          ▲ route table                        ▲ nav object
          │                                    │
   src/app/registry.tsx                 src/app/router.ts
   ALL_ROUTES = [ …homeRoutes,          Route { name, params }
                  …feedbackRoutes,      Nav { route, push, pop,
                  …notesRoutes,             popToRoot, replace }
                  …onboardingRoutes,    RouteDef { name, title, render }
                  …plannerRoutes,
                  …searchRoutes,
                  …syllabusRoutes,
                  …resultsRoutes,
                  …studentsRoutes,
                  …pyqsRoutes,
                  …toolsRoutes,
                  …noticesRoutes,
                  …settingsRoutes ]
   ROUTE_MAP = byName(ALL_ROUTES)
   routeExists(name) = name === "more" || ROUTE_MAP[name]

   src/features/<area>/index.tsx ──exports──► <area>Routes: RouteDef[]
          │
          ├── src/ui/index.tsx   the "Ink & Ember" primitives
          ├── src/lib/net.ts     fetch, cache, Storage, formatting
          └── its own state / data / parsing files
```

Two headers is deliberate: Android and iOS draw the real system header, and the
desktop hosts have no system header, so the shell draws `PageHeader` (back
chevron + title) into the `NavPage`'s `header` slot. Both are always supplied.

## 2. Router, registry, NavStack

`src/app/router.ts` depends on no screen. It is the contract:

| Type | Meaning |
|---|---|
| `RouteParams` | `Record<string, string \| number \| undefined>` |
| `Route` | `{ name, params }` — a value you can store, pass and compare |
| `Nav` | what a screen may do: `push`, `pop(count?)`, `popToRoot`, `replace`, and read `route` |
| `RouteDef` | `name` (unique), `title(params)` (a string, never throws), `render(nav)` |

Helpers: `route(name, params)` for callers that prefer an object, `param(nav,
key)` (string, `""` when absent) and `numParam(nav, key)` (number, `0` when
absent or not numeric). Screens read route input through these two, never
through a cast.

`src/app/registry.tsx` is the single merge point: it spreads each area's
`RouteDef[]` into `ALL_ROUTES`, builds `ROUTE_MAP`, and answers `routeExists`.
`more` is the one exception — rendered by the shell from `src/app/more.tsx`,
intentionally absent from `ALL_ROUTES`, and `routeExists("more")` is true so the
tab and QA contract resolve it.

First run is the other shell-level gate. `Shell` reads `introDone()` (the
`beu.onboarding` flag) into an `intro` signal; a blank view covers the read, so
the first frame is never Home. While `intro` is `true` the shell renders
`OnboardingScreen` instead of the stack. The `onboarding` route is registered as
well, so QA can mount the screen directly; its `onDone` is a no-op because the
shell owns the transition.

`NavStack` supplies the behaviour that would otherwise be per-screen code:

- a page stays mounted while it is in the stack, so scroll position, inputs and
  signals survive a push and come back on pop;
- Android back, predictive back and the iOS swipe back pop the top page;
- `title` feeds the system header, `headerClass` its colours.

The tab bar replaces the whole stack (`stack.setRoutes([{ name, params: {} }])`),
so switching tabs lands on that tab's root with no stale history. It hides when
the stack is deeper than its root or the software keyboard is up
(`keyboardFrame().height`).

Route names are namespaced strings, not URLs. The dot is the area boundary
(`syllabus.subject`, `results.table`, `pyqs.paper`), and the prefix is how QA
maps a route back to the folder that owns it.

## 3. The feature-folder contract

```
src/features/<area>/
├── index.tsx      export const <area>Routes: RouteDef[]   ← the only required file
├── …screens.tsx   one screen per file when the area is large
├── data.ts        fetch + parse + normalise into one native model
├── state.ts       signals, persisted shapes, storage keys
└── *.ts           pure logic, no JSX (engine, parser, catalog)
```

Rules the code follows today:

1. **One export name per area.** `homeRoutes`, `feedbackRoutes`,
   `notesRoutes`, `onboardingRoutes`, `plannerRoutes`, `searchRoutes`,
   `syllabusRoutes`, `resultsRoutes`, `studentsRoutes`, `pyqsRoutes`,
   `toolsRoutes`, `noticesRoutes`, `settingsRoutes`. The registry imports
   exactly these.
2. **The area registers its own top-level route.** `syllabus` lives in
   `syllabus/index.tsx`, not in the shell. Sub-routes use `<area>.` prefixes;
   `data` and `data.table` are the one separate namespace, owned by `pyqs`.
3. **A screen takes `nav`.** It navigates with `nav.push("results.rank", { reg,
   sem })`; it never imports another screen and calls it.
4. **Pure logic is not in JSX.** `results/data.ts` (parsing, ranking),
   `results/identity.ts`, `pyqs/paper-parse.ts`, `tools/engine.ts` and
   `syllabus/parse.ts` are plain TS; that is where a new rule belongs.
5. **`index.tsx` is a route table, not a god file.** `pyqs/index.tsx` is 23
   lines: it spreads `browseRoutes`, `paperRoutes`, `gateRoutes`, `dataRoutes`,
   `dataTableRoutes`. A one-screen area (`home`, `onboarding`) may keep that
   screen in `index.tsx`; the rule bites once a folder has several screens.
6. **Aliases are routes too.** `attendance`, `routine`, `holidays`, `wifi` and
   `tools.feedback` are registered twice: the `tools.` name is what the app
   pushes, and the bare name is a compatibility alias for an old link or an
   external deep link. The render is the same component. `feedback` is the
   exception: More and search push the bare name, because the shell mounts its
   sheet and every `Body` ends with its footer; `tools.feedback` is the alias it
   keeps for older links. `data` and `data.table` are not aliases — they are
   pyqs' own namespace, pushed by More, search and `pyqs`.
7. **A `<List>` needs a height.** It is a scroll view: it takes its size from its
   parent's constraints, and inside a `Screen` there is nothing to inherit, so a
   list with no `class="flex-1"` (or an explicit `h-`) lays out at zero pixels.
   The failure is silent and total — the list's own `header` and `footer` vanish
   with it, so the route shows a title bar over a blank page. `scripts/
   lint-list-height.mjs` scans the source for it and `scripts/check.sh` runs the
   scan before the types. Never nest a `List` in a scrolling column: map the
   rows into a `View` instead, as `planner` does.
8. **`List` reads its `each` once.** It captures the array at first paint, so
   data that can arrive late (storage hydration, a fetch) never reaches it.
   Wrap the list in a reactive block — `{() => <List each={rows()} … />}` — or
   it stays empty forever.
9. **A `List` slot body runs once, too.** `header`, `footer` and `empty` are
   evaluated at mount, so an `if` chain at the top of one freezes on whatever
   was true then: `notices` showed its loading skeleton forever because the
   failed-fetch branch sat below `if (!loaded) return <Skeleton />`. Keep the
   slot's JSX static and put the branching in a call —
   `empty={() => <View class="flex-1">{() => boardEmpty()}</View>}` — where
   `boardEmpty()` reads the signals itself and therefore re-runs. The same
   applies to any element-shaped slot: `<BoardEmpty />` would mount a component
   whose body runs once.

### Generated data

`src/features/pyqs/catalog-data.ts` is the one generated file in the app: a packed
JSON wire form (95 KB instead of 319 KB) that `decode()` expands. Reproduce it with
`bun scripts/pack-pyq-catalog.mjs`. The script loads the file through its own
`decode`, so re-running is safe, and it refuses to write unless the round-trip is
identical. Two repairs live in that script because the generator is not in this
repository: ten papers whose year was `0` (recovered from `id`), and the five
Mechanical Sem 7 subjects BEU's paper archive has but the syllabus pack does not
(102701–102706, with their 2021–2022 papers, no invented marks or duration).

## 4. Every route

Params are the ones the screen actually reads; `?` means optional (a missing
value falls back to saved state). Titles are the strings `title(params)`
returns.

| # | Route | Params | Title | Implemented in |
|---:|---|---|---|---|
| 1 | `onboarding` | — (first run; shell-gated) | Welcome | `features/onboarding/index.tsx` |
| 2 | `home` | — | BEUConnect | `features/home/index.tsx` |
| 3 | `syllabus` | — (uses the saved course) | Syllabus | `features/syllabus/index.tsx` |
| 4 | `syllabus.subject` | `code`, `branch?`, `sem?` | the subject code | `features/syllabus/index.tsx` |
| 5 | `syllabus.search` | `q?` (seed) | Search syllabus | `features/syllabus/index.tsx` |
| 6 | `syllabus.saved` | — | Saved | `features/syllabus/index.tsx` |
| 7 | `syllabus.gate` | `paper?` (e.g. `CS`) | GATE syllabus | `features/syllabus/index.tsx` |
| 8 | `results` | `reg?`, `sem?` | `Semester N result` / Results | `features/results/lookup.tsx` |
| 9 | `results.table` | `batch?`, `branch?`, `sem?`, `reg?` | `<BRANCH> result table` | `features/results/table.tsx` |
| 10 | `results.rank` | `reg`, `sem` | `Rank · Semester N` | `features/results/rank.tsx` |
| 11 | `results.merit` | `batch?`, `branch?`, `sem?`, `reg?`, `college?` | `Merit · Semester N` | `features/results/merit.tsx` |
| 12 | `results.battle` | `a`, `b`, `sem` | `Battle · Semester N` | `features/results/battle.tsx` |
| 13 | `results.portal` | `reg?`, `sem?` | `BEU portal · Semester N` | `features/results/portal.tsx` |
| 14 | `results.web` | `reg?`, `sem?` | `BEU page · Semester N` | `features/results/web.tsx` |
| 15 | `pyqs` | `q?` (seed) | Previous papers | `features/pyqs/browse.tsx` |
| 16 | `pyqs.paper` | `slug`, `year`, `code`, `variant`, `id`, `title`, `name`, `pdf`, `branch`, `sem` | `<year>[ · VARIANT]` | `features/pyqs/paper.tsx` |
| 17 | `pyqs.site` | `slug`, `name?`, `anchor?` | `name` / Subject papers | `features/pyqs/paper.tsx` (in-app BEU subject page) |
| 18 | `pyqs.pdf` | `url`, `title` | `title` / PDF | `features/pyqs/paper.tsx` |
| 19 | `pyqs.gate` | `code` **or** `url` + `title`, `subtitle`, `file`; `q?` | paper name / GATE papers | `features/pyqs/gate.tsx` |
| 20 | `data` | `q?` (seed) | Data browser | `features/pyqs/data.tsx` |
| 21 | `data.table` | `batch`, `branch`, `sem`, `college` (all required) | `<College> · Sem N` | `features/pyqs/data-table.tsx` |
| 22 | `tools` | — | Tools | `features/tools/index.tsx` |
| 23 | `tools.calculator` | — | Calculator | `features/tools/index.tsx` |
| 24 | `tools.attendance` | — | Attendance | `features/tools/index.tsx` |
| 25 | `tools.routine` | — | Routine | `features/tools/index.tsx` |
| 26 | `tools.holidays` | — | Holidays | `features/tools/index.tsx` |
| 27 | `tools.wifi` | — | Wi-Fi help | `features/tools/index.tsx` |
| 28 | `tools.feedback` | `from?` (where it was opened) | Feedback | `features/feedback/index.tsx` |
| 29 | `attendance` | — | Attendance | alias in `features/tools/index.tsx` |
| 30 | `routine` | — | Routine | alias in `features/tools/index.tsx` |
| 31 | `holidays` | — | Holidays | alias in `features/tools/index.tsx` |
| 32 | `wifi` | — | Wi-Fi help | alias in `features/tools/index.tsx` |
| 33 | `feedback` | `from?` (where it was opened) | Feedback | `features/feedback/index.tsx` (alias of `tools.feedback`) |
| 34 | `notices` | `id?` (opens that notice) | Notices / notice title | `features/notices/index.tsx` |
| 35 | `notices.detail` | `id` | notice title | `features/notices/index.tsx` |
| 36 | `notices.announcements` | — | Announcements | `features/notices/index.tsx` |
| 37 | `notices.post` | `slug` | post title | `features/notices/index.tsx` |
| 38 | `notices.search` | — | Search | `features/notices/index.tsx` |
| 39 | `notices.pdf` | `url`, `title` | `title` | `features/notices/index.tsx` (viewer from `notices/pdf.tsx`, `scope="beu"`) |
| 40 | `settings` | — | Settings | `features/settings/index.tsx` |
| 41 | `settings.profile` | — | Profile | `features/settings/index.tsx` |
| 42 | `settings.appearance` | — | Appearance | `features/settings/index.tsx` |
| 43 | `settings.reminders` | — | Reminders | `features/settings/index.tsx` |
| 44 | `settings.storage` | — | Storage | `features/settings/index.tsx` |
| 45 | `settings.about` | — | About | `features/settings/index.tsx` |
| 46 | `settings.offline` | — | Offline data | `features/offline/index.tsx` |
| 47 | `notes` | `branch?`, `sem?` (seed) | Notes & VVI | `features/notes/index.tsx` |
| 48 | `notes.subject` | `branch`, `sem`, `code`, `name?` | subject name | `features/notes/index.tsx` |
| 49 | `planner` | `branch?`, `sem?` | Study planner | `features/planner/index.tsx` |
| 50 | `search` | `q?`, `kind?` (seed) | Search | `features/search/index.tsx` |
| 51 | `students` | — | Students | `features/students/index.tsx` |
| 52 | `students.college` | `college?` | college name / `College N` | `features/students/index.tsx` |
| 53 | `students.branch` | `branch?`, `college?` | `<BRANCH> students` | `features/students/index.tsx` |
| 54 | `students.student` | `reg?` | the student's name | `features/students/index.tsx` |
| 55 | `students.leads` | — | Top by CGPA | `features/students/index.tsx` |
| — | `more` (shell) | — | More | `src/app/more.tsx` |

## 5. State

`nsh` provides the whole model; there is no store library.

| Tool | Use |
|---|---|
| `signal(initial)` | one reactive value: read `v()`, write `v.set(x)` or `v.update(fn)` |
| `computed(fn)` | derived value, recomputed only when an input changes |
| `effect(fn)` | side effect that re-runs when what it read changes; the returned function is cleanup |
| `cleanup(fn)` | teardown for the enclosing page or effect (use after `void promise()`) |
| `batch(fn)` | several writes, one re-render |

Placement decides lifetime:

- **Page state** — a signal created inside the component (`lookup.tsx`'s
  `state`, `portal.tsx`'s `phase`) dies with the page. A pushed page never
  unmounts, which is why its input is still there when you pop back.
- **Area state** — a module-level signal outside the component
  (`syllabus/index.tsx`'s `studied`, `home/state.ts`'s `identity`). It survives
  navigation within the session and is hydrated once from Storage.
- **Persistence** — `Storage` from `nsh/storage`, through `readStore` /
  `writeStore` / `removeStore` in `src/lib/net.ts`. Every call is a Promise:
  `await Storage.getItem(key)`. A `.then`-free `Storage.getItem(...)` used as a
  string is the classic bug here.

Two prefixes keep keys sane: app state is `beu.<key>` (`readStore` adds it),
network cache is `beu.cache.<key>` (`putCache` adds it).

**The semester is derived, not remembered.** `beu.profile` stores a semester, but
it is the student's declaration: the app works out what class they are in from
the registration number. BEU runs two semesters a year — odd from July, even
from January — so a batch's first semester starts in the July of its admission
year; the 2024 batch is the exception, its first semester began in January 2025.
`currentSemester()` in `results/data.ts` counts sessions from that start, which
is why a batch-24 student is in **Sem 4**, a 25 in **Sem 3**, a 26 in **Sem 1**
and a 23 in **Sem 7** today. Never default a screen to `defaultSem()`, which
answers a different question: the newest roster BEU has *published*, and
publication lags the class by one or two semesters.

| Key (`beu.` prefix) | Written by | Holds |
|---|---|---|
| `profile` | `settings/profile.ts` | name, registration number, branch, semester |
| `onboarding` | `features/onboarding/index.tsx` | `{ done, skipped, at }` — first-run gate read by the shell |
| `appearance` | `settings/prefs.ts` | `light` / `dark` / `system` |
| `reminders.v1` | `settings/prefs.ts` | `{ classes, times, holidays }` |
| `syllabus.course`, `.saved`, `.studied` | `syllabus/index.tsx` | course, bookmarked subjects, ticked topics |
| `tools.calculator`, `.calculator.extras`, `.attendance`, `.routine`, `.wifi` | `tools/state.ts` (`KEYS`) | the toolkit's saved work |
| `feedback.draft`, `feedback.memory` | `features/feedback/state.ts` | the unsent report and the last five that were sent |
| `tools.attendance.gecs` | `tools/gecs.ts` | last GECS register snapshot: papers, counts, registration number and fetch time; no mobile. Cleared by Attendance reset. |
| `results.recent`, `results.table.prefs` | `results/data.ts` | last lookups, table selection |
| `pyqs.recents.v1`, `pyqs.prefs.v1` | `pyqs/state.ts` | recent papers, branch/semester |
| `notices.read.v1` | `notices/api.ts` | which notices and announcements were opened (posts are keyed `a:<slug>`) |
| `notices.searches.v1` | `notices/parts.tsx` | recent searches |
| `notes.course`, `planner`, `search.recent` | `notes/data.ts`, `planner/index.tsx`, `search/index.tsx` | Notes' chosen course, the study plan, and the last eight searches |

Cache keys (`beu.cache.` prefix), all through `lib/net.ts`:

| Key | Holds |
|---|---|
| `result:<digits>:<sem>` | one saved result (live, CSV or captcha) |
| `identity:<digits>` | resolved name / CGPA, no expiry |
| `roster:<batch>:<branch>:<sem>` | a published branch roster |
| `wide:<batch>:<college>:<branch>:<sem>` | a published per-student wide table |
| `pyqs.manifest.v1`, `pyqs.csv.<id>`, `pyqs.page.<slug>` | data browser + paper pages |
| `notices.board.v1`, `notices.important.v1`, `announcements.feed.v1` | the three notice feeds |
| `announcement.<slug>.v1` | one announcement post's page |
| `announcements.bodies.v1` | the newest 24 post bodies, so search works offline |
| `notes.manifest` | the Notes & VVI manifest (`/data/notes.json`) |

Settings › Storage (`settings/storage.tsx`) measures these and clears them in
groups: downloaded tables (`wide:` / `roster:`), saved results (`result:`),
`beu.syllabus.studied`, `beu.notices.read.v1`, then every other `beu.cache.*`.
Profile, appearance, onboarding, reminders, attendance, calculator, bookmarks
and recents are in the "Kept" remainder and are never removed from that screen.

## 6. The data layers

Four upstream shapes fold into one native model (`ResultData`, `RankRow`,
`Identity`); `source` is part of the model, so the UI can say where a number came
from.

```
        fast path                              published path
 GET /api/result?…&format=json      GET /data/students_{batch}_all_{branch}_sem{n}.csv
 (site → BEU, retried once)         GET /data/wide_{batch}_{college}_{branch}_sem{n}.csv
        │                                      │
        ▼                                      ▼
   payloadFrom()                    csvRecords() → wideFromRecord() / rank()
        │                                      │
        └───────────────┬──────────────────────┘
                        ▼
             ResultData { source: live | cache | csv }
                        ▼
      Storage: beu.cache.result:<digits(reg)>:<sem>

  bundled assets                  BEU's own result page (results.web)
  assets/data/*.json              /result-one → /result-two → /result-three
  (syllabus, GATE, holidays,      injected watcher → postMessage(html)
   colleges, grading)             → parseResultHtml() → saveParsedResult()
                                  → the same cache key as the fast path
```

1. **Live JSON** — `loadResult(reg, sem)` calls
   `SITE/api/result?reg=…&sem=…&format=json`, accepts `{ status: 200, data }`,
   and retries once only when the failure was a network failure (`status 0`); a
   4xx/5xx is deterministic and is not retried.
2. **Saved copy** — the same call reads Storage with `cacheMaxAge: 0`. Anything
   ever seen (live, CSV or captcha) is here, so a second visit is instant and
   works offline; a copy younger than ten minutes skips the network entirely.
3. **Published CSV** — `students_{batch}_all_{branch}_sem{n}.csv` is the whole
   branch roster: table, rank, merit and identity. `wide_{batch}_{college}_{branch}_sem{n}.csv`
   is one student with per-paper ESE / IA / total / grade, eight-semester SGPA
   history, state rank and college rank, and is the last resort for a result
   while BEU's API is down. `COVERAGE` in `results/data.ts` lists which
   batch/branch/semester tables exist, so the app offers only real combinations.
4. **The captcha page** — BEU now answers its token endpoint with
   `403 CAPTCHA verification required.` and puts Cloudflare Turnstile in front of
   its result page, so `results.web` (`features/results/web.tsx`) is the path that
   works: it loads `https://beu-bih.ac.in/result-one` in a `WebView`, and an
   injected watcher opens the row for the student's semester, fills `#reg`, waits
   for the result and posts the markup of `app-result-three` once to the native
   side via `window.nsh.postMessage`. The three result routes are one Angular
   document and the data is in router state, so a direct `/result-three` load is
   empty — the watcher has to walk the page. `parseResultHtml()`
   (`features/results/parse-html.ts`) reads that markup without a DOM and
   `saveParsedResult()` writes the same cache key as the fast path. The captcha is
   solved by the student in the page; the app never solves, bypasses or replays
   it. `results.portal` (`features/results/portal.tsx`) keeps the older JSON
   capture: it hooks the portal's `result/get-result` XHR/fetch on `/result-three`
   and normalises the payload with `payloadFrom()` / `captureResult()`.
5. **Identity** — `results/identity.ts` turns a registration number into a
   person, cheapest first: the identity cache (`identity:<digits>`, permanent) →
   any result already saved for that number (semester 8 down to 1) → BEU's
   published roster for the batch + branch, newest three semesters, first `RegNo`
   match. `results/data.ts` writes the cache whenever it produces a result, so
   live, CSV and captcha all update Home in the same step. Home renders the name
   through an expression child (`{() => <Hero … whoIs={identity()} …/>}`) because
   the answer arrives after first paint; the hero's greeting and avatar initial
   re-read it. With no match, Home falls back to the profile name or a nameless
   greeting — never a guessed name.
6. **Bundled data** — `assets/data/manifest.json` + 12 files: six subject packs
   (343 subjects, 1,405 units, 2,324 topics), 30 GATE papers, 39 holidays, 52
   colleges, 7 grades and the GEC register. Generated by `scripts/extract.py`,
   packed by `scripts/data/build-packs.ts` and validated by `scripts/verify.py` /
   `scripts/data/verify-packs.ts` — never edited by hand.
7. **Live feed** — the published difference over step 6: a ~2 KB manifest plus
   content-addressed payloads at `https://beu.prit.eu.org/data/app/`, applied
   whole or not at all (`src/features/data-feed/`). A corrected topic or a new
   paper year reaches every installed app without a store release, while
   unchanged prose keeps the hash this build already carries and costs no bytes.
   Published by `scripts/data/publish-feed.ts`; see `docs/OFFLINE.md`.
8. **Notes** — `notes` fetches `https://beu.prit.eu.org/data/notes.json`, one
   manifest of subjects, VVI topics and PDF links, into
   `beu.cache.notes.manifest`. A copy younger than 30 minutes renders with no
   request; an older copy renders at once and refreshes behind the screen, and a
   failed refresh keeps the old copy labelled as offline. Written by
   `scripts/notes/build-notes.py`; a subject absent from the manifest has no
   notes rather than invented ones. The planner and search write nothing
   upstream: the planner reads the syllabus packs, and search indexes those plus
   the notices and dataset lists already on the device.

`scripts/verify-identity.ts` repeats step 5 against the live roster with no app
runtime and prints the name, SGPA, CGPA and college the app will show.

## 7. Network

`src/lib/net.ts` is the only place that calls `fetch`.

```ts
export const SITE = "https://beu.prit.eu.org";

fetchText(url, { timeout = 20_000, headers, cacheKey, cacheMaxAge = 10 * 60_000 })
fetchJson<T>(url, options)          // fetchText + JSON.parse
postJson<T>(url, body, timeout)     // POST application/json
```

- **Timeout** — every request is raced against a timer and rejects with
  `NetError(..., 0)`, so a hung BEU server cannot freeze a screen.
- **In-flight dedupe** — `fetchText` keeps `Map<key, Promise<string>>`; a second
  call with the same cache key joins the first instead of firing again.
- **Cache** — on success a request with `cacheKey` writes
  `beu.cache.<key> = { at, value }`; on failure it returns the cached string when
  it is younger than `cacheMaxAge`, otherwise rethrows. `cacheMaxAge: 0` means
  "any age" and is how saved results and rosters survive a dead connection.
- **Retries live in the callers.** `fetchText` itself does not retry;
  `results/data.ts` retries only `status 0`, `notices/api.ts` and `pyqs/api.ts`
  retry once with a short sleep.
- **Errors** — `NetError` carries an HTTP status; `httpMessage(status)` turns it
  into a sentence and screens render that through `ErrorState`, never a stack
  trace.

Hosts are allowlisted in `nsh.json`:

- `capabilities.network.hosts`: `beu.prit.eu.org` (every fetch),
  `beu-bih.ac.in` (the portal host), `rptbalyjcevtxoxyvzli.supabase.co` (GECS
  attendance).
- `capabilities.webview.hosts`: `beu.prit.eu.org`, `beu-bih.ac.in`,
  `www.beu-bih.ac.in`, `beu.ac.in`, `www.beu.ac.in` (portal and PDFs),
  `challenges.cloudflare.com` for the Turnstile widget the result page loads,
  `www.google.com`, `www.gstatic.com`, `recaptcha.google.com` for the reCAPTCHA
  the portal loads, and `docs.google.com`, `docs.googleusercontent.com`,
  `ssl.gstatic.com` for the Google Docs viewer used where the platform cannot
  paint a PDF itself.

A missing webview host is not a retryable network error: the navigation is
refused before it starts, `onError` fires, and `results.web` / `results.portal`
say the page did not load. See `docs/ANDROID.md` §4.

### The system-browser handoff

nsh 0.3.0 added `openUrl` (from `nsh`): it hands a URL to another app, an
`ACTION_VIEW` intent on Android. The app's single helper, `openExternal()` in
`src/features/notices/parts.tsx`, calls it and returns whether the handoff
happened; when it throws — no handler, or a scheme the capability does not
grant — the caller copies the link instead. Every caller goes through that
helper; no screen reaches for the call directly.

The intent is only allowed for the schemes `nsh.json` grants:

```jsonc
"capabilities": { "openUrl": { "schemes": ["https", "http", "tel", "mailto"] } }
```

Adding a scheme (say `upi`) means editing that list, or the call fails.

Still true, and worth remembering before planning a feature:

- A link out leaves the app: no address bar, no tab, and the student comes back
  to the same screen. For anything the app must keep its place in (the result
  portal, a PDF) use an in-app `WebView`, whose host also needs an entry under
  `capabilities.webview.hosts`.
- The syllabus topic actions in `src/features/syllabus/parts.tsx` stay "Notes"
  and "Papers" — real routes inside the app — rather than an "Ask AI" or
  "Watch" chip.

### Capabilities are a whitelist

An app **with** a `"capabilities"` block may do only what it lists; everything
else is denied at runtime, silently. The 0.3.0 migration found two that had been
missing since the first package: `clipboard` (every "copy" button in the app was
a no-op) and `openUrl`. When a native call starts returning nothing, check this
block before the call site.

## 8. Theming

`nsh.json` declares the whole palette; no screen reads a hex literal.

```jsonc
"theme": { "cssVars": {
  "theme": { "radius": "1.25rem", "font-sans": "System" },
  "light": { "background": "#FBF8F4", "foreground": "#17130F",
             "primary": "#E4572E", "accent": "#0E6B5C", … },
  "dark":  { "background": "#0E0C0A", "foreground": "#F6F1EA",
             "primary": "#FF7A4D", "accent": "#123B34", … }
}},
"tailwind": { "radius": { "card": 20, "hero": 28 } }
```

- A token is used as a class: `bg-background`, `text-foreground`,
  `border-border`, `bg-primary/10`, `text-muted-foreground`. Light and dark use
  the same class; the appearance picks the value. There is no `dark:` class
  variant in this codebase.
- `token("primary")`, `token("accent")`, `token("border")` read the live value
  where a class cannot go — `Ring` passes them into a `Canvas` draw callback.
- Radii: `rounded-3xl` (24 pt) for cards and rows, `[26px]`/`[28px]` for the tab
  bar and hero; hairline `border-border`, no shadows.
- The look is "Ink & Ember": warm paper, near-black ink, one ember (`primary`),
  one deep teal (`accent`), amber (`chart-3`) for highlights. `src/ui/index.tsx`
  is the only place allowed to encode it, with one exception:
  `features/settings/appearance.tsx` keeps five hexes per scheme for the three
  side-by-side previews, which must show every scheme at once and so cannot use
  the live tokens.
- `setColorScheme("light" | "dark" | "system")` from `nsh` flips every token at
  once. The choice is persisted as `beu.appearance`; `App.tsx` applies
  a stored `light` / `dark` before mount (no light flash on a dark launch),
  `system` leaves the platform default, and `settings/prefs.ts` applies every
  later change.
- `nsh test` prints `unknown class` for `text-primary-ink`, `text-accent-ink`
  and `border-border-strong`. It is a false positive in the 0.3.0 build's class
  check (`nsh check` is clean, and the tokens resolve in both schemes: verified
  with `app.spanStyle` — `#B0401D` light, `#FF7A4D` dark). The check reads
  `primary-ink` as the token `primary` with the shade `-ink`, because our extra
  tokens share a prefix with a shadcn token. Re-spelling them
  (`text-(--primary-ink)`, `border-(color:--border-strong)`) warns the same, so
  keep the readable spelling and ignore the line.
- `bun scripts/contrast.ts` gates the token pairs at WCAG 4.5:1 for text and
  3:1 for controls; run it after any theme edit.
