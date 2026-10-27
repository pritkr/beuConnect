/**
 * Pure BEU maths for the tools area: grading, SGPA/CGPA, the end-semester
 * predictor, the target planner, percentage conversion and the attendance
 * "bunk" calculation.
 *
 * Nothing here touches the UI or storage, so every number a screen shows can be
 * reasoned about — and checked — on its own. The rules mirror BEU's 10-point
 * credit system as the site's `src/lib/calculator/engine.ts` implements it:
 * seven grades (A+ down to F), credit-weighted averages, and the 35%
 * end-semester minimum that fails a paper whatever the total.
 *
 * ## The two formulas
 *
 *   SGPA = Σ(credits × grade points) / Σ(credits)      over graded papers
 *   CGPA = Σ(semester credits × SGPA) / Σ(semester credits)
 *
 * A paper with 0 credits contributes nothing to either sum (audit / NSS
 * courses work this way), and a paper with no grade yet is left out of *both*
 * the numerator and the denominator — never counted as a zero. When nothing is
 * counted the total is 0 credits and the value is `null`: an average of no
 * papers is unknown, not 0.00, and screens print "—".
 *
 * CGPA weights each semester's SGPA as stored, so "Save this SGPA" writes four
 * decimals (7.7222, never the displayed 7.72): a two-decimal save can move the
 * CGPA by up to 0.005 — exactly the last digit a student reads — while four
 * decimals hold that error under 0.00005. Rounding for display happens once, in
 * `fixed()` — half-up, because `toFixed` rounds the binary approximation of the
 * number rather than the number itself.
 *
 * ## Grade points (BEU 10-point scale)
 *
 *   A+ = 10   A = 9   B = 8   C = 7   D = 6   P = 5   F = 0
 *
 * (Some BEU schemes print "O" for the top grade; it is the same 10 points as
 * A+, and `GRADE_POINTS` carries it so a stored "O" can never read as NaN.)
 *
 * ## Marking rules
 *
 *   Total = IA + ESE, out of 100 (30 IA + 70 ESE) or 50 (20 IA + 30 ESE).
 *   Bands on the percentage of the total: A+ 90, A 80, B 70, C 60, D 50, P 40.
 *   A *separate* rule: ESE below 35% of the ESE maximum (24.5 of 70, 10.5 of
 *   30) fails the paper whatever the total, so the smallest whole ESE mark is
 *   25 of 70 and 11 of 30. The two numbers are different thresholds that must
 *   not be conflated: 40% overall earns P only once the paper has cleared 35%
 *   in the end-semester exam.
 *
 * Every function below carries worked examples with the expected number, so
 * the arithmetic can be checked by reading instead of running the app. (A
 * two-valued function such as `maxIa` shows both cases; the rest show three.)
 */

export type Grade = "A+" | "A" | "B" | "C" | "D" | "P" | "F";

export const GRADES: readonly Grade[] = ["A+", "A", "B", "C", "D", "P", "F"];

/**
 * BEU's 10-point scale. "O" is not a separate grade — it is how some schemes
 * print A+ — so it maps to the same 10 points instead of to `undefined`.
 *
 *   A+ 10 · A 9 · B 8 · C 7 · D 6 · P 5 · F 0
 */
export const GRADE_POINTS: Record<Grade | "O", number> = {
  "A+": 10,
  O: 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  P: 5,
  F: 0,
};

/**
 * Lowest percentage of the paper's total that still earns each grade.
 *
 * P is 40, not 35 — the 35% figure BEU also enforces is the *end-semester*
 * minimum (`minEse`), a different bar on a different denominator. Before this
 * table said 35, a 36%-overall paper with 25/70 in the ESE showed P instead of
 * F.
 */
const GRADE_CUTOFF: Record<Grade, number> = {
  "A+": 90,
  A: 80,
  B: 70,
  C: 60,
  D: 50,
  P: 40,
  F: 0,
};

/** A paper is either 100 marks (30 IA + 70 ESE) or 50 marks (20 + 30). */
export type SubjectTotal = 100 | 50;

/**
 * `value` held inside [min, max]; a non-finite value collapses to `min`.
 *
 *   value  min  max  result
 *   12     0    10   10
 *   −3     0    10   0
 *   NaN    0    10   0
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Whether a stored string is one of the seven grades ("O" included, as the
 * top-grade spelling some schemes use).
 *
 *   "A+"  → true
 *   "O"   → true
 *   "E"   → false
 */
