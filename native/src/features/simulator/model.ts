/**
 * Results — the simulator's arithmetic.
 *
 * A real semester result is the input; the student moves end-semester (ESE)
 * marks and the screen shows what that does to the SGPA, or how many ESE marks
 * a target SGPA still needs. Everything here is pure: the same result and the
 * same draft always produce the same numbers, so the screen holds no maths of
 * its own.
 *
 * The grade tables, the ESE floor and the SGPA sum live in `tools/engine.ts`
 * and are imported, never re-derived. A draft is indexed by subject position
 * (not by code — a result can print two rows with the same or a blank code)
 * and a `null` entry means "leave this paper exactly as BEU published it".
 * Leaving a paper alone keeps BEU's own grade, grace marks included, which is
 * what makes Reset return a delta of exactly 0.0.
 */

import type { ResultSubject } from "../results/data";
import type { Grade, SubjectInput, SubjectTotal } from "../tools/engine";
import {
  GRADE_POINTS,
  GRADES,
  clamp,
  gradeForMarks,
  isGrade,
  maxEse as eseCeiling,
  maxIa as iaCeiling,
  num,
  requiredEse,
  roundHalfUp,
  sgpa,
} from "../tools/engine";

/** One entry per subject: the ESE mark to simulate, or `null` to leave it. */
export type MarksDraft = readonly (number | null)[];

/** One subject's contribution to Σ(credits × points). */
export interface Contribution {
  code: string;
  name: string;
  /** Credits that count; 0 when the paper is not counted (audit, ungraded). */
  credit: number;
  /** Credit-weighted points; 0 when the paper is not counted. */
  points: number;
}

/** The simulated SGPA and what it moved from. */
export interface Simulation {
  /** Simulated SGPA, `null` when no paper carries both a credit and a grade. */
  value: number | null;
  /** Credits behind `value`; 0 when `value` is null. */
  credits: number;
  /** `value - real`, `null` when either side is unknown. */
  delta: number | null;
  /** SGPA of the marks exactly as BEU published them. */
  real: number | null;
}

/** One paper that can carry the SGPA to the target on its own. */
export interface NeededPaper {
  /** Position in `subjects`, the same key the draft uses. */
  index: number;
  code: string;
  name: string;
  /** Smallest whole ESE mark that reaches the target with every other paper held. */
  need: number;
  /** ESE maximum for that paper (70 or 30). */
  max: number;
  /** Grade that mark earns (or the higher grade the ESE floor jumps to). */
  grade: Grade;
}

/** Everything the target card needs, including the cases it must say no to. */
export interface TargetPlan {
  /** Clamped to 0–10. */
  target: number;
  /** Simulated SGPA right now. */
  current: number | null;
  /** Simulated SGPA with every editable ESE at its maximum. */
  ceiling: number | null;
  /** The target is already met by the current draft. */
  reached: boolean;
  /** The ceiling reaches the target, so some set of moves can get there. */
  reachable: boolean;
  /** Cheapest single-paper route; `null` when no one paper suffices. */
  best: NeededPaper | null;
  /** Every single-paper route that reaches the target, cheapest first. */
  options: NeededPaper[];
}

const EPS = 1e-9;

/* ------------------------------------------------------------------ papers */

/**
 * The paper's total marks, from its kind and its own marks.
 *
 * BEU prints 100-mark theory papers (30 IA + 70 ESE) and 50-mark practicals
 * (20 + 30). A stored mark larger than the smaller paper allows is proof the
 * paper is the larger one, which also covers a practical misfiled as theory.
 *
 *   kind       IA  ESE  total
 *   theory     24   46   100
 *   practical  12   13    50
 *   practical  24   46   100  (the marks cannot fit a 50-mark paper)
 */
export function paperTotal(subject: ResultSubject): SubjectTotal {
  if (subject.kind === "practical") {
    const ia = num(subject.ia);
    const ese = num(subject.ese);
    if (ia !== null && ia > iaCeiling(50)) return 100;
    if (ese !== null && ese > eseCeiling(50)) return 100;
    return 50;
  }
  return 100;
}

/**
 * The paper's ESE maximum.
 *
 *   100-mark theory  → 70
 *    50-mark practical → 30
 *   practical with ESE 46 → 70 (100-mark paper)
 */
export function paperMaxEse(subject: ResultSubject): number {
  return eseCeiling(paperTotal(subject));
}

/**
 * The credits a paper carries, `null` when the result does not print them.
 *
 *   4      → 4
 *   "0"    → 0    (audit paper: present, but not counted)
 *   ""     → null (the wide semester tables carry no credit column)
 */
export function creditOf(subject: ResultSubject): number | null {
  const credit = num(subject.credit);
  if (credit === null || credit < 0) return null;
  return Math.round(credit * 100) / 100;
}

/**
 * The paper's stored grade, `null` when the string is not a BEU grade.
 *
 *   "A+"  → "A+"
 *   "O"   → "O"   (the top-grade spelling some schemes print)
 *   ""    → null
 */
