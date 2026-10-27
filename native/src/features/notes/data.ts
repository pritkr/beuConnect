/**
 * Notes & VVI — the data layer.
 *
 * One manifest on the same host the rest of the app already trusts:
 *
 *   https://beu.prit.eu.org/data/notes.json
 *
 * It is written by `scripts/notes/build-notes.py` from the VVI source plus the
 * PDFs on disk (see `docs/NOTES.md`), so the app never guesses: a subject that
 * is not in the manifest is a subject with no notes, not an invented one.
 *
 * Caching is two-tier on purpose. A copy younger than 30 minutes renders with
 * no request. An older copy renders at once and refreshes behind the screen,
 * so Notes opens instantly offline instead of waiting for a timeout. When the
 * refresh fails the older copy stays and is labelled as an offline copy.
 */

import { fetchText, formatDate, getCache, putCache, readStore, writeStore } from "../../lib/net";
import { BRANCH_META } from "../syllabus/data/packs";
import { loadProfile } from "../settings/profile";

export const NOTES_URL = "https://beu.prit.eu.org/data/notes.json";

/** `putCache`/`getCache` prepend `beu.cache.`, so the device key is `beu.cache.notes.manifest`. */
export const NOTES_CACHE_KEY = "notes.manifest";

/** `readStore`/`writeStore` prepend `beu.`, so the device key is `beu.notes.course`. */
export const COURSE_KEY = "notes.course";

const FRESH = 30 * 60 * 1000;

export type NoteKind = "handwritten" | "short" | "vvi" | "formula";

export type Confidence = "high" | "medium" | "low";

export interface NoteFile {
  id: string;
  title: string;
  kind: NoteKind;
  pages: number | null;
  bytes: number;
  url: string;
  updatedAt: string;
}

export interface VviTopic {
  topic: string;
  note: string;
  marks: number | null;
  confidence: Confidence;
}

export interface NoteSubject {
  id: string;
  branch: string;
  sem: number;
  code: string;
  name: string;
  vvi: VviTopic[];
  files: NoteFile[];
}

export interface NotesManifest {
  updatedAt: string;
  subjects: NoteSubject[];
}

export interface Course {
  branch: string;
  sem: number;
}

export const KIND_LABEL: Record<NoteKind, string> = {
  handwritten: "Handwritten",
  short: "Short notes",
  vvi: "VVI",
  formula: "Formula sheet",
};

const EMPTY: NotesManifest = { updatedAt: "", subjects: [] };

const BRANCH_ORDER = new Map(BRANCH_META.map((branch, index) => [branch.code, index]));

/* ------------------------------------------------------------------ parsing */

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function whole(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function kindOf(value: unknown): NoteKind {
  const raw = text(value).toLowerCase();
  if (raw === "handwritten" || raw === "short" || raw === "vvi" || raw === "formula") return raw;
  return "short";
}

function confidenceOf(value: unknown): Confidence {
  const raw = text(value).toLowerCase();
  if (raw === "high" || raw === "low") return raw;
  return "medium";
}

function normaliseTopic(raw: unknown): VviTopic | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const topic = text(row.topic);
  if (topic === "") return null;
  return {
    topic,
    note: text(row.note),
    marks: whole(row.marks),
    confidence: confidenceOf(row.confidence),
  };
}

function normaliseFile(raw: unknown, fallbackId: string): NoteFile | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const url = text(row.url);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: text(row.id, fallbackId),
    title: text(row.title, "Notes"),
    kind: kindOf(row.kind),
    pages: whole(row.pages),
    bytes: whole(row.bytes) ?? 0,
    url,
    updatedAt: text(row.updatedAt),
  };
}

function normaliseSubject(raw: unknown): NoteSubject | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const branch = text(row.branch).toLowerCase();
  const code = text(row.code);
  const name = text(row.name, code);
  const sem = whole(row.sem);
  if (branch === "" || name === "" || sem === null || sem < 1 || sem > 8) return null;

  const id = text(row.id, `${branch}-${sem}-${code || name}`);
  const vvi = Array.isArray(row.vvi)
    ? row.vvi.map(normaliseTopic).filter((entry): entry is VviTopic => entry !== null)
    : [];
  const files = Array.isArray(row.files)
    ? row.files
        .map((entry, index) => normaliseFile(entry, `${id}-file-${index}`))
        .filter((entry): entry is NoteFile => entry !== null)
    : [];

  return { id, branch, sem, code, name, vvi, files };
}