export function isGrade(value: string): value is Grade {
  // "O" is the same 10-point top grade as A+ in schemes that print it.
  return value === "O" || (GRADES as readonly string[]).includes(value);
}

/**
 * Reads a numeric text field, `null` when it is empty or not a number.
 *
 *   input   result
 *   "8.5"   8.5
 *   " 7 "   7
 *   "abc"   null
 */
export function num(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rounds half-away-from-zero at `digits`. `toFixed` is not usable here: it
 * rounds the binary approximation, so `(2.675).toFixed(2)` is "2.67" and
 * `(1.005).toFixed(2)` is "1.00" — a stored 8.425 shown as 8.42.
 *
 *   value      digits  result
 *   2.675      2       2.68
 *   1.005      2       1.01
 *   8.424999   2       8.42
 */
export function roundHalfUp(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  const scaled = value * factor;
  // Nudge past the double's representation error (a half unit is enormous
  // compared with it) so an exact .xx5 lands on the upper digit.
  const nudged = Math.abs(scaled) + Math.abs(scaled) * Number.EPSILON * 4;
  return (Math.sign(scaled) * Math.round(nudged)) / factor;
}

/**
 * Display text — the only rounding a screen shows. `null`, NaN and infinity
 * print "—", so "no papers yet" can never read as 0.00. (The saved-SGPA field
 * is rounded separately, to four decimals, so the CGPA keeps its precision.)
 *
 *   value        fixed(value)   fixed(value, 1)
 *   7.190476…    "7.19"         "7.2"
 *   2.675        "2.68"         "2.7"
 *   null         "—"            "—"
 */
export function fixed(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return roundHalfUp(value, digits).toFixed(digits);
}

/**
 * Rounds *up* at `digits`: a requirement shown as 8.42 must be met by 8.42,
 * never by a rounded-down 8.41 that misses the target.
 *
 *   value      digits  result
 *   8.4200001  2       8.43
 *   8.42       2       8.42
 *   7.190476   2       7.20
 */
export function ceilTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.ceil(value * factor - 1e-9) / factor;
}

/**
 * 35% of the ESE maximum: the bar a paper's end-semester mark must clear.
 *
 *   total  minEse
 *   100    24.5   (25 of 70 passes, 24 does not)
 *   50     10.5   (11 of 30 passes, 10 does not)
 */
function minEse(total: SubjectTotal): number {
  return maxEse(total) * 0.35;
}

/**
 * Internal-assessment ceiling for a paper.
 *
 *   total  maxIa
 *   100    30
 *   50     20
 */
export function maxIa(total: SubjectTotal): number {
  return total === 100 ? 30 : 20;
}

/**
 * End-semester maximum for a paper.
 *
 *   total  maxEse
 *   100    70
 *   50     30
 */
export function maxEse(total: SubjectTotal): number {
  return total === 100 ? 70 : 30;
}

/**
 * The grade for a paper, `null` while either mark is missing. End-semester
 * marks below 35% of the ESE maximum fail the paper whatever the total.
 *
 *   Paper      IA  ESE  Total  % of total  Grade
 *   100 marks  24   46     70        70.0   B
 *   100 marks  24   24     48        48.0   F   (24 < 24.5, the ESE bar)
 *    50 marks  12   13     25        50.0   D
 */
export function gradeForMarks(total: SubjectTotal, ia: number, ese: number): Grade | null {
  if (!Number.isFinite(ia) || !Number.isFinite(ese)) return null;

  const safeIa = clamp(ia, 0, maxIa(total));
  const safeEse = clamp(ese, 0, maxEse(total));

  if (safeEse < minEse(total)) return "F";

  // (IA + ESE) × 100 against cutoff × total keeps band edges exact: 35 of 50
  // marks is 3500 ≥ 70 × 50, never 69.99999… that loses the higher band.
  const scored = (safeIa + safeEse) * 100;
  for (const grade of GRADES) {
    if (scored >= GRADE_CUTOFF[grade] * total) return grade;
  }
  return "F";
}

/**
 * The smallest whole ESE mark that earns *at least* `target`, `null` when the
 * paper cannot reach it. Solved by inverting the band, never by walking marks.
 *
 * The bands are contiguous, so the answer is the band's lower edge — raised to
 * the 35% ESE floor, which can skip a band entirely: with 30 IA the paper jumps
 * from F (24 marks) to D (25), so a P needs 25, not "impossible".
 *
 *   Paper      IA  Target  Band edge  Answer
 *   100 marks  24  B       ≥ 46       46
 *   100 marks  30  P       ≥ 10       25   (the ESE floor wins; 55% = D)
 *   100 marks   0  A+      ≥ 90       null (the ESE is only out of 70)
 */
