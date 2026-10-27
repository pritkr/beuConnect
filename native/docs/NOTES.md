# Notes & VVI — how the shelf is filled

The app reads **one** file:

```
https://beu.prit.eu.org/data/notes.json
```

Everything on the Notes & VVI screen comes from it. This document covers where
that file comes from, how to add notes, and what the app does when something is
missing.

## What the student sees

- **Course first.** The screen opens on the course last read here
  (`beu.notes.course`), then the one saved in Profile. Branch and semester chip
  rails switch it; the choice is remembered.
- **The shelf.** Heading like `CSE · Semester 5`, then the tally
  `8 subjects · 3 notes · 26 VVI topics` and `updated 2 days ago`. Subjects are
  ordered by VVI count, then name; each row shows its code, the first VVI topic
  and the counts as `VVI n` / `n notes` badges.
- **Search.** Matches subject name, code and VVI topic text. An exact code wins,
  then a code prefix. Typing is debounced.
- **Subject screen.** VVI cards carry the marks weight, a confidence dot and a
  selectable note; `Copy topic` copies the whole card as text. PDFs sit below,
  with kind, pages and size, and open in the app's shared reader
  (`pyqs.pdf`) — Notes has no PDF viewer of its own.
- **Offline.** A copy younger than 30 minutes renders with no request. An older
  copy renders at once and refreshes behind the screen; if the refresh fails the
  same copy stays and is labelled `Offline copy`.

## Folder layout

```
native/
  notes-src/
    vvi/
      cse-5.json              ← hand-authored VVI, one file per branch + semester
  scripts/
    notes/
      build-notes.py          ← the generator
public/
  data/
    notes.json                ← generated, never hand-edited
  notes/
    cse/5/
      105502/                 ← one folder per subject code
        subject.json          ← { "name": "Database Management Systems" }
        handwritten-dbms.pdf
      105503/
        handwritten-flat.pdf
```

Two file layouts are accepted:

1. **Folder form** — `public/notes/<branch>/<sem>/<code>/*.pdf`. All files in
   the folder belong to that code, so a PDF need not repeat the code in its
   name.
2. **Flat form** — `public/notes/<branch>/<sem>/<code>-<label>[-kind].pdf`. The
   file name must start with a VVI subject code that exists for that branch and
   semester; anything else is skipped with a warning.

A subject with PDFs but no VVI entry needs a `subject.json` in its folder to
supply the name. Without both, the folder is skipped and reported — the builder
never invents a title.

## Adding notes

1. Put the PDF in the right subject folder, or add a VVI entry first (shape
   below). `subject.json` is only needed when the subject has no VVI entry.
2. Or copy the file and rebuild in one command, from the repository root:

   ```sh
   ./native/scripts/notes/add-pdf.sh ~/Desktop/dbms-unit-1.pdf \
     cse 5 105502 "Database Management Systems" handwritten
   ```

   `kind` is `handwritten` (default), `short`, `vvi` or `formula`. The script
   names the file `<kind>-<slug>.pdf`, writes `subject.json` for a new folder,
   and runs the builder.
3. Rebuild and verify by hand:

   ```sh
   uv run python native/scripts/notes/build-notes.py
   uv run python native/scripts/notes/build-notes.py --check
   ```

   The first command writes `public/data/notes.json` and prints a summary plus
   every warning. The second compares the file on disk with a fresh build and
   exits non-zero when it is stale — that is the CI / pre-deploy gate.
4. Deploy the site. The app picks the manifest up within 30 minutes, or at the
   next refresh.

`build-notes.py` is Python 3 standard library only (no `pypdf`), takes
`--root` and `--out` for alternate trees, and reads page counts from the PDF's
own `/Type /Page` objects. A PDF that hides them gets `pages: null` rather than
a guess.

## VVI source shape

One file per branch and semester: `native/notes-src/vvi/cse-5.json`.

