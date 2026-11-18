/**
 * The college roster index, and the reader that turns one entry into a roster.
 *
 * `college-index.ts` is generated from BEU's published file names, so the tests
 * over it assert the properties a URL depends on: a semester is a whole number
 * 1–8, and every key is the 2/3/3-digit code the path is built from. The reader
 * is pinned on synthetic rows only, because the cases that matter are the ones
 * the site actually emits — a quoted name with a comma, a blank `Cur. CGPA`, a
 * row with no registration number or no name.
 *
 * No engine and no network: pure exports, ~1 ms.
 */

import { describe, expect, test } from "nsh/test";

import { COLLEGE_INDEX } from "../src/features/students/college-index";
import type { RemoteRow } from "../src/features/students/remote";
import {
  batchesFor,
  branchesFor,
  cgpaCount,
  filterRoster,
  hasRosters,
  parseRoster,
  rankRoster,
  rosterUrl,
  semsFor,
} from "../src/features/students/remote";
import { SITE } from "../src/lib/net";

function row(name: string, cgpa: number | null, sgpa: number | null): RemoteRow {
  return { reg: name, name, session: "2024-28", sgpa, cgpa };
}

describe("the generated index", () => {
  test("semesters are whole numbers 1–8, ascending and never repeated", () => {
    let groups = 0;
    for (const batches of Object.values(COLLEGE_INDEX)) {
      for (const branches of Object.values(batches)) {
        for (const sems of Object.values(branches)) {
          for (let index = 0; index < sems.length; index += 1) {
            // `sem0` is the enrolment register, not a result: it is counted as
            // skipped by the generator and must never become a semester chip.
            expect(Number.isInteger(sems[index])).toBe(true);
            expect(sems[index]).toBeGreaterThanOrEqual(1);
            expect(sems[index]).toBeLessThanOrEqual(8);
            if (index > 0) expect(sems[index]).toBeGreaterThan(sems[index - 1]);
          }
          groups += 1;
        }
      }
    }
    expect(groups).toBeGreaterThan(0);
  });

  test("every key is the 2-digit batch, 3-digit college, 3-digit branch the URL takes", () => {
    const colleges = Object.keys(COLLEGE_INDEX);
    expect(colleges.length).toBeGreaterThan(0);
    for (const college of colleges) {
      expect(college).toMatch(/^\d{3}$/);
      for (const batch of Object.keys(COLLEGE_INDEX[college])) {
        expect(batch).toMatch(/^\d{2}$/);
        for (const branch of Object.keys(COLLEGE_INDEX[college][batch])) {
          expect(branch).toMatch(/^\d{3}$/);
        }
      }
    }
  });

  test("an unnamed college is empty everywhere, and a named one is not", () => {
    expect(hasRosters("999")).toBe(false);
    expect(batchesFor("999")).toEqual([]);
    expect(branchesFor("999", "24")).toEqual([]);
    expect(semsFor("999", "24", "102")).toEqual([]);

    expect(hasRosters("102")).toBe(true);
    const batch = batchesFor("102")[0];
    const branch = branchesFor("102", batch)[0];
    expect(semsFor("102", batch, branch).length).toBeGreaterThan(0);
  });

  test("semsFor hands out a copy, so a screen cannot edit the shipped index", () => {
    const sems = semsFor("102", "24", "102");
    sems.push(9);
    expect(semsFor("102", "24", "102")).not.toContain(9);
  });
});

describe("a roster URL", () => {
  test("comes only from an entry the index carries", () => {
    expect(rosterUrl("102", "24", "102", 2)).toBe(`${SITE}/data/students_24_102_102_sem2.csv`);
    expect(rosterUrl("107", "21", "101", 8)).toBe(`${SITE}/data/students_21_107_101_sem8.csv`);
  });

  test("is null before any request when the index does not name the combination", () => {
    // College 102 published branch 101 for no batch at all.
    expect(rosterUrl("102", "24", "101", 2)).toBe(null);
    // College 102 has a roster for batch 24 only.
    expect(rosterUrl("102", "23", "102", 3)).toBe(null);
    // Semester 2 is the only one published for that branch.
    expect(rosterUrl("102", "24", "102", 1)).toBe(null);
    // And a college the index has never heard of has no URL either.
    expect(rosterUrl("999", "24", "102", 2)).toBe(null);
  });
});