/** The manifest as the app will use it: tolerant of missing fields, never throwing. */
export function parseManifest(raw: string): NotesManifest {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
    const row = parsed as Record<string, unknown>;
    const subjects = Array.isArray(row.subjects)
      ? row.subjects.map(normaliseSubject).filter((entry): entry is NoteSubject => entry !== null)
      : [];
    return { updatedAt: text(row.updatedAt), subjects };
  } catch {
    return EMPTY;
  }
}

/* -------------------------------------------------------------------- load */

export interface NotesResult {
  manifest: NotesManifest;
  /** Served from an older copy because the network failed. */
  stale: boolean;
  /** An older copy is on screen while a fresher one is being fetched. */
  refreshing: boolean;
  /**
   * Present when an older copy was served: resolves to the fresh manifest, or
   * `null` when the quiet refresh failed. The screen uses it to label an
   * offline copy without holding the first paint.
   */
  revalidate?: Promise<NotesManifest | null>;
}

/**
 * The manifest, fresh when possible and cached otherwise.
 *
 * Throws only when there is nothing to show at all — a valid-but-empty manifest
 * is a success, because "no notes for this semester yet" is a real answer.
 */
export async function loadNotes(options: { refresh?: boolean } = {}): Promise<NotesResult> {
  if (!options.refresh) {
    const fresh = await getCache(NOTES_CACHE_KEY, FRESH);
    if (fresh) return { manifest: parseManifest(fresh), stale: false, refreshing: false };

    const cached = await getCache(NOTES_CACHE_KEY, 0);
    if (cached) {
      // Render the copy on the device now; replace it behind the screen.
      const revalidate = refreshNotes().then(
        (manifest) => manifest,
        () => null,
      );
      return { manifest: parseManifest(cached), stale: false, refreshing: true, revalidate };
    }
  }

  try {
    return { manifest: await refreshNotes(), stale: false, refreshing: false };
  } catch (error) {
    const cached = await getCache(NOTES_CACHE_KEY, 0);
    if (cached) return { manifest: parseManifest(cached), stale: true, refreshing: false };
    throw error;
  }
}

/**
 * Fetches and normalises the manifest, then keeps that copy for offline use.
 *
 * A response that is not a notes manifest (a 404 page served as HTML, a
 * provider's error JSON) is a failure, not "no notes": caching it would show an
 * empty shelf for half an hour and hide the real fault.
 *
 * Deliberately no `cacheKey` here: `fetchText` answers from the device when a
 * request fails, which would hide the failure from `loadNotes` and stop it
 * labelling the screen as an offline copy.
 */
async function refreshNotes(): Promise<NotesManifest> {
  const raw = await fetchText(NOTES_URL, { timeout: 12000, cache: "no-cache" });
  if (!isManifestText(raw)) throw new Error("The notes manifest could not be read.");
  const manifest = parseManifest(raw);
  await putCache(NOTES_CACHE_KEY, JSON.stringify(manifest));
  return manifest;
}

/** A JSON object with a `subjects` array — the only shape the app can use. */
function isManifestText(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) &&
      Array.isArray((parsed as Record<string, unknown>).subjects);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ course */

function branchCode(value: unknown): string {
  const key = text(value).toLowerCase();
  if (key === "") return "";
  const match = BRANCH_META.find(
    (branch) => branch.code === key || branch.short.toLowerCase() === key || branch.name.toLowerCase() === key,
  );
  return match?.code ?? "";
}

function courseFrom(value: unknown): Course | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const branch = branchCode(row.branch || row.branchCode || row.course);
  const sem = whole(row.sem ?? row.semester);
  if (branch === "" || sem === null || sem > 8) return null;
  return { branch, sem };
}

/**
 * The course last read on this screen, then the one saved in Profile.
 * `null` when neither store has a usable branch + semester.
 */
export async function readSavedCourse(): Promise<Course | null> {
  const [savedRow, profile] = await Promise.all([readStore<unknown>(COURSE_KEY, null), loadProfile()]);
  return courseFrom(savedRow) ?? courseFrom(profile);
}

/** Remembers the branch + semester this student is reading. Never throws. */
export async function saveCourse(course: Course): Promise<void> {
  await writeStore(COURSE_KEY, course);
}

export function branchMeta(branch: string): { code: string; short: string; name: string } {
  return (
    BRANCH_META.find((item) => item.code === branch) ?? {
      code: branch,
      short: branch.toUpperCase(),
      name: branch.toUpperCase(),
    }
  );
}

/** True for the six BEU branch codes; anything else is a typo, not a branch. */
export function isBranch(branch: string): boolean {
  return BRANCH_META.some((item) => item.code === branch);
}

export function branchLabel(branch: string): string {
  return branchMeta(branch).short;
}

