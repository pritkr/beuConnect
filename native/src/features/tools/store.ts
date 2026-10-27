/**
 * The tools area's live state: six signals, one hydrate, and the normalisers
 * that make anything read from storage safe to render.
 *
 * Every screen imports from here; nothing else writes storage. Signals are
 * module-level on purpose — the native stack keeps every page mounted, so the
 * calculator's total survives a trip to the routine and back without a
 * refetch.
 */

import { cleanup, effect, signal } from "nsh";
import type { Grade, PercentageFormula, SubjectTotal } from "./engine";
import { clamp, isGrade, maxIa } from "./engine";
import { sanitiseRoutine } from "./routine-parse";
import type { ParsedRoutine } from "./routine-parse";
import type {
  AttendanceAction,
  AttendanceEntry,
  AttendanceState,
  AttendanceSubject,
  CalcMode,
  CalcSemester,
  CalcSubject,
  CalculatorState,
  RoutineState,
  WifiState,
} from "./state";
import {
  DEFAULT_ATTENDANCE,
  DEFAULT_ROUTINE,
  DEFAULT_WIFI,
  KEYS,
  LOG_LIMIT,
  blankSubject,
  loadVersioned,
  newId,
  saveNow,
  saveSoon,
} from "./state";

/* ---------------------------------------------------------------- extras */

export interface PredictRow {
  id: string;
  name: string;
  total: SubjectTotal;
  ia: number;
  target: Grade;
}

export interface PlannerDraft {
  current: string;
  previous: string;
  target: string;
  semester: string;
}

export interface PercentDraft {
  value: string;
  formula: PercentageFormula;
}

export interface CalcExtras {
  predict: { rows: PredictRow[]; planner: PlannerDraft };
  percent: PercentDraft;
}

export function freshCalculator(): CalculatorState {
  return { mode: "sgpa", subjects: [0, 1, 2, 3].map(blankSubject), semesters: [] };
}

export function freshPredictRow(index: number): PredictRow {
  return { id: newId("pred"), name: `Paper ${index + 1}`, total: 100, ia: 0, target: "B" };
}

export function freshExtras(): CalcExtras {
  return {
    predict: {
      rows: [freshPredictRow(0), freshPredictRow(1)],
      planner: { current: "", previous: "", target: "", semester: "" },
    },
    percent: { value: "", formula: "beu" },
  };
}

/* --------------------------------------------------------------- signals */

export const calc = signal<CalculatorState>(freshCalculator());
export const attendance = signal<AttendanceState>(DEFAULT_ATTENDANCE);
export const routine = signal<RoutineState>(DEFAULT_ROUTINE);
export const wifi = signal<WifiState>(DEFAULT_WIFI);
export const extras = signal<CalcExtras>(freshExtras());

/** False until storage has been read, so nothing overwrites it with defaults. */
export const ready = signal(false);

/** Ticks every 30s: keeps "now" honest for the routine and the countdown. */
export const nowMs = signal(Date.now());

/* ---------------------------------------------------------- normalisation */

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normaliseCalculator(value: unknown): CalculatorState {
  const fallback = freshCalculator();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const modes: CalcMode[] = ["sgpa", "cgpa", "predict", "percent"];
  const mode = modes.includes(raw.mode as CalcMode) ? (raw.mode as CalcMode) : "sgpa";

  let subjects = fallback.subjects;
  if (Array.isArray(raw.subjects)) {
    subjects = [];
    for (const entry of raw.subjects) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      subjects.push({
        id: asText(item.id, "") || newId("sub"),
        name: asText(item.name, "Subject").slice(0, 60),
        credits: clamp(asFinite(item.credits, 3), 0, 10),
        grade: typeof item.grade === "string" && isGrade(item.grade) ? item.grade : null,
      });
    }
  }

  const semesters: CalcSemester[] = [];
  if (Array.isArray(raw.semesters)) {
    for (const entry of raw.semesters) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      semesters.push({
        id: asText(item.id, "") || newId("sem"),
        name: asText(item.name, `Semester ${semesters.length + 1}`).slice(0, 40),
        sgpa: asText(item.sgpa, ""),
        credits: asText(item.credits, ""),
      });
    }
  }

  return { mode, subjects, semesters };
}

