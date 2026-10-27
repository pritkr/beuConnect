# `notes-src` — the VVI source

`vvi/<branch>-<sem>.json` is the hand-authored source for the Notes & VVI
screen. It is an input, not a shipped asset: the app reads the generated
`public/data/notes.json`.

## Rules

- **One file per branch + semester.** Keys are the app's course keys (`cse`,
  `ece`, `ee`, `mech`, `civil`, `eee`) and semesters 1–8.
- **No invented notes.** Every `topic`, `note` and `marks` value must come from
  the syllabus/papers or the contributor's own explanation. `confidence` says
  how sure the source is; do not raise it by editing the field.
- **A subject with no notes is absent**, not empty prose. The builder and the
  screen both handle a missing subject.
- **PDFs live beside the source**, under
  `public/notes/<branch>/<sem>/<code>/*.pdf`, and are indexed by the builder.
- **Never edit `public/data/notes.json`.** Rebuild it:

```sh
uv run native/scripts/notes/build-notes.py
uv run native/scripts/notes/build-notes.py --check
```

The build is deterministic (`--check` compares bytes), so a one-line change is
a one-line diff. `docs/NOTES.md` has the full folder and validation rules.
