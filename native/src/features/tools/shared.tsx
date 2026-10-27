/**
 * Small view helpers shared by two or more tools screens. Everything here is a
 * pure function of state passed in — no signals are read — so the same helper
 * can be used in the hub, the routine and the holidays page without coupling.
 */

import { AlertDialog } from "nsh/base";
import type { AttendanceAdvice, AttendanceStatus } from "./engine";
import { addDays, attendanceAdvice, attendanceStatus, daysUntil, parseIso } from "./engine";
import type { Holiday } from "./holidays-data";
import { holidayDays } from "./holidays-data";
import type { AttendanceState, AttendanceSubject } from "./state";
import { WEEK_ORDER, clockMinutes, dayName, weekIndex } from "./routine-parse";
import type { ParsedRoutine, RoutineClass, RoutinePaper } from "./routine-parse";

/** What "next class" means for a given minute: in session, later, or done. */
export interface NextClassInfo {
  moment: "now" | "next" | "done" | "none";
  subject: string;
  start: string;
  end: string;
  room: string;
  minutesAway: number;
  /** The period after the one shown, when today has another one. */
  following: { subject: string; start: string; room: string; minutesAway: number } | null;
}

/** "2 Oct", or "2 Oct – 4 Oct" for a range. Dates are ISO days at noon. */
export function holidaySpan(start: string, end?: string): string {
  const pretty = (iso: string): string => {
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };
  return end ? `${pretty(start)} – ${pretty(end)}` : pretty(start);
}

export function minutesNow(now: number): number {
  const date = new Date(now);
  return date.getHours() * 60 + date.getMinutes();
}

export function classMeta(item: RoutineClass): string {
  const parts = [`P${item.slot}`];
  if (item.type) parts.push(item.type);
  if (item.room) parts.push(`Room ${item.room}`);
  if (item.teacher) parts.push(item.teacher);
  return parts.join(" · ");
}

/**
 * The two-or-three-letter code a week-grid cell can hold at 320pt: initials for
 * a multi-word paper ("Data Structures" → "DS"), the first four letters for a
 * one-word one ("DBMS" → "DBMS"). A trailing "Lab"/"Practical" is dropped
 * first, so "DBMS Lab" and "DBMS" are the same two letters instead of "DL".
 * The full name is one tap away in the day list.
 */
export function shortCode(subject: string): string {
  const words = subject
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/^(of|and|the|&|\+|-)$/i.test(word))
    .filter((word, index, all) => index < all.length - 1 || !/^(lab|practical|tutorial|theory)$/i.test(word));
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((word) => word[0]).join("").toUpperCase().slice(0, 3);
}

/**
 * The attendance paper a routine class belongs to.
 *
 * The sheet prints an abbreviation ("COA"), while the attendance ledger may
 * hold either that abbreviation or the paper's full name, so both sides of the
 * saved paper list are tried. `null` when nothing matches — the routine then
 * offers no mark, rather than adding a paper the student never tracked.
 */
export function matchAttendance(
  item: RoutineClass,
  papers: readonly RoutinePaper[],
  subjects: readonly AttendanceSubject[],
): AttendanceSubject | null {
  const wanted = new Set<string>();
  const add = (value: string): void => {
    const key = value.trim().toLowerCase();
    if (key) wanted.add(key);
  };

  add(item.subject);
  const printed = item.subject.trim().toLowerCase();
  const paper = papers.find(
    (entry) => entry.abbr.trim().toLowerCase() === printed || entry.name.trim().toLowerCase() === printed,
  );
  if (paper) {
    add(paper.abbr);
    add(paper.name);
  }
  if (wanted.size === 0) return null;

  for (const subject of subjects) {
    if (wanted.has(subject.name.trim().toLowerCase())) return subject;
  }
  // "Computer Organization" vs a ledger entry typed as "Computer Organization
  // & Architecture": a prefix on either side is the same paper to a student.
  for (const subject of subjects) {
    const name = subject.name.trim().toLowerCase();
    if (name.length < 3) continue;
    for (const key of wanted) {
      if (key.length < 3) continue;
      if (name.startsWith(key) || key.startsWith(name)) return subject;
    }
  }
  return null;
}

/** Where the day stands right now, from the routine and the clock. */
export function nextClassInfo(data: ParsedRoutine | null, now: Date): NextClassInfo {
  const empty: NextClassInfo = {
    moment: "none",
    subject: "",
    start: "",
    end: "",
    room: "",
    minutesAway: 0,
    following: null,
  };
  if (!data) return empty;

  const classes = data.days.find((day) => day.day === dayName(now))?.classes ?? [];
  if (classes.length === 0) return { ...empty, moment: "done" };

  const ordered = [...classes].sort((left, right) => clockMinutes(left.start) - clockMinutes(right.start));
  const minutes = now.getHours() * 60 + now.getMinutes();
  const following = (from: RoutineClass): NextClassInfo["following"] => {
    const next = ordered[ordered.indexOf(from) + 1];
    if (!next) return null;
    return {
      subject: next.subject,
      start: next.start,
      room: next.room ?? "",
      minutesAway: Math.max(0, clockMinutes(next.start) - minutes),
    };
  };

  const current = ordered.find((item) => clockMinutes(item.start) <= minutes && minutes < clockMinutes(item.end));
  if (current) {
    return {
      moment: "now",
      subject: current.subject,
      start: current.start,
      end: current.end,
      room: current.room ?? "",
      minutesAway: 0,
      following: following(current),
    };
  }

  const later = ordered.find((item) => clockMinutes(item.start) > minutes);
  if (later) {
    return {
      moment: "next",
      subject: later.subject,
      start: later.start,
      end: later.end,
      room: later.room ?? "",
      minutesAway: clockMinutes(later.start) - minutes,
      following: following(later),
    };
  }

  return { ...empty, moment: "done" };
}