export function normaliseAttendance(value: unknown): AttendanceState {
  if (!value || typeof value !== "object") return DEFAULT_ATTENDANCE;
  const raw = value as Record<string, unknown>;
  const target = clamp(asFinite(raw.target, 75), 1, 100);

  const subjects: AttendanceSubject[] = [];
  if (Array.isArray(raw.subjects)) {
    for (const entry of raw.subjects) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const total = Math.max(0, Math.round(asFinite(item.total, 0)));
      const attended = clamp(Math.round(asFinite(item.attended, 0)), 0, total);
      const code = asText(item.code, "").trim().slice(0, 24);
      const source = item.source === "gecs" ? "gecs" : item.source === "manual" ? "manual" : undefined;
      const syncedAt = Math.round(asFinite(item.syncedAt, 0));
      subjects.push({
        id: asText(item.id, "") || newId("sub"),
        name: asText(item.name, "Subject").slice(0, 60),
        attended,
        total,
        code: code || undefined,
        source,
        syncedAt: syncedAt > 0 ? syncedAt : undefined,
      });
    }
  }

  const log: AttendanceEntry[] = [];
  if (Array.isArray(raw.log)) {
    for (const entry of raw.log) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const action = item.action === "absent" ? "absent" : item.action === "present" ? "present" : null;
      if (!action) continue;
      log.push({
        id: asText(item.id, "") || newId("att"),
        subjectId: asText(item.subjectId, ""),
        subjectName: asText(item.subjectName, "Subject").slice(0, 60),
        action,
        at: asFinite(item.at, Date.now()),
      });
      if (log.length >= LOG_LIMIT) break;
    }
  }

  return { subjects, log, target };
}

export function normaliseRoutine(value: unknown): RoutineState {
  if (!value || typeof value !== "object") return DEFAULT_ROUTINE;
  const raw = value as Record<string, unknown>;
  return {
    regNo: asText(raw.regNo, "").slice(0, 24),
    routine: sanitiseRoutine(raw.routine),
    fetchedAt: asFinite(raw.fetchedAt, 0),
    custom: sanitiseRoutine(raw.custom),
    group: raw.group === "A" || raw.group === "B" ? raw.group : null,
  };
}

export function normaliseWifi(value: unknown): WifiState {
  if (!value || typeof value !== "object") return DEFAULT_WIFI;
  const raw = value as Record<string, unknown>;
  return { regNo: asText(raw.regNo, "").slice(0, 24), portal: asText(raw.portal, "").slice(0, 120) };
}

export function normaliseExtras(value: unknown): CalcExtras {
  const fallback = freshExtras();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;

  const rows: PredictRow[] = [];
  const predictRaw = raw.predict as Record<string, unknown> | undefined;
  if (predictRaw && Array.isArray(predictRaw.rows)) {
    for (const entry of predictRaw.rows) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const total: SubjectTotal = item.total === 50 ? 50 : 100;
      rows.push({
        id: asText(item.id, "") || newId("pred"),
        name: asText(item.name, `Paper ${rows.length + 1}`).slice(0, 60),
        total,
        ia: clamp(Math.round(asFinite(item.ia, 0)), 0, maxIa(total)),
        target: typeof item.target === "string" && isGrade(item.target) ? item.target : "B",
      });
    }
  }

  const plannerRaw = (predictRaw?.planner ?? {}) as Record<string, unknown>;
  const percentRaw = (raw.percent ?? {}) as Record<string, unknown>;

  return {
    predict: {
      rows: Array.isArray(predictRaw?.rows) ? rows : fallback.predict.rows,
      planner: {
        current: asText(plannerRaw.current, ""),
        previous: asText(plannerRaw.previous, ""),
        target: asText(plannerRaw.target, ""),
        semester: asText(plannerRaw.semester, ""),
      },
    },
    percent: {
      value: asText(percentRaw.value, ""),
      formula: percentRaw.formula === "aicte" ? "aicte" : "beu",
    },
  };
}

/* --------------------------------------------------------------- hydrate */

/**
 * Two passes because the routine screen needs its own state before it renders:
 * read everything in parallel, then publish once. `loadVersioned` copies a v1
 * payload forward on the first launch after this build.
 */