export function requiredEse(total: SubjectTotal, ia: number, target: Grade): number | null {
  if (!Number.isFinite(ia)) return null;
  if (target === "F") return 0; // nothing to clear: F is the bottom band

  const safeIa = clamp(ia, 0, maxIa(total));
  // (safeIa + ese) × 100 ≥ cutoff × total, solved for the smallest whole ese.
  const bandEdge = Math.ceil((GRADE_CUTOFF[target] * total) / 100 - safeIa);
  const mark = Math.max(0, passEse(total), bandEdge);
  return mark > maxEse(total) ? null : mark;
}

/**
 * The best grade the end-semester paper can still reach with this IA.
 *
 *   100 marks, IA 30 → A+ (30 + 70 = 100%)
 *   100 marks, IA 18 → A  (18 + 70 = 88%, inside A's 80–89 band)
 *    50 marks, IA  0 → C  (0 + 30 = 60%)
 */
export function bestGrade(total: SubjectTotal, ia: number): Grade | null {
  return gradeForMarks(total, ia, maxEse(total));
}

/**
 * The smallest whole ESE mark that clears BEU's 35% end-semester bar: 35% of
 * the ESE maximum, rounded up to a mark you can actually score.
 *
 *   100 marks, 70 × 0.35 = 24.5 → 25   (ESE 24 fails, 25 passes)
 *    50 marks, 30 × 0.35 = 10.5 → 11   (ESE 10 fails, 11 passes)
 *    50 marks, IA 0 + ESE 11 = 22%  → F (the bar is not a pass on its own)
 */
export function passEse(total: SubjectTotal): number {
  return Math.ceil(minEse(total));
}

/* ------------------------------------------------------------------ SGPA */

export interface SubjectInput {
  credits: number;
  grade: Grade | null;
}

export interface CreditAverage {
  /** Full-precision average, `null` when nothing could be counted. */
  value: number | null;
  /** Credits behind the average; exactly 0 when `value` is null. */
  credits: number;
}

/**
 * A row's contribution to Σ(credits × points), or `null` when the row is not
 * counted at all: no grade yet, a non-numeric credit count, or 0 credits (an
 * audit / NSS paper). One predicate, used by the sum and by the "3 of 6
 * papers counted" hint, so the two can never disagree.
 *
 *   { credits: 4, grade: "A" }    → 36   (4 × 9)
 *   { credits: 4, grade: null }   → null
 *   { credits: 0, grade: "A+" }   → null (audit paper)
 */
function creditPoints(subject: SubjectInput): number | null {
  if (!subject.grade || !Number.isFinite(subject.credits) || subject.credits <= 0) return null;
  return subject.credits * GRADE_POINTS[subject.grade];
}

/**
 * Credit-weighted SGPA of the rows that have both a credit count and a grade.
 * Zero-credit papers are excluded from the sum and the denominator alike, and
 * an empty result is `null` — no papers graded is unknown, not 0.00.
 *
 *   Papers                        Σ credits  Σ points  SGPA
 *   4 × A+ (10), 4 × A (9)            8          76     9.50
 *   3 × B (8) + 0-credit audit        3          24     8.00
 *   nothing graded / all 0 credits    0           0     null
 */
export function sgpa(subjects: readonly SubjectInput[]): CreditAverage {
  let credits = 0;
  let points = 0;
  for (const subject of subjects) {
    const contribution = creditPoints(subject);
    if (contribution === null) continue;
    credits += subject.credits;
    points += contribution;
  }
  return { value: credits === 0 ? null : points / credits, credits };
}

/**
 * How many rows the SGPA actually counted — "3 of 6 papers".
 *
 *   three graded paper rows              → 3
 *   those three plus a 0-credit audit    → 3
 *   a row with credits but no grade yet  → 0
 */
export function countedPapers(subjects: readonly SubjectInput[]): number {
  return subjects.filter((subject) => creditPoints(subject) !== null).length;
}

export interface SemesterInput {
  sgpa: number;
  credits: number;
}

