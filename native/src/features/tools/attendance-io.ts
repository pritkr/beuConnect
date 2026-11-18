/**
 * Attendance backup: the file the website exports, read and written here.
 *
 * The shape is not ours to choose. `beu.prit.eu.org/attendance` writes
 * `{ version: 2, settings: { targetPercentage }, subjects: [...] }` and each
 * subject is `{ id, name, attended, total, history }`, so a file exported on
 * either side opens on the other. Nothing here renames a field or adds one the
 * site would not read.
 *
 * Two honesty rules:
 *
 *  1. **`history` goes out empty.** The site's history is a stack of the last
 *     twenty *previous totals*; this app keeps a dated log of marks and can
 *     lose old entries. Rebuilding `prevAttended`/`prevTotal` from today's
 *     counts would be a made-up history, so the array is empty and the site
 *     treats the paper as freshly typed.
 *  2. **An unreadable file changes nothing.** The whole file is checked before
 *     the first subject is applied, so a partly valid backup never leaves the
 *     ledger half-imported.
 *
 * The site does not export a semester, a batch or an `updatedAt`; the summary
 * date therefore comes from the newest `history[].timestamp` in the file, and
 * disappears when the file has no history.
 */

import { formatDate } from "../../lib/net";
import type { AttendanceState, AttendanceSubject } from "./state";
import { newId } from "./state";

/* ------------------------------------------------------------------- shape */

/** The site's file version, and the only envelope this app writes. */
export const ATTENDANCE_FILE_VERSION = 2;

export type AttendanceHistoryAction = "present" | "absent" | "manual";

export interface AttendanceFileHistory {
  action: AttendanceHistoryAction;
  prevAttended: number;
  prevTotal: number;
  timestamp: number;
}

export interface AttendanceFileSubject {
  id: string;
  name: string;
  attended: number;
  total: number;
  history: AttendanceFileHistory[];
  /** Not written by the site; read when another export carries it. */
  code?: string;
}

export interface AttendanceFile {
  version: number;
  settings: { targetPercentage: number };
  subjects: AttendanceFileSubject[];
}

/** A file read back: the site envelope, or a bare subject array from before v2. */
export interface AttendanceRead {
  subjects: AttendanceFileSubject[];
  /** `null` when the file carried no settings (the legacy array). */
  targetPercentage: number | null;
  /** The newest event the file can date itself with, epoch ms; `null` if none. */
  updatedAt: number | null;
  legacy: boolean;
}

export type AttendanceParse =
  | { ok: true; file: AttendanceRead }
  | { ok: false; reason: string };

/* ------------------------------------------------------------------ export */

/**
 * This device's ledger as the site's file. A paper the register filled in
 * exports its two counts like any other; the site has no field for the source.
 */
export function exportAttendance(state: AttendanceState): AttendanceFile {
  return {
    version: ATTENDANCE_FILE_VERSION,
    settings: { targetPercentage: state.target },
    subjects: state.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      attended: subject.attended,
      total: subject.total,
      history: [],
    })),
  };
}

/* ------------------------------------------------------------------- parse */

/** A whole, non-negative count, or `null` when the value is not one. */
function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** One row, or the sentence that says what is wrong with it. */
function readSubject(value: unknown, index: number): AttendanceFileSubject | string {
  const row = index + 1;
  if (!value || typeof value !== "object" || Array.isArray(value)) return `Row ${row} is not a paper.`;

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 64) : "";
  if (id === "") return `Row ${row} has no paper id.`;

  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
  if (name === "") return `Row ${row} has no paper name.`;

  const total = asCount(raw.total);
  if (total === null) {
    return raw.total === undefined || raw.total === null
      ? `Row ${row} has no class count.`
      : `Row ${row} has an invalid class count.`;
  }

  // A paper added but never marked has no attended count; a count that is
  // present has to be one, because a typo there is not a number to round.
  const attended = raw.attended === undefined || raw.attended === null ? 0 : asCount(raw.attended);
  if (attended === null) return `Row ${row} has an invalid attended count.`;
  if (attended > total) return `Row ${row} has attended more classes than it held.`;

  const code = typeof raw.code === "string" ? raw.code.trim().slice(0, 24) : "";

  // The site's history is a capped stack of previous totals. It is read for the
  // dates it carries, never for arithmetic on this side.
  const history: AttendanceFileHistory[] = [];
  if (Array.isArray(raw.history)) {
    for (const entry of raw.history) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const timestamp = asCount(item.timestamp);
      if (timestamp === null || timestamp === 0) continue;
      history.push({
        action: item.action === "present" || item.action === "absent" ? item.action : "manual",
        prevAttended: asCount(item.prevAttended) ?? 0,
        prevTotal: asCount(item.prevTotal) ?? 0,
        timestamp,
      });
    }
  }

  return {
    id,
    name,
    attended,
    total,
    history,
    ...(code === "" ? {} : { code }),
  };
}

