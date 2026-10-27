/**
 * The CGPA join behind `students.leads`, separated from the screen so it can be
 * tested without a host.
 *
 * BEU's published roster is the only source: a row without a CGPA is dropped,
 * never defaulted to zero, and a row from another college is dropped too. The
 * register says who exists; the roster says how they scored. Nothing here
 * invents a missing mark or a rank that BEU did not publish.
 */

/** The five branches BEU publishes result tables for. MET has no such code. */
export const LEAD_BRANCHES: readonly string[] = ["101", "102", "103", "104", "105"];

/** How many rows one batch shows. */
export const LEAD_LIMIT = 25;

export interface LeadCandidate {
  reg: string;
  name: string;
  cgpa: number | null;
  collegeCode: string;
  /** The branch code the roster was loaded for. */
  branch: string;
  /** The semester that roster was published for. */
  sem: number;
}

export interface Lead {
  reg: string;
  name: string;
  cgpa: number;
  branch: string;
  sem: number;
}

/** `2024-28` → `24`. */
export function sessionBatch(session: string): string {
  return session.slice(2, 4);
}

function compare(a: Lead, b: Lead): number {
  if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.reg < b.reg ? -1 : a.reg > b.reg ? 1 : 0;
}

/**
 * Every ranked row for one college, highest CGPA first. Ties break by name and
 * then registration, so the same roster always produces the same list.
 */
export function rankByCgpa(rows: readonly LeadCandidate[], college: string): Lead[] {
  const leads: Lead[] = [];
  for (const row of rows) {
    if (row.cgpa === null) continue;
    if (college !== "" && row.collegeCode !== college) continue;
    leads.push({ reg: row.reg, name: row.name, cgpa: row.cgpa, branch: row.branch, sem: row.sem });
  }
  leads.sort(compare);
  return leads;
}

/** The best `limit` rows from `rankByCgpa`. */
export function topByCgpa(
  rows: readonly LeadCandidate[],
  college: string,
  limit: number = LEAD_LIMIT,
): Lead[] {
  return rankByCgpa(rows, college).slice(0, Math.max(0, limit));
}
