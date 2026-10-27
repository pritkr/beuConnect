# `src/features` — the feature-folder contract

One folder per area. The folder owns its routes, screens, state and pure logic;
it does not own the shell, the design system or the network helpers.

## Shape

```
src/features/<area>/
├── index.tsx      export const <area>Routes: RouteDef[]   ← required
├── *screen*.tsx   one screen per file once the area is large
├── data.ts        fetch + parse + normalise into one model
├── state.ts       signals, persisted shapes, KEYS
└── *.ts           pure logic, no JSX (engine, parser, catalog)
```

- `index.tsx` is a route table, not a god file. A one-screen area may keep the
  screen there; a multi-screen area spreads sub-route arrays.
- The registry imports exactly `<area>Routes`; nothing else needs to change.
- Sub-routes use the `<area>.` prefix. The `data` / `data.table` namespace is
  owned by `pyqs`; the bare `attendance` / `routine` / `holidays` / `wifi` /
  `feedback` names are compatibility aliases for `tools.*`.

## Rules

1. **Screens take `nav`.** Navigate with `nav.push("results.rank", { … })`;
   never import another screen and call it.
2. **Read params** with `param` / `numParam`. A missing or absurd value must
   render a usable "pick one" state, not a crash.
3. **Pure logic is plain TS.** Parsing, ranking, formulas and catalog decoding
   live in `.ts` files and are unit-tested; JSX stays a view.
4. **State placement decides lifetime.** Page state inside the component; area
   state at module level; persistence through `readStore` / `writeStore`.
5. **Every async screen has four states:** loading, ready, error + retry, empty.
   Offline shows the last cached copy, labelled as such.
6. **Lists virtualise.** Over ~30 rows use `List`, with height, a reactive
   `each` wrapper and loading/empty slots. Never nest a `List` in a `Scroll`.
7. **Data honesty.** Never invent a row. If the upstream has no value, show the
   gap; do not default a CGPA, a rank, a date or a paper.
8. **No new route outside your own `<area>Routes`.** If you must add one, say so
   in the handoff and update `docs/ARCHITECTURE.md` §4 and `qa/routes.contract.ts`.

## Area-specific reading

| Area | Read |
|---|---|
| results | `results/AGENTS.md` |
| pyqs, data browser | `pyqs/AGENTS.md` |
| syllabus, GATE | `syllabus/AGENTS.md` |
| students | `students/AGENTS.md` |
| tools, planner | `tools/AGENTS.md` |
| home, notices, notes, search, settings, feedback, offline, onboarding, data-feed | this file + the folder header |

## Definition of done

`docs/BUILD_SPEC.md` §5 is the full list. The short version: route registered,
push targets resolve, `./scripts/check.sh test` green, mounts offline at 320×640,
params safe, data through `lib/net`, storage async, no new dependency, docs
updated, screenshot entry added if the screen is new.