/** The newest timestamp a history entry carries, or `null`. */
function newestHistory(subjects: readonly AttendanceFileSubject[]): number | null {
  let newest: number | null = null;
  for (const subject of subjects) {
    for (const entry of subject.history) {
      if (newest === null || entry.timestamp > newest) newest = entry.timestamp;
    }
  }
  return newest;
}

/**
 * Reads whatever the student pasted. The site's own importer accepts both the
 * v2 envelope and the pre-v2 bare array, so this one does too; anything else
 * comes back with the one sentence the screen shows.
 */
export function readAttendanceFile(text: string): AttendanceParse {
  if (text.trim() === "") return { ok: false, reason: "Nothing pasted." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Not valid JSON." };
  }

  const legacy = Array.isArray(parsed);
  const envelope =
    !legacy && parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  if (!legacy && envelope === null) {
    return { ok: false, reason: "Not a BEUConnect attendance file." };
  }
  if (envelope && (envelope.version !== ATTENDANCE_FILE_VERSION || !Array.isArray(envelope.subjects))) {
    return { ok: false, reason: "Not a BEUConnect attendance file." };
  }

  const rows = Array.isArray(parsed) ? parsed : (envelope?.subjects as unknown[]);
  if (rows.length === 0) return { ok: false, reason: "The file has no papers." };

  const subjects: AttendanceFileSubject[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const read = readSubject(rows[index], index);
    if (typeof read === "string") return { ok: false, reason: read };
    subjects.push(read);
  }

  const settings = envelope?.settings;
  const rawTarget =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).targetPercentage
      : null;
  const target = asCount(rawTarget);

  return {
    ok: true,
    file: {
      subjects,
      targetPercentage: target === null ? null : Math.min(100, Math.max(1, target)),
      updatedAt: newestHistory(subjects),
      legacy,
    },
  };
}

/* ------------------------------------------------------------------- merge */

export interface AttendanceMerge {
  state: AttendanceState;
  /** Papers whose two counts came from the file. */
  replaced: number;
  /** Papers the file added to the ledger. */
  added: number;
}

function samePaper(current: AttendanceSubject, imported: AttendanceFileSubject): boolean {
  if (imported.code && current.code && imported.code.toLowerCase() === current.code.toLowerCase()) return true;
  if (imported.id !== "" && current.id === imported.id) return true;
  return current.name.trim().toLowerCase() === imported.name.trim().toLowerCase();
}

/**
 * Applies a read file to the ledger.
 *
 * A matching paper (by code, then by the id the site wrote, then by name) takes
 * the file's two counts and name; a paper the file does not mention is left
 * exactly as it was; a paper new to this phone is added. The date log is never
 * rewritten: the file carries totals, not the days behind them.
 */
export function mergeAttendance(state: AttendanceState, file: AttendanceRead): AttendanceMerge {
  const subjects = state.subjects.map((subject) => ({ ...subject }));
  let replaced = 0;
  let added = 0;

  for (const imported of file.subjects) {
    const index = subjects.findIndex((subject) => samePaper(subject, imported));
    if (index >= 0) {
      const current = subjects[index];
      subjects[index] = {
        ...current,
        name: imported.name,
        attended: imported.attended,
        total: imported.total,
        code: imported.code ?? current.code,
        // Counts typed on another phone are the student's again, not the
        // register's: the GECS marker comes off with the numbers it fed.
        source: "manual",
        syncedAt: undefined,
      };
      replaced += 1;
      continue;
    }

    subjects.push({
      id: newId("sub"),
      name: imported.name,
      attended: imported.attended,
      total: imported.total,
      ...(imported.code ? { code: imported.code } : {}),
    });
    added += 1;
  }

  const target = file.targetPercentage ?? state.target;
  return { state: { ...state, subjects, target }, replaced, added };
}

/* ------------------------------------------------------------------- words */

/** `12 subjects · updated 3 Nov 2026`, or `12 subjects` when the file has no history. */
export function attendanceFileSummary(file: AttendanceRead): string {
  const count = file.subjects.length;
  const papers = count === 1 ? "1 subject" : `${count} subjects`;
  return file.updatedAt === null ? papers : `${papers} · updated ${formatDate(file.updatedAt)}`;
}

/** `8 replaced · 2 added`, and only the half that happened. */
export function attendanceMergeSummary(merge: AttendanceMerge): string {
  const parts: string[] = [];
  if (merge.replaced > 0) parts.push(`${merge.replaced} replaced`);
  if (merge.added > 0) parts.push(`${merge.added} added`);
  return parts.length === 0 ? "Nothing changed" : parts.join(" · ");
}
