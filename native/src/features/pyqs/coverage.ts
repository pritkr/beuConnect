/**
 * What the shelf actually covers, in one place.
 *
 * "Coverage" here is a product statement, not a paper count: for every branch
 * and semester, how many subjects the shelf lists, how many of those have at
 * least one paper, and how many papers they carry. A cell with subjects but no
 * papers is normal — the syllabus ships the code before the archive catches up
 * — and must never be hidden, because the code is what the student came for.
 *
 * `scripts/audit-catalog.ts` prints this; the audit is the honest read of the
 * catalogue without mounting the app.
 */

import { SEMESTERS, type CatalogSubject } from "./catalog-core";

export interface CoverageCell {
  branch: string;
  sem: number;
  subjects: number;
  withPapers: number;
  /** Paper rows across the cell, counting a shared paper once per cell. */
  papers: number;
}

export interface BranchCoverage {
  branch: string;
  subjects: number;
  withPapers: number;
  papers: number;
  /** Only the cells that exist; a missing semester is absent, not zero. */
  cells: CoverageCell[];
}

/** Every branch + semester with at least one row, in branch then semester order. */
export function coverageCells(rows: CatalogSubject[]): CoverageCell[] {
  const cells = new Map<string, CoverageCell>();
  for (const subject of rows) {
    const key = `${subject.branch}|${subject.sem}`;
    const cell = cells.get(key) ?? { branch: subject.branch, sem: subject.sem, subjects: 0, withPapers: 0, papers: 0 };
    cell.subjects += 1;
    if (subject.papers.length > 0) cell.withPapers += 1;
    cell.papers += subject.papers.length;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((left, right) =>
    left.branch === right.branch ? left.sem - right.sem : left.branch.localeCompare(right.branch),
  );
}

export function branchCoverage(rows: CatalogSubject[]): BranchCoverage[] {
  const byBranch = new Map<string, BranchCoverage>();
  for (const cell of coverageCells(rows)) {
    const branch = byBranch.get(cell.branch) ?? {
      branch: cell.branch,
      subjects: 0,
      withPapers: 0,
      papers: 0,
      cells: [],
    };
    branch.subjects += cell.subjects;
    branch.withPapers += cell.withPapers;
    branch.papers += cell.papers;
    branch.cells.push(cell);
    byBranch.set(cell.branch, branch);
  }
  return [...byBranch.values()].sort((left, right) => left.branch.localeCompare(right.branch));
}

/** Rows on the shelf with no paper yet: the empty state the audit counts. */
export function zeroPaperCount(rows: CatalogSubject[]): number {
  return rows.filter((subject) => subject.papers.length === 0).length;
}

/**
 * Branch + semester pairs a branch rail can offer but the shelf cannot fill.
 * `branchKeys` is the set the rail lists; empty cells are the honest gaps.
 */
export function emptyCells(rows: CatalogSubject[], branchKeys: string[]): { branch: string; sem: number }[] {
  const filled = new Set(rows.map((subject) => `${subject.branch}|${subject.sem}`));
  const gaps: { branch: string; sem: number }[] = [];
  for (const branch of branchKeys) {
    for (const sem of SEMESTERS) {
      if (!filled.has(`${branch}|${sem}`)) gaps.push({ branch, sem });
    }
  }
  return gaps;
}

/** "cse 3: 12 subjects / 4 with papers" — one line per branch, for the CLI. */
export function coverageLine(branch: BranchCoverage): string {
  const cells = branch.cells.map((cell) => `${cell.sem}:${cell.subjects}/${cell.withPapers}`).join(" ");
  return `${branch.branch.padEnd(7)} ${cells}`;
}