/**
 * The first period still ahead, looking past today into the next seven days —
 * what a free day shows instead of a dead end.
 *
 *   Saturday, no classes left → Monday's 10:00 period, 2 days ahead
 */
export function nextClassAhead(
  data: ParsedRoutine | null,
  now: Date = new Date(),
): { day: string; item: RoutineClass; daysAhead: number } | null {
  if (!data) return null;
  const today = dayName(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  // Monday-first offset of today, so "tomorrow" is the next entry in the week.
  const start = weekIndex(today);

  for (let offset = 0; offset < 8; offset += 1) {
    const day = WEEK_ORDER[(start + offset) % WEEK_ORDER.length];
    const classes = data.days.find((entry) => entry.day === day)?.classes ?? [];
    const ordered = [...classes].sort((left, right) => clockMinutes(left.start) - clockMinutes(right.start));
    const item = ordered.find((entry) => offset > 0 || clockMinutes(entry.start) > minutes);
    if (item) return { day, item, daysAhead: offset };
  }
  return null;
}

export function todayTimetable(data: ParsedRoutine | null): RoutineClass[] {
  if (!data) return [];
  return data.days.find((day) => day.day === dayName())?.classes ?? [];
}

export function overallAttendance(state: AttendanceState): {
  attended: number;
  total: number;
  status: AttendanceStatus;
} {
  let attended = 0;
  let total = 0;
  for (const subject of state.subjects) {
    attended += subject.attended;
    total += subject.total;
  }
  return { attended, total, status: attendanceStatus(attended, total, state.target) };
}

/** The advice line for an attendance total, from the one place that writes it. */
export function attendanceFor(attended: number, total: number, target: number): AttendanceAdvice {
  return attendanceAdvice(attended, total, target);
}

/** "Can miss 3 more" / "Attend 4 in a row" — the sentence students open this for. */
export function bunkLine(attended: number, total: number, target: number): string {
  return attendanceAdvice(attended, total, target).headline;
}

/** "14 Oct" from an entry's epoch milliseconds, for the log's date grouping. */
export function entryDay(at: number): string {
  const date = new Date(at);
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Today" / "Yesterday" / "20 Oct 2026", for a log date heading. */
export function logDayLabel(iso: string): string {
  const today = new Date();
  return iso === todayIso(today.getTime())
    ? "Today"
    : iso === addDays(todayIso(today.getTime()), -1)
      ? "Yesterday"
      : prettyDate(iso);
}

/** The log entries for one ISO day, newest first. */
export function entriesOn(state: AttendanceState, iso: string): AttendanceState["log"] {
  return state.log.filter((entry) => entryDay(entry.at) === iso).sort((left, right) => right.at - left.at);
}

/** "14 min" or "6h 44m" — never a four-digit minute count. */
export function waitLabel(minutes: number): string {
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/* ------------------------------------------------------------------ dates */

export function todayIso(now: number = Date.now()): string {
  const date = new Date(now);
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function prettyDate(iso: string): string {
  const date = parseIso(iso);
  return date ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : iso;
}

export function shortParts(iso: string): { day: string; month: string } {
  const date = parseIso(iso);
  if (!date) return { day: iso, month: "" };
  return { day: String(date.getDate()), month: date.toLocaleDateString(undefined, { month: "short" }) };
}

export function spanOf(holiday: Holiday): string {
  const start = prettyDate(holiday.start);
  return holiday.end ? `${start} – ${prettyDate(holiday.end)}` : start;
}

export function holidayDaysLabel(holiday: Holiday): string {
  const days = holidayDays(holiday);
  return days === 1 ? "1 day" : `${days} days`;
}

export function ongoingHoliday(holiday: Holiday, today: string): boolean {
  return holiday.start <= today && (holiday.end ?? holiday.start) >= today;
}

export function holidayCountdown(holiday: Holiday, today: string): { value: string; label: string } {
  if (holiday.start > today) {
    const days = Math.max(0, daysUntil(holiday.start));
    return { value: String(days), label: days === 1 ? "day to go" : "days to go" };
  }
  const left = Math.max(0, daysUntil(holiday.end ?? holiday.start)) + 1;
  return { value: String(left), label: left === 1 ? "day left" : "days left" };
}

/* ----------------------------------------------------------------- errors */

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

/** A destructive action behind a native dialog; a host without one honours the press. */
export async function askDestructive(title: string, description: string, confirmLabel = "Remove"): Promise<boolean> {
  try {
    const choice = await AlertDialog.show({
      title,
      description,
      actions: [
        { label: "Cancel", role: "cancel" },
        { label: confirmLabel, role: "destructive" },
      ],
    });
    return choice === confirmLabel;
  } catch {
    return true;
  }
}