export function gradeOf(subject: ResultSubject): Grade | null {
  const raw = subject.grade.trim();
  return isGrade(raw) ? raw : null;
}

/**
 * Whether the paper can be simulated at all: both IA and ESE are printed.
 *
 *   IA 24, ESE 46   → true
 *   IA 24, ESE ""   → false
 *   IA "", ESE 46   → false
 */
export function isEditable(subject: ResultSubject): boolean {
  return num(subject.ia) !== null && num(subject.ese) !== null;
}

/**
 * Whether the paper counts in an SGPA: a real grade and credits above zero.
 *
 *   { grade: "A", credit: "4" }   → true
 *   { grade: "A", credit: "0" }   → false (audit)
 *   { grade: "",  credit: "4" }   → false (nothing graded yet)
 */
export function isCounted(subject: ResultSubject): boolean {
  const credit = creditOf(subject);
  return credit !== null && credit > 0 && gradeOf(subject) !== null;
}

/* ------------------------------------------------------------------- input */

/**
 * Digits only, leading zeros dropped — what the ESE field holds while typing.
 *
 *   "07"   → "7"
 *   "7a"   → "7"
 *   "0"    → "0"
 */
export function cleanMark(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  return digits.slice(0, 2);
}

/**
 * The typed text as an ESE mark inside 0–`max`; empty reads 0.
 *
 *   "46"  max 70 → 46
 *   "90"  max 70 → 70
 *   ""    max 30 → 0
 */
export function readMark(raw: string, max: number): number {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return 0;
  const value = Number(digits);
  return Number.isFinite(value) ? clamp(Math.round(value), 0, max) : 0;
}

/**
 * The draft behind a list of field texts, one entry per subject.
 *
 *   texts ["46", ""]  subjects [theory, theory]  → [46, 0]
 *   texts ["13"]      subjects [practical]       → [13]
 *   any text          subject without marks      → null (leave it alone)
 */
export function draftFrom(subjects: readonly ResultSubject[], texts: readonly string[]): MarksDraft {
  return subjects.map((subject, index) => {
    if (!isEditable(subject)) return null;
    return readMark(texts[index] ?? "", paperMaxEse(subject));
  });
}

/* ------------------------------------------------------------------ grades */

interface Row {
  index: number;
  subject: ResultSubject;
  total: SubjectTotal;
  ia: number | null;
  ese: number | null;
  credit: number | null;
  grade: Grade | null;
  counted: boolean;
}

function rowsOf(subjects: readonly ResultSubject[]): Row[] {
  return subjects.map((subject, index) => {
    const credit = creditOf(subject);
    const grade = gradeOf(subject);
    return {
      index,
      subject,
      total: paperTotal(subject),
      ia: num(subject.ia),
      ese: num(subject.ese),
      credit,
      grade,
      counted: credit !== null && credit > 0 && grade !== null,
    };
  });
}

function average(rows: readonly Row[]): { value: number | null; credits: number } {
  const inputs: SubjectInput[] = [];
  for (const row of rows) {
    if (!row.counted || row.credit === null || row.grade === null) continue;
    inputs.push({ credits: row.credit, grade: row.grade });
  }
  return sgpa(inputs);
}

function pointsOf(rows: readonly Row[]): number {
  let total = 0;
  for (const row of rows) {
    if (!row.counted || row.credit === null || row.grade === null) continue;
    total += row.credit * GRADE_POINTS[row.grade];
  }
  return total;
}

/* ------------------------------------------------------------------- apply */

/**
 * The result with the draft's ESE marks applied. A paper the draft does not
 * change is returned as the *same object*, keeping BEU's printed grade (and
 * any grace marks) instead of re-deriving it from the marks.
 *
 *   paper IA 30, ESE 60, grade A+  draft [60]  → untouched, grade A+
 *   paper IA 30, ESE 60, grade A+  draft [50]  → ESE 50, total 80, grade A
 *   paper IA 24, ESE 46, grade B   draft null  → untouched, grade B
 */
export function applyMarks(subjects: readonly ResultSubject[], draft: MarksDraft): ResultSubject[] {
  return subjects.map((subject, index) => {
    const ia = num(subject.ia);
    const real = num(subject.ese);
    const wanted = draft[index];
    if (ia === null || real === null || wanted === null || !Number.isFinite(wanted)) return subject;

    const total = paperTotal(subject);
    const safeIa = clamp(ia, 0, iaCeiling(total));
    const ese = clamp(Math.round(wanted), 0, eseCeiling(total));
    if (ese === clamp(Math.round(real), 0, eseCeiling(total))) return subject;

    const grade = gradeForMarks(total, safeIa, ese);
    return {
      ...subject,
      ese: String(ese),
      total: String(safeIa + ese),
      grade: grade ?? "",
    };
  });
}

/* ---------------------------------------------------------------- simulate */

/**
 * The SGPA under a draft, with the real SGPA and the signed move.
 *
 *   real 8.20, draft unchanged        → { value: 8.20, delta: 0,     credits: 24 }
 *   real 8.20, draft lifts one A→A+   → { value: 8.35, delta: 0.15,  credits: 24 }
 *   result with no credits printed    → { value: null, delta: null,  credits: 0  }
 */
