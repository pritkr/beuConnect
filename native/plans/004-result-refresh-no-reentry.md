# 004 — A refresh must not re-enter the result card

- **Status**: DONE (2026-11-01) — `enteredResult` latch at module scope; `Fresh` key
  untouched. Gate green; the device feel check is still outstanding (no device
  attached).
- **Commit**: 62ec345
- **Severity**: MEDIUM
- **Category**: Performance / purpose & frequency
- **Estimated scope**: 1 file, ~10 lines

## Problem

The result card is wrapped in the app's entrance:

```tsx
// src/features/results/lookup.tsx:365 — current
<If when={data()}>
  {() => (
    <Fresh
      when={`view:${data()?.reg}:${data()?.semester}:${data()?.source}:${data()?.savedAt}`}
      build={() => {
        const result = data();
        if (!result) return <View />;
        // The screen swaps a skeleton for the result in place, so the
        // result arrives rather than replaces. One motion on the whole
        // card: the marks are what the student came for, not a reveal
        // to stagger.
        return (
          <Enter>
            <ResultView ... />
          </Enter>
        );
      }}
    />
  )}
</If>
```

`Fresh` rebuilds its child whenever the key changes
(`src/features/results/shared.tsx:162`), and the key includes `savedAt` and
`source`. A successful pull-to-refresh writes a new `ResultData` with a new
`savedAt` (`src/features/results/lookup.tsx:184-188`), so the **whole card
re-enters** — a 240 ms `opacity` + `translateY` over a large subtree — at the
exact moment the network has just finished and the JSON has just been parsed.

Two things are wrong with that:

- The screen's own promise is the opposite: "a refresh never blanks a result the
  student is reading" (`src/features/results/lookup.tsx:14`).
- It is motion that plays while the main thread is busiest (parse, commit,
  storage write, recent-list read at lines 184-199), which is when a large
  subtree's opacity animation is most likely to stutter on a mid-range phone.

A **new** result — a different registration number or semester — should still
enter. A refresh of the same one should update in place.

## Target

The card rises when a different result replaces the skeleton, and only then.

```tsx
// file scope, above the screen component
/** The result whose entrance has played; a refresh of the same one updates in place. */
let enteredResult = "";
```

```tsx
// src/features/results/lookup.tsx:365 — target
<If when={data()}>
  {() => (
    <Fresh
      when={`view:${data()?.reg}:${data()?.semester}:${data()?.source}:${data()?.savedAt}`}
      build={() => {
        const result = data();
        if (!result) return <View />;
        // The card arrives when a different result replaces the skeleton. A
        // refresh of the same one updates in place: re-entering content the
        // student pulled down for is motion, not information.
        const id = `${result.reg}:${result.semester}`;
        const first = id !== enteredResult;
        enteredResult = id;
        const body = (
          <ResultView
            data={result}
            onRank={() => nav.push("results.rank", { reg: result.reg, sem: result.semester })}
            onBattle={() => nav.push("results.battle", { a: result.reg, sem: result.semester })}
          />
        );
        return first ? <Enter>{body}</Enter> : body;
      }}
    />
  )}
</If>
```

The `Fresh` key stays exactly as it is: the rebuild is what repaints numbers
that changed in a re-evaluation. Only the entrance is latched.

## Repo conventions to follow

- `Enter` is mount-scoped on purpose; do not add props to it
  (`src/ui/enter.tsx`).
- A latch that must survive a rebuild is a module-level `let` — the same pattern
  as `recentHydrated` in `src/features/notices/parts.tsx:423` and the one in
  plan 002.
- `ResultData` carries `reg` and `semester`; read them from the object, not from
  the screen's signals, so a result for another student is compared against the
  one actually on screen.

## Steps

1. Add the file-scope `let enteredResult = ""` with the comment above, at module
   scope, beside the screen's other module state (not inside the component).
2. In the `build` callback at `src/features/results/lookup.tsx:369`, compute
   `id`, `first`, and build `const body = (<ResultView … />)` exactly as shown.
3. Return `first ? <Enter>{body}</Enter> : body`.
4. Leave the `<Fresh when={…}>` string untouched.

## Boundaries

- Do NOT change the `Fresh` key, `Fresh` itself, or `ResultView`.
- Do NOT change `Enter`, its duration or its curve.
- Do NOT touch the skeleton, the stale-copy panel or the error branch.
- If `ResultData` has no `reg`/`semester` at the cited lines, STOP and report —
  the identity key is wrong and the latch would never reset.

## Verification

- **Mechanical**: `bunx tsc --noEmit -p tsconfig.json` (the pre-existing
  `src/features/settings/notifications.tsx` error is unrelated).
- **Feel check**: open a saved result, pull to refresh. The numbers may change;
  the card must not rise or fade. Then look up a **different** registration
  number: the new card rises once.
- **Slow motion**: with the device's animation scale at 10×, the refresh shows
  no movement at all; the new lookup shows a single 240 ms rise.
- **Done when**: a refresh of the same result produces zero animation frames on
  the card.