/**
 * A semester's contribution to Σ(credits × SGPA), or `null` when it cannot
 * count: no SGPA, no credits, or an SGPA outside the 0–10 scale (a typo such as
 * "84.2" is dropped rather than weighted as 84). Shared by the CGPA and its
 * "across N semesters" hint.
 *
 *   { sgpa: 8.42, credits: 20 }  → 168.4
 *   { sgpa: NaN, credits: 20 }   → null (half-typed)
 *   { sgpa: 8, credits: 0 }      → null (nothing to weight)
 */
function semesterPoints(semester: SemesterInput): number | null {
  if (!Number.isFinite(semester.sgpa) || !Number.isFinite(semester.credits)) return null;
  if (semester.credits <= 0 || semester.sgpa < 0 || semester.sgpa > 10) return null;
  return semester.credits * semester.sgpa;
}

/**
 * Credit-weighted CGPA across semesters that have both a value and credits.
 * Never a plain mean of SGPAs, and `null` (not 0.00) when nothing counts.
 *
 *   Semesters                         Σ credits  CGPA
 *   8.00 × 20, 9.00 × 20                 40      8.50
 *   7.19 × 21, 8.00 × 20, 8.50 × 22      63      7.9046…
 *   one row with credits but no SGPA      0      null
 */
export function cgpa(semesters: readonly SemesterInput[]): CreditAverage {
  let credits = 0;
  let points = 0;
  for (const semester of semesters) {
    const contribution = semesterPoints(semester);
    if (contribution === null) continue;
    credits += semester.credits;
    points += contribution;
  }
  return { value: credits === 0 ? null : points / credits, credits };
}

/**
 * How many semesters the CGPA actually counted — the number behind
 * "44 credits across 2 semesters".
 *
 *   two semesters with SGPA and credits        → 2
 *   plus one half-typed semester (no SGPA)     → 2
 *   an SGPA of 84.2 (a percentage, not a CGPA) → 0
 */
export function countedSemesters(semesters: readonly SemesterInput[]): number {
  return semesters.filter((semester) => semesterPoints(semester) !== null).length;
}

/* --------------------------------------------------------- target planner */

export type TargetResult =
  | { type: "success"; requiredSgpa: number }
  | { type: "impossible_perfect" }
  | { type: "secured" }
  | { type: "impossible_this_sem"; semsNeeded: number };

/**
 * What SGPA this semester needs to land a target CGPA — one solve, no search.
 * Mirrors the site's planner, including the "already secured", "needs N perfect
 * semesters" and "this semester cannot weigh anything" cases a raw division
 * hides.
 *
 *   Needed = (target × (previous + this) − current × previous) / this
 *
 *   Current  Prev cr  Target  This cr  Needed              Result
 *   7.50     60       8.00    20       (640 − 450)/20 9.50 success 9.50
 *   8.50     80       8.00    20       (800 − 680)/20 6.00 success 6.00
 *   9.00      0      10.00    20       (200 − 0)/20  10.00 success 10.00
 *   7.50     60       8.60    20       (688 − 450)/20 11.90 → N perfect sems
 *
 * The last row is over a perfect 10.0, so no one semester does it: at 10.0 the
 * gap closes after 60 × (8.60 − 7.50) / (10 − 8.60) = 47.14 credits, i.e.
 * ceil(47.14 / 20) = 3 more perfect semesters.
 */
export function requiredSgpa(
  currentCgpa: number,
  previousCredits: number,
  targetCgpa: number,
  semesterCredits: number,
): TargetResult {
  // The UI already bounds these; the pure function must not divide by a typo.
  const current = clamp(currentCgpa, 0, 10);
  const target = clamp(targetCgpa, 0, 10);
  const previous = Number.isFinite(previousCredits) ? Math.max(0, previousCredits) : 0;
  const credits = Number.isFinite(semesterCredits) ? Math.max(0, semesterCredits) : 0;

  if (credits <= 0) return { type: "impossible_this_sem", semsNeeded: 0 };

  const needed = (target * (previous + credits) - current * previous) / credits;
  // 0 already keeps the target: even a blank semester cannot drag it down.
  if (needed <= 0) return { type: "secured" };
  if (needed <= 10) return { type: "success", requiredSgpa: needed };
  // More than a perfect semester is needed. Only 10.0 terms can close the gap,
  // and a 10.0 target can only be held by 10.0 terms — "perfect" is the answer.
  if (target >= 10) return { type: "impossible_perfect" };

  const extraCredits = (previous * (target - current)) / (10 - target);
  return { type: "impossible_this_sem", semsNeeded: Math.max(1, Math.ceil(extraCredits / credits - 1e-9)) };
}

