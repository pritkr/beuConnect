/**
 * The pure predicates behind the syllabus screens.
 *
 * Nothing here imports `nsh`, the UI or the stores: facets, printed hours, the
 * GATE row filters and the stored visit-history shape are plain functions, so
 * `qa/unit/syllabus.test.ts` can pin them without mounting a screen or touching
 * storage. `./parts.tsx` re-exports them for the screens.
 */

import type { Subject, Unit } from "./parse";

/* --------------------------------------------------------------- subjects */

/**
 * The facets the subject list can be narrowed to. `elective` cuts across the
 * other two: an elective can be theory or practical, and the chip counts say
 * so.
 */
export type SubjectFilter = "all" | "theory" | "practical" | "elective";

/** What a facet needs from a row: the paper it draws. */
export interface FacetRow {
  subject: Subject;
}

/**
 * The papers that pass one facet, in their published order. An unknown type is
 * neither theory nor practical and only survives "all", which is honest: the
 * snapshot never labels a paper we would have to guess about.
 */
export function filterEntries<T extends FacetRow>(entries: readonly T[], filter: SubjectFilter): T[] {
  if (filter === "all") return [...entries];
  if (filter === "elective") return entries.filter((entry) => entry.subject.elective === true);
  return entries.filter((entry) => entry.subject.type.trim().toLowerCase() === filter);
}

/**
 * The hours printed on a paper's unit headings, summed — or 0 unless every unit
 * prints them, because a partial sum understates the paper and a guessed one
 * would be an invention. These are lecture hours, not study time, so the screen
 * calls them "printed".
 */
export function printedHours(units: readonly Unit[]): number {
  if (units.length === 0) return 0;
  let total = 0;
  for (const unit of units) {
    const match = unit.hours ? /(\d+(?:\.\d+)?)/.exec(unit.hours) : null;
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(value)) return 0;
    total += value;
  }
  return Math.round(total);
}

/* ------------------------------------------------------------------- GATE */

/** What the GATE filters need from a row: the list's own line shape. */
export interface GateRow {
  kind: "section" | "topic";
  key: string;
  title: string;
  body: string;
}

/**
 * The GATE list narrowed to a search term. A matching topic keeps the section
 * heading above it, so a result never floats without its part of the paper;
 * both the topic title and the detail text are searched. A term shorter than
 * two characters is not a search yet and leaves the list alone.
 */
export function filterGateRows<T extends GateRow>(rows: readonly T[], term: string): T[] {
  const query = term.trim().toLowerCase();
  if (query.length < 2) return [...rows];

  const kept: T[] = [];
  let section: T | null = null;
  let heading = false;
  for (const row of rows) {
    if (row.kind === "section") {
      section = row;
      heading = false;
      continue;
    }
    const hit = row.title.toLowerCase().includes(query) || row.body.toLowerCase().includes(query);
    if (!hit) continue;
    if (section !== null && !heading) {
      kept.push(section);
      heading = true;
    }
    kept.push(row);
  }
  return kept;
}

/** One saved topic and the section heading above it: a deep link's exact rows. */
export function focusGateRows<T extends GateRow>(rows: readonly T[], key: string): T[] {
  const index = rows.findIndex((row) => row.kind === "topic" && row.key === key);
  if (index < 0) return [];
  const previous = rows[index - 1];
  const section = previous && previous.kind === "section" ? [previous] : [];
  return [...section, rows[index]];
}

/* ---------------------------------------------------------------- history */

/** How many papers the visit history keeps: the saved shelf covers the long tail. */
export const RECENT_MAX = 8;

/** One stored visit: enough to reopen the paper without the pack lookup. */
export interface HistoryRow {
  branch: string;
  sem: number;
  code: string;
  name: string;
  at: number;
}

function historyRow(value: unknown): HistoryRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const branch = typeof row.branch === "string" ? row.branch.trim().toLowerCase() : "";
  const code = typeof row.code === "string" ? row.code.trim() : "";
  const sem = Math.round(Number(row.sem));
  if (!branch || !code || !Number.isFinite(sem) || sem < 1 || sem > 8) return null;
  return {
    branch,
    sem,
    code,
    name: String(row.name ?? code),
    at: Number(row.at) || 0,
  };
}

/**
 * A stored history in one shape: valid rows only, newest first, one row per
 * paper, capped. Anything else (a broken write, a row from a future shape) is
 * dropped rather than trusted, so a bad key never breaks the Saved screen.
 */
export function recentList(value: unknown, cap = RECENT_MAX): HistoryRow[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: HistoryRow[] = [];
  for (const raw of value) {
    const row = historyRow(raw);
    if (!row) continue;
    const key = `${row.branch}|${row.sem}|${row.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length === cap) break;
  }
  return out;
}
