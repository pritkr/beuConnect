# `src/app` — navigation foundation

This folder is the app's contract, not a feature. A feature change does not edit
it; a change here is its own change, with the whole suite run afterwards.

## Files

| File | Owns |
|---|---|
| `router.ts` | `Route`, `Nav`, `RouteDef`, `param`, `numParam` |
| `registry.tsx` | the single merge point: `ALL_ROUTES`, `ROUTE_MAP`, `routeExists` |
| `shell.tsx` | the nav stack, app-drawn header, first-run gate |
| `tabbar.tsx` | the five tabs and their view-drawn marks |
| `more.tsx` | the shell-owned `more` screen |
| `coming-soon.tsx` | `NotFound` |

## Rules

- **`register` is the only wiring.** A feature exports `<area>Routes`; spread it
  in `registry.tsx`. Do not add per-screen branches to the shell.
- **`more` is shell-owned.** It is intentionally absent from `ALL_ROUTES`, but
  `routeExists("more")` is true. Never register it in a feature.
- **Names are namespaced.** `area` at the root, `area.thing` below. The prefix
  maps a route back to its folder in QA.
- **`title(params)` must never throw** and must return a non-empty string for
  `{}` and for every real param combination. QA checks this.
- **The tab bar replaces the stack**, not pushes onto it. A tab root has no
  stale history.
- **The tab bar hides** when the stack is deeper than its root or the keyboard
  is up (`keyboardFrame().height`).
- **First run is gated in the shell** from `beu.onboarding`; the
  `onboarding` route is also registered so QA can mount it. Its `onDone` is a
  no-op because the shell owns the transition.
- **`NavStack` needs `class="flex-1"`.** Without it every page is zero-height.
- **Two headers are deliberate**: Android/iOS get the system header (`title`),
  desktop gets the app-drawn `PageHeader` in the `header` slot. Always supply
  both.

## Adding a route

1. Define it in the owning feature's `index.tsx` with a unique name, a safe
   `title`, and a `render(nav)`.
2. Read params with `param` / `numParam`; handle missing and junk values.
3. If it is reachable by push, it must be registered before the push ships.
4. `bun qa/scan-push-targets.mjs` and `./qa/run-tests.sh`.
5. Add the row to `docs/ARCHITECTURE.md` §4 and the parity note to
   `docs/SITE_PARITY.md`.