/* -------------------------------------------------------------- percentage */

export type PercentageFormula = "beu" | "aicte";

/**
 * CGPA → percentage. BEU's 2026 ordinance converts with `CGPA × 10`; the older
 * AICTE/UGC convention (`(CGPA − 0.75) × 10`) is still quoted by placement
 * cells, so both are offered and labelled rather than picked silently. The
 * input is clamped to the 0–10 scale and the answer to 0–100, so no formula can
 * print 104% or −7.5%.
 *
 *   CGPA    BEU ×10   AICTE (CGPA − 0.75) × 10
 *   8.42      84.2     76.7
 *   10.00    100.0     92.5
 *   0.50       5.0      0.0   (the clamp stops −2.5)
 */
export function percentage(value: number, formula: PercentageFormula): number {
  const safe = clamp(value, 0, 10);
  if (formula === "beu") return clamp(safe * 10, 0, 100);
  return clamp((safe - 0.75) * 10, 0, 100);
}

/* -------------------------------------------------------------- attendance */

export interface AttendanceStatus {
  /** Rounded percentage, 0 when nothing has been logged. */
  percent: number;
  /** `empty` until a class is logged, then `safe` or `risk` against target. */
  type: "empty" | "safe" | "risk";
  /** Classes that can be missed while staying at or above the target. */
  bunkable: number;
  /** Classes that must be attended in a row to climb back to the target. */
  required: number;
  /** False when the target (usually 100%) can no longer be reached. */
  reachable: boolean;
}

/**
 * The honest bunk maths: with `attended` of `total` at a `target` percentage,
 * how many can be missed (or must be attended) before the target breaks.
 *
 * `bunkable = floor(attended / ratio − total)`, `required = ceil((ratio ×
 * total − attended) / (1 − ratio))`; both are inverse operations of the same
 * "attended / held ≥ ratio" line, so a student who attends `required` classes
 * lands exactly on the target.
 *
 *   attended  total  target  result
 *   40        50     75      80%, safe, bunk 3       (40/53 is 75.5%, 40/54 is not)
 *   30        50     75      60%, risk, attend 30    ((37.5 − 30) ÷ 0.25)
 *   40        50     100     80%, risk, unreachable   (100% can never be regained)
 */
export function attendanceStatus(attended: number, total: number, target: number): AttendanceStatus {
  const safeTotal = Math.max(0, Math.round(total));
  const safeAttended = clamp(Math.round(attended), 0, safeTotal);
  const ratio = clamp(target, 1, 100) / 100;

  if (safeTotal <= 0) return { percent: 0, type: "empty", bunkable: 0, required: 0, reachable: true };

  const percent = (safeAttended / safeTotal) * 100;

  if (percent + 1e-9 >= target) {
    const bunkable = ratio >= 1 ? 0 : Math.max(0, Math.floor(safeAttended / ratio - safeTotal + 1e-9));
    return { percent: Math.round(percent), type: "safe", bunkable, required: 0, reachable: true };
  }

  if (ratio >= 1) {
    // Every future class is attended and the ratio still cannot climb to 100%.
    return { percent: Math.round(percent), type: "risk", bunkable: 0, required: 0, reachable: false };
  }

  const required = Math.max(0, Math.ceil((ratio * safeTotal - safeAttended) / (1 - ratio) - 1e-9));
  return { percent: Math.round(percent), type: "risk", bunkable: 0, required, reachable: true };
}

/** How the attendance line should read; `lost` is a target that can no longer be reached. */
export type AttendanceLevel = "empty" | "safe" | "risk" | "lost";

export interface AttendanceAdvice {
  level: AttendanceLevel;
  /** The one sentence a student reads first ("Can miss 3 more"). */
  headline: string;
  /** The arithmetic behind it, in words. */
  detail: string;
  /** The number the headline names: bunkable when safe, required when risk. */
  count: number;
  status: AttendanceStatus;
}

