/**
 * The precomputed search headings, resolved per paper.
 *
 * `./data/headings.ts` is generated from the same packs the screens read, so the
 * first keystroke on Search does no parsing: the unit headings it used to take
 * from `parseSyllabus` (and GATE's from `parseGate`) are already here. The table
 * describes the bundled packs, so it is trusted only while it still matches
 * them: a subject row carries the length of the `content` its headings came
 * from (a live pack whose text changed length is a miss), and a paper with no
 * row is a miss too. Search also parses a GATE paper whose live record overrides
 * the bundled pack. Every miss ends in the parser, never in a stale row.
 *
 * Regenerate through `bun scripts/data/build-packs.ts`; never edit the data.
 */

import { GATE_HEADINGS, SUBJECT_HEADINGS, type SubjectHeadings } from "./data/headings";
import { parseSyllabus, searchHeadings } from "./parse";

/** The bundled row for `key`, or null when it is absent or its text changed. */
function bundledRow(key: string, contentLength: number): SubjectHeadings | null {
  if (!Object.prototype.hasOwnProperty.call(SUBJECT_HEADINGS, key)) return null;
  const row = SUBJECT_HEADINGS[key];
  return row.n === contentLength ? row : null;
}

/**
 * A paper's searchable headings: the precomputed list when `content` still has
 * the length its row was built from, the parser otherwise — so a paper the
 * table does not carry (a newer live pack) still gets its headings.
 */
export function subjectHeadings(key: string, content: unknown): readonly string[] {
  if (typeof content !== "string" || content.length === 0) return [];
  return bundledRow(key, content.length)?.h ?? searchHeadings(parseSyllabus(content));
}

/** The bundled section headings for a GATE paper code, or null when absent. */
export function precomputedGateHeadings(code: string): readonly string[] | null {
  return Object.prototype.hasOwnProperty.call(GATE_HEADINGS, code) ? GATE_HEADINGS[code] : null;
}
