# Syllabus parity — site ↔ native

Snapshot **2026-10-26** · site `https://beu.prit.eu.org` · app `native/`

The site's syllabus pages (`/syllabus`, `/[branch]`, `/[branch]/[sem]`, `/x`)
read `src/assets/data/branches/*.json` and `src/assets/data/gate/*.json`. The app
ships the same content through `src/features/syllabus/data/packs.ts`
(`BRANCH_PACKS`, `GATE_PACKS`), packed by `scripts/data/build-packs.ts` and
guarded by `scripts/data/verify-packs.ts`. This file records what survived that
trip, what did not, and why.

Measured with a read-only audit of both sides: every subject matched on
`(code, name)`, then compared field by field after whitespace normalisation.

## 1. Branch totals

| Branch | Site rows | App subjects | Semesters published | Units | Topics |
|---|---:|---:|---|---:|---:|
| CSE | 72 | **71** | 1–6 | 305 | 928 |
| ECE | 42 | 42 | 1–5 | 177 | 841 |
| EE | 54 | 54 | 1–5 | 180 | 873 |
| MECH | 57 | 57 | 1–6 | 231 | 810 |
| CIVIL | 71 | 71 | 1–6 | 323 | 1,454 |
| EEE | 47 | 47 | 1, 2, 3, 6 | 191 | 582 |
| **Total** | **343** | **342** | — | **1,407** | **5,488** |

Per semester, site rows → app subjects (all equal except CSE 6):

| Branch | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---:|---:|---:|---:|---:|---:|
| CSE | 10 → 10 | 10 → 10 | 12 → 12 | 11 → 11 | 6 → 6 | **23 → 22** |
| ECE | 10 → 10 | 10 → 10 | 10 → 10 | 5 → 5 | 7 → 7 | — |
| EE | 10 → 10 | 10 → 10 | 11 → 11 | 13 → 13 | 10 → 10 | — |
| MECH | 10 → 10 | 9 → 9 | 10 → 10 | 6 → 6 | 8 → 8 | 14 → 14 |
| CIVIL | 10 → 10 | 10 → 10 | 12 → 12 | 10 → 10 | 9 → 9 | 20 → 20 |
| EEE | 10 → 10 | 10 → 10 | 10 → 10 | — | — | 17 → 17 |

**Zero subjects missing, zero extra, zero unit-text differences.** Credits,
types, contact hours and electives match on all 342 subjects. Four `name`s and
18 `code`s are not byte-identical, and every one is a deliberate, recorded fix:
one merged duplicate and three titles completed where the source cut mid-word
(§2), plus the 18 blank codes the app mints an id for (§6). Every row the site
shows, the app shows, on one screen.

## 2. The one row that merged: CSE Sem 6 `105601`

`cse.json` carries the same paper twice in Semester 6:

| Code | Name | Content |
|---|---|---|
| `105601` | Compiler Design | 1,462 chars of unit text |
| `105601` | Complier **Design** (sic) | empty |

`decode.ts` normalises the pack by `(branch, semester, code)` and keeps the
**richer** row, so the app has one `105601` with the units and credits of the
first row. This is the 343 → 342 difference, and it is the correct merge: no
content is lost, and the typo'd shell row adds nothing.

### Three names the source cut mid-word

The site's own JSON truncates three titles mid-word; the app carries the full
paper name, so the row is the same paper but the string is not identical:

| Branch · Sem | Code | Site name (truncated) | App name |
|---|---|---|---|
| ECE · 5 | `EC112` | Linear Integrated Circuits **And** | Linear Integrated Circuits And **Applications** |
| ECE · 5 | `EC113` | Probability Theory And **Stochastic** | Probability Theory And Stochastic **Process** |
| EE · 5 | `PCC-EEE13` | Power Systems - I (Apparatus **and** | Power Systems - I (Apparatus and **Modelling)** |

Codes, credits, unit text and references are untouched; only the display name
is completed. A student searching for the real title finds the paper, and a
professor reading the row is not shown a sentence that stops mid-word.

## 3. References: 190 count differences, 0 text differences

190 subjects carry fewer `references` entries in the app than on the site
(e.g. Engineering Mathematics–I: 5 vs 11). In every one of the 190, the joined
text is identical once list numbering is dropped: the site stores each **wrapped
PDF line** as an entry, the pack stores each **numbered item** joined. Same
words, same order, different line breaks.

No `.tsx` in the app renders `references` today — the paper screen reads units
and the full `content` — so this is a storage-shape difference, not a capability
gap. The audit proved all 190 reflow-only by joining each set and stripping list
numbering. The suite runs headless from the shipped pack, so it pins the shape
instead — **206 papers, 934 lines, none blank** — and a refresh that actually
drops text moves those numbers.

## 4. Empty content: 19 papers

Every subject below has a code, credits and a type but **no unit text**, on the
site as well (except the last two, which are stubs upstream too — same cause).
The app shows the honest empty state ("No unit text for this paper") and never
invents units.

| Branch | Sem | Code | Paper |
|---|---:|---|---|
| CSE | 6 | `100604P` | NPTEL Courses-2 Lab |
| EE | 4 | `X-HSMC-ELECTIVE-COURSES` | HSMC Elective Courses |
| EE | 4 | `X-ENVIRONMENTAL-SCIENCE` | Environmental Science |
| EE | 4 | `X-CAPSTONE-DESIGN-PROJEC` | Capstone Design Project |
| EE | 4 | `X-NCC-NSS-OTHER-CLUBS-SO` | NCC / NSS / other Clubs & Society |
| EE | 5 | `X-CAPSTONE-DESIGN-PROJEC` | Capstone Design Project |
| EE | 5 | `X-MOOCS-SWAYAM-NPTEL-COU` | MOOCs / SWAYAM / NPTEL Courses - 2 |
| EE | 5 | `X-PROFESSIONAL-ELECTIVE-` | Professional Elective Laboratory - 1 |
| EE | 5 | `X-SUMMER-ENTREPRENEURSHI` | Summer Entrepreneurship - II |
| MECH | 4 | `X-ENVIRONMENTAL-SCIENCE` | Environmental Science |
| MECH | 5 | `X-CONSTITUTION-OF-INDIA-` | Constitution of India / Essence of Indian |
| MECH | 5 | `X-SUMMER-ENTREPRENEURSHI` | Summer Entrepreneurship-II |
| MECH | 5 | `X-OPEN-ELECTIVE-I-MOOCS-` | Open Elective- I (MOOCs / SWAYAM / NPTEL |
| MECH | 5 | `X-GRADUATE-EMPLOYABILITY` | Graduate Employability Skills and |
| CIVIL | 4 | `X-OPEN-ELECTIVE-I-HUMANI` | Open Elective-I (Humanities) MOOC |
| CIVIL | 4 | `X-MANAGEMENT-I-ORGANIZAT` | Management I (Organizational |
| CIVIL | 5 | `X-SUMMER-ENTREPRENEURSHI` | Summer Entrepreneurship-II |
| CIVIL | 6 | `100604P` | NPTEL Courses-2 |
| EEE | 6 | `103601P` | Power Systems-II Lab |

18 of the 19 are one-off elective/skill baskets BEU never published a unit
list for; the remaining `100604P` appears twice, as CSE and CIVIL Sem 6
`NPTEL Courses-2`, and is empty in both.

**The one fillable-looking stub that is not fillable:** `sylpy/civil_6.json`
holds a candidate body for CIVIL Sem 6 `100604P NPTEL Courses-2`, but the text
is a **Construction Management** syllabus, and the same file's
`Geotechnical Engineering -II` entry holds sewage/Environmental text. Attaching
it would print the wrong syllabus under the right code, so it stays empty and is
recorded here instead of being "fixed". A wrong page is worse than an honest
gap.

## 5. Semesters that do not exist upstream: 16

| Branch | Published | Missing upstream |
|---|---|---|
| CSE | 1–6 | 7, 8 |
| ECE | 1–5 | 6, 7, 8 |
| EE | 1–5 | 6, 7, 8 |
| MECH | 1–6 | 7, 8 |
| CIVIL | 1–6 | 7, 8 |
| EEE | 1, 2, 3, 6 | 4, 5, 7, 8 |

The site prints nothing for these, so the app prints nothing either: the
semester rail lists only published semesters, and a deep link to an unpublished
one (`/syllabus/cse/8`) says so and offers the nearest published semester. No
semester is invented to fill the grid. A batch-23 student (Sem 7 in the 2026–27
session) therefore lands on their own semester and sees that honest state, with
one tap to Sem 6.

## 6. Blank codes: 18 rows, normalised into stable ids

18 site rows print `"-"` as their code (EE 4 ×5 incl. Biology-I and
`PCC-EEE14 Power Systems - I Lab`, EE 5 ×5, MECH 4 ×1, MECH 5 ×4, CIVIL 4 ×2,
CIVIL 5 ×1). The 18 ids are baked into the shipped wire by the pack step, using
`decode.ts` `derivedCode()`: `X-<SLUG>` from the name — the slug is upper-cased,
non-alphanumerics become `-`, and it is capped at **22** characters, so the code
itself is at most 24 (`-P` is appended for a practical). The same rule runs at
decode, so a blank code in a future refresh gets the same treatment. Those
papers get a stable, searchable id (`X-ENVIRONMENTAL-SCIENCE`,
`X-SUMMER-ENTREPRENEURSHI`, …). The site keeps `"-"`.

The 18 rows carry **14 distinct ids**: the same placeholder name recurs in
different semesters (Summer Entrepreneurship-II in EE, MECH and CIVIL Sem 5;
Environmental Science in EE and MECH Sem 4; Capstone Design Project in EE Sem 4
and 5). Every id is unique **inside its semester**, which is what the app keys
on — `branch|semester|code` — so saves, marks, notes and PYQ links stay
separate. No minted id can collide with a real code, because no real code
starts with `X-`.

## 7. Upstream source quirks (documented, not copied)

| Quirk | Where | App behaviour |
|---|---|---|
| `branch: "ece"` on the EE file | `ee.json` | ignored; the filename is the branch |
| `branch: "ece"` on the EEE file | `eee.json` | ignored; the filename is the branch |
| No `name` field in any branch file | all six | names come from `src/assets/data/config.json` (`BRANCH_META`) |
| `cse copy.json` (a duplicate of CSE) | data dir | not packed |
| `branch: "CSE"` uppercase | `cse.json` | normalised to the code `cse` |

## 8. GATE: 30 papers, superset of the site

The site publishes 30 GATE papers. The app carries all 30 with the same codes
and names, 299 sections and 932 topics (203,620 characters of section text).

Eight site papers have `sections: []` (DA, GG, MA, BM, PE, ST, XH, GE). The app
fills those from the official 2026 syllabus text
(`scripts/data/extract_gate.py` → `GATE_PACKS`), so the app is a **superset**:
every site section exists in the app byte-for-byte, and no paper opens empty.
This is the only place the app deliberately carries more than the site, and it
is additive — nothing the site prints is dropped.

## 9. What the student gets that the site does not

Same content, different job:

- **Topic progress and saved papers/topics** — keys are `branch|sem|code|topic`,
  so marks survive a data refresh and are shared by every screen.
- **Cross-branch search** — code, paper name, topic title, then topic body, with
  the hit's branch and semester on the row.
- **In-paper search** that jumps to the unit, not just the paper.
- **Your course first** — a profile names a branch and semester; the landing
  opens there, pins that semester first in the rail and marks papers shared with
  the student's own semester. With no profile the landing behaves exactly as
  before (saved course, else CSE Sem 1).
- **Per-topic Ask AI and the paper's Notes / Previous papers** in the same place.

## 10. Regenerating

```sh
bun scripts/data/build-packs.ts --check     # shipped packs match the generator
bun scripts/data/build-packs.ts --from-site --write   # re-import site JSON
bun scripts/data/verify-packs.ts            # decode invariants (counts, hashes)
uv run python scripts/verify.py             # assets/data ↔ source PDFs
```

`qa/data.test.ts` checks that every branch on the shelf decodes into subjects
and units, and `bun scripts/data/verify-packs.ts` pins the numbers in this file:
per-branch and per-semester subject counts, per-branch units and topics, the 19
stubs, the 18 minted codes, the 206/934 reference shape, the three completed
titles and the 30 GATE papers. A data refresh that changes any of them fails the
gate and points back here.