/* Synthetic rows in the site's own shape: Session,RegNo,Name,SGPA,Cur. CGPA. */
const CSV = [
  "Session,RegNo,Name,SGPA,Cur. CGPA",
  '2023-27,23102107001,"KUMARI, ASHA",8.25,8.10',
  "2023-27,23102107002,RAVI KUMAR,,7.50",
  "2024-27,,MISSING REG,9.00,8.00",
  "2024-27,24102107004,,9.00,8.00",
  "2022-26,22102107006,PRIYA DEVI,7.00,",
  "",
].join("\n");

describe("reading a roster", () => {
  test("a quoted name keeps its comma and a blank mark stays null", () => {
    const rows = parseRoster(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      reg: "23102107001",
      name: "KUMARI, ASHA",
      session: "2023-27",
      sgpa: 8.25,
      cgpa: 8.1,
    });
    expect(rows[1].sgpa).toBe(null);
    expect(rows[1].cgpa).toBe(7.5);
    // A blank `Cur. CGPA` is a gap, never 0.00 — the student may still be
    // waiting for the semester that would produce one.
    expect(rows[2].cgpa).toBe(null);
    expect(rows[2].sgpa).toBe(7);
  });

  test("a row with no registration number or no name is dropped, not shown blank", () => {
    expect(parseRoster(CSV).map((entry) => entry.reg)).toEqual([
      "23102107001",
      "23102107002",
      "22102107006",
    ]);
  });

  test("a CRLF file reads the same as an LF one", () => {
    expect(parseRoster(CSV.replace(/\n/g, "\r\n"))).toEqual(parseRoster(CSV));
  });
});

const ROWS: RemoteRow[] = [
  row("BINA KUMARI", 8.5, 9),
  row("ASHA KUMARI", 8.5, 9),
  row("CHANDAN", 9, 7),
  row("DEEPA", 8.5, 9.5),
  row("EENA", null, 9.9),
  row("FARHAN", null, null),
];

describe("ranking a roster", () => {
  test("CGPA first, then SGPA, then name", () => {
    expect(rankRoster(ROWS).map((entry) => entry.name)).toEqual([
      "CHANDAN",
      "DEEPA",
      "ASHA KUMARI",
      "BINA KUMARI",
      "EENA",
      "FARHAN",
    ]);
  });

  test("a null CGPA is unranked and sorts after every student who has one", () => {
    const names = rankRoster(ROWS).map((entry) => entry.name);
    expect(names.indexOf("EENA")).toBeGreaterThan(names.indexOf("DEEPA"));
    expect(names.indexOf("FARHAN")).toBeGreaterThan(names.indexOf("EENA"));
  });

  test("sorting does not edit the caller's rows", () => {
    const before = ROWS.map((entry) => entry.name);
    rankRoster(ROWS);
    expect(ROWS.map((entry) => entry.name)).toEqual(before);
  });
});

describe("counting CGPAs", () => {
  test("only a row with a published CGPA counts", () => {
    expect(cgpaCount(ROWS)).toBe(4);
    expect(cgpaCount([])).toBe(0);
    // 0.00 is a published mark, not a gap; only an empty cell is null.
    expect(cgpaCount([row("X", null, 10), row("Y", 0, 0)])).toBe(1);
  });
});

describe("filtering a loaded roster", () => {
  const REGS: RemoteRow[] = [
    { reg: "23101107001", name: "KUMARI, ASHA", session: "2023-27", sgpa: 8, cgpa: 8 },
    { reg: "23101107002", name: "RAVI KUMAR", session: "2023-27", sgpa: 7, cgpa: 7.5 },
    { reg: "24101107003", name: "PRIYA DEVI", session: "2024-28", sgpa: 9, cgpa: null },
  ];

  test("a blank query keeps every row, in order", () => {
    expect(filterRoster(REGS, "").map((entry) => entry.reg)).toEqual(REGS.map((entry) => entry.reg));
    expect(filterRoster(REGS, "   ")).toHaveLength(REGS.length);
  });

  test("a name match ignores case, and a registration number keeps its digits only", () => {
    expect(filterRoster(REGS, "asha").map((entry) => entry.reg)).toEqual(["23101107001"]);
    expect(filterRoster(REGS, "23101107001").map((entry) => entry.reg)).toEqual(["23101107001"]);
    expect(filterRoster(REGS, "2310 1107").map((entry) => entry.reg)).toEqual([
      "23101107001",
      "23101107002",
    ]);
  });

  test("a name that matches nothing is empty, never the whole roster", () => {
    // The bug this pins: matching `reg.includes(query.replace(/\D/g, ""))` with
    // a name that has no digits is `includes("")` — true for every row.
    expect(filterRoster(REGS, "ZZZ")).toEqual([]);
    expect(filterRoster(REGS, "priya 9")).toEqual([]);
  });
});