export function simulate(subjects: readonly ResultSubject[], draft: MarksDraft): Simulation {
  const real = average(rowsOf(subjects));
  const live = average(rowsOf(applyMarks(subjects, draft)));
  return {
    value: live.value,
    credits: live.credits,
    delta: real.value === null || live.value === null ? null : live.value - real.value,
    real: real.value,
  };
}

/**
 * One row per subject, aligned with the input: credits counted and the points
 * they add. Uncounted rows report 0/0 so row order never shifts.
 *
 *   { credit: "4", grade: "A" }   → { credit: 4, points: 36 }
 *   { credit: "0", grade: "A+" }  → { credit: 0, points: 0  }
 *   { credit: "",  grade: "B" }   → { credit: 0, points: 0  }
 */
export function contributions(subjects: readonly ResultSubject[]): Contribution[] {
  return rowsOf(subjects).map((row) => {
    const counted = row.counted && row.credit !== null && row.grade !== null;
    return {
      code: row.subject.code,
      name: row.subject.name,
      credit: counted && row.credit !== null ? row.credit : 0,
      points: counted && row.credit !== null && row.grade !== null ? row.credit * GRADE_POINTS[row.grade] : 0,
    };
  });
}

/**
 * One paper's contribution on its own: credits × grade points, 0 when the
 * paper is not counted. `contributions()` is the same number for every paper
 * at once.
 *
 *   { credit: "4", grade: "A" }   → 36
 *   { credit: "0", grade: "A+" }  → 0
 *   { credit: "",  grade: "B" }   → 0
 */
export function pointsFor(subject: ResultSubject): number {
  const credit = creditOf(subject);
  const grade = gradeOf(subject);
  return credit === null || grade === null ? 0 : credit * GRADE_POINTS[grade];
}

/* ------------------------------------------------------------------ target */

/** The lowest grade worth at least `points` per credit. */
function gradeForPoints(points: number): Grade | null {
  let found: Grade | null = null;
  for (const grade of GRADES) {
    if (GRADE_POINTS[grade] >= points) found = grade;
  }
  return found;
}

/**
 * The ESE each paper needs, on its own, to reach `target` with every other
 * paper held at its current draft. Options are sorted by marks needed, so the
 * first line is the cheapest paper to move.
 *
 *   target 8.5, 24 credits, a paper worth 4 credits needs 8 points → B
 *   target 9.0, that paper's IA caps it at A              → no option
 *   target below the current SGPA                          → reached, no options
 */
export function marksNeeded(subjects: readonly ResultSubject[], draft: MarksDraft, targetSgpa: number): TargetPlan {
  const target = clamp(Number.isFinite(targetSgpa) ? targetSgpa : 0, 0, 10);
  const applied = applyMarks(subjects, draft);
  const rows = rowsOf(applied);
  const base = average(rows);

  const maxed = subjects.map((subject) => (isEditable(subject) ? paperMaxEse(subject) : null));
  const top = average(rowsOf(applyMarks(subjects, maxed)));

  // Compare what the screen prints: a paper result of 8.296 shows "8.30", and
  // a target of 8.3 must read as met rather than contradict its own header.
  const shown = base.value === null ? null : roundHalfUp(base.value, 2);
  const ceiling = top.value === null ? null : roundHalfUp(top.value, 2);
  const reached = shown !== null && shown >= target - EPS;
  const reachable = ceiling !== null && ceiling >= target - EPS;
  const options = reached ? [] : optionsFor(rows, base, target);

  return {
    target,
    current: base.value,
    ceiling: top.value,
    reached,
    reachable,
    best: options[0] ?? null,
    options,
  };
}

function optionsFor(
  rows: readonly Row[],
  base: { value: number | null; credits: number },
  target: number,
): NeededPaper[] {
  if (base.value === null || base.credits <= 0) return [];

  const points = pointsOf(rows);
  const options: NeededPaper[] = [];

  for (const row of rows) {
    if (!row.counted || row.credit === null || row.credit <= 0) continue;
    if (row.ia === null || row.ese === null || row.grade === null) continue;
    if (!isEditable(row.subject)) continue;

    // Hold every other paper: this one must add the missing points alone.
    const others = points - row.credit * GRADE_POINTS[row.grade];
    const perCredit = (target * base.credits - others) / row.credit;
    const neededPoints = Math.ceil(perCredit - EPS);
    if (neededPoints <= 0 || neededPoints > 10) continue;

    const grade = gradeForPoints(neededPoints);
    if (grade === null) continue;

    const need = requiredEse(row.total, clamp(row.ia, 0, iaCeiling(row.total)), grade);
    if (need === null || need <= row.ese) continue;

    options.push({
      index: row.index,
      code: row.subject.code,
      name: row.subject.name,
      need,
      max: eseCeiling(row.total),
      grade,
    });
  }

  options.sort((a, b) => a.need - b.need || a.name.localeCompare(b.name));
  return options;
}
