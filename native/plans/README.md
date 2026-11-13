# Animation plans

Output of the `improve-animations` audit run on 2026-10-31 (`62ec345`), after the
`remove-animations` pass in the same session.

All four are implemented (2026-11-01). `./scripts/check.sh test` is green
(407 tests); the device feel checks are the only outstanding verification, since
no emulator or phone was attached.

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | [Confirmation line: stop animating a reflow that never happens](001-confirmation-line-no-reflow.md) | MEDIUM | DONE |
| 002 | [First-run name plays its entrance once](002-onboarding-name-plays-once.md) | MEDIUM | DONE (step 1 not run — no device) |
| 003 | [Ask AI row: name the transitioned properties](003-ask-ai-named-transition.md) | LOW | DONE |
| 004 | [A refresh must not re-enter the result card](004-result-refresh-no-reentry.md) | MEDIUM | DONE |

## Order

1. **001** — independent, four lines deleted, no runtime check needed.
2. **003** — independent, one line.
3. **004** — independent, one latch. It removes a full-card entrance that plays
   while the fetch result is being committed.
4. **002** — run its step 1 first. It may resolve to "not needed", in which case
   close the plan without touching code.

None of the four depend on each other; 002 and 004 share the same latch pattern
and can be done by the same executor in one sitting.

## Not findings (checked, deliberately left alone)

- **Press washes at 150 ms `ease-out`** — consistent across every pressable and
  documented in `src/ui/enter.tsx` and `docs/A11Y_AUDIT.md`. Colour transitions
  could use `ease`, but the repo's convention is deliberate; not re-litigated.
- **`Check`, the Home focus tile and `SemCard` keep `active:scale`** — they are
  the three pressables with no colour wash on press, so the scale is their only
  feedback. Everything else was reduced to the wash in the removal pass.
- **`LayoutAnimation` on accordions and row expansion** — it is the app's answer
  to a real layout jump, gated by `motionOn()`. Removing it would reveal the
  jump, not remove work.
- **`Dialog animation="slide"` on the calendar reader** — platform-native sheet
  motion for a rare surface. Whether it honours Reduce Motion is nsh's business,
  not this repo's; feel-check it on a device rather than guessing from source.
