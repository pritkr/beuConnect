# GECS student roster

`native/assets/data/students-gecs.json` is the full student roster for
Government Engineering College, Sheikhpura (BEU college code `157`): **1,323
students** across batches **2K22–2K26**. It is generated from the college
register, never hand-edited. The website (`src/pages/listofstudents/`) and the
native app read the same file.

## Source

| | |
|---|---|
| Register dump | `~/gecs-cli/dumps/20261026_031340/students_basic_details.csv` |
| Rows | 1,323 |
| Columns used | `id, roll_no, registration_no, name, gender, date_of_birth, batch, branch, admission_type, status, mobile_no, email_id, guardian_name, guardian_mobile_no, is_hosteller, category` |
| Read-only | Yes. The dump folder holds live faculty credentials; this pipeline only reads the CSV and never runs the register CLI. |

`gecs-cli/reports/GEC_2K26_students_full_report.md` is the 2K26 cross-check
(334 students, 7 branches, 91 hostellers).

## Regenerate

`extract.py` rewrites `manifest.json` and knows nothing about students, so run
the roster builder **after** it:

```sh
uv run python native/scripts/extract.py
uv run python native/scripts/build-students-data.py
uv run python native/scripts/build-students-data.py --check
```

A different dump:

```sh
uv run python native/scripts/build-students-data.py --source ~/gecs-cli/dumps/<stamp>/students_basic_details.csv
# or: GECS_STUDENTS_CSV=/path/to/students_basic_details.csv uv run python native/scripts/build-students-data.py
```

`--check` rebuilds from the source and compares every record, every CSV, the
manifest entry and the published counts. It exits non-zero on any difference.
Set `SOURCE_DATE_EPOCH` for a reproducible manifest stamp.

## Files

| File | Rows | Purpose |
|---|---:|---|
| `native/assets/data/students-gecs.json` | 1,323 | Canonical roster, one record per line |
| `native/assets/data/manifest.json` | — | One `students` dataset entry + `totals.students` |
| `src/data/students/gecs-<branch>.csv` | per branch | Site CSV: the 4-column contract plus extra columns |
| `src/data/students/gecsheikhpura<branch>.csv` | per branch | Legacy 4-column files (`Session,Sno,RegNo,Name`) |
| `src/data/students/gecs-archive-2019-2021.csv` | 467 | Frozen pre-2K22 rows from the old lists; not generated, not in the register |

