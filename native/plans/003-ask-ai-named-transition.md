# 003 — The Ask AI row should transition the two properties it changes

- **Status**: DONE (2026-11-01) — `transition-colors duration-150`, nothing else changed.
  Gate green.
- **Commit**: 62ec345
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 line

## Problem

The row is the only place left in the app whose press transition is not named:

```tsx
// src/ui/ask-ai.tsx:118 — current
class={`min-h-11 flex-row items-center gap-2 rounded-xl px-1 transition duration-150 ease-out motion-reduce:transition-none active:bg-muted ${
  working() ? "opacity-50" : ""
}`}
```

Tailwind's bare `transition` animates a fixed but broad list — colour,
background, border, text-decoration, fill, stroke, opacity, box-shadow,
transform, filter, backdrop-filter. This row changes exactly two of those:
`background-color` (the press wash) and `opacity` (the working dim). Every other
transition in the app names its property (`transition-colors`,
`transition-opacity`, `transition-transform`); this one is the outlier.

## Target

```tsx
// src/ui/ask-ai.tsx:118 — target
class={`min-h-11 flex-row items-center gap-2 rounded-xl px-1 transition-colors duration-150 ease-out motion-reduce:transition-none active:bg-muted ${
  working() ? "opacity-50" : ""
}`}
```

The press wash keeps its 150 ms fade. The working dim (`opacity-50`) now snaps —
it is a sub-second state on a row that is about to hand off to another app, and
it is not worth animating.

## Repo conventions to follow

- Press feedback: `transition-colors duration-150 ease-out motion-reduce:transition-none`
  with an `active:` wash — `src/ui/index.tsx:112` (`Row`) and
  `src/features/feedback/footer.tsx:19` are the exemplars.
- Colour changes use the shared 150 ms duration, never a bare `ease`.

## Steps

1. In `src/ui/ask-ai.tsx`, replace `transition duration-150` with
   `transition-colors duration-150` in the class string at line 118. Change
   nothing else in the string.

## Boundaries

- Do NOT touch the `Ask AI` row's layout, label, icon or `working()` logic.
- Do NOT change the `opacity-50` value or add an opacity transition back.
- Do NOT change any other file.

## Verification

- **Mechanical**: `bunx tsc --noEmit -p tsconfig.json` (the pre-existing
  `src/features/settings/notifications.tsx` error is unrelated);
  `./scripts/check.sh test` should not report a new unknown class.
- **Feel check**: on a topic row, press Ask AI. The wash appears over 150 ms; the
  row dims as the chooser opens. Nothing else fades.
- **Done when**: `grep -n "transition duration" src/ui/ask-ai.tsx` returns
  nothing.