async function hydrate(): Promise<void> {
  const [storedCalc, storedAttendance, storedRoutine, storedWifi, storedExtras] = await Promise.all([
    loadVersioned<unknown>(KEYS.calculator),
    loadVersioned<unknown>(KEYS.attendance),
    loadVersioned<unknown>(KEYS.routine),
    loadVersioned<unknown>(KEYS.wifi),
    loadVersioned<unknown>(KEYS.calculatorExtras),
  ]);

  calc.set(normaliseCalculator(storedCalc));
  attendance.set(normaliseAttendance(storedAttendance));
  routine.set(normaliseRoutine(storedRoutine));
  wifi.set(normaliseWifi(storedWifi));
  extras.set(normaliseExtras(storedExtras));
  ready.set(true);
}

void hydrate();

/* A normalised value is written straight back: this is the step that repairs a
 * corrupt payload, and the reason a returning user never sees a crash. */
effect(() => {
  if (ready()) saveSoon(KEYS.calculator, calc());
});
effect(() => {
  if (ready()) saveSoon(KEYS.attendance, attendance());
});
effect(() => {
  if (ready()) saveSoon(KEYS.routine, routine());
});
effect(() => {
  if (ready()) saveSoon(KEYS.wifi, wifi());
});
effect(() => {
  if (ready()) saveSoon(KEYS.calculatorExtras, extras());
});

effect(() => {
  const timer = setInterval(() => nowMs.set(Date.now()), 30_000);
  cleanup(() => clearInterval(timer));
});

/* ---------------------------------------------------------------- writes */

export function persistAttendance(): void {
  saveNow(KEYS.attendance, attendance());
}

export function persistRoutine(): void {
  saveNow(KEYS.routine, routine());
}

/** For typing: debounced, so a keystroke does not hit storage. */
export function persistRoutineSoon(): void {
  saveSoon(KEYS.routine, routine());
}

export function persistCalculator(): void {
  saveNow(KEYS.calculator, calc());
}

export function persistWifi(): void {
  saveNow(KEYS.wifi, wifi());
}

export function persistExtras(): void {
  saveNow(KEYS.calculatorExtras, extras());
}

/**
 * Applies a present/absent tap to one subject and appends to the date log.
 * `at` lets the screen log a class for a past day; it defaults to now.
 */
export function recordAttendance(subject: AttendanceSubject, action: AttendanceAction, at: number = Date.now()): void {
  const entry: AttendanceEntry = {
    id: newId("att"),
    subjectId: subject.id,
    subjectName: subject.name,
    action,
    at,
  };
  const state = attendance();
  const next: AttendanceState = {
    ...state,
    subjects: state.subjects.map((item) =>
      item.id === subject.id
        ? {
            ...item,
            attended: item.attended + (action === "present" ? 1 : 0),
            total: item.total + 1,
          }
        : item,
    ),
    log: [entry, ...state.log].slice(0, LOG_LIMIT),
  };
  attendance.set(next);
  saveNow(KEYS.attendance, next);
}

/**
 * Removes one log entry and takes its class back off the subject's counts —
 * the undo a mistap (or a wrong day) needs.
 */
export function undoEntry(entryId: string): void {
  const state = attendance();
  const entry = state.log.find((item) => item.id === entryId);
  if (!entry) return;
  const next: AttendanceState = {
    ...state,
    subjects: state.subjects.map((item) => {
      if (item.id !== entry.subjectId) return item;
      // A class dated on or before the register sync is already inside the
      // synced counts. Taking its marker back must not subtract it twice.
      if (item.syncedAt !== undefined && entry.at <= item.syncedAt) return item;
      return {
        ...item,
        attended: entry.action === "present" ? Math.max(0, item.attended - 1) : item.attended,
        total: Math.max(0, item.total - 1),
      };
    }),
    log: state.log.filter((item) => item.id !== entryId),
  };
  attendance.set(next);
  saveNow(KEYS.attendance, next);
}

/** Takes back the newest matching entry, so a mistap never skews the maths. */
export function undoAttendance(subjectId: string, action: AttendanceAction): void {
  const newest = attendance().log.find((entry) => entry.subjectId === subjectId && entry.action === action);
  if (newest) undoEntry(newest.id);
}

/** The week the screens show: a hand-edited copy wins over the published one. */
export function effectiveRoutine(state: RoutineState): ParsedRoutine | null {
  return state.custom ?? state.routine;
}
