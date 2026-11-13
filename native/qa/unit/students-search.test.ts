/**
 * Students — the register's search index and the college order, with synthetic
 * rows only (no real name, registration or roll ever enters this file).
 *
 * Two contracts are pinned here, because both are invisible when they drift:
 *
 *  - **Indexed ranking is unchanged ranking.** `searchStudents` scores against a
 *    `StudentIndex` built once at module load, so every keystroke stops
 *    re-normalising 1,784 rows. That is only safe while `rankIndexed` returns
 *    exactly what `rankStudents` returns, tie-break included.
 *  - **The college list is honest.** The one college with a register leads, the
 *    rest follow A–Z, and a code nobody knows is not invented.
 *
 * Run: `nsh test qa/unit/students-search.test.ts`
 */

import { describe, expect, test } from "nsh/test";

import type { CollegeEntry } from "../../src/features/students/college-list";
import {
  COLLEGE_ENTRIES,
  collegesByPriority,
  collegesByRegisterFirst,
  filterColleges,
  matchesCollege,
} from "../../src/features/students/college-list";
import type { SearchableStudent } from "../../src/features/students/rank";
import { filterIndex, indexStudents, rankIndexed, rankStudents } from "../../src/features/students/rank";

/** A row whose every value is invented. */
function row(reg: string, name: string, roll = "", session = "2024-28"): SearchableStudent {
  return { reg, name, roll, session };
}

const ROWS: readonly SearchableStudent[] = [
  row("98000000001", "SURAJ KUMAR", "24/CV/19"),
  row("98000000002", "SURAJ KUMAR RAM", "24-CV-20"),
  row("98000000003", "ANITA VERMA", "25EE01", "2025-29"),
  row("98000000004", "MEZA SINGH", "25EE02", "2025-29"),
  row("98000000005", "BINA DAS", "", "2025-29"),
];

/** Asserts the two paths agree, then hands back the indexed answer. */
function parity(query: string, rows: readonly SearchableStudent[] = ROWS): SearchableStudent[] {
  const indexed = rankIndexed(indexStudents(rows), query);
  expect(indexed).toEqual(rankStudents(rows, query));
  return indexed;
}

function regs(rows: readonly SearchableStudent[]): string[] {
  return rows.map((student) => student.reg);
}

describe("indexed ranking equals rankStudents", () => {
  test("an empty query keeps the browse order", () => {
    const found = parity("");
    expect(regs(found)).toEqual(regs(ROWS));
  });

  test("an exact registration number wins the code tier", () => {
    const found = parity("98000000003");
    expect(regs(found)).toEqual(["98000000003"]);
  });

  test("a registration prefix returns every match, newest batch first", () => {
    const found = parity("9800000000");
    expect(regs(found)).toEqual([
      "98000000003",
      "98000000005",
      "98000000004",
      "98000000001",
      "98000000002",
    ]);
  });

  test("punctuation in a roll number does not matter", () => {
    // One roll, three spellings: the compact form is what is compared.
    for (const query of ["24/CV/19", "24-cv-19", "24CV19"]) {
      expect(regs(parity(query))).toEqual(["98000000001"]);
    }
  });

  test("initials match consecutive word starts", () => {
    // "sk" is the initials of SURAJ KUMAR; "ram" starts the third word.
    expect(regs(parity("sk ram"))).toEqual(["98000000002"]);
  });

  test("tokens match in any order", () => {
    expect(regs(parity("kumar suraj"))).toEqual(["98000000001", "98000000002"]);
  });

  test("a one-letter token is not a substring match", () => {
    // Z is inside MEZA, not at a word start, and initials need two letters.
    expect(parity("z")).toEqual([]);
    // Two letters are allowed to be a last-resort substring.
    expect(regs(parity("ez"))).toEqual(["98000000004"]);
  });

  test("ties break by batch, then name, then registration number", () => {
    const ties = [
      row("97000000012", "SURAJ KUMAR", "", "2025-29"),
      row("97000000010", "SURAJ KUMAR", "", "2025-29"),
      row("97000000011", "SURAJ KUMAR", "", "2024-28"),
    ];
    expect(regs(parity("suraj", ties))).toEqual(["97000000010", "97000000012", "97000000011"]);
  });

  test("ranking a narrowed index equals ranking the narrowed rows", () => {
    // `searchStudents` filters the pool before it ranks; this is that shortcut.
    const index = indexStudents(ROWS);
    const fresh = ROWS.filter((student) => student.session === "2025-29");
    for (const query of ["", "a", "an", "suraj", "24cv", "9800"]) {
      expect(rankIndexed(filterIndex(index, (student) => student.session === "2025-29"), query)).toEqual(
        rankStudents(fresh, query),
      );
    }
  });

  test("an index is reusable: ranking never reorders or rewrites it", () => {
    const index = indexStudents(ROWS);
    const before = regs(index.items.map((item) => item.row));
    expect(rankIndexed(index, "suraj")).toEqual(rankIndexed(index, "suraj"));
    expect(regs(index.items.map((item) => item.row))).toEqual(before);
  });
});

