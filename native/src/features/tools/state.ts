/**
 * What the tools area remembers between launches, and the small helpers that
 * write it. Everything is stored locally through `src/lib/net.ts`, so every
 * screen works offline once it has been used at least once.
 *
 * ## Versioned keys
 *
 * Each key ends in `:v2`. A future shape change bumps the suffix, so an old
 * payload is simply never read as if it were the new one — a returning user
 * starts clean instead of crashing on a field that moved. On first launch
 * after the rename, `loadVersioned` copies the unversioned (v1) payload
 * forward; a payload that fails to parse is dropped silently and the screen
 * opens on its defaults.
 */

import type { Grade } from "./engine";
import type { ParsedRoutine, RoutineGroup } from "./routine-parse";
import { readStore, writeStore } from "../../lib/net";

/** Bump this and the `:vN` suffixes together when a shape changes. */
export const STORAGE_VERSION = 2;

const v = (name: string): string => `${name}:v${STORAGE_VERSION}`;

export const KEYS = {
  calculator: v("tools.calculator"),
  calculatorExtras: v("tools.calculator.extras"),
  attendance: v("tools.attendance"),
  /** The last GECS paper list, so Attendance opens offline. */
  gecs: v("tools.attendance.gecs"),
  routine: v("tools.routine"),
  wifi: v("tools.wifi"),
} as const;

/** The pre-versioning names, read once so an existing install keeps its data. */
const LEGACY_KEYS: Record<string, string> = {
  [KEYS.calculator]: "tools.calculator",
  [KEYS.calculatorExtras]: "tools.calculator.extras",
  [KEYS.attendance]: "tools.attendance",
  [KEYS.routine]: "tools.routine",
  [KEYS.wifi]: "tools.wifi",
};

/* -------------------------------------------------------------- calculator */

export type CalcMode = "sgpa" | "cgpa" | "predict" | "percent";

export interface CalcSubject {
  id: string;
  name: string;
  credits: number;
  grade: Grade | null;
}

export interface CalcSemester {
  id: string;
  name: string;
  /** Kept as text so a half-typed "8." survives a keystroke. */
  sgpa: string;
  credits: string;
}

export interface CalculatorState {
  mode: CalcMode;
  subjects: CalcSubject[];
  semesters: CalcSemester[];
}

export function newId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankSubject(index: number): CalcSubject {
  return { id: newId("sub"), name: `Subject ${index + 1}`, credits: 3, grade: null };
}

export const DEFAULT_CALCULATOR: CalculatorState = {
  mode: "sgpa",
  subjects: [blankSubject(0), blankSubject(1), blankSubject(2), blankSubject(3)],
  semesters: [],
};

/* -------------------------------------------------------------- attendance */

export interface AttendanceSubject {
  id: string;
  name: string;
  attended: number;
  total: number;
  /** The GECS paper code once the counts came from the college register. */
  code?: string;
  /** Where the counts came from; absent on a paper typed before this marker. */
  source?: "manual" | "gecs";
  /** When the register answered, so an older log entry is not subtracted twice. */
  syncedAt?: number;
}

export type AttendanceAction = "present" | "absent";

export interface AttendanceEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  action: AttendanceAction;
  /** Epoch milliseconds: the date log keeps the day and the time. */
  at: number;
}

export interface AttendanceState {
  subjects: AttendanceSubject[];
  log: AttendanceEntry[];
  target: number;
}

export const DEFAULT_ATTENDANCE: AttendanceState = {
  subjects: [],
  log: [],
  target: 75,
};

/** The date log is capped so the store never grows without bound. */
export const LOG_LIMIT = 80;

/* ----------------------------------------------------------------- routine */

export interface RoutineState {
  /** The registration number the published routine was looked up with. */
  regNo: string;
  /** The published timetable exactly as parsed, kept for a re-read. */
  routine: ParsedRoutine | null;
  fetchedAt: number;
  /** Hand-edited copy of the week; wins over `routine` while it exists. */
  custom: ParsedRoutine | null;
  /** The lab batch the student chose, so a refresh keeps it; null = infer. */
  group: RoutineGroup | null;
}

export const DEFAULT_ROUTINE: RoutineState = {
  regNo: "",
  routine: null,
  fetchedAt: 0,
  custom: null,
  group: null,
};

/* -------------------------------------------------------------------- wifi */

export interface WifiState {
  regNo: string;
  portal: string;
}

export const DEFAULT_WIFI: WifiState = { regNo: "", portal: "" };

/* ------------------------------------------------------------------ writes */

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced write: typing in a field should not hit storage per keystroke. */
export function saveSoon(key: string, value: unknown, delay = 350): void {
  const existing = pending.get(key);
  if (existing !== undefined) clearTimeout(existing);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void writeStore(key, value);
    }, delay),
  );
}

/** Writes immediately (a deliberate action such as "save semester"). */
export function saveNow(key: string, value: unknown): void {
  const existing = pending.get(key);
  if (existing !== undefined) {
    clearTimeout(existing);
    pending.delete(key);
  }
  void writeStore(key, value);
}

/**
 * Reads a persisted value. `null` means "nothing stored (or unreadable)" so the
 * caller can apply its own defaults; a corrupt payload never throws.
 */
export async function loadJson<T>(key: string, fallback: T | null = null): Promise<T | null> {
  const stored = await readStore<T | null>(key, null);
  if (stored === null || stored === undefined) return fallback;
  return stored;
}

/**
 * Versioned read: the current key first, then (once, on upgrade) the
 * unversioned one, copied forward so the next launch reads the fast path.
 */
export async function loadVersioned<T>(key: string): Promise<T | null> {
  const current = await loadJson<T>(key);
  if (current !== null) return current;

  const legacy = LEGACY_KEYS[key];
  if (!legacy) return null;
  const previous = await loadJson<T>(legacy);
  if (previous === null) return null;
  void writeStore(key, previous);
  return previous;
}
