/**
 * Results — rank numbers that stay honest about ties and missing CGPAs.
 *
 * `data.ts` assigns a *competition* rank: students with the same CGPA share a
 * place, and the next different CGPA jumps past the shared block (1, 1, 3).
 * The rank is therefore never unique on its own, and the screens must say so
 * instead of printing "3" where two students are third.
 *
 * A student with no CGPA in BEU's table has no rank at all. That is not rank
 * zero: it is "not ranked", and it is counted separately so a percentile never
 * divides by students who were never in the order.
 */

import type { RankRow } from "./data";

export type RankKey = "rank" | "collegeRank";

/** How many rows share this rank. 0 when the rank is null. */
export function tieSize(rows: RankRow[], rank: number | null, key: RankKey = "rank"): number {
  if (rank === null || rank <= 0) return 0;
  let count = 0;
  for (const row of rows) if (row[key] === rank) count += 1;
  return count;
}

/** A rank as it should be read: `#3`, `=3` when the place is shared, `—` when unranked. */
export function rankLabel(rank: number | null, tied = 1): string {
  if (rank === null || rank <= 0) return "—";
  return tied > 1 ? `=${rank}` : `#${rank}`;
}

/** A plain numeral for the medal / table gutter, with the tie marker. */
export function rankNumeral(rank: number | null, tied = 1): string {
  if (rank === null || rank <= 0) return "—";
  return tied > 1 ? `=${rank}` : String(rank);
}

/** How many rows in this roster have no CGPA and therefore no rank. */
export function unrankedCount(rows: RankRow[]): number {
  let count = 0;
  for (const row of rows) if (row.cgpa === null) count += 1;
  return count;
}

/** `1 student`, `4 students`. */
export function students(n: number): string {
  return `${n} ${n === 1 ? "student" : "students"}`;
}

/** The sentence that explains a shared place. Empty when the place is unique. */
export function tieSentence(rank: number | null, tied: number, scope: string): string {
  if (rank === null || rank <= 0 || tied <= 1) return "";
  return `${students(tied)} share ${scope} rank ${rank}. The next rank skips the shared places.`;
}

/** The sentence that explains an unranked student. Empty when everyone is ranked. */
export function missingSentence(unranked: number): string {
  if (unranked <= 0) return "";
  return `${students(unranked)} in this table have no CGPA, so they are not ranked.`;
}

/* ------------------------------------------------------------ distribution */

/** BEU grades on a 10-point scale; a value outside it is not a CGPA. */
const SCALE = 10;

/** One column of the CGPA spread: `[from, to)` on the 10-point scale. */
export interface CgpaBand {
  /** Lower edge, inclusive. */
  from: number;
  /** Upper edge, exclusive; the last band also holds a perfect 10. */
  to: number;
  /** Ranked students whose CGPA falls in this band. */
  count: number;
}

/** Two decimals at most, so a band edge never prints a float's leftovers. */
function edge(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Which band a CGPA falls in, or null when the value is not on BEU's scale.
 * A missing CGPA has no band: it is not a zero and must not be drawn as one.
 */
export function cgpaBandIndex(value: number | null | undefined, bands = 10): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > SCALE) return null;
  const size = SCALE / bands;
  return Math.min(bands - 1, Math.floor(value / size));
}

/**
 * The CGPA spread of a roster, in `bands` equal slices of the 10-point scale.
 *
 * The histogram answers the question a rank alone cannot: is the student in a
 * cluster or on a ledge? It counts only rows that carry a real CGPA, so the
 * columns always sum to the number of ranked students in the table.
 */
export function cgpaDistribution(rows: RankRow[], bands = 10): CgpaBand[] {
  const size = SCALE / bands;
  const out: CgpaBand[] = [];
  for (let index = 0; index < bands; index += 1) {
    out.push({ from: edge(index * size), to: edge((index + 1) * size), count: 0 });
  }
  for (const row of rows) {
    const index = cgpaBandIndex(row.cgpa, bands);
    if (index !== null) out[index].count += 1;
  }
  return out;
}

/** `8` → `"8"`, `8.5` → `"8.5"`: a band edge without a trailing zero. */
export function bandEdge(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
