# Site ↔ native parity

Snapshot: **2026-10-27** · site `https://beu.prit.eu.org` · app `native/`
Site side read from `src/pages/**`: **36 files — 33 page files + 3 API
endpoints**. App side read from `src/app/registry.tsx` + every feature module:
**55 registered routes** across thirteen modules (including the first-run
`onboarding`), plus the shell-owned `more` screen.

Statuses: **done** = the feature exists natively and does the same job ·
**partial** = exists, one capability is missing or narrowed ·
**different-by-design** = same need, deliberately another interaction ·
**not planned** = the native app does not need it.

| # | Site feature | Native route | Status | Implemented in |
|---:|---|---|---|---|
| 1 | `/` home: tiles, latest notices | `home` | done | `features/home/index.tsx` |
| 2 | `/result`: lookup, BEU page in an **iframe** | `results` + `results.web` | done | `features/results/lookup.tsx`, `web.tsx` |
| 3 | `/result-table`: branch roster ranked by CGPA | `results.table` | done | `features/results/table.tsx` |
| 4 | `/rank`: one student's branch + college standing | `results.rank` | done | `features/results/rank.tsx` |
| 5 | `/merit-list`: toppers by branch/semester | `results.merit` | done | `features/results/merit.tsx` |
| 6 | `/battle`: 1v1 result comparison | `results.battle` | done | `features/results/battle.tsx` |
| 7 | `/calculator`: SGPA, CGPA, target planner | `tools.calculator` | done | `features/tools/index.tsx` |
| 8 | `/attendance`: subjects, target %, safe-bunk maths | `tools.attendance` | partial — no JSON file import/export; counts sync from the GECS register | `features/tools/index.tsx`, `features/tools/gecs.ts` |
| 9 | `/routine`: timetable resolved from a registration number | `tools.routine` | done | `features/tools/index.tsx` |
| 10 | `/holidays`: 2025 + 2026 calendar **images** | — | not planned | superseded by #11 |
| 11 | `/holidays-calendar`: interactive 2026 calendar | `tools.holidays` | done | `features/tools/index.tsx` |
| 12 | `/wifi`: drag-to-toolbar bookmarklet generator | `tools.wifi` | different-by-design | `features/tools/index.tsx` |
| 13 | `/notices`: scraped BEU board, important filter, PDF links | `notices`, `notices.detail` | done | `features/notices/index.tsx` |
| 14 | `/notice-board`: curated static notices | `notices` (merged feed) | done | `features/notices/api.ts` |
| 15 | `/announcements`, `/[slug]`: editorial posts | `notices.announcements`, `notices.post` | done | `features/notices/index.tsx` |
| 16 | `/data-browser`: filter/sort/export any published dataset | `data`, `data.table` | done | `features/pyqs/data.tsx`, `data-table.tsx` |
| 17 | `/listofstudents`, `/[college]`, `/gecs`, `/gecscv`: college directory | `students`, `.college`, `.branch`, `.student`, `.leads`; `data` | partial — the GEC Sheikhpura directory exists, but nothing in More or search links to it yet; other colleges are reachable only as datasets | `features/students/index.tsx`, `features/pyqs/data.tsx` |
| 18 | `/syllabus`, `/[branch]`, `/[branch]/[sem]`, `/x` | `syllabus`, `.subject`, `.search`, `.saved` | done | `features/syllabus/index.tsx` |
| 19 | `/gate-syllabus`, `/[paper]`: 30 papers | `syllabus.gate` | done | `features/syllabus/index.tsx` |
| 20 | `/gate-pyqs`, `/[branch]`: GATE PDFs | `pyqs.gate` | done | `features/pyqs/gate.tsx` |
| 21 | `/pyqs`, `/[subject]`: one page per subject shelf | `pyqs`, `pyqs.paper`, `pyqs.site`, `pyqs.pdf` | done | `features/pyqs/browse.tsx`, `paper.tsx` |
| 22 | `/api/result`: server-side BEU fetch | results data layer, `results.web` | partial — upstream now demands a captcha (§1) | `features/results/data.ts`, `web.tsx`, `parse-html.ts` |
| 23 | `/api/notices/important` | `notices`, Home ticker | done | `features/notices/api.ts` |
| 24 | `/api/feedback`: bug / wrong-data / idea reports | `feedback` (alias `tools.feedback`) | done | `features/feedback/index.tsx` |
| 25 | `/404` | not-found screen | done | `src/app/coming-soon.tsx` |
| 26 | PWA: manifest, service worker, install banner | — | not planned | the native app is the install |
| 27 | SEO: OG images, JSON-LD, sitemap | — | not planned | no crawler surface in an app |
| 28 | — (native-only) | `notes`, `notes.subject` | done | `features/notes/index.tsx` |
| 29 | — (native-only) | `planner` | done | `features/planner/index.tsx` |
| 30 | — (native-only) | `search` | done | `features/search/index.tsx` |

