# QA acceptance rubric

The checklist a change must pass before it is called done. `BUILD_SPEC.md` owns
the *contract* (what a screen is); this file owns the *evidence* (how we know it
is true, and what counts as a failure). When the two disagree, `BUILD_SPEC.md`
wins and this file gets fixed in the same change.

Scope: every screen under `src/features/**`, the shell in `src/app/**`, and the
routes they register. Applies to feature agents, to the lead before packaging,
and to the final `nsh package` run.

## 0. How to use this

1. Before handoff, run the gate: `./scripts/check.sh test` (types + build + full
   suite). It runs under the shared `.nsh/` lock — never call `nsh` directly.
2. Run the rubric's **automated** rows; any ✗ is a blocker regardless of the
   rest of the checklist.
3. Run the **manual** rows on a 320 pt phone and note the result in
   the release run note; a defect that survives goes into `docs/BLOCKERS.md`. A
   row that could not be tested is `untested`, never `pass`.
4. A screen that is not reachable by a tap from `home` is not done, even if it
   mounts in the harness.

### Severity

| Level | Meaning | Ships? |
|---|---|---|
| **blocker** | Crash, dead end, data loss, wrong result, or the gate is red | No |
| **major** | A core path is broken or a state is missing for a common case (offline, empty, error, back) | No |
| **minor** | Degrades a corner (long text, rare device, copy, spacing) but the path works | Yes, if listed |
| **nit** | Style preference with no user-visible effect | Yes |

### Evidence rules

- A test that asserts copy is weaker than one that asserts a route, a `testID`
  or bundled data. Prefer `id:` and `label:`.
- "It renders" is not evidence unless the screen also shows **something the
  student needs** — a list, a state, an action. An empty body is a failure even
  when `app.texts()` is non-empty (a title bar alone is the classic failure).
- Screenshots are evidence for layout, never for navigation or data.

## 1. Route and navigation contract

| # | Requirement | Automated | Manual |
|---|---|---|---|
| R1 | Every screen has a `RouteDef` in its feature's `index.tsx`, exported as `<area>Routes` and merged in `src/app/registry.tsx` | `qa/registry.test.ts` → "route table" | — |
| R2 | No route name is registered twice; the merge loses nothing | `qa/registry.test.ts` | — |
| R3 | Every `nav.push` / `nav.replace` target resolves in `ROUTE_MAP` | `qa/registry.test.ts` + fresh `qa/push-targets.ts` (`bun qa/scan-push-targets.mjs --check`) | — |
| R4 | Every route is reachable by taps from `home` (tab, More, or an in-screen door) — not only by typing a name in a harness | `qa/integration.test.tsx` → "every More entry is a real push with a working back" | Open the app cold and walk the five tabs + More |
| R5 | `title(params)` never throws, never returns `""`, never contains `undefined`/`NaN`, and is stable | `qa/registry.test.ts` | Header text on the device |
| R6 | `back()` from any child returns to the screen that pushed it; the tab bar comes back at a root | `qa/integration.test.tsx` (back to More) ; `qa/shell.test.tsx` (tab bar returns) | Android system back + predictive back |
| R7 | A pushed route that is unregistered never renders a silent blank — it renders the 404 with a way home | `qa/integration.test.tsx` (fallback text is a failure) | Deep-link a bogus route if a host path exists |
| R8 | No route ignores its params (a route that takes `code`/`reg`/`id` must render that entity, not a default) | `qa/integration.test.tsx` → "a route renders the entity its params name" | Push two different students from the roster |

## 2. States

Every screen that loads, saves or filters must be able to answer all four. A
missing state is **major**, not a nit.

| # | Requirement | Automated | Manual |
|---|---|---|---|
| S1 | **Loading**: a skeleton or spinner, not a blank body and not a flash of "empty" | Mount with a stalled network if feasible; otherwise source review | Airplane mode + cold start |
| S2 | **Empty**: explains the state in one sentence and offers the action that fills it | `qa/integration.test.tsx` mounts every route offline and requires non-empty text | Fresh install, no cache |
| S3 | **Error**: says what failed, keeps any already-visible data, and offers retry | `qa/screens.test.tsx` (offline results/notices) | Airplane mode mid-session |
| S4 | **Success with stale data**: shows the saved copy and when it was saved | Covered for results/notes/pyqs | Open a cached result offline |
| S5 | A refresh never clears content the student is reading; a failed refresh keeps the copy and adds a note | Source review + mounted test where it exists | Pull-to-refresh in airplane mode |
| S6 | State resets when the screen's identity changes (a new `reg`/`code`/`sem` must not show the previous entity's data) | `qa/integration.test.tsx` → "a route renders the entity its params name" | Open student A, back, open student B |
| S7 | A filter that yields nothing says so; it never renders an empty list under a header | Source review + screen test | Search for `zzzz` in Syllabus, PYQs, Notices |

