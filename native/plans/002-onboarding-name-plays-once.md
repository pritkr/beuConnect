# 002 — The name on the first-run screen plays its entrance once

- **Status**: DONE (2026-11-01), with a caveat — step 1 could not be run (no device or
  emulator attached), so the latch was applied as the guaranteed form. Reading the
  source, `who()` stays set through a re-check, so the slot keeps returning
  `RosterMatch` and the entrance is expected to play once already; the latch is
  therefore insurance, not a proven fix. Kept because it is cheap, invisible, and
  makes the invariant explicit. The device feel check remains outstanding. Gate green.
- **Commit**: 62ec345
- **Severity**: MEDIUM
- **Category**: Interruptibility / purpose & frequency
- **Estimated scope**: 1 file, ~10 lines

## Problem

The first-run screen resolves a registration number to a name while the student
is still typing. From the 8th digit on, every keystroke starts a new roster
check, and the check replaces `who()`.

The name is rendered from a reactive slot:

```tsx
// src/features/onboarding/index.tsx:180 — current
{() => {
  const now = phase();
  const found = who();
  // A resolved name outranks the check: it is the same name the
  // roster just gave, and it stays put while the next one is read.
  if (found) return <RosterMatch who={found} checking={now === "checking"} />;
  ...
}}
```

and `RosterMatch` wraps itself in the app's entrance:

```tsx
// src/features/onboarding/index.tsx:58 — current
function RosterMatch(props: { who: Identity; checking: boolean }) {
  return (
    <Enter>
      <View class={`gap-1 transition-opacity duration-150 ease-out ...`}>
```

`Enter` creates its motion at component scope (`src/ui/enter.tsx:33`), so the
240 ms rise plays **once per mount** — and this file already relies on a changed
key meaning a new mount (`Fresh`, `src/features/results/shared.tsx:162`, rebuilds
its child whenever `when` changes). If the slot above replaces `RosterMatch`
when `who()` or `phase()` changes — which is what a re-check does on every
keystroke past the 8th digit — the name rises again on every digit, under the
thumb of someone typing.

This is a runtime question, not a code-reading one: nsh may reconcile the slot
by component type and keep the instance. **Step 1 settles it.**

## Target

The name rises exactly once, when it first resolves, and then stays put through
every re-check. A re-check dims it (the existing `opacity-60`), nothing more.

## Repo conventions to follow

- `Enter` is the app's one entrance and is deliberately mount-scoped; do not add
  props to it (`src/ui/enter.tsx`).
- The name is kept on screen through a re-check on purpose — see the comment at
  `src/features/onboarding/index.tsx:50-57`. Never fall back to swapping in
  skeletons.
- A latch that outlives a remount is a module-level `let`, the pattern already
  used for one-shot hydration in this codebase (e.g. `recentHydrated` in
  `src/features/notices/parts.tsx:423`).

## Steps

1. **Check first.** Run the app (`nsh run App.tsx`), open the first-run screen
   (`beu.onboarding` cleared), and type `2410515701` one digit every ~1 second.
   Watch the name.
   - Rises once and then only dims → mark this plan **NOT NEEDED**, note the
     check in the PR/commit message, and stop. Do not change any code.
   - Rises (or fades) again on a later digit → continue.
2. In `src/features/onboarding/index.tsx`, above `RosterMatch`, add the latch:

   ```tsx
   /** The name plays its entrance once; a re-check must not replay it. */
   let nameArrived = false;
   ```

3. Rewrite `RosterMatch` so the entrance is used only on the first arrival:

   ```tsx
   function RosterMatch(props: { who: Identity; checking: boolean }) {
     const first = !nameArrived;
     nameArrived = true;
     const body = (
       <View
         class={`gap-1 transition-opacity duration-150 ease-out motion-reduce:transition-none ${
           props.checking ? "opacity-60" : ""
         }`}
       >
         {/* existing children, unchanged */}
       </View>
     );
     return first ? <Enter>{body}</Enter> : body;
   }
   ```

   Keep the existing children exactly as they are; only the `Enter` wrapper and
   the `const body` are new.

## Boundaries

- Do NOT change `Enter` (`src/ui/enter.tsx`), its duration, its curve or its
  mount scope.
- Do NOT touch the skeleton branch or the `statusLine` branch of the slot.
- Do NOT add a second entrance anywhere on this screen.
- If step 1 says the entrance already plays once, discard the rest of this plan.

## Verification

- **Mechanical**: `bunx tsc --noEmit -p tsconfig.json` clean apart from the
  pre-existing `src/features/settings/notifications.tsx` error.
- **Feel check**: clear `beu.onboarding`, type the number at one digit per
  second. The name rises once, on first resolution; digits 9, 10 and 11 only dim
  it and bring it back. Type slowly enough to see each state.
- **Reduce Motion**: with the setting on, the name appears with no rise at any
  point.
- **Done when**: the name rises at most once per launch of the screen.
