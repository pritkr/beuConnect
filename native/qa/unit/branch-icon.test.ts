/**
 * Branch → glyph.
 *
 * The same branch reaches the UI under three ids: the syllabus and notes carry
 * a slug (`cse`), the result tables and the data feed carry BEU's numeric code
 * (`105`), and the college register adds Mechatronics (`met`). A missing entry
 * is silent at runtime — the chip simply loses its icon — so every id space is
 * checked here against one table.
 */

import { describe, expect, test } from "nsh/test";

import { branchIcon } from "../../src/ui/branch-icon";
import { BRANCHES as RESULT_BRANCHES } from "../../src/features/results/data";
import { BRANCHES as REGISTER_BRANCHES } from "../../src/features/students/data";
import { BRANCH_META } from "../../src/features/syllabus/data/packs";

describe("branchIcon", () => {
  test("every branch the syllabus offers carries a mark", () => {
    for (const branch of BRANCH_META) {
      expect(branchIcon(branch.code) !== undefined).toBe(true);
    }
  });

  test("a numeric code draws the same mark as its slug", () => {
    expect(branchIcon("101")).toBe(branchIcon("civil"));
    expect(branchIcon("102")).toBe(branchIcon("mech"));
    expect(branchIcon("103")).toBe(branchIcon("ee"));
    expect(branchIcon("104")).toBe(branchIcon("ece"));
    expect(branchIcon("105")).toBe(branchIcon("cse"));
    expect(branchIcon("110")).toBe(branchIcon("eee"));
    expect(branchIcon("161")).toBe(branchIcon("eee"));
  });

  test("every branch in the result tables resolves", () => {
    for (const branch of RESULT_BRANCHES) {
      expect(branchIcon(branch.code) !== undefined).toBe(true);
    }
  });

  test("the register's branches resolve, MET included", () => {
    for (const branch of REGISTER_BRANCHES) {
      expect(branchIcon(branch.slug) !== undefined).toBe(true);
    }
  });

  test("the paper catalog's first year and IT rows resolve", () => {
    expect(branchIcon("common") !== undefined).toBe(true);
    expect(branchIcon("it") !== undefined).toBe(true);
  });

  test("an unknown branch gets no mark, not a guess", () => {
    expect(branchIcon("nope")).toBe(undefined);
    expect(branchIcon("")).toBe(undefined);
  });
});
