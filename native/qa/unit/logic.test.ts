/**
 * The app's own maths — no engine, no network, ~1 ms.
 *
 * Runs headless: `nsh test qa/unit/logic.test.ts`
 *
 * These are the numbers a student acts on: the SGPA on their result, the mark
 * they need in the end-semester paper, how many classes they can still miss,
 * where they stand in their college, and which semester their batch is in.
 * All of it is a pure export, so it is pinned here in milliseconds instead of
 * being re-derived from a screenshot.
 *
 * Fixtures are inline and tiny on purpose (BUILD_SPEC: bundle-free runtime).
 */

import { describe, expect, test } from "nsh/test";

import type { RankRow } from "../../src/features/results/data";
import { currentSemester, ranked, sortByCgpa } from "../../src/features/results/data";
import { cgpa, gradeForMarks, requiredSgpa, sgpa } from "../../src/features/tools/engine";
import { attendanceStatus } from "../../src/features/tools/engine";

/** Two decimals, so a float's last bit never decides a test. */
function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

describe("grades", () => {
  test("BEU's bands, and the 35% end-semester bar that fails a paper", () => {
    expect(gradeForMarks(100, 30, 70)).toBe("A+");
    expect(gradeForMarks(100, 20, 50)).toBe("B");
    expect(gradeForMarks(100, 5, 35)).toBe("P");
    // 54% overall, but the end-semester paper is under 24.5/70 → F.
    expect(gradeForMarks(100, 30, 24)).toBe("F");
    expect(gradeForMarks(100, 30, 25)).toBe("D");
    // A 50-mark paper uses 20 + 30, with its own 10.5 bar.
    expect(gradeForMarks(50, 20, 10)).toBe("F");
    expect(gradeForMarks(50, 20, 11)).toBe("C");
  });
});

describe("sgpa and cgpa", () => {
  test("SGPA is credit-weighted, and a failed paper still weighs in", () => {
    const result = sgpa([
      { credits: 4, grade: "A+" },
      { credits: 3, grade: "B" },
      { credits: 3, grade: "P" },
    ]);
    // (4×10 + 3×8 + 3×5) / 10
    expect(result.value === null ? null : rounded(result.value)).toBe(7.9);
    expect(result.credits).toBe(10);

    expect(sgpa([{ credits: 4, grade: "A" }, { credits: 4, grade: "F" }]).value).toBe(4.5);
  });

  test("nothing counted is null, not 0.00 SGPA", () => {
    const result = sgpa([
      { credits: 4, grade: null },
      { credits: 0, grade: "A" },
      { credits: -2, grade: "A" },
    ]);
    expect(result.credits).toBe(0);
    expect(result.value).toBe(null);
  });

  test("CGPA weights each semester by its credits and skips empty ones", () => {
    const result = cgpa([
      { sgpa: 8.75, credits: 22 },
      { sgpa: 8.1, credits: 20 },
    ]);
    expect(result.value === null ? null : rounded(result.value)).toBe(8.44);
    expect(result.credits).toBe(42);

    const withGaps = cgpa([
      { sgpa: 9, credits: 20 },
      { sgpa: Number.NaN, credits: 20 },
      { sgpa: 11, credits: 20 },
      { sgpa: 8, credits: 0 },
    ]);
    expect(withGaps.value).toBe(9);
    expect(withGaps.credits).toBe(20);
  });
});

describe("target planner", () => {
  test("answers what this semester must score, and refuses the impossible", () => {
    const plan = requiredSgpa(8.44, 42, 8.5, 22);
    expect(plan.type).toBe("success");
    if (plan.type === "success") expect(rounded(plan.requiredSgpa)).toBe(8.61);

    expect(requiredSgpa(9.5, 100, 7, 20).type).toBe("secured");
    expect(requiredSgpa(9, 100, 10, 20).type).toBe("impossible_perfect");
    expect(requiredSgpa(6, 100, 9, 20).type).toBe("impossible_this_sem");
  });
});

describe("attendance", () => {
  test("over the target: how many classes can still be missed", () => {
    const status = attendanceStatus(40, 50, 75);
    expect(status.type).toBe("safe");
    expect(status.percent).toBe(80);
    expect(status.bunkable).toBe(3);
    expect(status.required).toBe(0);
  });

  test("under the target: how many must be attended in a row", () => {
    const status = attendanceStatus(30, 50, 75);
    expect(status.type).toBe("risk");
    expect(status.percent).toBe(60);
    expect(status.bunkable).toBe(0);
    expect(status.required).toBe(30);
  });

  test("nothing logged yet is empty, not a 0% risk", () => {
    const status = attendanceStatus(0, 0, 75);
    expect(status.type).toBe("empty");
    expect(status.percent).toBe(0);
    expect(status.required).toBe(0);
  });
});

describe("ranking", () => {
  /** A roster row, with only the fields the ranking reads. */
  function row(reg: string, value: number | null, collegeCode = "105"): RankRow {
    return {
      reg, name: reg, sgpa: value, cgpa: value, sgpaText: "", cgpaText: "",
      collegeCode, collegeName: "", rank: null, collegeRank: null,
    };
  }

  const rows = [
    row("21105157110", 8.0),
    row("21105157098", 9.0),
    row("21105157102", 9.0),
    row("21105157120", 8.0, "106"),
    row("21105157130", null, "106"),
  ];

  test("CGPA first, missing last, registration as the tie-break", () => {
    expect(sortByCgpa(rows).map((entry) => entry.reg)).toEqual([
      "21105157098", "21105157102", "21105157110", "21105157120", "21105157130",
    ]);
  });

  test("ties share a rank, the next rank skips, college rank is per college", () => {
    const result = ranked(rows);
    expect(result.map((entry) => entry.rank)).toEqual([1, 1, 3, 3, null]);
    expect(result.map((entry) => entry.collegeRank)).toEqual([1, 1, 3, 1, null]);
    // Ranking never mutates the order it was given.
    expect(rows.map((entry) => entry.reg)[0]).toBe("21105157110");
  });
});

describe("semester", () => {
  const OCT_2026 = new Date(2026, 9, 26);

  test("the batch decides the semester the class is attending", () => {
    expect(currentSemester("26", false, OCT_2026)).toBe(1);
    expect(currentSemester("25", false, OCT_2026)).toBe(3);
    expect(currentSemester("24", false, OCT_2026)).toBe(4);
    expect(currentSemester("23", false, OCT_2026)).toBe(7);
  });

  test("the even session moves everyone up one, and never past eight", () => {
    const JAN_2026 = new Date(2026, 0, 15);
    expect(currentSemester("24", false, JAN_2026)).toBe(3);
    expect(currentSemester("22", false, JAN_2026)).toBe(8);
    // A graduated batch is clamped, not extrapolated.
    expect(currentSemester("19", false, OCT_2026)).toBe(8);
  });
});
