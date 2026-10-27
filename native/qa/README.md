# QA — the native suite

Everything under `qa/` is test code. It proves seven things and nothing else:

1. the route table merges without a duplicate, and every name, title, tab,
   More entry and push target resolves (`registry.test.ts`);
2. the real shell moves between tabs, keeps one stack entry, and hides the bar
   under a child (`shell.test.tsx`);
3. the core screens render and survive the offline/empty path
   (`screens.test.tsx`);
4. the maths a student acts on is right (`unit/logic.test.ts`);
5. the BEU result page is read correctly from real fixtures
   (`unit/result-parse.test.ts`);
6. the four generated snapshots still add up (`data.test.ts`);
7. a cache key belongs to exactly one offline pack (`unit/offline.test.ts`).

That is **52 tests and 13 mounts**, against 335 tests / 169 mounts before the
rewrite. The old suite mounted every route twice and slept 220 ms after each
mount; both are gone.

Files the table below does not list (`feedback.test.tsx`, `results.test.tsx`,
`unit/routine.test.ts`) are owned by their feature and run in the same pass.
`qa/tmp-*` files are screenshot scratch, not suite.

## Run

```bash
./qa/run-tests.sh            # push-target freshness + the suite
./qa/run-tests.sh check      # the same + types/build
./scripts/check.sh test-only # suite only, still under the lock
```

**Never call `nsh test` / `nsh check` directly.** The `nsh` build cache is one
directory per project; `scripts/check.sh` takes a lock, waits for the holder,
and always releases it.

Budget: **under 15 s** end to end. The owned files are ~6 s; a full `qa/`
pass that includes the feature tests is ~8 s.

## The files

| File | Owns | Mounts |
|---|---|---|
| `qa/registry.test.ts` | static contracts: no duplicate route name across features, name shape, `title()` for every plausible param set, every push target / tab / More entry resolves | 0 |
| `qa/shell.test.tsx` | `App.tsx`: five tabs, one stack entry, child hides the bar, back restores it | 3 (shared) |
| `qa/screens.test.tsx` | home, syllabus (landing + paper + topic), results (offline + retry), notes, search, notices, onboarding | 10 |
| `qa/unit/logic.test.ts` | grade bands, SGPA/CGPA, target planner, attendance, ranking, semester | 0 |
| `qa/unit/result-parse.test.ts` | the Angular and ASP.NET result pages, and `null` for a page that is not a result | 0 |
| `qa/data.test.ts` | syllabus packs, PYQ catalogue + PDFs, student register, notes manifest | 0 |
| `qa/unit/offline.test.ts` | cache-key ownership across the offline packs, and the ledger's byte accounting | 0 |
| `qa/harness.tsx` | mounts one route in isolation; records `nav.push`/`replace` into `qa.navlog` | — |
| `qa/support.ts` | `openRoute`, `expectPage`, `navEntries`/`awaitNav`, `pressFirst`, `visible`/`snippet` | — |
| `qa/routes.contract.ts` | the names the app *must* ship; a missing one is `test.todo`, never red | — |
| `qa/push-targets.ts` | **generated** — every route name written in `src/` | — |
| `qa/scan-push-targets.mjs` | the generator (`--check` fails on a stale snapshot) | — |
| `qa/run-tests.sh` | freshness gate + `scripts/check.sh` | — |

## Three decisions that make it fast

**The harness is curated.** `qa/harness.tsx` imports the route arrays of the
eight areas the suite mounts — not `src/app/registry.tsx`. A feature mid-refactor
can no longer zero the whole suite; the damage stops at the area that broke, and
the failure names the route. The real merge is `registry.test.ts`'s job, and it
is static.

**No settle sleep.** `open()` already resolves once the app rendered and is
quiet. The old `await app.wait(220)` after every mount cost 264 ms per mount
(measured: 126 ms without, 390 ms with).

**A manual clock by default.** Every mount gets `clock: {}`, so animations finish
at once and `app.wait(2600)` moves virtual time — a retry backoff is free. Only a
test that genuinely needs wall time passes `clock: null`.

## Adding a screen test

1. If the area is not in `qa/harness.tsx`, add its route array there.
2. Mount through the harness, never a feature's internals:

   ```tsx
   test("results.merit lists the top of the branch", async () => {
     const app = await openRoute("results.merit", { branch: "cse", sem: 1 });
     expectPage(app, "results.merit");
     expect(visible(app)).toContain("Merit");
   }, 20000);
   ```

3. Prefer `id:<testID>`, then `label:`, then text. Copy changes; a route name
   does not.
4. Seed storage with the app's own keys (`beu.cache.result:<digits>:<sem>`), or
   stub the network with `open`'s `network` map.
5. One screen per test. If a block mounts the same app for several assertions,
   use `beforeAll` — three mounts are three engines.

## The two rules

**No internals.** A screen is addressed by its registered route name, `testID`,
accessibility label or text — never by importing a `signal`. Two deliberate
exceptions: `qa/unit/*` imports pure exported functions, and
`registry.test.ts` imports each `<area>Routes` array because the duplicate
contract is about the merge.

**No network.** No test reaches `beu.prit.eu.org` or `beu-bih.ac.in`. A red test
must mean *this build is broken*, not *the university is down*. Every app opens
with a `network` map; unlisted requests fail.

```tsx
// Everything fails — the error path is what runs.
await openRoute("results", { reg, sem: 1 }, { network: DOWN });

// One endpoint answers, the rest fail.
await openRoute("notices", {}, { network: { "GET https://beu.prit.eu.org/api/notices": { body: { items: [] } } } });
```

## Failure output

`openRoute` throws the route, its params, and what the user actually saw:

```
route "results.rank" (reg=21105157098, sem=1) did not mount.
  rendered: Results | Registration number | Every mark, in one place. | …
  reason: the app threw while rendering: …
```

The runner filters four documented false-positive warnings
(`text-primary-ink`, `border-border-strong`, `text-accent-ink`, `bg-accent-ink`,
see `docs/ARCHITECTURE.md`) and keeps everything else. Any other unknown class
is a real typo.

## Deliberately loose assertions

* `screens.test.tsx` — the retry call to action is looked up from a short list
  of wordings (`pressFirst`); the *destination* is what is asserted.
* `shell.test.tsx` — the More sweep reads the expected header from
  `ROUTE_MAP[route].title({})` instead of hard-coding it.
* `data.test.ts` — asserts shape and totals, never a row count that a
  regeneration is allowed to change.