Counts: **23 done · 3 partial · 1 different-by-design · 3 not planned**.

## 1. The result path: the captcha page

BEU gates its own result token behind a reCAPTCHA, so the site's server-side
lookup cannot finish on its own:

```
GET https://beu-bih.ac.in/backend/v1/result/token
→ 403 {"message":"CAPTCHA verification required."}            (2026-10-26)

GET https://beu.prit.eu.org/api/result?reg=…&sem=…&format=json
→ 502 {"status":502,"message":"Target server returned status 530. …"}
```

The native app still tries the fast path first, then this phone's saved copy,
then the published `wide_*.csv` row. When all three miss, the error state offers
**`results.web`** — the only honest way through.

`features/results/web.tsx` is that screen. BEU's result flow is three Angular
routes in one document:

```
/result-one                 the published exam list, one clickable row each
/result-two/:exam?d=<b64>   that exam's form: #reg, Turnstile, "Show Result"
/result-three?d=<b64>       the result, handed over in Angular router state
```

1. The WebView opens `https://beu-bih.ac.in/result-one` at phone size, with the
   registration number and semester in the route params.
2. `injectedJavaScript` installs one watcher for the whole visit (an Angular
   route change is not a document load). It opens the `<ordinal> Semester
   Examination` row for the student's batch, skips supplementary and backlog
   rows, fills `#reg` once and never overwrites an edit, and reports BEU's own
   `.alert-danger` text.
3. When `app-result-three` holds the result, it posts
   `{kind:"result", html}` exactly once and stops polling.
4. `parseResultHtml()` (`features/results/parse-html.ts`) reads that markup with
   no DOM and no dependencies — tables first, then label/value pairs, then the
   SGPA table's own semester column — and returns `null` rather than guessing.
5. `saveParsedResult()` writes the **same** cache key
   (`beu.cache.result:<digits>:<sem>`) and the **same** `ResultData` shape, so
   rank, battle, merit, recents and Home treat it as an ordinary result. The
   screen then swaps the WebView for `<ResultView>` and offers "Open in Results".

The student solves the captcha in the page. The app never solves, bypasses,
replays or farms a token; it only reads the result the student already earned.

`features/results/portal.tsx` is the older JSON capture, kept for direct links:

1. Loads `https://beu-bih.ac.in/result-three` in a native `WebView`.
2. Injects `CAPTURE_HOOK` through `injectedJavaScriptBeforeContentLoaded`, i.e.
   before the page's own scripts: it wraps `XMLHttpRequest.prototype.open/send`
   and `window.fetch`, and for any URL containing `result/get-result` posts
   `JSON.stringify({ url, body })` with `window.nsh.postMessage`. ES5, defensive,
   no DOM scraping.
