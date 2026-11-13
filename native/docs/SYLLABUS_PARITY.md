# Syllabus parity — site ↔ native

Snapshot **2026-10-28** · site `https://beu.prit.eu.org` · app `native/`

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
| CSE | 72 | **71** | 1–6 | 302 | 884 |
| ECE | 47 | 47 | 1–5 | 178 | 799 |
| EE | 51 | 51 | 1–5 | 176 | 814 |
| MECH | 60 | 60 | 1–6 | 232 | 811 |
| CIVIL | 74 | 74 | 1–6 | 314 | 1,225 |
| EEE | 57 | 57 | 1, 2, 3, 4, 6 | 221 | 761 |
| **Total** | **361** | **360** | — | **1,423** | **5,294** |

Per semester, site rows → app subjects (all equal except CSE 6):

| Branch | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---:|---:|---:|---:|---:|---:|
| CSE | 10 → 10 | 10 → 10 | 12 → 12 | 11 → 11 | 6 → 6 | **23 → 22** |
| ECE | 10 → 10 | 10 → 10 | 10 → 10 | 10 → 10 | 7 → 7 | — |
| EE | 10 → 10 | 10 → 10 | 11 → 11 | 10 → 10 | 10 → 10 | — |
| MECH | 10 → 10 | 9 → 9 | 10 → 10 | 9 → 9 | 8 → 8 | 14 → 14 |
| CIVIL | 10 → 10 | 10 → 10 | 12 → 12 | 13 → 13 | 9 → 9 | 20 → 20 |
| EEE | 10 → 10 | 10 → 10 | 10 → 10 | 10 → 10 | — | 17 → 17 |

**Zero subjects missing, zero extra, zero unit-text differences.** Credits,
types, contact hours and electives match on all 360 subjects. Three `name`s and
10 `code`s are not byte-identical, and every one is a deliberate, recorded fix:
one merged duplicate and three titles completed where the source cut mid-word
(§2), plus the 10 blank codes the app mints an id for (§6). Every row the site
shows, the app shows, on one screen.

Semesters 1–3 and 5–6 carry the scheme the site already had. **Sem 4 is the
2024-28 scheme for all six branches** (EE and CSE were already; CIVIL, ECE, MECH
and EEE were re-transcribed from BEU's own Semester-IV documents, which renamed
`101401`–`101407`, `102401`–`102405`, `104401`–`104405` and `110401`–`110406`
and added their labs). Both sides changed together, so parity holds; the scheme
evidence is in `src/features/syllabus/data/AUDIT.md` §1.

## 2. The one row that merged: CSE Sem 6 `105601`

`cse.json` carries the same paper twice in Semester 6:

| Code | Name | Content |
|---|---|---|
| `105601` | Compiler Design | 1,462 chars of unit text |
| `105601` | Complier **Design** (sic) | empty |

`decode.ts` normalises the pack by `(branch, semester, code)` and keeps the
**richer** row, so the app has one `105601` with the units and credits of the
first row. This is the 361 → 360 difference, and it is the correct merge: no
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

## 3. References: 207 subjects, 1,822 entries, identical on both sides

The pack stores each **numbered item** as one entry, and so does the site JSON —
`build-packs.ts --from-site` runs `decode.ts`'s `normalise`, which joins a
wrapped PDF line back into the item it belongs to. So every subject's reference
list is entry-for-entry the same on both sides: 207 subjects carry references,
1,822 entries in total, and no subject differs in count or text.

Earlier snapshots recorded 190 count differences here, because the import step
stored the site's wrapped lines as separate entries. That is fixed at the
source, not papered over downstream.

No `.tsx` in the app renders `references` today — the paper screen reads units
and the full `content` — so this is a storage-shape detail, not a capability
gap. `bun scripts/data/verify-packs.ts` pins the 1,822 total.

## 4. Empty content: 13 papers