/**
 * The advice line and its explanation, from the same numbers as the percentage.
 *
 * This is the only place the words "can miss" are produced, and it can never
 * produce them below the target: `safe` comes from `attendanceStatus`, which
 * sets it only when the exact percentage is at or above the target. A target
 * already missed is `risk` ("attend N in a row") or `lost` (100% after an
 * absence) — never "safe".
 *
 *   attended  total  target  level  headline
 *   40        50     75      safe   Can miss 3 more
 *   30        50     75      risk   Attend 30 in a row
 *   49        50     100     lost   Target missed
 *   40        50     100     lost   Target missed
 *    0         0     75      empty  Nothing logged yet
 */
export function attendanceAdvice(attended: number, total: number, target: number): AttendanceAdvice {
  const status = attendanceStatus(attended, total, target);
  const safeAttended = Math.max(0, Math.round(attended));
  const safeTotal = Math.max(0, Math.round(total));

  if (status.type === "empty") {
    return {
      level: "empty",
      headline: "Nothing logged yet",
      detail: "Mark Present or Absent after your first class and the count starts there.",
      count: 0,
      status,
    };
  }

  if (!status.reachable) {
    return {
      level: "lost",
      headline: "Target missed",
      detail: `${status.percent}% now. ${target}% cannot be regained this term; lower the target to track what is still possible.`,
      count: 0,
      status,
    };
  }

  if (status.type === "safe") {
    if (status.bunkable > 0) {
      const count = status.bunkable;
      return {
        level: "safe",
        headline: `Can miss ${count} more`,
        detail: `${safeAttended} of ${safeTotal} attended. Miss ${count} and you hold ${target}%; the one after drops you below.`,
        count,
        status,
      };
    }
    return {
      level: "safe",
      headline: `At the ${target}% line`,
      detail: `${safeAttended} of ${safeTotal} attended. One more absence drops you below ${target}%.`,
      count: 0,
      status,
    };
  }

  return {
    level: "risk",
    headline: `Attend ${status.required} in a row`,
    detail: `${safeAttended} of ${safeTotal} attended. ${status.required} classes without a miss puts you back at ${target}%.`,
    count: status.required,
    status,
  };
}

/* -------------------------------------------------------------------- dates */

/**
 * Two digits, for the YYYY-MM-DD builders.
 *
 *   5 → "05"   9 → "09"   12 → "12"
 */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The local calendar date as `YYYY-MM-DD` (never shifted by UTC+5:30).
 *
 *   new Date(2026, 0, 5)   → "2026-01-05"
 *   new Date(2026, 8, 9)   → "2026-09-09"
 *   new Date(2026, 11, 31) → "2026-12-31"
 */
export function isoDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parses `YYYY-MM-DD` at local noon, avoiding DST and UTC edge cases.
 *
 *   "2026-01-05" → 5 Jan 2026, 12:00 local
 *   "2026-1-5"   → null (the zero-padded shape is required)
 *   "tomorrow"   → null
 */
export function parseIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `iso` moved by whole calendar days, still `YYYY-MM-DD` and still at noon.
 *
 *   ("2026-10-26", -1) → "2026-10-25"
 *   ("2026-12-31",  1) → "2027-01-01"
 *   ("not-a-date", 1)  → "not-a-date"
 */
export function addDays(iso: string, delta: number): string {
  const date = parseIso(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

/**
 * "Today", "Yesterday", "Tomorrow", otherwise "20 Oct 2026" — the label on the
 * attendance log's date stepper.
 *
 *   ("2026-10-26", "2026-10-26") → "Today"
 *   ("2026-10-25", "2026-10-26") → "Yesterday"
 *   ("2026-10-20", "2026-10-26") → "20 Oct 2026"
 */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  if (iso === addDays(today, 1)) return "Tomorrow";
  const date = parseIso(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Whole calendar days from today to `iso` (negative when it already passed).
 *
 *   iso           from          result
 *   "2026-11-05"  26 Oct 2026   10
 *   "2026-10-26"  26 Oct 2026   0
 *   "2026-10-23"  26 Oct 2026   −3
 */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = parseIso(iso);
  if (!target) return 0;
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end - start) / 86_400_000);
}

/**
 * "Today", "Tomorrow", "In 9 days", "3 days ago".
 *
 *   0 → "Today"   1 → "Tomorrow"   −1 → "Yesterday"   −3 → "3 days ago"
 */
export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${Math.abs(days)} days ago`;
}

/**
 * 24-hour `HH:MM` in minutes since midnight, `null` for a malformed string.
 *
 *   "09:05" → 545 (9 × 60 + 5)
 *   "9:05"  → 545 (one-digit hour is fine)
 *   "24:00" → null (no such time)
 */
export function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