## 3. Lists and large data

| # | Requirement | Automated | Manual |
|---|---|---|---|
| L1 | Any list that can exceed ~100 rows uses `List` (virtualized), never `Scroll` + `.map` | `bun scripts/lint-list-height.mjs` covers height; row-count review is human | Scroll a 3 000-row table to the end |
| L2 | Every `List` has height (`class="flex-1"` or explicit) and a reactive wrapper `{() => <List each={rows()} … />}` | `bun scripts/lint-list-height.mjs` | A table that shows only its header |
| L3 | No `List` nested inside a scrolling column | Review | Scroll gesture fights the inner list |
| L4 | CSV parsing is chunked; the UI stays responsive on a 5 MB file | `qa/data.test.ts` for parsing; timing on device | Open the largest table, scroll during parse |
| L5 | Row identity is stable (`id`/key from the row, not the index) so expanding a row does not jump | Review | Expand a row mid-list |
| L6 | The list survives a re-render without losing scroll position or expansion | Review + screen test | Rotate with a row expanded |
| L7 | A horizontal rail (chips, recents) has a height — `min-h-11`/`h-11`, never `flex-1` alone in a column | `bun scripts/lint-rail-height.mjs` | A "Sort by" heading with nothing under it |

## 4. Data and network

| # | Requirement | Automated | Manual |
|---|---|---|---|
| D1 | Every request goes through `src/lib/net.ts` (timeout, dedupe, cache); no raw `fetch` in a feature | Review + `qa/integration.test.tsx` opens offline | — |
| D2 | No request can hang the UI: the net layer times out and the screen shows the error state | `qa/unit/*` for the net layer where present | Airplane mode, watch the screen for 35 s |
| D3 | No unawaited promise that can reject unhandled (every `void promise` has a `.catch`) | Review + `nsh test` unhandled-rejection failure | — |
| D4 | No invented paper, result, notice, date or rank — a gap says it is a gap | `qa/data.test.ts` + review | Compare a result and a roster row with the site |
| D5 | Cache keys are namespaced (`beu.` / `beu.cache.`), never ad hoc | Review | — |
| D6 | Offline start shows the last snapshot and says it is offline; nothing crashes without network | `qa/screens.test.tsx` (every test runs offline) | Cold start in airplane mode |
| D7 | No `console.error` / thrown path reachable from missing data (`undefined.length`, `JSON.parse` on a bad cache) | `qa/integration.test.tsx` (a throw fails the mount) + review of parsers | — |

## 5. Params and storage

| # | Requirement | Automated | Manual |
|---|---|---|---|
| P1 | Params are read with `param(nav, …)` / `numParam(nav, …)`, never by reaching into internals | `qa/registry.test.ts` (title matrix) + review | — |
| P2 | A missing or malformed param degrades to a usable screen, not a crash | `qa/integration.test.tsx` mounts every route with `{}` | Deep link a route with no params if a host path exists |
| P3 | `Storage` is awaited on read, `void …catch` on write, hydrated once into a signal | Review (grep `Storage.getItem`) | Kill and relaunch; the value survives |
| P4 | Saved values are versioned or defensive: a bad/old JSON value is discarded, not thrown | `qa/unit/*` where covered + review | Restore an old app backup if available |

## 6. Look, theme and Android feel

| # | Requirement | Automated | Manual |
|---|---|---|---|
| V1 | No hardcoded hex in a screen; colour comes from a token (`bg-card`, `text-muted-foreground`, `border-border`, `text-primary-ink`) | `bun scripts/contrast.ts` + review (`#` in `src/features/**`) | Dark mode sweep |
| V2 | No interpolated class names (`bg-${tone}`); unknown classes are a build warning | `nsh build` warnings filtered in `scripts/check.sh` | — |
| V3 | Light, dark and system all render with readable contrast; no white flash on launch | `bun scripts/contrast.ts` | Toggle Appearance, relaunch |
| V4 | Touch targets are at least 44 × 44 pt for anything actionable, including icon-only buttons, chips and list chevrons | `docs/A11Y_AUDIT.md` + review | Thumb test on device |
| V5 | Text is not clipped or ellipsized into meaninglessness at 320 pt width and at 1.3× font scale | `qa/integration.test.tsx` mounts at 320 × 640 | Settings → Display → font 1.3×, walk every tab |
| V6 | A header title is one line; long subject names are truncated in the bar and shown in full in the body | screenshots (`./scripts/shots.sh`) | Open the longest subject name |
| V7 | Lists scroll with momentum; no gesture is swallowed by a nested scroll view | — | Fling every long list |
| V8 | `WebView` appears only for the BEU captcha/result page and PDFs; every other page is native views | review `grep -rn "<WebView" src/` | Open the captcha flow and a PDF |
| V9 | Every `WebView` host is declared in `nsh.json` `capabilities.webview.hosts` | `nsh package` refuses otherwise; review | Open each WebView on device |
| V10 | Keyboard opens over the tab bar, never under it, and the focused field stays visible | — | Focus the registration input at the bottom of the screen |