3. `onMessage` unwraps `body` and calls `payloadFrom()` (`results/data.ts`),
   which walks `{status, data}` envelopes (up to four levels) or takes a bare
   payload and accepts a body only when **some** payload marker is present:
   `redg_no`, `name`, `semester`, `theorySubjects`, `practicalSubjects`, `sgpa`
   or `cgpa`. An error body has none, so it is never cached.
4. `captureResult(reg, sem, payload)` normalises with the **same**
   `fromPayload()` the live path uses and writes the **same** cache key
   (`beu.cache.result:<digits>:<sem>`), so rank, battle, merit and recents treat
   it as an ordinary result.
5. The screen switches from the WebView to `<ResultView>` and offers
   "Open in Results". Before the capture lands it offers "Copy my registration
   number" and fills the form, but never touches the captcha.

The student solves the captcha in the page. The app never solves, bypasses,
replays or farms a token; it only reads the result the student already earned.
After 10 seconds without a captcha widget that older hook posts
`{probe:"nocaptcha"}`,
so the screen can say the challenge itself did not load.

`nsh.json` must allow every host the WebView navigates to:

```jsonc
"webview": { "hosts": [
  "beu.prit.eu.org",
  "beu-bih.ac.in", "www.beu-bih.ac.in",
  "beu.ac.in", "www.beu.ac.in",
  "challenges.cloudflare.com",
  "www.google.com", "www.gstatic.com", "recaptcha.google.com",
  "docs.google.com", "docs.googleusercontent.com", "ssl.gstatic.com"
] }
```

The three Google hosts are the reCAPTCHA endpoints the portal's form loads; the
last three are the Google Docs viewer Android's WebView falls back to for a PDF.
A web view checks top-level navigations, so a missing host means the portal (or
its challenge) never loads and `onError` shows "The portal did not load." — a
configuration bug, not a network failure. See `docs/ANDROID.md` §4.

## 2. Identity: a registration number becomes a person

Site-side, a student sees their name only after BEU answers. The app resolves it
first, so Home can greet them before any result request:

```
registration number
        │  parseReg(): SS = batch, BBB = branch, CCC = college
        ▼
1. identity cache          beu.cache.identity:<digits>          (permanent)
2. a saved result          beu.cache.result:<digits>:<sem>, sem 8 → 1
3. a published roster      students_<batch>_all_<branch>_sem<n>.csv,
                           newest three published semesters, first hit wins
```

`src/features/results/identity.ts` owns the order and writes the cache;
`src/features/results/data.ts` writes it too, so every producer — live, CSV or
captcha — updates Home in the same step that updates Results. There is no fourth
step: when nothing matches, Home falls back to the profile name or a nameless
greeting, and nothing is guessed from the number.

Where the resolved identity shows up:

| Screen | Use |
|---|---|
| `onboarding` | FOUND state: the resolved name, branch and college before the profile is saved |
| `home` | `Good morning, Prit.` plus branch · college, and the avatar initial |
| `results` | heading `Prit Kumar · semester 2` while the result itself loads |
| `results` (view) | fills the name when a published table row carries marks but no name |

Home reads the name inside an expression child —
`{() => <Hero who={profile()} whoIs={identity()} …/>}` — because the answer lands
after first paint: only expressions inside the tree re-read the signal, so the
greeting and the avatar initial update when the roster arrives. A `const first`
above the JSX would freeze the greeting for the life of the screen.

Verified against the live roster 2026-10-27:

```sh
bun scripts/verify-identity.ts
→ https://beu.prit.eu.org/data/students_24_all_105_sem2.csv
✓ semester 2: Prit Kumar · SGPA 6.2 · CGPA 6.6 · Government Engineering College, Sheikhpura
```

## 3. Different by design, and what is dropped