/** "CSE · Semester 5" — the heading on the shelf. */
export function courseTitle(course: Course): string {
  return `${branchLabel(course.branch)} · Semester ${course.sem}`;
}

/* --------------------------------------------------------------- selectors */

/** Every subject with notes for one branch and semester, VVI-heavy first. */
export function subjectsFor(manifest: NotesManifest, branch: string, sem: number): NoteSubject[] {
  return manifest.subjects
    .filter((subject) => subject.branch === branch && subject.sem === sem)
    .sort((a, b) => b.vvi.length - a.vvi.length || a.name.localeCompare(b.name));
}

export function findSubject(manifest: NotesManifest, branch: string, sem: number, code: string): NoteSubject | null {
  return (
    manifest.subjects.find(
      (subject) =>
        subject.branch === branch && subject.sem === sem && (subject.code === code || subject.id === code),
    ) ?? null
  );
}

export function vviCount(subjects: readonly NoteSubject[]): number {
  return subjects.reduce((total, subject) => total + subject.vvi.length, 0);
}

export function fileCount(subjects: readonly NoteSubject[]): number {
  return subjects.reduce((total, subject) => total + subject.files.length, 0);
}

/** The first course the manifest actually covers, in branch then semester order. */
export function firstCourse(manifest: NotesManifest): Course | null {
  const sorted = [...manifest.subjects].sort((a, b) => {
    const branch = (BRANCH_ORDER.get(a.branch) ?? 99) - (BRANCH_ORDER.get(b.branch) ?? 99);
    return branch || a.sem - b.sem;
  });
  const first = sorted[0];
  return first ? { branch: first.branch, sem: first.sem } : null;
}

/** Search subject name, code and VVI topic text. Exact code wins, then prefix. */
export function searchSubjects(subjects: readonly NoteSubject[], query: string): NoteSubject[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...subjects];
  const scored: { subject: NoteSubject; score: number }[] = [];
  for (const subject of subjects) {
    const code = subject.code.toLowerCase();
    const name = subject.name.toLowerCase();
    let score = 0;
    if (code === needle) score = 1000;
    else if (name === needle) score = 800;
    else if (code.startsWith(needle)) score = 500;
    else if (name.startsWith(needle)) score = 400;
    else if (name.split(/\s+/).some((word) => word.startsWith(needle))) score = 300;
    else if (name.includes(needle)) score = 120;
    else if (subject.vvi.some((topic) => `${topic.topic} ${topic.note}`.toLowerCase().includes(needle))) score = 60;
    if (score > 0) scored.push({ subject, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.subject.name.localeCompare(b.subject.name)).map((row) => row.subject);
}

/* ------------------------------------------------------------------ labels */

/** "1.2 MB", "840 KB" — for a file row. */
export function sizeLabel(bytes: number): string {
  if (bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "updated 2 days ago", "updated just now", then a date once it is old.
 *
 * Long form on purpose: this is a sentence under the heading, not a timestamp
 * column, so `relativeTime`'s "2d ago" would read as data.
 */
export function updatedLabel(iso: string): string {
  if (iso === "") return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "updated just now";
  if (minutes < 60) return `updated ${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `updated ${plural(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `updated ${plural(days, "day")} ago`;
  return `updated ${formatDate(iso)}`;
}

/** "8 marks", or "" when the manifest did not record a weight. */
export function marksLabel(marks: number | null): string {
  return marks === null ? "" : `${marks} mark${marks === 1 ? "" : "s"}`;
}

/** "1 subject", "4 subjects" — counts read as sentences, not as data. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The shelf's one-line tally: "5 subjects · 3 notes · 26 VVI topics". */
export function shelfSummary(subjects: readonly NoteSubject[]): string {
  return [
    plural(subjects.length, "subject"),
    plural(fileCount(subjects), "note"),
    plural(vviCount(subjects), "VVI topic"),
  ].join(" · ");
}

/** "6 VVI topics · 2 notes" — the subject screen's one line. */
export function subjectSummary(subject: NoteSubject): string {
  return [plural(subject.vvi.length, "VVI topic"), plural(subject.files.length, "note")].join(" · ");
}

/** The block a "Copy" action puts on the clipboard. */
export function topicText(subject: NoteSubject, topic: VviTopic): string {
  const head = `${topic.topic} — ${subject.name} (${subject.code}, sem ${subject.sem})`;
  const marks = topic.marks === null ? "" : `Likely ${topic.marks} marks. `;
  return [head, `${marks}${topic.note}`.trim()].filter((line) => line !== "").join("\n\n");
}

/** "High confidence", "Medium confidence", "Low confidence". */
export function confidenceLabel(confidence: Confidence): string {
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
}
