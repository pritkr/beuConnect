/* eslint-disable */
/**
 * STUB — the public source does not carry the student register.
 *
 * The shipped app bundles GEC Sheikhpura's register (1,784 students, names and
 * registration numbers) so that search and browsing work offline. That data is
 * personal information, so it is not in this repository. The real file is
 * generated from private CSVs by `bun scripts/build-students-data.mjs` inside
 * the maintainer's checkout; this stub keeps the module shape so the rest of
 * the app compiles and runs with an empty register.
 *
 * Screens that read the roster render their own empty state. Everything else —
 * results lookup, syllabus, papers, tools — is unaffected.
 */
export const ROSTER_SNAPSHOT = "";
export const ROSTER_COLLEGE = "157";
export const ROSTER_TOTAL = 0;

/** Newest first. */
export const ROSTER_SESSIONS: string[] = [];
export const ROSTER_SESSION_COUNTS: Record<string, number> = {};
export const ROSTER_BRANCH_COUNTS: Record<string, number> = {};

/** One packed row, before the app adds the batch label. */
export interface WireStudent {
  reg: string;
  name: string;
  /** The class roll number; "" when it is the registration number. */
  roll: string;
  session: string;
  branch: string;
}

/** Nothing to expand without the register. */
export function decodeRoster(): WireStudent[] {
  return [];
}