CSV row counts are in the [counts](#counts) table. Branch files exist for
`cse, ece, ee, mech, civil, met`.

## JSON shape

Top-level **array**, ordered batch (newest first) → branch → section → natural
roll/reg order. One object per line so a one-student change is a one-line diff.
The file has no wrapper and no timestamp; the manifest carries the stamp.

```ts
type Student = {
  id: number | string;          // register row id (unique within GECS)
  name: string;                 // exactly as the register stores it (case preserved)
  rollNo: string;               // uppercase; not unique across batches
  regNo: string;                // uppercase BEU registration number
  provisionalReg: boolean;      // true when regNo is really the roll (all 2K26)
  batch: "2K22" | "2K23" | "2K24" | "2K25" | "2K26";
  session: string;              // "2022-26" … "2026-30"
  branch: "cse" | "ece" | "ee" | "mech" | "civil" | "met";
  branchLabel: string;          // "Computer Science & Engineering" …
  section?: "A" | "B";          // 2K26 CSE only
  gender?: "M" | "F";
  dob?: string;                 // "YYYY-MM-DD"; 2K26 only
  guardian?: string;
  guardianPhone?: string;       // digits only
  phone?: string;               // digits only
  email?: string;               // lowercase
  hosteller: boolean;           // always present
  category?: "BC" | "EBC" | "EWS" | "SC" | "ST" | "UR" | "BC(OBC)";
  admissionType?: string;       // "Regular" (2K26 only)
  status?: string;              // "Active" (2K26 only)
};
```

**Omitted keys mean “not recorded”** — the generator never writes `""`. Do not
assume an optional key exists; use `student.guardian ?? ""`. `id`, `name`,
`rollNo`, `regNo`, `provisionalReg`, `batch`, `session`, `branch`,
`branchLabel`, `hosteller` are always present.

Example (2K26, provisional):

```json
{"id":1616,"name":"SAZIYA KHANAM","rollNo":"26CSE01","regNo":"26CSE01","provisionalReg":true,"batch":"2K26","session":"2026-30","branch":"cse","branchLabel":"Computer Science & Engineering","section":"A","gender":"F","dob":"2007-09-27","guardian":"MAZHAR ASIF","guardianPhone":"8676935281","phone":"8521027432","email":"saziyakhanam90@gmail.com","hosteller":false,"category":"EBC","admissionType":"Regular","status":"Active"}
```

## How to load it

The file is already decoded — no base64, no packed table, no runtime fetch.
Either import it if the bundler resolves JSON (Vite/NSH do):

```ts
import roster from "../../../native/assets/data/students-gecs.json";
const students = roster as Student[];
```

or pack it at build time the way `src/features/syllabus/data/packs.ts` packs
syllabus data:

```ts
const students: Student[] = JSON.parse(await Bun.file("native/assets/data/students-gecs.json").text());
```

Useful derivations:

```ts
students.filter((s) => s.batch === "2K26");                     // 334
students.filter((s) => s.batch === "2K26" && s.section === "A"); // 59
students.filter((s) => s.branch === "met");                      // 44
```

Search over `name`, `rollNo` and `regNo` token-wise (`"kumar rahul"` and
`"rahul kumar"` must both hit). `src/data/students/roster.ts` has the site's
reference implementation (`searchHaystack`).

## Mapping decisions

### Batches → sessions

`2K22 → 2022-26`, `2K23 → 2023-27`, `2K24 → 2024-28`, `2K25 → 2025-29`,
`2K26 → 2026-30`. The register only carries `2KXX`; the session is the four-year
window the site already uses.

### Branches

| Register value | App/site slug | Label |
|---|---|---|
| `CE` | `civil` | Civil Engineering |
| `CSE`, `CSE-A`, `CSE-B` | `cse` | Computer Science & Engineering |
| `ECE` | `ece` | Electronics & Communication Engineering |
| `EE` | `ee` | Electrical Engineering |
| `ME` | `mech` | Mechanical Engineering |
| `MET` | `met` | Mechatronics Engineering |

`CSE-A` / `CSE-B` keep their section in `section: "A" | "B"`. 2K26 is the only
batch split into sections (A: 59, B: 62); older CSE batches stay unsectioned
because the register has no section label for them. Sections are **not**
derived from roll numbers.

### MET is Mechatronics, a separate programme

`MET` is **Mechatronics Engineering**, BEU branch code `161`
(`src/lib/beuReg.ts: "161": "Mechatronics Engineering"`,
`src/lib/routine/resolver.ts` resolves `161` to `MET` / `ME/MET`). It is not
Metallurgy and it is not Mechanical. It is emitted as its own slug `met`
(44 students: 14 in 2K24, 11 in 2K25, 19 in 2K26) rather than folded into
`mech` or `eee`. The site's `branchPathMap` maps `161` to `eee` only because the
old result-table buckets had no Mechatronics column; that legacy choice is not
reused here.

### Provisional registrations

Every 2K26 row has `registration_no == roll_no` (`26CV01`, `26CSE119`, …). BEU
has not issued registration numbers for the batch yet, so those rows are
`provisionalReg: true` and the site shows `Roll 26CV01` + a “Provisional” chip,
never “Reg No”. All 334 2K26 rows are provisional; no other batch is. When BEU
issues the numbers, rerun the builder against a fresh dump and the flag clears.

## Counts

Measured from the 2026-10-26 dump (`--check` pins these):

| Batch | Students | | Branch | Students |
|---|---:|---|---|---:|
| 2K26 | 334 | | cse | 478 |
| 2K25 | 294 | | ece | 193 |
| 2K24 | 359 | | ee | 239 |
| 2K23 | 183 | | mech | 79 |
| 2K22 | 153 | | civil | 290 |
| **Total** | **1,323** | | met | 44 |

2K26 by branch: CSE-A 59, CSE-B 62, CE 61, EE 59, ECE 54, ME 20, MET 19 = **334**.

> The brief quoted 2K22 168 · 2K23 179 · 2K24 449 · 2K25 300 — those sum to
> 1,430 and do not match the dump. The dump (and `gecs_cache.db`) holds 1,323
> rows; the numbers above are measured, not assumed. 2K26 matches exactly.

## Privacy

The JSON is bundled app data and carries phone, email, DOB and guardian name so
the app can use them offline. The website **does not publish them**:
`src/data/students/roster.ts` projects records to `PublicStudent`
(`id, name, rollNo, regNo, provisionalReg, batch, session, branch, branchLabel,
section, hosteller`) and that is the only shape the pages render. No phone,
email, DOB, address, guardian or category reaches the HTML or the client script.
Keep it that way when adding screens.

## Manifest entry

```json
{
  "dataset": "students",
  "college": "157",
  "collegeName": "Government Engineering College, Sheikhpura",
  "path": "students-gecs.json",
  "count": 1323,
  "generatedAt": "…",
  "source": "gecs-cli/dumps/20261026_031340/students_basic_details.csv",
  "batches": {"2K26": 334, "2K25": 294, "2K24": 359, "2K23": 183, "2K22": 153},
  "branches": {"cse": 478, "ece": 193, "ee": 239, "mech": 79, "civil": 290, "met": 44},
  "provisionalRegistrations": 334
}
```

`verify.py` treats the top-level array as a non-dict document and skips it after
checking the file exists; the entry is still required so the file is not
reported as stray. Running `extract.py` alone drops the entry — rerun the roster
builder afterwards.

## Known gaps

- **995 students have no DOB** in the register (only 2K26 is populated: 328/334).
- **64 guardian phones, 46 student phones, 28 emails and 24 guardian names are
  missing**; they are omitted, not blanked. One guardian phone (`916200848`) is
  nine digits in the source and is preserved as-is.
- **Gender, category and admission type exist only for 2K26** (gender 246 M /
  88 F, category 334, admission type “Regular” 334). Older batches have blank
  columns; the site does not render these fields.
- **Roll numbers are unreliable outside 2K26** (2K22 contains `21ECE02` and
  `23DME06`), so the site shows the official registration number there. Roll
  numbers are also not globally unique: `24DCSE05` exists in both 2K23 and
  2K24; `id` and `regNo` are unique.
- **Names keep the register's casing** (2K26 is uppercase, older batches are
  mixed case). No title-casing was invented.
- **`src/data/students/gecs-archive-2019-2021.csv`** holds 467 pre-2K22 rows
  (2019-23, 2020-24, 2021-25) recovered from the old site CSVs. The register
  dump starts at 2K22, so the archive is frozen and not regenerated.
