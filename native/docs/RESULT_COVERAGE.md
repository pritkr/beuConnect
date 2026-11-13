# Result coverage — 24105157010

Decoded by `parseReg` / `colleges.ts`: batch **24**, branch **105** (CSE, present in `BRANCHES`), college **157** (GEC Sheikhpura), roll **010**, not lateral. `COVERAGE["24"]["105"] = [1,2]` matches the server: batch 24 published **sem1–2 only**. Wide row: PRIT KUMAR, 2024-2028.

| dataset | URL | sem | status | size / header | usable | show when missing |
|---|---|---|---|---|---|---|
| wide | `/data/wide_24_157_105_sem{N}.csv` | 1,2 | 200 · **404** 3–8 | 28403 / 28887 B · 56 cols, `Session,RegNo,…,StateRank,CollegeRank,<code>_ESE` | **yes** — full papers, SGPA, CGPA, ranks | “Sem {N} not published for batch 24” + offer saved copy, never a blank result |
| college roster | `/data/students_24_157_105_sem{N}.csv` | 1,2 | 200 · **404** 3–8 | 5500 / 5169 B · 5 cols `Session,RegNo,Name,SGPA,Cur. CGPA` | yes | college merit list unavailable, hide the tab |
| branch roster | `/data/students_24_all_105_sem{N}.csv` | 1,2 | 200 · **404** 3–8 | 187079 / 210049 B · 7 cols, +`CollegeCode,CollegeName` | sem2 yes; **sem1 no** (`Cur. CGPA` blank in **2123/2123** rows) | “CGPA not published” — do not rank on SGPA alone |
| live API | `/api/result?reg=24105157010&sem=N&format=json` | 1–8 | **502** every sem, 3 tries | 89 B `{"status":502,…530…}` | no | keep last good copy; say “BEU is down”, don’t blame the reg |
| manifest | `/data/manifest/index.json` | — | 200 | 30305 B | index only | lists `24/105/sem1_157.json`, which **404s** at `/data/24/105/…` and `/data/manifest/24/105/…` — never build URLs from it |

- Only **6 of 2761** published CSVs contain `24105157010`: the three files above × sem1–2. Rank/merit therefore exists for **sem1–2 only**.
- sem1: SGPA 7.00, CGPA 7.00, StateRank 33 / CollegeRank 33. sem2: SGPA 6.2, CGPA 6.6, paper `100202` grade **F**, `FailAny=FAIL:100202`, StateRank 61 / CollegeRank 61.
- Sources disagree on rank: roster-computed branch rank for sem2 is **1683 of 2284**, the wide file says **61**. Label the first “computed from roster (1 683 / 2 284)”, the second “BEU column”, and never print either as “state rank”.
- `fromWide` compares `FailAny === "FAIL"`; sem2 carries `FAIL:100202`, so `status` renders empty. Prefix-match instead.

**Fallback order (live API down):** 1) live `/api/result`, one retry → 2) cached `result:{reg}:{sem}` (source `cache`, show its timestamp) → 3) wide CSV row → 4) college roster (name + SGPA/CGPA only, no papers/status) → 5) branch roster for rank/merit only, never as a result → 6) honest “nothing published for batch 24 semester N”, offering sem 2. Today this reg resolves at step 3 for sem1–2 and dead-ends at step 6 for sem3–8.