## 7. Code and API hygiene

| # | Requirement | Automated | Manual |
|---|---|---|---|
| C1 | `nsh check` is clean: no TypeScript errors, no unresolved imports | `./scripts/check.sh check` | — |
| C2 | No `any` in an exported signature; no `as any` to silence a real mismatch | review (`grep -rn ": any\|as any" src/`) | — |
| C3 | No `@ts-ignore` / `@ts-expect-error` without a one-line reason | review | — |
| C4 | No dead export that claims a route the registry does not merge (e.g. an area module that exists but is not in `ALL_ROUTES`) | `qa/registry.test.ts` + `qa/integration.test.tsx` harness-coverage check | — |
| C5 | Generated files are untouched by hand (`assets/data/*`, `pyqs/catalog-data.ts`, `students/roster-data.ts`, `qa/push-targets.ts`) | review + regenerate | — |
| C6 | New route → a row in `docs/ARCHITECTURE.md` §4, a line in `docs/SITE_PARITY.md`, and a screenshot entry | review | — |

## 8. Android device behaviour

Full sequence and commands: `docs/ANDROID_TEST_PLAN.md`.

| # | Requirement | Evidence |
|---|---|---|
| A1 | Installs and cold-starts in under 3 s on the reference device, no splash hang | screen recording / `adb shell am start -W` |
| A2 | Starts offline from a warm cache without a crash or an empty Home | airplane mode, cold start |
| A3 | System back from a root exits the app; from a child pops one level; predictive back shows the destination | device |
| A4 | Rotation keeps the screen and its scroll position (or the host locks portrait by design — record which) | device |
| A5 | 1.3× font scale does not clip tab labels, buttons or list rows | device |
| A6 | Process death → relaunch restores profile, saved subjects and cached results | `adb shell am kill org.beuconnect.app` |
| A7 | Low memory: no OOM on the largest CSV table plus a PDF | `adb shell am send-trim-memory` |
| A8 | Captcha flow completes and the result is parsed and saved | device, real registration number |
| A9 | No ANR in `adb logcat` during a 10-minute walk of every tab | `adb logcat` |

## 9. Definition of done (all must be true)

- [ ] `./scripts/check.sh test` is green.
- [ ] `bun qa/scan-push-targets.mjs --check` is clean.
- [ ] `bun scripts/contrast.ts` is clean.
- [ ] `qa/integration.test.tsx` mounts the new route cold and offline. Add its
      area to `qa/harness-routes.ts`; the harness/registry equality test fails
      until you do.
- [ ] All rows above are `pass` or a listed `minor` in `docs/BLOCKERS.md`.
- [ ] `docs/ARCHITECTURE.md` route table and `docs/SITE_PARITY.md` updated.
- [ ] One screenshot of the new screen at 320 pt in `docs/shots/` (or the
      `SHOTS.md` sweep re-run).

## 10. What is deliberately not in this rubric

- Visual taste (spacing rhythm, illustration, copy tone). That is
  `docs/SHOTS.md` and review, not a checkbox.
- Performance micro-benchmarks on the dev host; only device-visible hangs count.
- iOS/desktop parity beyond "it builds and does not crash"; Android ships.

## 11. Enforcement map (what is actually automated today)

| Check | Runs in | Covers |
|---|---|---|
| `scripts/lint-list-height.mjs` | `check.sh` | L1/L2 |
| `scripts/lint-rail-height.mjs` | `check.sh` | L7 |
| `scripts/icons/verify.mjs` | `check.sh` | icon names exist in the subset font |
| `scripts/data/publish-feed.ts --check` | `check.sh` | D5 (feed hashes current) |
| `scripts/verify.py` | `check.sh` | D4 (dataset counts and contracts) + no contact/email/caste column in a public CSV |
| `qa/scan-push-targets.mjs --check` | `qa/run-tests.sh` | R3 |
| `qa/registry.test.ts` | suite | R1, R2, R3, R5, R7 (static), C4 (static) |
| `qa/shell.test.tsx` | suite | R6 (tabs/More), first run |
| `qa/integration.test.tsx` | suite | R4, R6, R7, R8, S2, S6, D7, V5 (mount width) |
| `qa/screens.test.tsx` | suite | S1–S4 for the first-five-minutes screens |
| `qa/data.test.ts` | suite | D4, generated data contracts |
| `qa/unit/*` | suite | parsers, grades, storage, offline accounting |
| `scripts/contrast.ts` | manual/gate | V1, V3 |
| `scripts/shots.sh` | manual | V4, V5, V6, visual regression |
| device checklist | manual | A1–A9, V7, V10 |
