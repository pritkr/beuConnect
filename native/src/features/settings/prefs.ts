/**
 * The two preferences that describe the app itself: appearance and reminders.
 *
 * Storage keys (both are read through `src/lib/net.ts`, so the real keys carry
 * the "beu." prefix):
 *
 *   "appearance"      → "light" | "dark" | "system"          (beu.appearance)
 *   "reminders.v1"    → { classes, times, holidays }         (beu.reminders.v1)
 *
 * Appearance is device-wide by design: `setColorScheme` repaints every screen,
 * the native header, dialogs and the system bars. It is applied on launch from
 * this module, which the registry imports at boot through the settings routes,
 * so App.tsx needs no change. The async Storage read means the first frame can
 * use the system theme for a moment on a cold start; after that every frame
 * follows the saved choice.
 *
 * Reminders are honestly local: the runtime exposes no notification API, so
 * these values drive what the app shows while it is open (Home's glance card
 * and the Reminders screen), never a system alarm. See `RemindersScreen`.
 */

import { signal, setColorScheme, type Accessor } from "nsh";

import { readStore, writeStore } from "../../lib/net";

export type Scheme = "light" | "dark" | "system";

export const APPEARANCE_STORAGE_KEY = "beu.appearance";
export const REMINDERS_STORAGE_KEY = "beu.reminders.v1";

const APPEARANCE_KEY = "appearance";
const REMINDERS_KEY = "reminders.v1";

export const SCHEMES: readonly Scheme[] = ["light", "dark", "system"];

export function isScheme(value: unknown): value is Scheme {
  return value === "light" || value === "dark" || value === "system";
}

export function schemeLabel(value: Scheme): string {
  return value === "light" ? "Light" : value === "dark" ? "Dark" : "System";
}

/** "Light — warm paper, always", for the settings list. */
export function schemeHint(value: Scheme): string {
  return value === "light"
    ? "Warm paper, always"
    : value === "dark"
      ? "Ink, for late nights"
      : "Follows the phone";
}

/* ------------------------------------------------------------------ reminders */

export interface Reminders {
  /** Show the day's class while the app is open. */
  classes: boolean;
  /** Local 24-hour times ("08:30"), at most REMINDER_LIMIT, sorted. */
  times: string[];
  /** Show holiday countdowns in the app. */
  holidays: boolean;
}

export const REMINDER_LIMIT = 3;

export const DEFAULT_REMINDERS: Reminders = { classes: true, times: ["08:30"], holidays: true };

/** "8:30 am", for chips and the next-reminder line. */
export function timeLabel(value: string): string {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Accepts "8:05", "08:05", "8.05" and returns "08:05"; null otherwise. */
export function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function isValidTime(value: string): boolean {
  return normalizeTime(value) !== null;
}

/** Minutes since midnight for a stored time (0 for a malformed one). */
export function minutesOf(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

/** The next stored time at or after `now`, or null when today's are done. */
export function nextReminder(times: readonly string[], now: Date): { time: string; minutes: number } | null {
  const current = now.getHours() * 60 + now.getMinutes();
  for (const time of [...times].sort()) {
    const minutes = minutesOf(time) - current;
    if (minutes >= 0) return { time, minutes };
  }
  return null;
}

/** "in 1 h 20 m" / "in 12 min" / "now". */
export function waitLabel(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} m`;
}

export function normalizeReminders(input: unknown): Reminders {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawTimes = Array.isArray(record.times)
    ? record.times.filter((value): value is string => typeof value === "string")
    : DEFAULT_REMINDERS.times;
  const times: string[] = [];
  for (const raw of rawTimes) {
    const time = normalizeTime(raw);
    if (time && !times.includes(time)) times.push(time);
  }
  times.sort();
  return {
    classes: record.classes !== false,
    times: times.slice(0, REMINDER_LIMIT),
    holidays: record.holidays !== false,
  };
}

/* -------------------------------------------------------------------- store */

const appearance = signal<Scheme>("system");
const reminders = signal<Reminders>(DEFAULT_REMINDERS);
const ready = signal(false);
let started = false;

function hydrate(): void {
  if (started) return;
  started = true;
  void Promise.all([readStore<unknown>(APPEARANCE_KEY, "system"), readStore<unknown>(REMINDERS_KEY, null)]).then(
    ([storedScheme, storedReminders]) => {
      const scheme = isScheme(storedScheme) ? storedScheme : "system";
      appearance.set(scheme);
      setColorScheme(scheme);
      reminders.set(normalizeReminders(storedReminders));
      ready.set(true);
    },
  );
}

// Imported at boot by the settings routes; this is what makes the saved theme
// survive a restart without a change in App.tsx.
hydrate();

export function useAppearance(): Accessor<Scheme> {
  return appearance;
}

export function useReminders(): Accessor<Reminders> {
  return reminders;
}

/** False until the first Storage read finishes. */
export function usePreferencesReady(): Accessor<boolean> {
  return ready;
}

/** Applies the scheme at once and remembers it for the next launch. */
export async function setAppearance(next: Scheme): Promise<boolean> {
  appearance.set(next);
  setColorScheme(next);
  return writeStore(APPEARANCE_KEY, next);
}

/** Merges a patch, normalizes it and persists it. */
export async function updateReminders(patch: Partial<Reminders>): Promise<boolean> {
  const next = normalizeReminders({ ...reminders(), ...patch });
  reminders.set(next);
  return writeStore(REMINDERS_KEY, next);
}
