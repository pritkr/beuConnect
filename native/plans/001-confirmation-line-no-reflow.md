# 001 — Stop animating a reflow that never happens

- **Status**: DONE (2026-11-01) — `motionOn` + `LayoutAnimation` deleted, doc comment
  rewritten, `docs/A11Y_AUDIT.md` updated. Gate green.
- **Commit**: 62ec345
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, 4 lines removed

## Problem

`flash()` is the app's short-lived confirmation line ("Link copied." and the
like). It is inserted into the page and removed three seconds later, and both
edges are wrapped in a native layout animation:

```tsx
// src/features/notices/parts.tsx:404 — current
export function flash(): { note: () => string; say: (text: string) => void } {
  const value = signal("");
  return {
    note: () => value(),
    say: (text: string) => {
      if (motionOn()) LayoutAnimation.easeInEaseOut();
      value.set(text);
      setTimeout(() => {
        if (value() === text) {
          if (motionOn()) LayoutAnimation.easeInEaseOut();
          value.set("");
        }
      }, 3000);
    },
  };
}
```

The comment above it justifies the animation by a reflow that does not exist:

> The line is inserted into the page, so it pushes everything below it down and
> pulls it back three seconds later.

Every caller renders the line as the **last** child of its container:

| Caller | The line | What follows it |
|---|---|---|
| `src/features/notices/detail.tsx:131` | `<Panel tone="mint" class="p-3">` | nothing |
| `src/features/notices/post.tsx:120` | `<Panel tone="mint" class="p-3">` | nothing |
| `src/features/notices/pdf.tsx:95` | `<Muted class="text-center">` | nothing |

So there is nothing below to push. The animation only animates the line's own
height at the bottom of a `Scroll`, three seconds after the tap — an animation
running on a page the student may already have scrolled away from.

## Target

The line appears in one frame and disappears in one frame. No layout animation,
no `motionOn` and no `LayoutAnimation` import in this file.

```tsx
// src/features/notices/parts.tsx:404 — target
export function flash(): { note: () => string; say: (text: string) => void } {
  const value = signal("");
  return {
    note: () => value(),
    say: (text: string) => {
      value.set(text);
      setTimeout(() => {
        if (value() === text) value.set("");
      }, 3000);
    },
  };
}
```

## Repo conventions to follow

- Motion that is not needed is deleted, not retimed. `src/ui/AGENTS.md` and
  `docs/A11Y_AUDIT.md` describe the app's remaining motion surface; a removal
  that leaves them stale is updated in the same change.
- A confirmation line is data, not an entrance: `Enter` (`src/ui/enter.tsx`) is
  for a skeleton being replaced by content, not for a label appearing at the
  bottom of a page.

## Steps

1. In `src/features/notices/parts.tsx`, delete the line
   `if (motionOn()) LayoutAnimation.easeInEaseOut();` inside `say`.
2. In the same function, delete the second
   `if (motionOn()) LayoutAnimation.easeInEaseOut();` inside the `setTimeout`.
3. Rewrite the doc comment above `flash()` (lines 395–403): keep the reason the
   line exists, delete the reflow paragraph, say it appears in one frame.
4. Remove `LayoutAnimation` from the `nsh` import on line 20 and delete the
   `import { motionOn } from "../../ui/motion";` line (line 25). Both are used
   only by the code deleted in steps 1–2 — verify with
   `grep -n "motionOn\|LayoutAnimation" src/features/notices/parts.tsx` that
   nothing else in the file refers to them.

## Boundaries

- Do NOT change how `.note()` is rendered in `detail.tsx`, `post.tsx` or
  `pdf.tsx`.
- Do NOT change the 3000 ms lifetime.
- If any caller is found that renders `note()` with elements after it, STOP and
  report: that caller would jump without the animation, and the finding needs
  re-opening rather than the call site changing silently.

## Verification

- **Mechanical**: `./scripts/check.sh test` (the suite currently stops on an
  unrelated pre-existing type error in `src/features/settings/notifications.tsx`
  — if that is the only failure, this plan did not introduce it).
- **Feel check**: on a device or emulator, open Notices → any notice → Copy
  link. The green line appears under the buttons in one frame; nothing above it
  moves. Wait three seconds; the line goes in one frame.
- **Reduce Motion**: repeat with the setting on. The result is identical, which
  is the point.
- **Done when**: `motionOn` and `LayoutAnimation` no longer appear in
  `src/features/notices/parts.tsx`, and a copy on all three screens shows no
  movement above the line.
