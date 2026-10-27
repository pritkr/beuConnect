---
name: BEU QA
description: "Run or extend the BEUConnect native test suite. Covers the curated route harness, offline network stubs, static route contracts, pure-logic and generated-data tests, and the build lock. Use when a native test fails, a new screen needs coverage, or QA output is confusing."
---

# BEU QA

`qa/README.md` is the full contract; this is the working loop. 52 tests, 13
mounts, ~5 s. Everything in `qa/` is test code; `qa/tmp-*` is screenshot scratch.

## Run

```sh
./qa/run-tests.sh            # push-target freshness + suite (the gate)
./qa/run-tests.sh check      # the above + types/build
./scripts/check.sh test-only # suite only, still under the lock
```

Never call `nsh test` directly: the `.nsh/` build cache is shared and two
processes corrupt it. `scripts/check.sh` takes the lock and always releases it.
Budget: under 15 s end to end.

## The files

| File | Owns | Mounts |
|---|---|---|
| `registry.test.ts` | merge, name shape, titles, push targets, tabs/More | 0 |
| `shell.test.tsx` | `App.tsx`: tabs, stack, bar, back | 3 shared |
| `screens.test.tsx` | home, syllabus, results, notes, search, notices, onboarding | 10 |
| `unit/logic.test.ts` | grades, SGPA/CGPA, planner, attendance, ranking, semester | 0 |
| `unit/result-parse.test.ts` | BEU result page reader, real fixtures | 0 |
| `data.test.ts` | syllabus packs, PYQ catalogue + PDFs, roster, notes | 0 |
| `unit/offline.test.ts` | offline pack key ownership and bytes | 0 |

`harness.tsx` mounts one route and records navigation; `support.ts` has
`openRoute`, `expectPage`, `navEntries`/`awaitNav`, `pressFirst`.

## How a test sees the app

`openRoute(name, params)` seeds `{ "qa.route": name, "qa.params": params }` and
waits for the `qa-page` testID. A failure names the route, the params, the first
200 characters of what rendered, and the original error. `clock: {}` is the
default; there is **no settle sleep** — `open()` already resolves when the app is
quiet.

The harness is **curated** to the eight areas the suite mounts. A feature
mid-refactor cannot zero the suite; the real merge is `registry.test.ts`.

## The two rules

1. **No internals.** Address a screen by registered route name, `testID`,
   accessibility label or text. Exceptions: `qa/unit/*` may import pure exported
   functions, and `registry.test.ts` may import each `xRoutes` array.
2. **No network.** Every app is opened with a `network` map; unlisted requests
   fail. A red test must mean "this build is broken", not "the university is
   down".

```tsx
await openRoute("results", { reg, sem: 1 }, { network: DOWN });
await openRoute("notices", {}, {
  network: { "GET https://beu.prit.eu.org/api/notices": { body: { items: [] } } },
});
```

Seed saved state with the app's own keys: `beu.cache.result:<digits>:<sem>`,
`beu.cache.roster:<batch>:<branch>:<sem>`.

## Adding coverage

1. **Register the route first** (in the feature's `index.tsx`). If it is new,
   add it to `qa/routes.contract.ts` too.
2. If the area is not in `qa/harness.tsx`, add its route array there.
3. Mount through the harness; `expectPage(app, "area.thing")` first, then assert
   visible text. Prefer `id:` / `label:` over copy.
4. One screen per test; use `beforeAll` when a block mounts the same app.
5. Behaviour change → extend the nearest suite; new pure logic → `qa/unit/`.
6. Navigation change → `bun qa/scan-push-targets.mjs`, then the suite.

## When a test fails

| Symptom | Likely cause | Check |
|---|---|---|
| `did not mount` | route unregistered or throws | rendered snippet, feature `index.tsx` |
| Page mounts but is blank | `List` has no height | `bun scripts/lint-list-height.mjs` |
| Text never updates | signal read in a body `const` | move the read into JSX |
| List never fills | `each` captured once | `{() => <List each={rows()} … />}` |
| Slot stuck on loading | `header`/`footer`/`empty` body ran once | read signals inside |
| `No screen for …` | unregistered push target | register it, re-scan push targets |
| Timeout | real network or real clock | `network` map, `clock: {}` |
| Copy assertion fails | copy moved on purpose | relax the assertion, never delete the test |

## Definition of done

- `./scripts/check.sh test` green.
- New route mounts offline at 320×640 with a real body (add it to the harness).
- Every push target resolves (`qa/push-targets.ts` fresh).
- New pure logic has a unit test; changed behaviour has a screen test.
