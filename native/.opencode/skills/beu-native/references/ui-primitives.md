# UI primitives — `src/ui/index.tsx`

The design system is the only place that encodes the look. Import from
`../../ui`; do not restyle around these with raw cards or buttons.

Colour tokens (from `nsh.json`): `background`, `foreground`, `card`, `muted`,
`muted-foreground`, `primary`, `primary-ink`, `secondary`, `accent`,
`accent-ink`, `destructive`, `border`, `border-strong`, `chart-1..5`.
Ink is `text-*`; `primary`/`accent` are surfaces, not text colours.

## Layout

| Primitive | Props |
|---|---|
| `Screen` | `children`, `class` — full-height page on `bg-background` |
| `Body` | `children`, `class`, `contentClass` — scrolling page with the 16 pt gutter |
| `Row` | `children`, `class`, `onPress?`, `role?`, `label?` — interactive rows are `min-h-11` |
| `Col` | `children`, `class` |
| `Divider` | `class` |
| `Spacer` | `size?` |

## Text

| Primitive | Props |
|---|---|
| `Title` | `children`, `class`, `numberOfLines` — 2xl bold |
| `Subtitle` | `children`, `class`, `numberOfLines` |
| `Muted` | `children`, `class`, `numberOfLines` — supporting copy |
| `Label` | `children`, `class`, `role?: "header"` — uppercase micro-label |
| `Mono` | `children`, `class`, `numberOfLines` — registration numbers, codes |

## Surfaces

| Primitive | Props |
|---|---|
| `Card` | `children`, `class`, `onPress?`, `onLongPress?`, `label?`, `testID?` — interactive adds strong border + press scale |
| `Panel` | `children`, `class`, `tone?: ember/mint/amber/plain`, `testID?` |
| `SectionHeader` | `title`, `action?`, `onAction?`, `trailing?`, `class?` |
| `ListBar` | `title`, `meta?`, `class?` — fixed title above a virtualised list |

## Input

| Primitive | Props |
|---|---|
| `Chip` | `children`, `active?`, `onPress?`, `class?`, `tone?: default/mint/amber`, `label?` |
| `Check` | `checked`, `onPress`, `label` (required), `class?` |
| `Btn` | `children`, `onPress?`, `variant?: primary/secondary/ghost/link/danger`, `disabled?`, `class?`, `label?` |
| `Field` | `value`, `onChange`, `placeholder?`, `label?`, `hint?`, `keyboard?`, `masked?`, `multiline?`, `maxLength?`, `onSubmit?`, `class?`, `autoFocus?`, `prefix?` |
| `Search` | `value`, `onChange`, `placeholder?`, `class?` |

## Data and states

| Primitive | Props |
|---|---|
| `Skeleton` | `w?`, `h?`, `class?` |
| `Loading` | `label?` |
| `ErrorState` | `message?`, `onRetry?`, `title?` — always pass `onRetry` |
| `EmptyState` | `title`, `hint?`, `action?`, `onAction?`, `glyph?` |
| `Badge` | `children`, `tone?: ember/mint/amber/neutral`, `class?` |
| `Progress` | `value` (0–100), `class?`, `tone?: ember/mint/amber`, `label?` |
| `Stat` | `value`, `label`, `hint?`, `tone?: ember/mint/plain`, `class?` |
| `Ring` | `value`, `size?`, `label?`, `tone?: ember/mint` |
| `Marquee` | `items`, `label?`, `onPressItem?`, `class?`, `interval?` |

## Rules the primitives encode

- Pressables already carry `active:` feedback and `min-h-11`; do not add
  hover-only styles.
- `Card` / `Chip` / `Btn` derive the spoken label from plain-text children.
  Pass `label` when the content starts with a shape or nested component.
- `Check` owns its own 44 pt target and square box; use it instead of a custom
  progress control.
- `Progress` / `Ring` already use the readable chart tokens in dark mode.
