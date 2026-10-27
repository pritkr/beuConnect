/**
 * Which course the syllabus opens on.
 *
 * The profile is the student's own course. A profile that names a branch makes
 * that branch what the landing opens on: browsing another branch is a visit,
 * not a change of identity, so `syllabus.course` never drags the student back
 * to a branch that is not theirs. With no profile there is nothing to prefer,
 * and the remembered course (`syllabus.course`) stands exactly as before.
 *
 * A remembered semester also goes stale: a batch-24 student who first opened
 * the app in Sem 1 was still landing on Sem 1 in their fourth semester. The
 * registration number in `beu.profile` says where the class is today, so a
 * stored semester that has fallen behind it is corrected forward. A stored
 * semester ahead of it is kept, because that is a pick the student made on
 * purpose and the picker must still do what it says — but only on the same
 * branch: a semester picked for another branch says nothing about this one.
 *
 * No storage here: `parts.tsx` hydrates the stores and hands them in, so the
 * rule is one pure function the tests can pin to a calendar date.
 */

import { classSemester } from "../settings/profile";
import { BRANCH_META } from "./data/packs";

export interface Course {
  branch: string;
  sem: number;
}

/** The landing always has a course to draw, even before the profile is read. */
export const DEFAULT_BRANCH = "cse";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** A branch code the snapshot actually carries, or "" for anything else. */
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
 * The course the landing opens on: the profile's branch when it names one (the
 * student's own course beats a branch browsed last), else the saved branch,
 * else CSE. The semester is the furthest of the saved one (same branch only),
 * the profile's own, and the one the registration number implies — never
 * backwards, so a paper read from a later term survives.
 */
export function resolveCourse(stored: unknown, profile: unknown, at: Date = new Date()): Course {
  const storedRow = asRecord(stored);
  const profileRow = asRecord(profile);

  const storedBranch = branchOf(storedRow?.branch);
  const profileBranch = branchOf(profileRow?.branch);
  const branch = profileBranch || storedBranch || DEFAULT_BRANCH;

  // A row whose branch is not a real one is junk, so its semester is ignored
  // with it rather than trusted to steer the landing. A semester saved for a
  // different branch is not carried over to this one either.
  const storedSem = storedBranch === branch ? semesterOf(storedRow?.sem) : 0;
  const profileSem = profileBranch === branch ? semesterOf(profileRow?.sem) : 0;
  const derived = classSemester(profileRow, at);

  return { branch, sem: Math.max(storedSem, profileSem, derived) || 1 };
}
