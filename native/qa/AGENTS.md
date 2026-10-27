# `qa` — the native test suite

`qa/README.md` is the full contract; the `beu-qa` skill is the working loop.

52 tests, 13 mounts. Everything here is test code.

## Run

```sh
./qa/run-tests.sh            # push-target freshness + suite
./qa/run-tests.sh check      # + types/build
./scripts/check.sh test-only # suite only, still under the lock
```

Never `nsh test` directly. Budget: under 15 s.

## Files

| File | Owns |
|---|---|
| `registry.test.ts` | static route contracts (merge, names, titles, push targets, tabs/More) |
| `shell.test.tsx` | `App.tsx`: tabs, stack, bar, back — 3 mounts |
| `screens.test.tsx` | home, syllabus, results, notes, search, notices, onboarding |
| `unit/logic.test.ts` | grades, SGPA/CGPA, target planner, attendance, ranking, semester |
| `unit/result-parse.test.ts` | BEU result page reader, real Angular/ASP.NET fixtures |
| `unit/offline.test.ts` | offline pack key ownership and byte accounting |
| `data.test.ts` | syllabus packs, PYQ catalogue + PDFs, roster, notes manifest |
| `harness.tsx` | one route in isolation, curated to the 8 mounted areas |
| `support.ts` | `openRoute`, `expectPage`, `navEntries`/`awaitNav`, `pressFirst` |
| `routes.contract.ts` | required names (missing = `test.todo`, not red) |
| `push-targets.ts` | generated — do not edit |

## Invariants

- **No network.** Every app opens with a `network` map; unlisted requests fail.
- **`clock: {}` by default.** Animations are instant and `app.wait(ms)` is free.
  Do not add a settle sleep: `open()` already resolves when the app is quiet.
- **Address routes, not internals.** `openRoute(name, params)` → `expectPage` →
  `id:`/`label:`/text. Only `qa/unit/*` may import pure exports.
- **Share an engine** with `beforeAll` when a block mounts the same app; every
  mount is ~130 ms.
- **New area mounted?** Add its route array to `harness.tsx` (curated on
  purpose — do not import the whole registry).
- **Navigation change →** `bun qa/scan-push-targets.mjs`; the gate refuses a
  stale `qa/push-targets.ts`.
- **Relax copy assertions, never delete a test.** Query by route or testID, or
  accept a list of wordings.

## When a test fails

| Symptom | Likely cause | Check |
|---|---|---|
| `did not mount` | route unregistered or throws | rendered snippet, feature `index.tsx` |
| Page mounts but is blank | `List` has no height | `bun scripts/lint-list-height.mjs` |
| Text never updates | signal read in a body `const` | move the read into JSX |
| List never fills | `each` captured once | `{() => <List each={rows()} … />}` |
| `No screen for …` | unregistered push target | register it, re-scan push targets |
| Timeout | real network or real clock | `network` map, `clock: {}` |

Do not create a second harness, a network-touching test, or a test that imports
a feature's signal.
