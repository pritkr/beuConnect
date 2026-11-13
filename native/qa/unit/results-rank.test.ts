/**
 * Results — the rank maths a student acts on, with no engine and no network.
 *
 * The screens print whatever these functions return, so the two rules that keep
 * a rank honest are pinned here:
 *
 *  - a tie shares a place and the next rank skips it;
 *  - a CGPA BEU did not publish is missing, never a zero — no rank, no band,
 *    and not counted in a percentile or a spread.
 *
 * Run: `nsh test qa/unit/results-rank.test.ts`
 */

import { describe, expect, test } from "nsh/test";

import type { RankRow } from "../../src/features/results/data";
import {
  bandEdge,
  cgpaBandIndex,
  cgpaDistribution,
  missingSentence,
  rankLabel,
  tieSize,
} from "../../src/features/results/ranking";

/** A roster row; only the fields the rank maths reads are interesting. */
function row(reg: string, cgpa: number | null, rank: number | null = null, collegeRank: number | null = null): RankRow {
  return {
    reg,
    name: `Student ${reg.slice(-2)}`,
    sgpa: null,
    cgpa,
    sgpaText: cgpa === null ? "—" : cgpa.toFixed(2),
    cgpaText: cgpa === null ? "—" : cgpa.toFixed(2),
    collegeCode: "105",
    collegeName: "Government Engineering College Sheikhpura",
    rank,
    collegeRank,
  };
}

describe("rank ties", () => {
  test("a shared place counts every student on it, and the next place skips", () => {
    const rows = [row("1", 9.0, 1), row("2", 8.5, 2), row("3", 8.5, 2), row("4", 8.5, 2), row("5", 8.0, 5)];

    expect(tieSize(rows, 2)).toBe(3);
    expect(tieSize(rows, 1)).toBe(1);
    expect(tieSize(rows, 5)).toBe(1);
    // A place nobody holds is not a tie.
    expect(tieSize(rows, 3)).toBe(0);
    expect(tieSize(rows, null)).toBe(0);
  });

  test("college places are counted inside the college, not the branch", () => {
    const rows = [
      row("1", 9.0, 1, 2),
      row("2", 8.5, 2, 1),
      row("3", 8.5, 2, 1),
      row("4", 8.0, 4, 3),
    ];

    expect(tieSize(rows, 2, "rank")).toBe(2);
    expect(tieSize(rows, 1, "collegeRank")).toBe(2);
    expect(tieSize(rows, 2, "collegeRank")).toBe(1);
  });

  test("a shared place reads =3; a unique one reads #3; no rank reads a dash", () => {
    expect(rankLabel(3, 2)).toBe("=3");
    expect(rankLabel(3, 1)).toBe("#3");
    expect(rankLabel(null)).toBe("—");
    expect(rankLabel(0)).toBe("—");
  });

  test("an unranked row is named, not counted as zero", () => {
    expect(missingSentence(0)).toBe("");
    expect(missingSentence(1)).toContain("1 student");
    expect(missingSentence(4)).toContain("4 students");
    expect(missingSentence(4)).toContain("not ranked");
  });
});

describe("CGPA distribution", () => {
  test("ten bands cover the whole scale and count only real CGPAs", () => {
    const rows = [
      row("1", 10.0),
      row("2", 9.99),
      row("3", 8.0),
      row("4", 7.49),
      row("5", 0),
      row("6", null),
      row("7", Number.NaN),
      // Out of range: BEU's scale is 0–10, so neither is a band.
      row("8", -0.5),
      row("9", 10.5),
    ];

    const bands = cgpaDistribution(rows);
    expect(bands.length).toBe(10);
    expect(bands[0].from).toBe(0);
    expect(bands[9].to).toBe(10);
    // 10 is in the top band, not an eleventh one.
    expect(bands[9].count).toBe(2);
    expect(bands[8].count).toBe(1);
    expect(bands[7].count).toBe(1);
    expect(bands[0].count).toBe(1);
    expect(bands.reduce((sum, band) => sum + band.count, 0)).toBe(5);
  });

  test("half-point bands place a 8.75 CGPA between 8.5 and 9.0", () => {
    const bands = cgpaDistribution([row("1", 8.75), row("2", 8.5), row("3", 8.49)], 20);
    expect(bands.length).toBe(20);
    expect(cgpaBandIndex(8.75, 20)).toBe(17);
    expect(bands[17].from).toBe(8.5);
    expect(bands[17].to).toBe(9);
    expect(bands[17].count).toBe(2);
    expect(bands[16].count).toBe(1);
  });

  test("an empty roster is ten empty columns, not a crash or a zero", () => {
    const bands = cgpaDistribution([]);
    expect(bands.length).toBe(10);
    expect(bands.every((band) => band.count === 0)).toBe(true);
    expect(bands[0]).toEqual({ from: 0, to: 1, count: 0 });
  });

  test("a CGPA that is not on the scale has no band", () => {
    expect(cgpaBandIndex(null)).toBe(null);
    expect(cgpaBandIndex(Number.NaN)).toBe(null);
    expect(cgpaBandIndex(-1)).toBe(null);
    expect(cgpaBandIndex(10.1)).toBe(null);
    expect(cgpaBandIndex(0)).toBe(0);
    expect(cgpaBandIndex(10)).toBe(9);
  });

  test("a band edge prints without a trailing zero", () => {
    expect(bandEdge(8)).toBe("8");
    expect(bandEdge(8.5)).toBe("8.5");
    expect(bandEdge(0)).toBe("0");
  });
});