describe("collegesByRegisterFirst", () => {
  const SAMPLE: readonly CollegeEntry[] = [
    { code: "999", name: "Zeta Institute of Technology", short: "ZIT" },
    { code: "157", name: "Government Engineering College, Sheikhpura", short: "GEC Sheikhpura" },
    { code: "100", name: "Beta College of Engineering", short: "BCE" },
    { code: "101", name: "Alpha College of Engineering", short: "ACE" },
  ];

  test("the register leads and the rest follow A–Z", () => {
    const ordered = collegesByRegisterFirst(SAMPLE, "157");
    expect(ordered.map((college) => college.code)).toEqual(["157", "101", "100", "999"]);
  });

  test("the input order is not rewritten", () => {
    collegesByRegisterFirst(SAMPLE, "157");
    expect(SAMPLE.map((college) => college.code)).toEqual(["999", "157", "100", "101"]);
  });

  test("a code the table does not know is not promoted or invented", () => {
    const ordered = collegesByRegisterFirst(SAMPLE, "000");
    expect(ordered.map((college) => college.code)).toEqual(["101", "100", "157", "999"]);
    expect(ordered.length).toBe(SAMPLE.length);
  });

  test("the real BEU table puts 157 first, once", () => {
    const ordered = collegesByRegisterFirst(COLLEGE_ENTRIES, "157");
    expect(ordered.length).toBe(COLLEGE_ENTRIES.length);
    expect(ordered[0].code).toBe("157");
    expect(ordered.filter((college) => college.code === "157").length).toBe(1);
    expect(new Set(ordered.map((college) => college.code)).size).toBe(ordered.length);
    for (let index = 2; index < ordered.length; index += 1) {
      expect(ordered[index - 1].name <= ordered[index].name).toBe(true);
    }
  });
});

describe("collegesByPriority", () => {
  const SAMPLE: readonly CollegeEntry[] = [
    { code: "999", name: "Zeta Institute of Technology", short: "ZIT" },
    { code: "157", name: "Government Engineering College, Sheikhpura", short: "GEC Sheikhpura" },
    { code: "100", name: "Beta College of Engineering", short: "BCE" },
    { code: "101", name: "Alpha College of Engineering", short: "ACE" },
  ];

  test("the student's college leads, then the register, then A–Z", () => {
    const ordered = collegesByPriority(SAMPLE, ["100", "157"]);
    expect(ordered.map((college) => college.code)).toEqual(["100", "157", "101", "999"]);
  });

  test("a duplicate priority code is listed once", () => {
    const ordered = collegesByPriority(SAMPLE, ["157", "157"]);
    expect(ordered.map((college) => college.code)).toEqual(["157", "101", "100", "999"]);
  });

  test("an unknown priority code promotes nothing", () => {
    const ordered = collegesByPriority(SAMPLE, ["000", ""]);
    expect(ordered.map((college) => college.code)).toEqual(["101", "100", "157", "999"]);
    expect(ordered.length).toBe(SAMPLE.length);
  });
});

describe("filterColleges", () => {
  const SAMPLE: readonly CollegeEntry[] = [
    { code: "157", name: "Government Engineering College, Sheikhpura", short: "GEC Sheikhpura" },
    { code: "110", name: "Gaya College of Engineering, Gaya", short: "Gaya College of Engineering" },
    { code: "128", name: "B. P. Mandal College of Engineering, Madhepura", short: "B. P. Mandal College of Engineering" },
  ];

  test("an empty query returns the input array, not a copy", () => {
    expect(filterColleges(SAMPLE, "")).toBe(SAMPLE);
    expect(filterColleges(SAMPLE, "   ")).toBe(SAMPLE);
  });

  test("the short name, the official name and the code all match", () => {
    expect(filterColleges(SAMPLE, "gec sheikhpura").map((college) => college.code)).toEqual(["157"]);
    expect(filterColleges(SAMPLE, "government engineering college").map((college) => college.code)).toEqual([
      "157",
    ]);
    expect(filterColleges(SAMPLE, "128").map((college) => college.code)).toEqual(["128"]);
  });

  test("tokens match in any order, case and punctuation ignored", () => {
    // "sheikhpura gec" is the reverse of the stored short name.
    expect(filterColleges(SAMPLE, "sheikhpura gec").map((college) => college.code)).toEqual(["157"]);
    expect(filterColleges(SAMPLE, "b p mandal").map((college) => college.code)).toEqual(["128"]);
    expect(filterColleges(SAMPLE, "B.P. MANDAL").map((college) => college.code)).toEqual(["128"]);
  });

  test("a miss is empty, and one token is enough to narrow", () => {
    expect(filterColleges(SAMPLE, "no such college")).toEqual([]);
    expect(filterColleges(SAMPLE, "engineering").length).toBe(3);
    expect(filterColleges(SAMPLE, "gaya").map((college) => college.code)).toEqual(["110"]);
  });
});

describe("matchesCollege", () => {
  const REGISTER: CollegeEntry = {
    code: "157",
    name: "Government Engineering College, Sheikhpura",
    short: "GEC Sheikhpura",
  };

  test("a blank query matches nothing, so a screen can tell search from idle", () => {
    expect(matchesCollege(REGISTER, "")).toBe(false);
    expect(matchesCollege(REGISTER, "   ")).toBe(false);
  });

  test("the register answers its short form, its full name and its code", () => {
    expect(matchesCollege(REGISTER, "sheikhpura")).toBe(true);
    expect(matchesCollege(REGISTER, "GEC SHEIKHPURA")).toBe(true);
    expect(matchesCollege(REGISTER, "government engineering college")).toBe(true);
    expect(matchesCollege(REGISTER, "157")).toBe(true);
    expect(matchesCollege(REGISTER, "gaya")).toBe(false);
  });

  test("agrees with filterColleges row for row", () => {
    const SAMPLE: readonly CollegeEntry[] = [
      REGISTER,
      { code: "110", name: "Gaya College of Engineering, Gaya", short: "Gaya College of Engineering" },
    ];
    for (const query of ["sheikhpura", "157", "gaya", "engineering", "nope"]) {
      expect(SAMPLE.filter((college) => matchesCollege(college, query))).toEqual(filterColleges(SAMPLE, query));
    }
  });
});
