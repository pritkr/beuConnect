/**
 * Home's picture of what the student already saved.
 *
 * Home never invents a number: everything here is read back from the stores the
 * other areas write (`profile`, `syllabus.course`, `syllabus.studied`,
 * `planner`, `tools.routine`, `tools.attendance`, `results.recent` and the
 * cached result copy). A store that is absent simply produces `null`, and the
 * screen falls back to a promise instead of a fake statistic.
 */

import { signal } from "nsh";
import { getCache, readStore } from "../../lib/net";
import { BRANCH_META } from "../syllabus/data/packs";
import { digits, readRecent, type RecentLookup } from "../results/data";
import { cachedIdentity, resolveIdentity, type Identity } from "../results/identity";
import { attendanceStatus } from "../tools/engine";

export interface HomeProfile {
  name: string;
  reg: string;
  /** Branch code as `BRANCH_META` spells it (`cse`). */
  branch: string;
  sem: number;
}

export interface HomeClass {
  subject: string;
  start: string;
  end: string;
  room: string;
}

export interface SavedResult {
  reg: string;
  sem: number;
  name: string;
  sgpa: number | null;
  /** When that copy was fetched, 0 when only the registration is known. */
  at: number;
}

export interface AttendanceSummary {
  percent: number;
  attended: number;
  total: number;
  target: number;
  bunkable: number;
  required: number;
  subjects: number;
}

/* ------------------------------------------------------------------ store */

export const profile = signal<HomeProfile | null>(null);
export const recents = signal<RecentLookup[]>([]);
export const classesToday = signal<HomeClass[]>([]);
export const attendance = signal<AttendanceSummary | null>(null);
export const studiedDone = signal(0);
export const savedResult = signal<SavedResult | null>(null);
export const routineAt = signal(0);
/**
 * The exam date saved by the study planner (`beu.planner.exam`), `YYYY-MM-DD`.
 * Empty when no date is set — Home then shows no countdown instead of a zero.
 */
export const planExam = signal("");
/**
 * Who the saved registration number belongs to, resolved from Results.
 *
 * The name is not something Home asks the student to type twice: the results
 * layer already knows how to turn `24105157010` into a student (saved result,
 * then BEU's published roster), so Home shows that name and writes nothing.
 */
