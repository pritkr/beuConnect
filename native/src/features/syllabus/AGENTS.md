# `syllabus` — generated syllabus and GATE packs

`data/packs.ts` and `data/table/` are generated wire data. `data/decode.ts`
documents the format and expands it on first read per branch. Editing a pack by
hand is always wrong: the next `build-packs.ts` run erases it.

## Source of truth

- `BRANCH_PACKS` / `GATE_PACKS` are the app's export; the site's JSON plus the
  fixes this app carries.
- `DATA_SNAPSHOT` in `packs.ts` is the date. Change it only through a
  regeneration that actually changed the data.

## Regenerate

```sh
cd native
bun scripts/data/build-packs.ts --check      # is the shipped file stale?
bun scripts/data/build-packs.ts              # lossless re-pack
bun scripts/data/build-packs.ts --from-site  # import newer site JSON (needs --write)
bun scripts/data/verify-packs.ts             # decode, counts, per-branch hash
```

A plain run is byte-identical when nothing changed. `--from-site` prints what
changed branch by branch before writing.

## Rules

- **No invented topics.** A subject with no source text is a stub
  (`units: []`, `confidence: "none"`), not prose.
- **Codes are unique per semester**; the pack verifier checks this. The five
  Mechanical Sem 7 subjects (102701–102706) are a documented repair, not a
  pattern to copy.
- **Ticks are student state, not data.** `beu.syllabus.studied` holds progress;
  `beu.syllabus.saved` holds bookmarks; `beu.syllabus.course` holds the course.
  Clearing bundled data must not clear these.
- **Search** covers subjects, units and topics from the decoded packs; do not
  build a second index in the screen.
- **GATE** has 30 papers. The site ships `sections: []` for eight of them
  (DA, GG, MA, BM, PE, ST, XH, GE); the app fills those from the official 2026
  text, so no paper opens empty. The site-only gap is recorded in
  `docs/SYLLABUS_PARITY.md` §8 — keep every paper's "no text" state honest.

## Files

| File | Owns |
|---|---|
| `index.tsx` | route table and screens |
| `data/packs.ts`, `data/table/`, `data/decode.ts` | generated data + wire format |
| `parse.ts`, `course.ts`, `active.ts`, `you.ts` | parsing and saved-course logic |
| `parts.tsx`, `topic-actions.tsx` | shared UI |

## Gate

`bun scripts/data/verify-packs.ts`, `qa/data.test.ts` (the shelf decodes) and
`qa/screens.test.tsx` (a paper and a topic render) then `./scripts/check.sh test`.
