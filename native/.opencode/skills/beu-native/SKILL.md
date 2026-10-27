---
name: BEU Native
description: "Build or change a screen in the BEUConnect native app (native/). Covers the route contract, feature folders, Ink & Ember primitives, nsh reactivity and caching rules, and the check gate. Use for any work in native/src/features, src/app, src/ui or src/lib."
---

# BEU Native

The app is TSX on NativeShell (QuickJS, real platform views), not a website in a
box. Android is the shipping target; macOS is the dev host. Entry: `App.tsx` →
`mount(Shell)`. No `package.json`, no dependencies.

## Before you edit

1. Read `AGENTS.md` (this folder) and the nearest nested `AGENTS.md`.
2. Read the header comment of the feature folder you own.
3. For routing/state/data rules, `docs/ARCHITECTURE.md`; for the contract,
   `docs/BUILD_SPEC.md`.

All paths in this skill are relative to `native/`; repo-root paths are written
as `../…`.

## Commands

```sh
source ~/.config/nsh/env.sh
nsh run App.tsx                  # dev loop; one nsh process at a time
./scripts/check.sh test          # lint + types + build + suite (the gate)
./qa/run-tests.sh                # freshness gate + suite
bun scripts/contrast.ts          # after a theme-token change
./scripts/shots.sh --only home   # after a visual change
./scripts/size-report.sh         # after adding bundled data
```

Never call `nsh check` / `nsh test` directly: the build cache is one `.nsh/`
directory and `scripts/check.sh` serialises it with a lock.

## How a screen is added

1. **Route first.** In `src/features/<area>/index.tsx`, add a `RouteDef` to the
   area's exported `<area>Routes`. The registry already spreads it.
   - `name` is namespaced: `area` at the root, `area.thing` below.
   - `title(params)` returns a non-empty string and never throws.
   - `render(nav)` returns the page body.
2. **Read params** with `param(nav, "reg")` / `numParam(nav, "sem")`, never a
   cast. Junk and missing values must still render a usable screen.
3. **Data** through `src/lib/net.ts` (`fetchJson` / `fetchText` / `postJson`)
   with a `cacheKey`. Parse in a plain `.ts` module, not in JSX.
4. **State** with `signal` / `computed` / `effect`. Page state inside the
   component; area state at module level; persistence through `readStore` /
   `writeStore` in `src/lib/net.ts`.
5. **Design** with `src/ui/index.tsx` primitives and theme tokens only.
6. **Every list** has loading, error + retry and empty states; errors use
   `ErrorState`, not a blank screen.
7. Re-run `bun qa/scan-push-targets.mjs` if you touched navigation, then
   `./scripts/check.sh test`.

## Reactivity rules (these have shipped bugs)

- **A component body runs once.** Read a signal inside JSX or through
  `computed`; a top-of-body `const name = identity().name` freezes.
- **`List` captures `each` once.** Wrap it: `{() => <List each={rows()} … />}`.
- **`List` slot bodies (`header`, `footer`, `empty`) run once.** Keep the slot
  static and call a function that reads signals inside it.
- **A `<List>` needs height.** `class="flex-1"` (or an explicit `h-`), or it
  paints nothing — header included. `scripts/lint-list-height.mjs` catches it.
- **Never nest a `List` in a scrolling column.** Map rows into a `View` instead.
- **Storage is async.** `await` reads, `void` writes, hydrate into a signal.

## Rendering rules

- Text always inside `Text` / `Title` / `Muted` / `Label`.
- No `key` prop on `View`, `Chip`, `Card`, `Row`, `Btn`; keys belong to
  `<Each of={…} key={…}>`.
- Colour by token (`bg-primary/10`, `text-muted-foreground`,
  `border-border-strong`), never hex or an interpolated class name.
- Pressables are ≥ 44 pt (`min-h-11`) with `active:` feedback.
- Layout for a 320 pt phone first; text grows with the system font scale
  (`min-h`, never a fixed height around text).
- `WebView` is only for the BEU captcha page and PDFs; a new host must be added
  to `nsh.json`.

## Where things live

| Need | File |
|---|---|
| Route types, `param`, `numParam` | `src/app/router.ts` |
| Route merge, `ROUTE_MAP`, `routeExists` | `src/app/registry.tsx` |
| Shell, header, first-run gate, tab bar | `src/app/shell.tsx`, `tabbar.tsx`, `more.tsx` |
| Design primitives | `src/ui/index.tsx` (inventory: `references/ui-primitives.md`) |
| Fetch, cache, Storage, formatting | `src/lib/net.ts`, `src/lib/cache.ts` |
| Copy-paste screen patterns | `references/patterns.md` |

## Generated files (never hand-edit)

`src/features/syllabus/data/packs.ts` + `data/table/`,
`src/features/pyqs/catalog-data.ts`, `src/features/pyqs/pdf-catalog.ts`,
`src/features/students/roster-data.ts`, `assets/data/*`, `qa/push-targets.ts`.
Commands are in the `beu-data` skill and `scripts/AGENTS.md`.