```json
{
  "branch": "cse",
  "sem": 5,
  "subjects": [
    {
      "code": "105502",
      "name": "Database Management Systems",
      "vvi": [
        {
          "topic": "Normalisation and functional dependencies",
          "note": "1NF removes repeating groups, 2NF removes partial dependencies on a composite key, 3NF removes transitive dependencies, and BCNF requires every determinant to be a superkey. Name the normal form each example reaches and why.",
          "marks": 8,
          "confidence": "high"
        }
      ]
    }
  ]
}
```

Rules the builder enforces:

| Rule | Why |
| --- | --- |
| `branch` is `cse`, `ece`, `ee`, `mech`, `civil` or `eee` | The app's course keys |
| `sem` is an integer `1`–`8` | BEU's eight semesters |
| A subject has a `code` or a `name`; codes are unique per branch + semester | Folder matching and stable IDs |
| `marks` is an integer or `null`, clamped to `2`–`12` | BEU paper weights; a guide, never a promise |
| `confidence` is `high`, `medium` or `low` | The dot on the card |
| `topic` is a non-empty string; `note` may be empty | A card with no note still helps |
| A PDF is under 8 MB (warning only) | The site is served through a worker |

The note is plain text: two or three sentences that answer the question beat a
paragraph that repeats it. `confidence: high` means the topic is structurally
unavoidable (a definition the syllabus names, a standard derivation); it does
not mean "leaked".

## Output

```json
{
  "updatedAt": "2026-10-27T09:14:02Z",
  "subjects": [
    {
      "id": "cse-5-105502",
      "branch": "cse",
      "sem": 5,
      "code": "105502",
      "name": "Database Management Systems",
      "vvi": [{ "topic": "…", "note": "…", "marks": 8, "confidence": "high" }],
      "files": [
        {
          "id": "cse-5-105502-handwritten-dbms",
          "title": "DBMS",
          "kind": "handwritten",
          "pages": 10,
          "bytes": 2052783,
          "url": "https://beu.prit.eu.org/notes/cse/5/105502/handwritten-dbms.pdf",
          "updatedAt": "2026-10-26"
        }
      ]
    }
  ]
}
```

The build is deterministic: identical inputs produce identical bytes. VVI
topics are sorted by marks (high first), then confidence, then topic; subjects
by branch, semester, VVI count and name; files by title. `updatedAt` moves only
when the content changes, so `--check` can compare the file byte for byte.

The app parses tolerantly: an unknown `kind` becomes `short`, a missing
`confidence` becomes `medium`, a missing `marks` becomes `null`, and a subject
without a branch or semester is dropped. A valid-but-empty manifest is a
success — it means there are no notes yet, not that the request failed.

## What the app does when data is missing

| Situation | Behaviour |
| --- | --- |
| No manifest and no cached copy, first run offline | Error state with Retry; no fake subjects |
| No notes for the chosen branch and semester | `No notes for Civil Engineering semester 3 yet.` plus `Papers for the same subjects` → the PYQ shelf |
| Search finds nothing | `No match for “…”` with `Clear search` |
| Subject screen opened for a code that is not in the manifest | `This subject is not on the notes shelf.` with a way back |
| Subject has VVI but no PDFs (or the reverse) | The subject still appears; the empty section says so |
| PDF deleted from the host | The shared reader shows its own error and browser fallback |
| Host answers with something that is not a manifest | Treated as a failed request: the cached copy stays, or the screen shows Retry — it is never read as "no notes" |
| Manifest cached, network down | The cached copy is shown and labelled `Offline copy` |

Nothing on this screen invents content. If the manifest does not say it, the
screen does not show it.

## Files this pipeline owns

| File | Role |
| --- | --- |
| `native/notes-src/vvi/*.json` | human-authored VVI source |
| `public/notes/**` | PDFs and `subject.json` names |
| `native/scripts/notes/build-notes.py` | generator (`--check` gate) |
| `native/scripts/notes/add-pdf.sh` | copy one PDF + rebuild |
| `public/data/notes.json` | generated manifest the app reads |
| `native/src/features/notes/{data.ts,parts.tsx,index.tsx}` | app data layer and screens |
