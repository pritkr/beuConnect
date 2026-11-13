/**
 * BEU's colleges as the register screen lists them: the one college this build
 * carries students for, then every other college A–Z.
 *
 * Pure — no roster, no JSX — so the order is unit-tested apart from a screen.
 * The names come from `results/colleges.ts`, the same table a registration
 * number is decoded against, so a college cannot be named twice.
 */

import { COLLEGE_NAMES, shortCollegeName } from "../results/colleges";

export interface CollegeEntry {
  /** The BEU college code from `COLLEGE_NAMES`, e.g. `157`. */
  readonly code: string;
  /** The official BEU name. */
  readonly name: string;
  /** The dense form: "GEC Sheikhpura", "MIT Muzaffarpur". */
  readonly short: string;
}

/** Every BEU college, in the code order `COLLEGE_NAMES` declares. */
export const COLLEGE_ENTRIES: readonly CollegeEntry[] = Object.keys(COLLEGE_NAMES).map((code) => ({
  code,
  name: COLLEGE_NAMES[code],
  short: shortCollegeName(code),
}));

function compareColleges(left: CollegeEntry, right: CollegeEntry): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
}

/**
 * `codes` lead, in the order given, then every other college A–Z by its
 * official name (the code breaks a tie). A code the table does not know is not
 * invented and not promoted: the rest of the list still comes back A–Z. A
 * duplicate code is listed once, at its highest priority.
 */
export function collegesByPriority(
  colleges: readonly CollegeEntry[],
  codes: readonly string[],
): CollegeEntry[] {
  const ranked = codes.filter((code, index) => code !== "" && codes.indexOf(code) === index);
  const rank = new Map(ranked.map((code, index) => [code, index]));
  return [...colleges].sort((left, right) => {
    const leftRank = rank.get(left.code);
    const rightRank = rank.get(right.code);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? ranked.length) - (rightRank ?? ranked.length);
    }
    return compareColleges(left, right);
  });
}

/**
 * `register` first, then every other college A–Z by its official name (the code
 * breaks a tie). A code the table does not know is not invented and not
 * promoted: the whole list comes back A–Z.
 */
export function collegesByRegisterFirst(
  colleges: readonly CollegeEntry[],
  register: string,
): CollegeEntry[] {
  return collegesByPriority(colleges, [register.trim()]);
}

/**
 * The colleges whose name, short name or code contains every token of `query`.
 *
 * Tokens match in any order and case, so "sheikhpura gec", "GEC Sheikhpura" and
 * "157" all reach the one college the register carries. A blank query returns
 * the input array itself, which lets a screen tell "not filtered" from "no
 * match" without copying 52 rows.
 */
export function filterColleges(colleges: readonly CollegeEntry[], query: string): readonly CollegeEntry[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return colleges;
  return colleges.filter((college) => answers(college, tokens));
}

/**
 * Whether one college answers `query`.
 *
 * The colleges screen keeps the register on screen in every state, so it must
 * know whether the register is part of the answer: a query naming it cannot be
 * followed by "no college matches". A blank query matches nothing, so the
 * caller can tell "searching" from "idle".
 */
export function matchesCollege(college: CollegeEntry, query: string): boolean {
  return answers(college, queryTokens(query));
}

function queryTokens(query: string): string[] {
  return query
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function answers(college: CollegeEntry, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const haystack = `${college.name} ${college.short} ${college.code}`.toUpperCase();
  return tokens.every((token) => haystack.includes(token));
}
