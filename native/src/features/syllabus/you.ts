/**
 * The student's own course, and how the syllabus treats it.
 *
 * `useProfile()` declares a branch (one of the six) and a semester; this module
 * turns that answer into the two rules the screens need, and nothing else:
 *
 *  - **the landing opens on it** — its branch and its semester, with the six
 *    other semesters one tap away (`./course.ts` resolves the semester, so a
 *    batch that has moved on is never left behind);
 *  - **a paper that also belongs to it is marked** — browsing ECE Sem 1 is not
 *    a reason to lose sight of the fact that Engineering Physics is your paper
 *    too. The mark is a comparison of real codes in the snapshot, never a guess:
 *    a paper is "yours" only when your own semester carries that exact code.
 *
 * Everything here is pure: the profile row is passed in, so a test can pin it
 * and a screen can read it inside a `computed`.
 */

import { BRANCH_META } from "./data/packs";

export interface OwnCourse {
  branch: string;
  sem: number;
}

/** A branch code the snapshot carries, or "" for anything else. */
function branchOf(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return BRANCH_META.some((meta) => meta.code === code) ? code : "";
}

/** A whole semester in 1–8, or 0 when the value says nothing usable. */
function semesterOf(value: unknown): number {
  const sem = Math.round(Number(value));
  return Number.isFinite(sem) && sem >= 1 && sem <= 8 ? sem : 0;
}

/**
 * The student's declared course, or `null` when the profile names no real
 * branch. A profile with a branch and no usable semester is still a course —
 * semester 1 is the only honest answer, and the landing corrects it from the
 * registration number in `./course.ts`.
 */
export function ownCourse(profile: unknown): OwnCourse | null {
  const row = profile && typeof profile === "object" ? (profile as Record<string, unknown>) : null;
  const branch = branchOf(row?.branch);
  if (branch === "") return null;
  return { branch, sem: semesterOf(row?.sem) || 1 };
}

/** True when `branch` / `sem` is where the student actually is. */
export function isOwnCourse(own: OwnCourse | null, branch: string, sem: number): boolean {
  return own !== null && own.branch === branch && own.sem === sem;
}

/** "CSE · Semester 3" — the one line that names the student's course. */
export function ownLine(own: OwnCourse | null): string {
  if (!own) return "";
  const short = BRANCH_META.find((meta) => meta.code === own.branch)?.short ?? own.branch.toUpperCase();
  return `${short} · Semester ${own.sem}`;
}

/**
 * The student's semester first, then the rest in their published order. Pinning
 * a duplicate would show a semester twice, so a list without the own semester
 * is returned untouched.
 */
export function ownSemesterFirst<T extends { sem: number }>(list: readonly T[], own: OwnCourse | null): T[] {
  if (!own) return [...list];
  const at = list.findIndex((item) => item.sem === own.sem);
  if (at <= 0) return [...list];
  const out = [...list];
  const [mine] = out.splice(at, 1);
  out.unshift(mine);
  return out;
}
