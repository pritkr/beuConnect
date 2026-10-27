/**
 * Small persisted state for the PYQ area: recently opened papers, the student's
 * saved course, and the branch/semester filter. All storage helpers are async;
 * the signals let the screens paint the cached values immediately. The filter
 * follows the saved course until the student picks chips of their own, so the
 * shelf opens on the semester the student is in.
 */

import { signal } from "nsh";
import { BRANCH_META } from "../syllabus/data/packs";
import { classSemester, useProfile } from "../settings/profile";
import { readStore, writeStore } from "../../lib/net";

export interface RecentPaper {
  /** Stable identity for de-duplication. */
  key: string;
  kind: "beu" | "gate";
  /** Epoch ms when it was opened. */
  at: number;
  /** Subject name (or GATE paper name). */
  name: string;
  /** "2023 · V4" / "2023 · Set 1". */
  label: string;
  code: string;
  year: number;
  variant: string;
  /** Exam title; disambiguates two papers that share a year and set. */
  title: string;
  /** The paper's anchor id inside the subject page (file stem). */
  id: string;
  slug: string;
  branch: string;
  sem: number;
  file: string;
}

const RECENTS_KEY = "pyqs.recents.v1";
const RECENTS_LIMIT = 12;

export const recents = signal<RecentPaper[]>([]);

let hydrated = false;

export function hydrateRecents(): void {
  if (hydrated) return;
  hydrated = true;
  readStore<RecentPaper[]>(RECENTS_KEY, []).then((saved) => {
    if (!Array.isArray(saved)) return;
    recents.set(
      saved
        .filter((item) => item && typeof item.key === "string")
        .map((item) => ({
          ...item,
          id: typeof item.id === "string" ? item.id : "",
          title: typeof item.title === "string" ? item.title : "",
        }))
        .slice(0, RECENTS_LIMIT),
    );
  });
}

void hydrateRecents();

export function rememberPaper(paper: Omit<RecentPaper, "at">): void {
  const entry: RecentPaper = { ...paper, at: Date.now() };
  const next = [entry, ...recents().filter((item) => item.key !== entry.key)].slice(0, RECENTS_LIMIT);
  recents.set(next);
  void writeStore(RECENTS_KEY, next);
}

export function clearRecents(): void {
  recents.set([]);
  void writeStore(RECENTS_KEY, []);
}

/* --------------------------------------------------------------- the course */

export interface Course {
  branch: string;
  sem: number;
}

/** The student's course, once known: `syllabus.course`, else `profile`. */
export const course = signal<Course | null>(null);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `{ branch, sem }` from any store that carries a course, or null. */
export function courseFrom(value: unknown): Course | null {
  const row = asRecord(value);
  if (!row) return null;
  const raw = typeof row.branch === "string" ? row.branch.trim().toLowerCase() : "";
  // A registration number implies the current semester; prefer it over a
  // stored (and possibly stale) semester so a 24-batch student lands on Sem 4.
  const derived = classSemester(row);
  const sem = derived > 0 ? derived : Math.round(Number(row.sem ?? row.semester));
  const branch = BRANCH_META.some((meta) => meta.code === raw) ? raw : "";
  if (!branch || !(sem >= 1 && sem <= 8)) return null;
  return { branch, sem };
}

const COURSE_KEYS = ["syllabus.course", "profile"] as const;

let courseRead: Promise<void> | null = null;

function readCourse(): Promise<void> {
  if (courseRead) return courseRead;
  courseRead = Promise.all([
    readStore<unknown>(COURSE_KEYS[0], null),
    readStore<unknown>(COURSE_KEYS[1], null),
  ])
    .then(([courseRow, profileRow]) => {
      course.set(courseFrom(courseRow) ?? courseFrom(profileRow));
    })
    .catch(() => {})
    .finally(() => {
      courseRead = null;
    });
  return courseRead;
}

/* --------------------------------------------------------------- preferences */

export interface PyqPrefs {
  branch: string | null;
  sem: number | null;
  /**
   * The student picked these two chips themselves. Until then the shelf
   * follows the saved course, so it opens where the student is.
   */
  custom: boolean;
}

const PREFS_KEY = "pyqs.prefs.v1";

export const prefs = signal<PyqPrefs>({ branch: null, sem: null, custom: false });

let prefsLoaded = false;

export function hydratePrefs(): void {
  if (prefsLoaded) return;
  prefsLoaded = true;
  readStore<PyqPrefs | null>(PREFS_KEY, null).then((saved) => {
    if (!saved || typeof saved !== "object") return;
    prefs.set({
      branch: typeof saved.branch === "string" ? saved.branch : null,
      sem: typeof saved.sem === "number" && saved.sem >= 1 && saved.sem <= 8 ? saved.sem : null,
      // A stored pair without the flag comes from an older build, where the
      // only writer was a chip tap: the student chose it, keep it chosen.
      custom: saved.custom === true || saved.branch != null || saved.sem != null,
    });
  });
}

/**
 * What the shelf filters by: the chips the student tapped, or — before any
 * tap — the course the app already knows.
 *
 * The live profile wins over the stored `syllabus.course`, because it is the
 * value the student last confirmed (and it carries the registration number,
 * which `courseFrom` turns into the semester actually in session). The stored
 * course is the fallback for a student who has not onboarded yet.
 */
export function effectiveCourse(): { branch: string | null; sem: number | null } {
  const saved = prefs();
  if (saved.custom) return { branch: saved.branch, sem: saved.sem };
  const known = courseFrom(useProfile()()) ?? course();
  return known ? { branch: known.branch, sem: known.sem } : { branch: null, sem: null };
}

void hydratePrefs();
void readCourse();

/**
 * Persists the two chips. Anything a screen hands here came from a tap, so
 * the stored pair stops following the saved course (see `effectiveCourse`).
 */
export function setPrefs(next: { branch: string | null; sem: number | null }): void {
  const value: PyqPrefs = { ...next, custom: true };
  prefs.set(value);
  void writeStore(PREFS_KEY, value);
}
