/**
 * Dated reminders — the "don't miss this" half of Reminders.
 *
 * A student adds an exam date, the day attendance has to be back above 75%, or
 * a holiday they care about; the Reminders screen lists what is due today and
 * what is close. The runtime exposes no notification API, so these never ring:
 * they are rows the app shows while it is open, which the screen says plainly.
 *
 * Storage: "beu.reminders.dates.v1" → DatedReminder[], written only here.
 * The old `beu.reminders.v1` (class times, holiday toggle) stays in `prefs.ts`.
 */

import { signal, type Accessor } from "nsh";

import { formatDate, readStore, writeStore } from "../../lib/net";

export type ReminderKind = "exam" | "attendance" | "holiday" | "other";

export interface DatedReminder {
  id: string;
  /** What it is, in the student's words. */
  title: string;
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  kind: ReminderKind;
  done: boolean;
}

export interface DatedBuckets {
  /** Open, dated today or earlier — the "due today" list. */
  due: DatedReminder[];
  /** Open and later, soonest first. */
  later: DatedReminder[];
  /** Ticked off, most recent first. */
  done: DatedReminder[];
}

export const DATES_STORAGE_KEY = "beu.reminders.dates.v1";
export const DATES_LIMIT = 24;
export const TITLE_LIMIT = 80;

const DATES_KEY = "reminders.dates.v1";

export const KINDS: readonly ReminderKind[] = ["exam", "attendance", "holiday", "other"];

export const KIND_LABEL: Record<ReminderKind, string> = {
  exam: "Exam",
  attendance: "Attendance",
  holiday: "Holiday",
  other: "Other",
};

export function kindOf(value: unknown): ReminderKind {
  return value === "exam" || value === "attendance" || value === "holiday" ? value : "other";
}

/* -------------------------------------------------------------------- dates */

/** The local calendar day of `date` as "YYYY-MM-DD" (never UTC). */
export function isoDay(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A real calendar day, or null for "2026-02-31" and everything else. */
export function parseIsoDay(value: string): Date | null {
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isoDay(date) === text ? date : null;
}

export function isValidIsoDay(value: string): boolean {
  return parseIsoDay(value) !== null;
}

/** Whole days from `today` to `date`: negative is in the past. */
export function daysUntil(date: string, today: string = isoDay()): number {
  const target = parseIsoDay(date);
  const from = parseIsoDay(today);
  if (!target || !from) return 0;
  return Math.round((target.getTime() - from.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "3 days late", "In 5 days", then a real date. */
export function dueLabel(date: string, today: string = isoDay()): string {
  const delta = daysUntil(date, today);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta < 0) return `${-delta} days late`;
  if (delta < 7) return `In ${delta} days`;
  return formatDate(`${date}T12:00:00`);
}

/** Accepts digits as they arrive ("20261114") and keeps a readable "2026-11-14". */
export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** `isoDay()` moved by `days`, used by the quick-pick date chips. */
export function shiftDay(days: number, from: string = isoDay()): string {
  const date = parseIsoDay(from);
  if (!date) return from;
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

/* -------------------------------------------------------------------- shape */

export function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, TITLE_LIMIT);
}

export function normalizeDated(input: unknown): DatedReminder[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const list: DatedReminder[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const date = typeof record.date === "string" ? record.date.trim() : "";
    const title = typeof record.title === "string" ? normalizeTitle(record.title) : "";
    if (!isValidIsoDay(date) || title === "") continue;
    const id = typeof record.id === "string" && record.id !== "" ? record.id : `${date}:${title}`;
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({ id, title, date, kind: kindOf(record.kind), done: record.done === true });
    if (list.length >= DATES_LIMIT) break;
  }
  return list;
}

export function bucketsOf(list: readonly DatedReminder[], today: string = isoDay()): DatedBuckets {
  const open = list.filter((item) => !item.done).sort((a, b) => a.date.localeCompare(b.date));
  return {
    due: open.filter((item) => item.date <= today),
    later: open.filter((item) => item.date > today),
    done: list.filter((item) => item.done).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Open reminders dated today or earlier — what the hub row counts. */
export function dueCount(list: readonly DatedReminder[], today: string = isoDay()): number {
  return bucketsOf(list, today).due.length;
}

/* -------------------------------------------------------------------- store */

const dated = signal<DatedReminder[]>([]);
let started = false;

async function read(): Promise<DatedReminder[]> {
  return normalizeDated(await readStore<unknown>(DATES_KEY, null));
}

function hydrate(): void {
  if (started) return;
  started = true;
  void read().then((value) => dated.set(value));
}

/** The live list; hydrates on first read. */
export function useDatedReminders(): Accessor<DatedReminder[]> {
  hydrate();
  return dated;
}

/** Reads Storage again — used after a reset clears every key. */
export async function reloadDatedReminders(): Promise<void> {
  started = true;
  dated.set(await read());
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 46_656).toString(36)}`;
}

async function commit(next: DatedReminder[]): Promise<boolean> {
  const value = normalizeDated(next);
  const saved = await writeStore(DATES_KEY, value);
  if (saved) dated.set(value);
  return saved;
}

/** Adds one reminder. False when the date or title is not usable, or at the cap. */
export async function addDatedReminder(input: { title: string; date: string; kind: ReminderKind }): Promise<boolean> {
  const title = normalizeTitle(input.title);
  if (title === "" || !isValidIsoDay(input.date)) return false;
  const current = dated();
  if (current.length >= DATES_LIMIT) return false;
  return commit([
    ...current,
    { id: newId(), title, date: input.date.trim(), kind: input.kind, done: false },
  ]);
}

export async function setDatedDone(id: string, done: boolean): Promise<boolean> {
  return commit(dated().map((item) => (item.id === id ? { ...item, done } : item)));
}

export async function removeDatedReminder(id: string): Promise<boolean> {
  return commit(dated().filter((item) => item.id !== id));
}
