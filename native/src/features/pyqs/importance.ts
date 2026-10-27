/**
 * How useful a shelf row is to *this* student, and the three buckets the shelf
 * is actually read in: their semester, then everything with papers worth
 * revising, then the rest.
 *
 * The score is deliberately blunt. It ranks rows for a person, not papers:
 *
 *   current semester                       +1000
 *   their branch                            +120
 *   papers (at most six count)               +40 each
 *   a paper from the running academic year   +80
 *   a 4-credit-or-more subject               +30
 *   theory over practical                    +10
 *   an elective                             -20
 *
 * Worked examples from the October 2026 snapshot (CSE, sem 5):
 *
 *   Formal Language & Automata Theory · 105503 · 6 papers · 4 credits
 *     1000 + 120 + 6×40 + 30 + 10                     = 1400 (current)
 *   Data Structure & Algorithms · 105302 · 11 papers · 3 credits
 *     0 + 120 + 6×40 + 10                            = 370  (most important)
 *   Discrete Mathematics and Graph Theory · 105304 · no papers · 4 credits
 *     0 + 120 + 0 + 30 + 10                          = 160  (rest)
 *
 * No paper is counted twice: the shared table means one paper serves every
 * branch row, and the cap stops a single well-archived subject from owning the
 * top of the shelf forever.
 */

import type { CatalogSubject } from "./catalog-core";

export interface ImportanceOptions {
  /** The student's own semester, if known. */
  current?: number | null;
  /** The student's own branch, if known. */
  branch?: string | null;
  /** The clock the session is read from; tests pass a fixed date. */
  now?: Date;
}

/** The weights above, named so a caller can explain a rank without reading it. */
export const IMPORTANCE = {
  currentSemester: 1000,
  sameBranch: 120,
  perPaper: 40,
  paperCap: 6,
  currentYear: 80,
  heavyCredits: 30,
  heavyCreditsAt: 4,
  theory: 10,
  elective: -20,
} as const;

/** One row's score. Pure: it reads the hydration shape, never a signal. */
export function importanceOf(subject: CatalogSubject, options: ImportanceOptions = {}): number {
  const now = options.now ?? new Date();
  let score = 0;
  if (options.current != null && subject.sem === options.current) score += IMPORTANCE.currentSemester;
  if (options.branch != null && subject.branch === options.branch) score += IMPORTANCE.sameBranch;
  score += Math.min(subject.papers.length, IMPORTANCE.paperCap) * IMPORTANCE.perPaper;
  if (subject.papers.some((paper) => paper.year === now.getFullYear())) score += IMPORTANCE.currentYear;
  if (subject.credits >= IMPORTANCE.heavyCreditsAt) score += IMPORTANCE.heavyCredits;
  if (subject.type === "theory") score += IMPORTANCE.theory;
  if (subject.elective) score += IMPORTANCE.elective;
  return score;
}

/** Highest score first, then more papers, then the name a student would scan. */
export function compareImportance(left: CatalogSubject, right: CatalogSubject, options: ImportanceOptions = {}): number {
  const byScore = importanceOf(right, options) - importanceOf(left, options);
  if (byScore !== 0) return byScore;
  const byPapers = right.papers.length - left.papers.length;
  if (byPapers !== 0) return byPapers;
  return left.name.localeCompare(right.name);
}

export interface SubjectBuckets {
  /** The student's own semester, highest score first. */
  current: CatalogSubject[];
  /**
   * Rows with at least one paper, outside their semester, nearest semester
   * first: a sem-5 student revises sem 3 before sem 1, and sem 1 before sem 8.
   */
  mostImportant: CatalogSubject[];
  /** Everything else: newer electives, labs, rows with no paper yet. */
  rest: CatalogSubject[];
}

/**
 * The shelf's three bands. `current` and `mostImportant` never overlap, so
 * flattening the result lists every row exactly once.
 */
export function groupSubjects(rows: CatalogSubject[], options: ImportanceOptions = {}): SubjectBuckets {
  const current = options.current ?? null;
  const buckets: SubjectBuckets = { current: [], mostImportant: [], rest: [] };
  for (const subject of rows) {
    if (current !== null && subject.sem === current) buckets.current.push(subject);
    else if (subject.papers.length > 0) buckets.mostImportant.push(subject);
    else buckets.rest.push(subject);
  }
  buckets.current.sort((left, right) => compareImportance(left, right, options));
  const distance = (subject: CatalogSubject): number =>
    current === null ? 0 : Math.abs(subject.sem - current);
  buckets.mostImportant.sort(
    (left, right) =>
      distance(left) - distance(right) || compareImportance(left, right, options),
  );
  buckets.rest.sort((left, right) => compareImportance(left, right, options));
  return buckets;
}

/** The three bands as one list, for a single virtualised `List`. */
export function rankSubjects(rows: CatalogSubject[], options: ImportanceOptions = {}): CatalogSubject[] {
  const buckets = groupSubjects(rows, options);
  return [...buckets.current, ...buckets.mostImportant, ...buckets.rest];
}
