/**
 * The GEC Sheikhpura register, indexed once for the five student screens.
 *
 * `./roster-data.ts` carries the packed rows and expands them on the first
 * `decodeRoster()` call; this file adds the batch label, the branch table and
 * the maps the screens read. Nothing here touches the network: the roster is
 * the copy that ships with the app, so search and browsing work offline.
 *
 * The register's own Session/Batch are authoritative. A year-back student can
 * carry a registration year earlier than their current batch, so the year is
 * read from the session, not from the registration number.
 */

import {
  ROSTER_BRANCH_COUNTS,
  ROSTER_COLLEGE,
  ROSTER_SESSIONS,
  ROSTER_SESSION_COUNTS,
  ROSTER_TOTAL,
  decodeRoster,
} from "./roster-data";
import { rankStudents } from "./rank";

export type BranchSlug = "cse" | "ece" | "ee" | "mech" | "civil" | "met";

export interface BranchDef {
  slug: BranchSlug;
  /** The BEU branch code from a registration number; "" when the branch has none. */
  code: string;
  name: string;
  short: string;
}

/** The register's branch order: largest first, MET last. */
export const BRANCHES: readonly BranchDef[] = [
  { slug: "cse", code: "105", name: "Computer Science & Engineering", short: "CSE" },
  { slug: "ece", code: "104", name: "Electronics & Communication Engineering", short: "ECE" },
  { slug: "ee", code: "103", name: "Electrical Engineering", short: "EE" },
  { slug: "mech", code: "102", name: "Mechanical Engineering", short: "MECH" },
  { slug: "civil", code: "101", name: "Civil Engineering", short: "CIVIL" },
  { slug: "met", code: "", name: "Mechatronics Engineering", short: "MET" },
];

export const COLLEGE_CODE = ROSTER_COLLEGE;
export const COLLEGE_NAME = "Government Engineering College, Sheikhpura";
export const TOTAL = ROSTER_TOTAL;

/** Newest first. */
export const SESSIONS: readonly string[] = ROSTER_SESSIONS;
export const SESSION_COUNTS: Readonly<Record<string, number>> = ROSTER_SESSION_COUNTS;
export const BRANCH_COUNTS: Readonly<Record<string, number>> = ROSTER_BRANCH_COUNTS;

export interface Student {
  reg: string;
  name: string;
  /** The class roll number; "" when it is the registration number. */
  roll: string;
  branch: BranchSlug;
  /** `2024-28`. */
  session: string;
  /** The session's first year. */
  year: number;
  /** `2K24`, the register's batch label. */
  batch: string;
  /** True when `reg` is a provisional class roll, not a BEU number. */
  provisional: boolean;
}

function isProvisional(reg: string): boolean {
  return !/^\d{11}$/.test(reg);
}

function compareStudents(left: Student, right: Student): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : left.reg < right.reg ? -1 : left.reg > right.reg ? 1 : 0;
}

const DECODED: Student[] = decodeRoster().map((row) => {
  const session = row.session;
  const year = Number(session.slice(0, 4));
  return {
    reg: row.reg,
    name: row.name,
    roll: row.roll,
    branch: row.branch as BranchSlug,
    session,
    year,
    batch: `2K${session.slice(2, 4)}`,
    provisional: isProvisional(row.reg),
  };
});

/** Every student, A–Z by name. */
export const ALL_STUDENTS: readonly Student[] = DECODED.slice().sort(compareStudents);

const BY_REG = new Map(DECODED.map((student) => [student.reg, student] as const));
const BY_BRANCH = new Map<BranchSlug, Student[]>();
const BY_SESSION = new Map<string, Student[]>();
for (const student of ALL_STUDENTS) {
  const branchRows = BY_BRANCH.get(student.branch);
  if (branchRows) branchRows.push(student);
  else BY_BRANCH.set(student.branch, [student]);
  const sessionRows = BY_SESSION.get(student.session);
  if (sessionRows) sessionRows.push(student);
  else BY_SESSION.set(student.session, [student]);
}

/** A branch slug (or BEU code) as the branch table describes it. */
export function branchBySlug(value: string): BranchDef | null {
  const wanted = value.trim().toLowerCase();
  if (!wanted) return null;
  return BRANCHES.find((branch) => branch.slug === wanted || (branch.code !== "" && branch.code === wanted)) ?? null;
}

/** The branch for a BEU code, or null for MET and unknown codes. */
export function branchByCode(code: string): BranchDef | null {
  const wanted = code.trim();
  if (!wanted) return null;
  return BRANCHES.find((branch) => branch.code !== "" && branch.code === wanted) ?? null;
}

/** A registration number as the register stores it: uppercase, letters and digits only. */
export function cleanReg(value: string): string {
  return value.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function studentByReg(value: string): Student | null {
  return BY_REG.get(cleanReg(value)) ?? null;
}

export function studentsInBranch(value: string): readonly Student[] {
  const branch = branchBySlug(value);
  return branch ? (BY_BRANCH.get(branch.slug) ?? []) : [];
}

export function studentsInSession(session: string): readonly Student[] {
  return BY_SESSION.get(session.trim()) ?? [];
}

/** `CSE`, `MECH`, or the raw value when it is not one of the six branches. */
export function branchShort(value: string): string {
  return branchBySlug(value)?.short ?? value.trim().toUpperCase();
}

export function searchStudents(
  query: string,
  options: { branch?: string; session?: string } = {},
): readonly Student[] {
  let pool: readonly Student[] = options.branch ? studentsInBranch(options.branch) : ALL_STUDENTS;
  if (options.session) pool = pool.filter((student) => student.session === options.session);
  return rankStudents(pool, query);
}

export interface SessionGroup {
  session: string;
  count: number;
  rows: Student[];
}

/** Rows grouped by batch, newest first, A–Z inside each batch. */
export function groupBySession(rows: readonly Student[]): SessionGroup[] {
  const buckets = new Map<string, Student[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.session);
    if (bucket) bucket.push(row);
    else buckets.set(row.session, [row]);
  }
  return SESSIONS.filter((session) => buckets.has(session)).map((session) => {
    const bucket = buckets.get(session) ?? [];
    bucket.sort(compareStudents);
    return { session, count: bucket.length, rows: bucket };
  });
}

/** `1784` → `"1,784"`; small, dependency-free, and the same in every locale. */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
