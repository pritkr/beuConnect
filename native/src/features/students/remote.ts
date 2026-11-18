/**
 * Rosters for the other 51 colleges.
 *
 * The site publishes one CSV per `(batch, college, branch, semester)` — the
 * same rows the app would bundle if it could. It cannot: the whole set is 8.5 MB
 * against ≈766 KB of APK headroom (`docs/DATA_BREADTH.md` §2). So the app ships
 * the **index** (`college-index.ts`, generated, 462 B gzipped) and fetches one
 * roster when a student opens it, then keeps it in `lib/net`'s cache.
 *
 * Two rules this file keeps:
 *
 *  1. **Never build a URL the index did not name.** A combination BEU has not
 *     published is an empty list, not a guess that 404s on the student.
 *  2. **Never invent a mark.** A blank `Cur. CGPA` stays `null` and sorts last;
 *     it is not a zero and it is not skipped silently.
 *
 * GEC Sheikhpura still prefers its bundled register (`data.ts`); this path is
 * what every other college, and any batch the register lacks, opens.
 */

import { SITE, fetchText } from "../../lib/net";
import { csvRecords } from "../../lib/csv";
import { BRANCHES, branchByCode } from "./data";
import { COLLEGE_INDEX } from "./college-index";

/** One published row: the five columns the college roster carries. */
export interface RemoteRow {
  reg: string;
  name: string;
  session: string;
  /** `null` when BEU left the cell empty — never a zero. */
  sgpa: number | null;
  cgpa: number | null;
}

type Index = typeof COLLEGE_INDEX;
const INDEX: Index = COLLEGE_INDEX;

/** Newest batch first, the order the rest of the app uses. */
export function batchesFor(college: string): string[] {
  const entry = INDEX[college];
  return entry ? Object.keys(entry).sort((a, b) => b.localeCompare(a)) : [];
}

export function branchesFor(college: string, batch: string): string[] {
  const entry = INDEX[college]?.[batch];
  return entry ? Object.keys(entry) : [];
}

/** The semesters BEU has actually published, ascending. Empty means "none". */
export function semsFor(college: string, batch: string, branch: string): number[] {
  return [...(INDEX[college]?.[batch]?.[branch] ?? [])];
}

/** Whether any roster exists for this college at all. */
export function hasRosters(college: string): boolean {
  return Object.keys(INDEX[college] ?? {}).length > 0;
}

/** Every branch code the college has ever published, in the app's branch order. */
export function branchesOfCollege(college: string): string[] {
  const seen = new Set<string>();
  for (const batch of Object.values(INDEX[college] ?? {})) {
    for (const branch of Object.keys(batch)) seen.add(branch);
  }
  const known = BRANCHES.map((entry) => entry.code).filter((code) => seen.has(code));
  const rest = [...seen].filter((code) => !known.includes(code)).sort();
  return [...known, ...rest];
}

/** `CSE`, or the code itself when the branch is not one the app names. */
export function branchLabel(code: string): string {
  return branchByCode(code)?.short ?? code;
}

/**
 * The rows a name or registration query leaves. A query with no digits is a
 * name query: matching it against registration numbers with `includes("")`
 * would turn a miss into the whole roster.
 */
export function filterRoster(rows: readonly RemoteRow[], query: string): RemoteRow[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return [...rows];
  const digits = wanted.replace(/\D/g, "");
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(wanted)) return true;
    return digits !== "" && row.reg.includes(digits);
  });
}

/**
 * The URL for one published roster, or `null` when the index does not carry it.
 *
 * A 404 from a URL the student's own tap produced is the app's claim failing;
 * a `null` here is the honest answer before any request is made.
 */
export function rosterUrl(college: string, batch: string, branch: string, sem: number): string | null {
  if (!semsFor(college, batch, branch).includes(sem)) return null;
  return `${SITE}/data/students_${batch}_${college}_${branch}_sem${sem}.csv`;
}

function mark(value: string): number | null {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

/**
 * Parses one roster. The header is `Session,RegNo,Name,SGPA,Cur. CGPA`; a row
 * without a registration number or a name is dropped rather than shown blank.
 */
export function parseRoster(text: string): RemoteRow[] {
  const rows: RemoteRow[] = [];
  for (const record of csvRecords(text)) {
    const reg = (record.RegNo ?? "").trim();
    const name = (record.Name ?? "").trim();
    if (reg === "" || name === "") continue;
    rows.push({
      reg,
      name,
      session: (record.Session ?? "").trim(),
      sgpa: mark(record.SGPA ?? ""),
      cgpa: mark(record["Cur. CGPA"] ?? ""),
    });
  }
  return rows;
}

/**
 * CGPA first, then SGPA, then name. A `null` CGPA is unranked and sorts after
 * every student who has one — the same rule the result tables use.
 */
export function rankRoster(rows: readonly RemoteRow[]): RemoteRow[] {
  return [...rows].sort((a, b) => {
    const cgpa = (b.cgpa ?? -1) - (a.cgpa ?? -1);
    if (cgpa !== 0) return cgpa;
    const sgpa = (b.sgpa ?? -1) - (a.sgpa ?? -1);
    if (sgpa !== 0) return sgpa;
    return a.name.localeCompare(b.name);
  });
}

/** How many rows carry a CGPA at all; the rest are ranked by SGPA only. */
export function cgpaCount(rows: readonly RemoteRow[]): number {
  return rows.reduce((count, row) => count + (row.cgpa === null ? 0 : 1), 0);
}

/**
 * Fetches and ranks one roster. The cache key carries every coordinate, so two
 * colleges or two semesters can never answer for each other, and a reopened
 * roster paints from disk before the network.
 */
export async function loadRoster(
  college: string,
  batch: string,
  branch: string,
  sem: number,
): Promise<RemoteRow[]> {
  const url = rosterUrl(college, batch, branch, sem);
  if (!url) return [];
  // Same `roster:` family the Storage screen groups and the offline pack clears;
  // the college sits in the key so two colleges can never answer for each other.
  const key = `roster:${batch}:${college}:${branch}:${sem}`;
  const text = await fetchText(url, { cacheKey: key, cacheMaxAge: 7 * 24 * 60 * 60 * 1000, timeout: 20000 });
  return rankRoster(parseRoster(text));
}
