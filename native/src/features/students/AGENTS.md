# `students` — the college register

This area joins two different datasets. Confusing them is the usual bug.

| Data | Where | Built by |
|---|---|---|
| The register: who exists | `src/features/students/roster-data.ts` (packed app form) | `bun scripts/build-students-data.mjs` |
| The register: canonical JSON + site CSVs | `assets/data/students-gecs.json`, `src/data/students/*.csv` | `uv run python native/scripts/build-students-data.py` |
| Published results | BEU roster/wide CSVs, via `results/` | not stored here |

Counts in the generated file headers are authoritative. Prose docs may lag; do
not copy a number forward without checking the header. The register is GEC
Sheikhpura (college `157`); `ROSTER_TOTAL`, `ROSTER_SESSIONS` and
`ROSTER_BRANCH_COUNTS` are the published counts.

## Rules

- **Never hand-edit `roster-data.ts`.** It is generated, verified row-for-row,
  and refuses to write if the decode does not match.
- **The register's `Session`/`Batch` wins.** A year-back student can carry an
  earlier registration year; do not derive the batch from the registration
  number when the row has one.
- **Reg ≠ roll.** `provisionalReg` is true for rows whose "reg" is really a roll
  (all 2K26). Roll numbers are not unique across batches; registration numbers
  are the key.
- **PII stays out of output.** Read the CSVs, never print names/numbers/mobiles
  into logs, tests, screenshots or docs. Use synthetic values in tests.
- **The lead join is BEU-only.** `leads.ts` drops a row without a published
  CGPA and a row from another college; it never defaults a mark. `LEAD_BRANCHES`
  is the set BEU publishes (MET has no code).
- **Sorting is the published order**, not a new rank. `rank.ts` is the pure
  logic; change it with a unit test.

## Regenerate

```sh
bun scripts/build-students-data.mjs --check
bun scripts/build-students-data.mjs
uv run python native/scripts/build-students-data.py --check   # canonical JSON + CSVs
```

Then `./scripts/check.sh test` and `./scripts/size-report.sh` — the roster is
bundled data and counts against the APK budget.

## Files

`roster-data.ts` (generated), `leads-data.ts` (generated join input),
`data.ts`, `rank.ts`, `students.tsx`, `student.tsx`, `college.tsx`,
`branch.tsx`, `leads.tsx`, `components.tsx`.
