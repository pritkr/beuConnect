# `src/ui` — Ink & Ember design system

`index.tsx` is the only file that encodes the look. Feature screens compose
these primitives; they do not restyle around them with raw cards, buttons or
hex colours.

## Rules

- **Colour by token.** `bg-background`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `border-border-strong`,
  `bg-primary/10`, `text-primary-ink`, `text-accent-ink`, `chart-1..5`.
  `primary` and `accent` are surfaces, not ink; in dark mode they are darker
  than the card. No hex in a screen.
- **No interpolated class names.** A class assembled at runtime is only checked
  the first time the runtime sees it; use a token map or a ternary.
- **44 pt targets.** Pressables are `min-h-11` with `active:` feedback, never
  hover-only.
- **Text grows.** Use `min-h`, never a fixed height around text; test at
  `fontScale` 1.0 / 1.3 / 2.0.
- **Small phone first.** 320 pt, 16 pt gutter, two columns; no wide tables.
- **No `key` props.** `Card`, `Chip`, `Row`, `Btn` and the rest take no `key`;
  keys belong to `<Each of={…} key={…}>`.
- **Icons are Boxicons.** One `<Icon name="…" />` from `icons.tsx`, never an
  emoji, a `★`, or a `›` in a `Text`. Add a name to `ICONS`, then
  `uv run scripts/icons/build-boxicons.py`; `./scripts/check.sh` fails when the
  font and the map disagree. Solid is for selected states only.

## If you touch a token

Tokens live in `nsh.json` (`cssVars.theme.light|dark`), not in this file. After
a token change:

```sh
bun scripts/contrast.ts
./scripts/check.sh test
./scripts/shots.sh --scheme both
```

`text-primary-ink` / `border-border-strong` can produce a false `unknown class`
warning in `nsh test`; `nsh check` is clean and the runtime resolves them. The
header comment in `index.tsx` explains why the readable form stays.

The full primitive inventory with props is in the `beu-native` skill
(`references/ui-primitives.md`).
