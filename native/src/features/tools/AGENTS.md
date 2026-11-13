# `tools` — calculators, attendance, routine, holidays

Student-facing maths must be explainable. Every formula here is a BEU rule, not
a design choice.

## Rules

- **Pure maths lives in `engine.ts`.** SGPA/CGPA are credit-weighted; the BEU
  grade bands, the ESE minimum and the pass rule come from `assets/data/grading.json`
  and the site's calculator engine. Do not fork a second formula in a screen.
- **Every number shows its units and its assumption.** A target-SGPA plan, a
  bunk count and a percentage each name the semester and the credits they used.
- **No invented dates or holidays.** `holidays-data.ts` is the 2026 calendar from
  the site; an unknown year is a gap, not a guess.
- **Saved work is student state.** Keys live in `state.ts` (`KEYS`):
  `tools.calculator`, `tools.calculator.extras`, `tools.attendance`,
  `tools.routine`, `tools.wifi`. Clearing a cache must not clear them.
  `tools.attendance.gecs` is the exception: it is the last GECS register
  snapshot, so Attendance reset clears it with the counts it fed.
- **Attendance undo is real.** The log keeps the previous state; an undo that
  only edits the count is a bug.
- **Routine is per-student.** `/routine?reg=…` is a live proxy; parse in
  `routine-parse.ts`, never in the screen, and show an empty state when it
  fails.
- **The Wi-Fi password is stored, deliberately.** Automatic sign-in runs from
  an Android `JobService` with the app closed, so it has nothing else to read:
  `tools.wifi` keeps the password on the device and the screen says where it
  lives. It goes to the portal host the network itself named, never anywhere
  else. Do not add a second copy, a log line that contains it, or a "never
  stored" promise. The runner logs one `beu-wifi` line per state *change* —
  the phase and the portal's own sentence, never the credentials.
- **Aliases stay registered.** `attendance`, `routine`, `holidays`, `wifi`
  are compatibility names for `tools.*`; same render, no new screen. `feedback`
  is the exception: it lives in `features/feedback` (the shell mounts its sheet
  and every `Body` ends with its footer), and `tools.feedback` is its alias.
- **44 pt and 320 pt.** Calculator keys, day chips and attendance rows are
  pressed constantly on small phones.

## Files

| File | Owns |
|---|---|
| `engine.ts` | grades, SGPA/CGPA, target plan, percentage, bunk maths, dates |
| `state.ts`, `store.ts` | signals, persisted shapes, `KEYS` |
| `calculator.tsx`, `predict.tsx` | result and target calculators |
| `attendance.tsx`, `routine.tsx`, `routine-parse.ts` | day-to-day utilities |
| `holidays.tsx`, `holidays-data.ts`, `calendar.ts` | 2026 calendar |
| `hub.tsx`, `index.tsx`, `kit.tsx`, `shared.tsx` | hub, route table, shared UI |
| `wifi.tsx`, `wifi-auto.ts`, `wifi-bridge.tsx` | campus Wi-Fi: the screen, the runner's states, the Android wire |
| `gecs.ts` | GECS register client, normaliser and offline snapshot |

## Gate

`qa/unit/logic.test.ts` is the formula contract. Change a band, a credit rule or
a date helper in the same commit as its test. Then `./scripts/check.sh test`.