| Site thing | What the app does instead | Why |
|---|---|---|
| `/wifi` bookmarklet: drag a `javascript:` link to the toolbar | Same logic, built as a **copyable snippet**, plus steps and copy buttons for the number / portal address / password. The password is never persisted. | Phone browsers strip `javascript:` from the address bar; a bookmarklet is a desktop-only affordance. |
| `/result` iframe showing BEU's page | Native result view; the official page appears only for the captcha | A result is data, not a page. Native rows are searchable, copyable and work offline. |
| `/result?view=official` raw BEU HTML | — | Debug affordance, not a student need. |
| `/attendance` JSON import/export | Attendance lives in `beu.tools.attendance`; no file-picker capability is declared in `nsh.json` | Import/export was desktop plumbing. |
| `/holidays` 2025/2026 PNG calendars | `tools.holidays`: month grid, countdown, teacher-day toggle | Structured data beats an image: searchable and knows today. |

## 4. App-only capabilities (the site has no equivalent)

| Capability | Route | File |
|---|---|---|
| First run: one registration number resolves a name and college before a profile exists | `onboarding` | `features/onboarding/index.tsx` |
| Captcha page → native result capture | `results.web`; the older JSON hook is `results.portal` | `features/results/web.tsx`, `parse-html.ts`, `portal.tsx` |
| Registration number → name/CGPA with no captcha (Home greeting) | `home`, `results` | `features/results/identity.ts` |
| Eight-semester SGPA history, state rank, college rank from the wide CSV | `results` | `features/results/result-view.tsx` |
| Percentage conversion, BEU ×10 and AICTE (CGPA − 0.75) ×10 | `tools.calculator` | `features/tools/index.tsx` |
| Syllabus topic progress, saved subjects, cross-syllabus search | `syllabus`, `.saved`, `.search` | `features/syllabus/index.tsx` |
| Per-topic next step: its notes sheet and the papers for that code | `syllabus.subject` → `notes.subject`, `pyqs` | `features/syllabus/parts.tsx` |
| VVI topics, confidence and note PDFs per subject, from `/data/notes.json` | `notes`, `notes.subject` | `features/notes/index.tsx` |
| Study plan: syllabus topics spread over the days left | `planner` | `features/planner/index.tsx` |
| One search box over subjects, papers, notices, datasets and screens | `search` | `features/search/index.tsx` |
| Offline last-good cache, saved result copies, recent lookups | every screen | `lib/net.ts`, `features/results/data.ts` |
| Notices search across the board **and** announcements | `notices.search` | `features/notices/index.tsx` |
| Deep-linkable dataset table (batch/branch/sem/college in the route) | `data.table` | `features/pyqs/data-table.tsx` |
| Profile, appearance (light/dark/system), reminders, storage, offline data, about | `settings`, `.profile`, `.appearance`, `.reminders`, `.storage`, `.offline`, `.about` | `features/settings/index.tsx`, `features/offline/index.tsx` |
| Routine week view + "in session / next" spotlight | `tools.routine` | `features/tools/index.tsx` |
| Attendance date log with undo, target line | `tools.attendance` | `features/tools/index.tsx` |

## 5. Live probes (2026-10-26)

| Request | Result | App handles it |
|---|---|---|
| `GET /api/result?reg=21101157017&sem=3&format=json` | **502**, 89 B, 5.5 s | yes → saved copy → CSV → portal |
| `GET beu-bih.ac.in/backend/v1/result/token` | **403** `CAPTCHA verification required.`, 28 B | yes → `results.web` |
| `GET /api/notices/important?limit=2` | **200**, 502 B JSON | yes |
| `GET /data/students_24_all_105_sem2.csv` | **200**, 210,053 B (header `Session,RegNo,Name,SGPA,Cur. CGPA,CollegeCode,CollegeName`) | yes → identity, table, rank, merit |
| `GET /data/manifest/index.json` | **200**, 30,305 B | yes → `data` |

Notice and announcement links point at `beu-bih.ac.in/backend/…pdf`; the notices
PDF screen keeps them inside the WebView when the host is allowlisted (and says
so when it is not), rather than leaving a dead end.