Every subject below has a code, credits and a type but **no unit text**, on the
site as well. The app shows the honest empty state ("No unit text for this
paper") and never invents units.

| Branch | Sem | Code | Paper |
|---|---:|---|---|
| CSE | 4 | `105407` | NPTEL-I (Open Course) |
| CSE | 6 | `100604P` | NPTEL Courses-2 Lab |
| EE | 5 | `X-CAPSTONE-DESIGN-PROJEC` | Capstone Design Project |
| EE | 5 | `X-MOOCS-SWAYAM-NPTEL-COU` | MOOCs / SWAYAM / NPTEL Courses - 2 |
| EE | 5 | `X-PROFESSIONAL-ELECTIVE-` | Professional Elective Laboratory - 1 |
| EE | 5 | `X-SUMMER-ENTREPRENEURSHI` | Summer Entrepreneurship - II |
| MECH | 5 | `X-CONSTITUTION-OF-INDIA-` | Constitution of India / Essence of Indian |
| MECH | 5 | `X-SUMMER-ENTREPRENEURSHI` | Summer Entrepreneurship-II |
| MECH | 5 | `X-OPEN-ELECTIVE-I-MOOCS-` | Open Elective- I (MOOCs / SWAYAM / NPTEL |
| MECH | 5 | `X-GRADUATE-EMPLOYABILITY` | Graduate Employability Skills and |
| CIVIL | 5 | `X-SUMMER-ENTREPRENEURSHI` | Summer Entrepreneurship-II |
| CIVIL | 6 | `100604P` | NPTEL Courses-2 |
| EEE | 6 | `103601P` | Power Systems-II Lab |

11 of the 13 are one-off elective/skill baskets BEU never published a unit list
for; the remaining `100604P` appears twice, as CSE and CIVIL Sem 6
`NPTEL Courses-2`, and is empty in both. The Sem 4 rows that used to sit here
(EE's HSMC/Environmental Science/NCC baskets, MECH's Environmental Science,
CIVIL's Open Elective and Management I) left with the 2022-26 scheme: the
2024-28 Semester-IV documents carry no such rows, and their unit text is
published for every row that remains.

**The one fillable-looking stub that is not fillable:** `sylpy/civil_6.json`
holds a candidate body for CIVIL Sem 6 `100604P NPTEL Courses-2`, but the text
is a **Construction Management** syllabus, and the same file's
`Geotechnical Engineering -II` entry holds sewage/Environmental text. Attaching
it would print the wrong syllabus under the right code, so it stays empty and is
recorded here instead of being "fixed". A wrong page is worse than an honest
gap.

## 5. Semesters that do not exist upstream: 15

| Branch | Published | Missing upstream |
|---|---|---|
| CSE | 1–6 | 7, 8 |
| ECE | 1–5 | 6, 7, 8 |
| EE | 1–5 | 6, 7, 8 |
| MECH | 1–6 | 7, 8 |
| CIVIL | 1–6 | 7, 8 |
| EEE | 1, 2, 3, 4, 6 | 5, 7, 8 |

The site prints nothing for these, so the app prints nothing either: the
semester rail lists only published semesters, and a deep link to an unpublished
one (`/syllabus/cse/8`) says so and offers the nearest published semester. No
semester is invented to fill the grid. A batch-23 student (Sem 7 in the 2026–27
session) therefore lands on their own semester and sees that honest state, with
one tap to Sem 6.

## 6. Blank codes: 10 rows, normalised into stable ids

10 site rows print `"-"` as their code (EE 5 ×5 incl. Biology-I and
`PCC-EEE14 Power Systems - I Lab`, MECH 5 ×4, CIVIL 5 ×1). The ids are baked
into the shipped wire by the pack step, using
`decode.ts` `derivedCode()`: `X-<SLUG>` from the name — the slug is upper-cased,
non-alphanumerics become `-`, and it is capped at **22** characters, so the code
itself is at most 24 (`-P` is appended for a practical). The same rule runs at
decode, so a blank code in a future refresh gets the same treatment. Those
papers get a stable, searchable id (`X-ENVIRONMENTAL-SCIENCE`,
`X-SUMMER-ENTREPRENEURSHI`, …). The site keeps `"-"`.

The 10 rows carry **8 distinct ids**: the same placeholder name recurs in
different semesters (Summer Entrepreneurship-II in EE, MECH and CIVIL Sem 5).
Every id is unique **inside its semester**, which is what the app keys on —
`branch|semester|code` — so saves, marks, notes and PYQ links stay separate. No
minted id can collide with a real code, because no real code starts with `X-`.

The Sem 4 half of this list left with the 2022-26 scheme: the 2024-28
Semester-IV documents name every row, so CIVIL, ECE and MECH Sem 4 no longer
carry a blank code at all.

## 7. Upstream source quirks (documented, not copied)

| Quirk | Where | App behaviour |
|---|---|---|
| `branch: "ece"` on the EE file | `ee.json` | fixed to `"ee"`; the filename was already the branch |
| `branch: "ece"` on the EEE file | `eee.json` | fixed to `"eee"`; the filename was already the branch |
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
per-branch and per-semester subject counts, per-branch units and topics, the 13
stubs, the 10 minted codes, the 1,822 reference entries, the three completed
titles and the 30 GATE papers. A data refresh that changes any of them fails the
gate and points back here.