export const identity = signal<Identity | null>(null);
/** True once the first local read finished: the greeting card waits for it. */
export const ready = signal(false);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------------------------------------------------------------- readers */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textIn(row: Record<string, unknown> | null, keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberIn(row: Record<string, unknown> | null, keys: string[]): number | null {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

/** The branch as `BRANCH_META` names it, from a code, short name or full name. */
export function branchMeta(value: string): { code: string; name: string; short: string } | null {
  const key = value.trim().toLowerCase();
  return BRANCH_META.find((item) => item.code === key || item.short.toLowerCase() === key || item.name.toLowerCase() === key) ?? null;
}

export function shortBranch(branch: string): string {
  return branchMeta(branch)?.short ?? branch.toUpperCase();
}

export function branchTitle(branch: string): string {
  return branchMeta(branch)?.name ?? branch.toUpperCase();
}

/** A saved course from either settings (`profile`) or the syllabus landing. */
function courseFrom(value: unknown): { branch: string; sem: number } | null {
  const row = asRecord(value);
  if (!row) return null;
  const branch = textIn(row, ["branch", "branchCode", "branch_code", "course", "courseCode", "department"]);
  const sem = numberIn(row, ["sem", "semester", "currentSemester", "current_semester"]);
  if (!branch || sem === null) return null;
  const meta = branchMeta(branch);
  const rounded = Math.round(sem);
  return meta && rounded >= 1 && rounded <= 8 ? { branch: meta.code, sem: rounded } : null;
}

function profileFrom(profileRow: unknown, courseRow: unknown): HomeProfile | null {
  const own = asRecord(profileRow);
  const base = courseFrom(profileRow) ?? courseFrom(courseRow);
  if (!base) return null;
  return {
    name: textIn(own, ["name", "studentName", "student_name"]),
    reg: textIn(own, ["reg", "regNo", "registration", "registrationNumber"]),
    branch: base.branch,
    sem: base.sem,
  };
}

/** `10:00` → 600; anything that is not a clock time → -1. */
export function minutesOf(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Today's saved timetable, in clock order, from `tools.routine`. */
function classesFrom(value: unknown, now: Date): HomeClass[] {
  const row = asRecord(value);
  const routine = asRecord(row?.routine);
  const days = Array.isArray(routine?.days) ? routine.days : [];
  const today = WEEKDAYS[now.getDay()].toLowerCase().slice(0, 3);
  for (const entry of days) {
    const day = asRecord(entry);
    const label = textIn(day, ["day"]).toLowerCase();
    if (!label || !label.startsWith(today)) continue;
    const list = Array.isArray(day?.classes) ? day.classes : [];
    const classes: HomeClass[] = [];
    for (const item of list) {
      const slot = asRecord(item);
      const subject = textIn(slot, ["subject"]);
      const start = textIn(slot, ["start"]);
      const end = textIn(slot, ["end"]);
      if (!subject || minutesOf(start) < 0 || minutesOf(end) < 0) continue;
      classes.push({ subject, start, end, room: textIn(slot, ["room"]) });
    }
    return classes.sort((left, right) => minutesOf(left.start) - minutesOf(right.start));
  }
  return [];
}

function attendanceFrom(value: unknown): AttendanceSummary | null {
  const row = asRecord(value);
  const subjects = Array.isArray(row?.subjects) ? row.subjects : [];
  let attended = 0;
  let total = 0;
  let count = 0;
  for (const item of subjects) {
    const subject = asRecord(item);
    if (!subject) continue;
    const seen = numberIn(subject, ["attended"]);
    const held = numberIn(subject, ["total"]);
    if (seen === null || held === null || held <= 0) continue;
    attended += Math.max(0, Math.min(seen, held));
    total += held;
    count += 1;
  }
  if (total <= 0) return null;
  const target = numberIn(row, ["target"]) ?? 75;
  const status = attendanceStatus(attended, total, target);
  return { percent: status.percent, attended, total, target, bunkable: status.bunkable, required: status.required, subjects: count };
}

/** Topics ticked off in the syllabus area for this course. */
function studiedFor(marks: Record<string, boolean>, branch: string, sem: number): number {
  const prefix = `${branch}|${sem}|`;
  let count = 0;
  for (const key of Object.keys(marks)) {
    if (key.startsWith(prefix) && marks[key]) count += 1;
  }
  return count;
}

/**
 * The last result the app already holds. `results` caches a copy at
 * `result:<digits>:<semester>`; when only the registration is known the card
 * still points at it (with no invented SGPA).
 */
async function savedResultFor(recent: RecentLookup | null, who: HomeProfile | null): Promise<SavedResult | null> {
  const reg = recent?.reg ?? who?.reg ?? "";
  const sem = recent?.sem ?? who?.sem ?? 0;
  if (!reg || sem < 1 || sem > 8) return null;
  const name = recent?.name ?? "";
  const raw = await getCache(`result:${digits(reg)}:${sem}`, 0);
  if (!raw) return { reg, sem, name, sgpa: null, at: recent?.at ?? 0 };
  try {
    const envelope = asRecord(JSON.parse(raw));
    const data = asRecord(envelope?.data);
    const sgpa = numberIn(data, ["sgpa"]);
    const at = numberIn(data, ["savedAt"]) ?? numberIn(envelope, ["at"]) ?? recent?.at ?? 0;
    return { reg, sem, name: textIn(data, ["name"]) || name, sgpa, at };
  } catch {
    return { reg, sem, name, sgpa: null, at: recent?.at ?? 0 };
  }
}

/* ------------------------------------------------------------------- read */

let loading: Promise<void> | null = null;

/** Reads every store home depends on. Safe to call again (pull to refresh). */
export function refreshHome(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const now = new Date();
    const [profileRow, courseRow, recentsRow, routineRow, attendanceRow, marks, planRow] = await Promise.all([
      readStore<unknown>("profile", null),
      readStore<unknown>("syllabus.course", null),
      readRecent().catch(() => [] as RecentLookup[]),
      readStore<unknown>("tools.routine", null),
      readStore<unknown>("tools.attendance", null),
      readStore<Record<string, boolean>>("syllabus.studied", {}),
      readStore<unknown>("planner", null),
    ]);

    const who = profileFrom(profileRow, courseRow);
    const recent = Array.isArray(recentsRow) ? recentsRow : [];
    profile.set(who);
    recents.set(recent);
    classesToday.set(classesFrom(routineRow, now));
    routineAt.set(numberIn(asRecord(routineRow), ["fetchedAt"]) ?? 0);
    planExam.set(textIn(asRecord(planRow), ["exam"]));
    attendance.set(attendanceFrom(attendanceRow));
    studiedDone.set(who ? studiedFor(marks && typeof marks === "object" ? marks : {}, who.branch, who.sem) : 0);
    savedResult.set(await savedResultFor(recent[0] ?? null, who));
    ready.set(true);

    // Identity is enrichment, never a gate: a cached name paints immediately and
    // a roster lookup finishes in the background.
    const reg = who?.reg || recent[0]?.reg || "";
    if (reg) {
      void cachedIdentity(reg).then((known) => {
        if (known) identity.set(known);
      });
      void resolveIdentity(reg)
        .then((found) => {
          if (found) identity.set(found);
        })
        .catch(() => {
          /* offline: the cached name, or no name, is still a working home */
        });
    } else {
      identity.set(null);
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}
