/**
 * The course a PYQ shelf opens on.
 *
 * The saved course is a choice made once and remembered forever, so a student
 * who picked Semester 1 in first year must not still land there in their third.
 * A registration number implies the class semester; a stored semester is only
 * a fallback when there is no number. The session calendar is pinned so these
 * assertions do not rot.
 */

import { describe, expect, test } from "nsh/test";

import { courseFrom } from "../../src/features/pyqs/state";

const OCT_2026 = new Date(2026, 9, 26);

describe("pyq course semester derivation", () => {
  test("24-batch lands on Sem 4", () => {
    const course = courseFrom({ branch: "cse", reg: "24000000" }, OCT_2026);
    expect(course?.branch).toBe("cse");
    expect(course?.sem).toBe(4);
  });

  test("23-batch lands on Sem 7", () => {
    expect(courseFrom({ branch: "cse", reg: "23000000" }, OCT_2026)?.sem).toBe(7);
  });

  test("25-batch lands on Sem 3", () => {
    expect(courseFrom({ branch: "cse", reg: "25000000" }, OCT_2026)?.sem).toBe(3);
  });

  test("26-batch lands on Sem 1", () => {
    expect(courseFrom({ branch: "cse", reg: "26000000" }, OCT_2026)?.sem).toBe(1);
  });

  test("a stored semester wins when no registration number is available", () => {
    expect(courseFrom({ branch: "cse", sem: 6 }, OCT_2026)?.sem).toBe(6);
  });

  test("a stored semester does not override the registration number", () => {
    expect(courseFrom({ branch: "cse", reg: "24000000", sem: 1 }, OCT_2026)?.sem).toBe(4);
  });

  test("an unknown branch is not a course, and junk is null", () => {
    expect(courseFrom({ branch: "zzz", sem: 3 }, OCT_2026)).toBeNull();
    expect(courseFrom(null, OCT_2026)).toBeNull();
    expect(courseFrom("cse", OCT_2026)).toBeNull();
  });
});
