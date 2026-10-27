/**
 * Syllabus — shared state, lookups and the rows every syllabus screen draws.
 *
 * Two rules decide the shape of this file:
 *
 *  - **A component body runs once.** Only expressions inside the JSX re-read
 *    their props and signals, so nothing that can arrive late (the hydrated
 *    course, a topic ticked on another screen, a recycled list row) is read
 *    into a `const` above the JSX. Rows that a virtualised `List` recycles take
 *    their data as accessors (`item: () => SubjectEntry`) and read them inside
 *    the tree; anything derived from them is a `computed`, which is an accessor
 *    too.
 *  - **Parsing is cached.** `packs.ts` decodes JSON lazily and `parseSyllabus`
 *    is pure but not free; branch, subject, unit and search indexes are built
 *    once and kept for the session.
 *
 * Storage keys documented in `docs/ARCHITECTURE.md`: `syllabus.course`,
 * `syllabus.studied`, `syllabus.saved`, plus `syllabus.last` for the
 * "continue" card.
 */

import { Scroll, Text, View, computed, effect, signal, untracked, type JSX } from "nsh";

import { readStore, writeStore } from "../../lib/net";
import { loadProfile, useProfile } from "../settings/profile";
import { Badge, Btn, Card, Check, Divider, Label, Muted, Panel, Row, SectionHeader } from "../../ui";
import { Icon } from "../../ui/icons";
import { AskAi } from "../../ui/ask-ai";
import { topicPrompt } from "../../lib/ask-ai";
import { TopicActions } from "./topic-actions";
import { DEFAULT_BRANCH, resolveCourse, type Course } from "./course";
import { BRANCH_META, GATE_META, branchPack as liveBranch, gatePack as liveGate } from "./active";
import { dataVersion } from "../data-feed/pyqs";
import { ownCourse, type OwnCourse } from "./you";
import {
  matchSnippet,
  parseGate,
  parseSyllabus,
  type BranchPack,
  type GatePack,
  type Subject,
  type Topic,
  type Unit,
} from "./parse";

export type { Course };

/* ------------------------------------------------------------------- state */

/** The subject the student looked at last, for the continue card. */
export interface LastSubject {
  branch: string;
  sem: number;
  code: string;
  name: string;
  at: number;
}

export const course = signal<Course>({ branch: DEFAULT_BRANCH, sem: 1 });

/** Persists an explicit choice. The default is never written, so Home can tell
 *  "this student picked a course" from "this module loaded". */
export function chooseCourse(next: Course): void {
  const value = { ...next, at: Date.now() };
  course.set(value);
  void writeStore(COURSE_KEY, value);
}
export const studied = signal<Record<string, boolean>>({});
export const saved = signal<Record<string, boolean>>({});
/** Which topic bodies are expanded. Session-only: it is a reading position. */
export const open = signal<Record<string, boolean>>({});
/** Which unit accordions are expanded. Session-only, like `open`. */
export const unitOpen = signal<Record<string, boolean>>({});
export const lastSubject = signal<LastSubject | null>(null);

const hydrated = signal(false);

const COURSE_KEY = "syllabus.course";
const STUDIED_KEY = "syllabus.studied";
const SAVED_KEY = "syllabus.saved";
const LAST_KEY = "syllabus.last";

function markMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, mark] of Object.entries(value as Record<string, unknown>)) {
    if (mark === true && key.includes("|")) out[key] = true;
  }
  return out;
}

/** A branch/semester from the route (`/cse/3`), which beats the stored one. */
let pinned = false;

export function pinCourse(branch: string, sem: number): boolean {
  if (!pack(branch)) return false;
  pinned = true;
  chooseCourse({ branch, sem: sem > 0 ? sem : (course().sem || 1) });
  return true;
}

async function hydrate(): Promise<void> {
  const [storedCourse, storedStudied, storedSaved, storedLast] = await Promise.all([
    readStore<Course | null>(COURSE_KEY, null),
    readStore<unknown>(STUDIED_KEY, {}),
    readStore<unknown>(SAVED_KEY, {}),
    readStore<LastSubject | null>(LAST_KEY, null),
  ]);

  // The profile is the student's own course: it decides the branch, and its
  // semester moves forward when the registration number says the class has
  // moved on (see ./course), so a pick made in first year does not pin the
  // landing to Sem 1 forever. The resolved default is deliberately never
  // written: the next visit derives it again, and the first tap persists like
  // any choice.
  if (!pinned) {
    const profileRow = await loadProfile();
    // A deep link may have pinned a course while the profile was loading.
    if (!pinned) course.set(resolveCourse(storedCourse, profileRow));
  }
  studied.set(markMap(storedStudied));
  saved.set(markMap(storedSaved));
  if (storedLast && typeof storedLast.code === "string" && typeof storedLast.branch === "string") {
    lastSubject.set({
      branch: storedLast.branch,
      sem: Number(storedLast.sem) || 1,
      code: storedLast.code,
      name: String(storedLast.name ?? storedLast.code),
      at: Number(storedLast.at) || 0,
    });
  }
  hydrated.set(true);
}

void hydrate();

/**
 * The student's own course, live. `null` until a profile names a branch — and
 * that is what keeps a profile-less install on the old behaviour exactly.
 */
export function own(): OwnCourse | null {
  return ownCourse(useProfile());
}

// A branch changed in Settings retargets the landing on this visit: the profile
// is who the student is, not a hint, so a corrected profile must not leave the
// syllabus on the branch it opened with. The current course is read untracked
// on purpose — tapping another branch is a visit, not a profile change, and it
// must not snap back. `pinned` (a deep link) still wins over both.
effect(() => {
  if (!hydrated() || pinned) return;
  const mine = ownCourse(useProfile());
  if (!mine) return;
  untracked(() => {
    if (course().branch === mine.branch) return;
    const published = semestersOf(mine.branch).map((info) => info.sem);
    course.set({ branch: mine.branch, sem: published.includes(mine.sem) ? mine.sem : (published[0] ?? 1) });
  });
});

effect(() => {
  if (hydrated()) void writeStore(STUDIED_KEY, studied());
});
effect(() => {
  if (hydrated()) void writeStore(SAVED_KEY, saved());
});
effect(() => {
  if (hydrated()) void writeStore(LAST_KEY, lastSubject());
});

/** Runs `run` once, after the first paint, without tracking what it reads. */
export function once(run: () => void): void {
  effect(() => {
    untracked(run);
  });
}

/* -------------------------------------------------------------------- keys */

/** `branch|sem|code|topicId` — the studied-mark key, stable across reinstall. */
export function topicKey(branch: string, sem: number, code: string, topicId: string): string {
  return `${branch}|${sem}|${code}|${topicId}`;
}

/** `branch|sem|code` — the saved-subject key. */
export function subjectKey(branch: string, sem: number, code: string): string {
  return `${branch}|${sem}|${code}`;
}

export function toggleTopic(branch: string, sem: number, code: string, topicId: string): void {
  const key = topicKey(branch, sem, code, topicId);
  studied.update((marks) => {
    const next = { ...marks };
    if (next[key]) delete next[key];
    else next[key] = true;
    return next;
  });
}

export function toggleSaved(key: string): void {
  saved.update((marks) => {
    const next = { ...marks };
    if (next[key]) delete next[key];
    else next[key] = true;
    return next;
  });
}

export function toggleOpen(key: string): void {
  open.update((map) => ({ ...map, [key]: !map[key] }));
}

/** `branch|sem|code|unitId` — one unit accordion. */
export function unitKey(branch: string, sem: number, code: string, unitId: string): string {
  return `${branch}|${sem}|${code}|${unitId}`;
}

export function setUnitOpen(key: string, value: boolean): void {
  unitOpen.update((map) => {
    if (map[key] === value) return map;
    return { ...map, [key]: value };
  });
}

/** Opens or closes a whole paper's units ("Expand all" / "Collapse all"). */
export function setUnitsOpen(keys: readonly string[], value: boolean): void {
  unitOpen.update((map) => {
    const next = { ...map };
    for (const key of keys) next[key] = value;
    return next;
  });
}

/** How many of a unit's topics are ticked. Reads `studied`, so call it in JSX. */
export function unitDone(unit: Unit, branch: string, sem: number, code: string): number {
  const marks = studied();
  let done = 0;
  for (const topic of unit.topics) if (marks[topicKey(branch, sem, code, topic.id)]) done += 1;
  return done;
}

export function rememberSubject(branch: string, sem: number, code: string, name: string): void {
  lastSubject.set({ branch, sem, code, name, at: Date.now() });
}

/* -------------------------------------------------------------------- data */

const packCache = new Map<string, BranchPack | null>();
const subjectMaps = new Map<string, Map<string, Subject>>();
const unitCache = new Map<string, Unit[]>();
const semCache = new Map<string, SemInfo[]>();
const entryCache = new Map<string, SubjectEntry[]>();

export function pack(branch: string): BranchPack | null {
  const key = `${branch}@${dataVersion()}`;
  if (packCache.has(key)) return packCache.get(key) ?? null;
  const raw = liveBranch(branch);
  let parsed: BranchPack | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as BranchPack;
    } catch {
      parsed = null;
    }
  }
  packCache.set(key, parsed);
  return parsed;
}

export function shortBranch(branch: string): string {
  return BRANCH_META.find((item) => item.code === branch)?.short ?? branch.toUpperCase();
}

export function branchName(branch: string): string {
  return pack(branch)?.name ?? BRANCH_META.find((item) => item.code === branch)?.name ?? shortBranch(branch);
}

export function subjectsOf(branch: string, sem: number): Subject[] {
  return pack(branch)?.semesters[String(sem)] ?? [];
}

function subjectMap(branch: string, sem: number): Map<string, Subject> {
  const key = `${branch}|${sem}@${dataVersion()}`;
  const cached = subjectMaps.get(key);
  if (cached) return cached;
  const map = new Map<string, Subject>();
  for (const subject of subjectsOf(branch, sem)) map.set(subject.code, subject);
  subjectMaps.set(key, map);
  return map;
}

export function subjectOf(branch: string, sem: number, code: string): Subject | null {
  if (!code) return null;
  return subjectMap(branch, sem).get(code) ?? null;
}

export function unitsOf(branch: string, sem: number, code: string): Unit[] {
  const key = `${branch}|${sem}|${code}@${dataVersion()}`;
  const cached = unitCache.get(key);
  if (cached) return cached;
  const subject = subjectOf(branch, sem, code);
  const units = subject ? parseSyllabus(subject.content) : [];
  unitCache.set(key, units);
  return units;
}

export interface SemInfo {
  sem: number;
  papers: number;
  credits: number;
}

/** The semesters a branch actually publishes, with their paper and credit load. */
export function semestersOf(branch: string): SemInfo[] {
  const key = `${branch}@${dataVersion()}`;
  const cached = semCache.get(key);
  if (cached) return cached;
  const parsed = pack(branch);
  const list: SemInfo[] = [];
  if (parsed) {
    for (const key of Object.keys(parsed.semesters)) {
      const sem = Number(key);
      if (!Number.isFinite(sem) || sem <= 0) continue;
      const subjects = parsed.semesters[key] ?? [];
      let credits = 0;
      for (const subject of subjects) credits += Number.isFinite(subject.credits) ? subject.credits : 0;
      list.push({ sem, papers: subjects.length, credits });
    }
  }
  list.sort((left, right) => left.sem - right.sem);
  semCache.set(key, list);
  return list;
}

/** One subject prepared for a list row: units parsed once, mark keys built once. */
export interface SubjectEntry {
  key: string;
  branch: string;
  sem: number;
  subject: Subject;
  units: Unit[];
  topics: number;
  keys: string[];
}

export function entriesOf(branch: string, sem: number): SubjectEntry[] {
  const key = `${branch}|${sem}@${dataVersion()}`;
  const cached = entryCache.get(key);
  if (cached) return cached;
  const prefix = `${branch}|${sem}|`;
  const entries = subjectsOf(branch, sem).map((subject) => {
    const units = unitsOf(branch, sem, subject.code);
    const keys: string[] = [];
    let topics = 0;
    for (const unit of units) {
      for (const topic of unit.topics) {
        keys.push(`${prefix}${subject.code}|${topic.id}`);
        topics += 1;
      }
    }
    return { key: `${prefix}${subject.code}`, branch, sem, subject, units, topics, keys };
  });
  entryCache.set(key, entries);
  return entries;
}

/** How many of an entry's topics are ticked. Reads `studied`, so call it in a `computed`. */
export function doneIn(entry: SubjectEntry): number {
  const marks = studied();
  let done = 0;
  for (const key of entry.keys) if (marks[key]) done += 1;
  return done;
}

export interface Progress {
  papers: number;
  credits: number;
  topics: number;
  done: number;
}

export function semesterStats(branch: string, sem: number): Progress {
  const marks = studied();
  const entries = entriesOf(branch, sem);
  let credits = 0;
  let topics = 0;
  let done = 0;
  for (const entry of entries) {
    credits += Number.isFinite(entry.subject.credits) ? entry.subject.credits : 0;
    topics += entry.topics;
    for (const key of entry.keys) if (marks[key]) done += 1;
  }
  return { papers: entries.length, credits, topics, done };
}

export function subjectProgress(branch: string, sem: number, code: string): Progress {
  const marks = studied();
  const units = unitsOf(branch, sem, code);
  const subject = subjectOf(branch, sem, code);
  let topics = 0;
  let done = 0;
  for (const unit of units) {
    for (const topic of unit.topics) {
      topics += 1;
      if (marks[topicKey(branch, sem, code, topic.id)]) done += 1;
    }
  }
  return { papers: 1, credits: subject?.credits ?? 0, topics, done };
}

/* ------------------------------------------------------------------ search */

interface IndexedTopic {
  id: string;
  title: string;
  titleLower: string;
  body: string;
  bodyLower: string;
}

interface IndexedSubject {
  sem: number;
  code: string;
  codeLower: string;
  name: string;
  nameLower: string;
  topics: IndexedTopic[];
}

export interface Hit {
  key: string;
  /** 0 code exact · 1 prefix · 2 substring · 3 topic title · 4 topic body. */
  rank: number;
  branch: string;
  sem: number;
  code: string;
  subject: string;
  /** The topic title, or the subject name for a subject-level hit. */
  title: string;
  snippet: string;
  topic: string | null;
  topics: number;
}

export interface SearchResult {
  hits: Hit[];
  total: number;
}

const indexCache = new Map<string, IndexedSubject[]>();

function indexOf(branch: string): IndexedSubject[] {
  const cached = indexCache.get(branch);
  if (cached) return cached;
  const parsed = pack(branch);
  const subjects: IndexedSubject[] = [];
  if (parsed) {
    for (const key of Object.keys(parsed.semesters)) {
      const sem = Number(key);
      if (!Number.isFinite(sem)) continue;
      for (const entry of entriesOf(branch, sem)) {
        const topics: IndexedTopic[] = [];
        for (const unit of entry.units) {
          for (const topic of unit.topics) {
            topics.push({
              id: topic.id,
              title: topic.title,
              titleLower: topic.title.toLowerCase(),
              body: topic.body,
              bodyLower: topic.body.toLowerCase(),
            });
          }
        }
        subjects.push({
          sem,
          code: entry.subject.code,
          codeLower: entry.subject.code.toLowerCase(),
          name: entry.subject.name,
          nameLower: entry.subject.name.toLowerCase(),
          topics,
        });
      }
    }
  }
  indexCache.set(branch, subjects);
  return subjects;
}

function subjectRank(subject: IndexedSubject, query: string): number {
  if (subject.codeLower === query) return 0;
  if (subject.nameLower.startsWith(query) || subject.codeLower.startsWith(query)) return 1;
  if (subject.nameLower.includes(query) || subject.codeLower.includes(query)) return 2;
  return -1;
}

/**
 * Ranked search over the branches given: a paper's own code and name first
 * (exact, prefix, then substring), then its topics (title before body). The
 * sort is stable, so within a rank the branch order and semester order stand.
 */
export function searchHits(term: string, branches: readonly string[], cap = 80): SearchResult {
  const query = term.trim().toLowerCase();
  if (query.length < 2) return { hits: [], total: 0 };

  const found: Hit[] = [];
  for (const branch of branches) {
    for (const subject of indexOf(branch)) {
      const rank = subjectRank(subject, query);
      if (rank >= 0) {
        found.push({
          key: `${branch}|${subject.sem}|${subject.code}`,
          rank,
          branch,
          sem: subject.sem,
          code: subject.code,
          subject: subject.name,
          title: subject.name,
          snippet: "",
          topic: null,
          topics: subject.topics.length,
        });
        continue;
      }
      for (const topic of subject.topics) {
        const inTitle = topic.titleLower.indexOf(query);
        const inBody = topic.bodyLower.indexOf(query);
        if (inTitle < 0 && inBody < 0) continue;
        found.push({
          key: `${branch}|${subject.sem}|${subject.code}|${topic.id}`,
          rank: inTitle >= 0 ? 3 : 4,
          branch,
          sem: subject.sem,
          code: subject.code,
          subject: subject.name,
          title: topic.title,
          snippet: inBody >= 0 ? (matchSnippet(topic.body, query) ?? topic.body.slice(0, 120)) : topic.body.slice(0, 120),
          topic: topic.id,
          topics: subject.topics.length,
        });
      }
    }
  }

  found.sort((left, right) => left.rank - right.rank);
  return { hits: found.slice(0, cap), total: found.length };
}

/** The first occurrence of `term` in `text`, for the highlight spans. */
export function matchRange(text: string, term: string): { start: number; end: number } | null {
  const query = term.trim().toLowerCase();
  if (query.length < 2 || !text) return null;
  const start = text.toLowerCase().indexOf(query);
  return start < 0 ? null : { start, end: start + query.length };
}

/** One hit inside a paper: a unit, a topic title or a topic's body. */
export interface SubjectMatch {
  key: string;
  unitIndex: number;
  unitId: string;
  /** `null` when the unit's own title matched. */
  topicId: string | null;
  unitTitle: string;
  title: string;
  snippet: string;
  /** 0 unit title · 1 topic title · 2 topic body. */
  rank: number;
}

/**
 * Finds `term` inside one paper's units and topics, in document order. A
 * student searching their own paper is looking for the place in the paper, so
 * the result carries the unit to jump to instead of a flat ranked list.
 */
export function matchesIn(units: readonly Unit[], term: string, cap = 40): SubjectMatch[] {
  const query = term.trim().toLowerCase();
  if (query.length < 2) return [];

  const found: SubjectMatch[] = [];
  units.forEach((unit, unitIndex) => {
    if (unit.title.toLowerCase().includes(query)) {
      found.push({
        key: `${unit.id}|unit`,
        unitIndex,
        unitId: unit.id,
        topicId: null,
        unitTitle: unit.title,
        title: unit.title,
        snippet: "",
        rank: 0,
      });
    }
    for (const topic of unit.topics) {
      const inTitle = topic.title.toLowerCase().indexOf(query);
      const inBody = topic.body.toLowerCase().indexOf(query);
      if (inTitle < 0 && inBody < 0) continue;
      found.push({
        key: `${unit.id}|${topic.id}`,
        unitIndex,
        unitId: unit.id,
        topicId: topic.id,
        unitTitle: unit.title,
        title: topic.title,
        snippet: inBody >= 0 ? (matchSnippet(topic.body, query) ?? "") : "",
        rank: inTitle >= 0 ? 1 : 2,
      });
    }
  });
  return found.slice(0, cap);
}

/* ------------------------------------------------------------------- saved */

/** One line of the saved list: a branch heading or something kept. */
export interface SavedLine {
  kind: "group" | "row";
  key: string;
  branch: string;
  sem: number;
  code: string;
  label: string;
  hint: string;
  topic: string | null;
}

/** One removal that can still be undone. */
export interface Removal {
  key: string;
  label: string;
}

export const lastRemoval = signal<Removal | null>(null);

/** Saved subjects and topics, grouped by branch, in branch → semester → name order. */
export function savedItems(): SavedLine[] {
  const marks = saved();
  const byBranch = new Map<string, SavedLine[]>();

  for (const key of Object.keys(marks)) {
    if (!marks[key]) continue;
    const [branch, semText, code, topicId] = key.split("|");
    const sem = Number(semText);
    if (!branch || !code || !Number.isFinite(sem)) continue;
    const subject = subjectOf(branch, sem, code);
    if (!subject) continue;

    let topic: Topic | null = null;
    if (topicId) {
      for (const unit of unitsOf(branch, sem, code)) {
        const found = unit.topics.find((item) => item.id === topicId);
        if (found) {
          topic = found;
          break;
        }
      }
      if (!topic) continue;
    }

    const line: SavedLine = {
      kind: "row",
      key,
      branch,
      sem,
      code,
      label: topic ? topic.title : subject.name,
      hint: topic ? `${subject.name} · ${subject.code}` : `${subject.code} · ${subject.credits} credits · Sem ${sem}`,
      topic: topicId || null,
    };
    const rows = byBranch.get(branch);
    if (rows) rows.push(line);
    else byBranch.set(branch, [line]);
  }

  const lines: SavedLine[] = [];
  const known = BRANCH_META.map((meta) => meta.code);
  const order = [...known, ...byBranch.keys()];
  for (const code of order) {
    const rows = byBranch.get(code);
    if (!rows || rows.length === 0) continue;
    rows.sort((left, right) => left.sem - right.sem || left.label.localeCompare(right.label));
    const seen = new Set<string>();
    let credits = 0;
    for (const row of rows) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      credits += subjectOf(row.branch, row.sem, row.code)?.credits ?? 0;
    }
    lines.push({
      kind: "group",
      key: `group:${code}`,
      branch: code,
      sem: 0,
      code: "",
      label: branchName(code),
      hint: `${rows.length} saved · ${credits} credits`,
      topic: null,
    });
    for (const row of rows) lines.push(row);
    byBranch.delete(code);
  }
  return lines;
}

export function removeSaved(line: SavedLine): void {
  saved.update((marks) => {
    const next = { ...marks };
    delete next[line.key];
    return next;
  });
  lastRemoval.set({ key: line.key, label: line.label });
}

export function undoSaved(): void {
  const removal = lastRemoval();
  if (!removal) return;
  saved.update((marks) => ({ ...marks, [removal.key]: true }));
  lastRemoval.set(null);
}

export function dismissRemoval(): void {
  lastRemoval.set(null);
}

/* -------------------------------------------------------------------- GATE */

const gateCache = new Map<string, GatePack | null>();
const gateRowsCache = new Map<string, GateLine[]>();

/** One line of the GATE list: a section heading or a topic. */
export interface GateLine {
  kind: "section" | "topic";
  key: string;
  title: string;
  body: string;
  hint: string;
  /** The `open` map key a topic toggles; "" for a section heading. */
  mark: string;
}

export function gatePack(code: string): GatePack | null {
  const key = `${code}@${dataVersion()}`;
  if (gateCache.has(key)) return gateCache.get(key) ?? null;
  const raw = liveGate(code);
  let parsed: GatePack | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as GatePack;
    } catch {
      parsed = null;
    }
  }
  gateCache.set(key, parsed);
  return parsed;
}

/** Flat rows for the virtualised GATE list: section headings and their topics. */
export function gateRows(code: string): GateLine[] {
  const key = `${code}@${dataVersion()}`;
  const cached = gateRowsCache.get(key);
  if (cached) return cached;
  const parsed = gatePack(code);
  const lines: GateLine[] = [];
  if (parsed) {
    parseGate(parsed).forEach((unit, index) => {
      lines.push({
        kind: "section",
        key: `s${index}`,
        title: unit.title,
        body: "",
        hint: `${unit.topics.length} topics${unit.hours ? ` · ${unit.hours}` : ""}`,
        mark: "",
      });
      for (const topic of unit.topics) {
        lines.push({
          kind: "topic",
          key: `gate|${code}|${unit.id}|${topic.id}`,
          title: topic.title,
          body: topic.body || "No detail in the source.",
          hint: topic.hours ?? "",
          mark: `gate|${code}|${unit.id}|${topic.id}`,
        });
      }
    });
  }
  gateRowsCache.set(key, lines);
  return lines;
}

/* ------------------------------------------------------------------ pieces */

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** A progress bar whose width is read inside the tree, so it follows a tick. */
export function Bar(props: { value: number; tone?: "ember" | "mint"; class?: string }) {
  return (
    <View
      class={`h-2 w-full overflow-hidden rounded-full bg-muted ${props.class ?? ""}`}
      role="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(props.value)) }}
    >
      <View
        class={`h-full rounded-full ${props.tone === "mint" ? "bg-accent-ink" : "bg-primary"}`}
        style={{ width: `${clamp(props.value)}%` }}
      />
    </View>
  );
}

/** A percentage that keeps up with the topic list next to it. */
export function Pct(props: { value: number; class?: string }) {
  return (
    <View class={`h-14 w-14 items-center justify-center rounded-full border-2 border-primary/25 bg-primary/8 ${props.class ?? ""}`}>
      <Text class="text-[15px] font-bold tabular-nums text-foreground">{`${Math.round(clamp(props.value))}%`}</Text>
    </View>
  );
}

/** A selectable pill. Reads `active` in the tree so a tap repaints it. */
export function Pick(props: { children?: JSX.Element | string | number; active: boolean; onPress: () => void; label?: string }) {
  return (
    <View
      class={`min-h-11 flex-row items-center rounded-full border px-4 active:opacity-80 ${
        props.active ? "border-foreground bg-foreground" : "border-border-strong bg-card"
      }`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.active }}
    >
      <Text class={`text-[13px] font-semibold ${props.active ? "text-background" : "text-foreground"}`} numberOfLines={1}>
        {props.children}
      </Text>
    </View>
  );
}

/** A semester at a glance: which papers, how many credits. */
export function SemCard(props: { sem: number; papers: number; credits: number; active: boolean; onPress: () => void }) {
  return (
    <View
      class={`w-[104px] gap-0.5 rounded-2xl border p-3 active:scale-[0.98] ${
        props.active ? "border-foreground bg-foreground" : "border-border bg-card"
      }`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`Semester ${props.sem}, ${props.papers} papers, ${props.credits} credits`}
      accessibilityState={{ selected: props.active }}
    >
      <Text class={`text-[14px] font-bold ${props.active ? "text-background" : "text-foreground"}`}>{`Sem ${props.sem}`}</Text>
      <Text class={`text-[11px] ${props.active ? "text-background opacity-80" : "text-muted-foreground"}`} numberOfLines={1}>
        {`${props.papers} papers`}
      </Text>
      <Text class={`text-[11px] tabular-nums ${props.active ? "text-background opacity-80" : "text-muted-foreground"}`} numberOfLines={1}>
        {`${props.credits} credits`}
      </Text>
    </View>
  );
}

function contact(subject: Subject): string {
  const parts: string[] = [];
  if ((subject.lecture ?? 0) > 0) parts.push(`L ${subject.lecture}`);
  if ((subject.tutorial ?? 0) > 0) parts.push(`T ${subject.tutorial}`);
  if ((subject.practical ?? 0) > 0) parts.push(`P ${subject.practical}`);
  return parts.length ? `${parts.join(" · ")} hrs/week` : "hours not listed";
}

/** Credits and contact hours on one line that wraps between groups, never mid-number. */
export function CreditLine(props: { subject: Subject }) {
  return (
    <Row class="flex-wrap items-center gap-1.5">
      <Badge tone="ember">{`${props.subject.credits} credits`}</Badge>
      <Badge>{props.subject.type || "Theory"}</Badge>
      <Muted class="text-[11px] tabular-nums" numberOfLines={1}>
        {contact(props.subject)}
      </Muted>
    </Row>
  );
}

/**
 * The paper header: what this paper is, how far it is, and the three things it
 * can do. Progress and the tick are accessors — the screen is created once and
 * this header has to keep reading them.
 */
export function SubjectCard(props: {
  subject: Subject;
  sem: number;
  progress: () => Progress;
  saved: () => boolean;
  onToggleSaved: () => void;
  onNotes: () => void;
  onPapers: () => void;
}) {
  const pct = (): number => {
    const value = props.progress();
    return value.topics ? (value.done / value.topics) * 100 : 0;
  };

  return (
    <View class="overflow-hidden rounded-[28px] border border-border bg-card p-4">
      <Row class="items-start justify-between gap-3">
        <View class="flex-1 gap-1">
          <Label>{`${props.subject.code} · Sem ${props.sem}`}</Label>
          <Text class="text-[22px] font-bold leading-7 tracking-tight text-foreground">{props.subject.name}</Text>
        </View>
        <Pct value={pct()} />
      </Row>
      <View class="mt-3 gap-2">
        <CreditLine subject={props.subject} />
        <Bar value={pct()} />
      </View>
      {/* Notes and papers belong to the paper, not to each of its forty topics:
          one row here instead of two chips per topic. */}
      <Row class="mt-1 flex-wrap items-center gap-1">
        <Btn
          variant="link"
          icon="star"
          iconSolid={props.saved()}
          label={props.saved() ? "Remove this paper from saved" : "Save this paper"}
          onPress={props.onToggleSaved}
        >
          {() => (props.saved() ? "Saved" : "Save")}
        </Btn>
        <Btn variant="ghost" label="Notes for this paper" onPress={props.onNotes}>
          Notes
        </Btn>
        <Btn variant="ghost" label={`Previous papers for ${props.subject.code}`} onPress={props.onPapers}>
          Papers
        </Btn>
      </Row>
    </View>
  );
}

/** The full source text of a paper, with its copy action and the note it leaves. */
export function SourceBox(props: { content: () => string; note: () => string; onCopy: () => void }) {
  return (
    <View class="gap-2">
      <Card>
        <Text class="text-[14px] leading-6 text-foreground" selectable>
          {() => props.content() || "The source carries no unit text for this paper."}
        </Text>
      </Card>
      {() =>
        props.content().trim() ? (
          <Row class="items-center gap-2">
            <Btn variant="secondary" class="flex-1" label="Copy the full text" onPress={props.onCopy}>
              Copy the full text
            </Btn>
            {() => (props.note() === "" ? null : <Muted class="text-[11px]">{() => props.note()}</Muted>)}
          </Row>
        ) : null
      }
    </View>
  );
}

/** The semester's studied count: percentage, count and bar on the landing. */
export function ProgressCard(props: {
  branch: string;
  sem: number;
  progress: () => Progress;
  own: () => boolean;
}) {
  const pct = (): number => {
    const value = props.progress();
    return value.topics ? (value.done / value.topics) * 100 : 0;
  };

  return (
    <Card class="gap-3">
      <Row class="items-center gap-2">
        {() => (props.own() ? <Label class="flex-1 text-primary-ink">Your branch</Label> : <View class="flex-1" />)}
        <Muted class="text-[11px]">{`${shortBranch(props.branch)} · Sem ${props.sem}`}</Muted>
      </Row>
      <Row class="items-center gap-3">
        <Pct value={pct()} />
        <Text class="flex-1 text-[15px] font-semibold text-foreground">
          {() => `${props.progress().done} of ${props.progress().topics} topics studied`}
        </Text>
      </Row>
      <Bar value={pct()} />
    </Card>
  );
}

/** Off the student's own course, the one-tap way back to it. */
export function OwnBranchCard(props: { line: () => string; onOpen: () => void }) {
  return (
    <View
      class="flex-row items-center gap-3 rounded-3xl border border-primary/25 bg-primary/8 p-4 active:bg-primary/12"
      onPress={props.onOpen}
      role="button"
      accessibilityLabel="Your branch"
    >
      <View class="flex-1 gap-0.5">
        <Label class="text-primary-ink">Your branch</Label>
        <Text class="text-[14px] font-semibold text-foreground" numberOfLines={1}>
          {() => props.line()}
        </Text>
      </View>
      <Text class="text-[13px] font-semibold text-primary-ink">Open</Text>
    </View>
  );
}

/** A bad deep link explained, with one tap out of it. */
export function NoticePanel(props: {
  tone: "ember" | "amber";
  label: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Panel tone={props.tone} class="gap-2">
      <Label class={props.tone === "ember" ? "text-primary-ink" : undefined}>{props.label}</Label>
      <Text class="text-[13px] leading-5 text-foreground">{props.body}</Text>
      <Btn variant="secondary" onPress={props.onAction}>
        {props.action}
      </Btn>
    </Panel>
  );
}

/** The GATE paper card and the 30-paper rail, kept together. */export function GateHeader(props: { paper: () => string; onPick: (code: string) => void }) {
  return (
    <View class="gap-3 pb-2 pt-4">
      <View class="overflow-hidden rounded-[28px] border border-border bg-card p-4">
        <Label>GATE</Label>
        <Text class="mt-1 text-[22px] font-bold leading-7 tracking-tight text-foreground">
          {() => gatePack(props.paper())?.name ?? "GATE syllabus"}
        </Text>
        <Muted class="mt-1 text-[12px]">Split section by section into the exact topics GATE names.</Muted>
      </View>
      <Scroll horizontal scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
        <Each of={GATE_META} key={(meta) => meta.code}>
          {(meta: () => (typeof GATE_META)[number]) => (
            <Pick active={meta().code === props.paper()} label={meta().name} onPress={() => props.onPick(meta().code)}>
              {meta().code}
            </Pick>
          )}
        </Each>
      </Scroll>
    </View>
  );
}

/** Branch and semester: the two choices that decide which papers are on screen. */
export function CourseRail(props: {
  branch: () => string;
  sem: () => number;
  sems: () => SemInfo[];
  onBranch: (code: string) => void;
  onSemester: (sem: number) => void;
}) {
  return (
    <View class="gap-4">
      <View class="gap-2">
        <SectionHeader title="Branch" trailing={<Badge tone="mint">{branchName(props.branch())}</Badge>} />
        <Scroll horizontal scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
          <Each of={BRANCH_META} key={(meta) => meta.code}>
            {(meta: () => (typeof BRANCH_META)[number]) => (
              <Pick active={meta().code === props.branch()} label={meta().name} onPress={() => props.onBranch(meta().code)}>
                {meta().short}
              </Pick>
            )}
          </Each>
        </Scroll>
      </View>
      <View class="gap-2">
        <SectionHeader title="Semester" />
        <Scroll
          horizontal
          scrollbar={false}
          bounces={false}
          // Opens on the student's own semester, with the one before it for
          // context, instead of always starting at Sem 1.
          contentOffset={{ x: Math.max(0, (props.sems().findIndex((info) => info.sem === props.sem()) - 1) * 112) }}
          contentClass="flex-row gap-2 pr-4"
        >
          <Each of={props.sems()} key={(info: SemInfo) => String(info.sem)}>
            {(info: () => SemInfo) => (
              <SemCard
                sem={info().sem}
                papers={info().papers}
                credits={info().credits}
                active={info().sem === props.sem()}
                onPress={() => props.onSemester(info().sem)}
              />
            )}
          </Each>
        </Scroll>
      </View>
    </View>
  );
}

/** Text with the matching part of the search term in ember ink. */
export function Highlight(props: { text: string; term: string; class?: string; numberOfLines?: number }) {
  return (
    <Text class={props.class} numberOfLines={props.numberOfLines}>
      {matchRange(props.text, props.term) ? props.text.slice(0, matchRange(props.text, props.term)?.start ?? 0) : props.text}
      {matchRange(props.text, props.term) ? (
        <Text class="font-bold text-primary-ink">
          {props.text.slice(matchRange(props.text, props.term)?.start ?? 0, matchRange(props.text, props.term)?.end ?? 0)}
        </Text>
      ) : null}
      {matchRange(props.text, props.term) ? props.text.slice(matchRange(props.text, props.term)?.end ?? 0) : null}
    </Text>
  );
}

/* -------------------------------------------------------------------- rows */

export function ContinueCard(props: { name: string; branch: string; sem: number; done: number; total: number; onOpen: () => void }) {
  return (
    <View
      class="gap-2 rounded-3xl border border-primary/25 bg-primary/8 p-4 active:bg-primary/12"
      onPress={props.onOpen}
      role="button"
      accessibilityLabel={`Continue ${props.name}`}
    >
      <Row class="items-center gap-2">
        <Label class="text-primary-ink">Continue</Label>
        <View class="flex-1" />
        <Muted class="text-[11px]">{`${shortBranch(props.branch)} · Sem ${props.sem}`}</Muted>
      </Row>
      <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
        {props.name}
      </Text>
      <Row class="items-center gap-2">
        <Bar value={props.total ? (props.done / props.total) * 100 : 0} class="h-1.5 flex-1" />
        <Text class="text-[11px] tabular-nums text-muted-foreground">{`${props.done}/${props.total} topics`}</Text>
      </Row>
    </View>
  );
}

export function SubjectRow(props: {
  item: () => SubjectEntry;
  /** True when this paper also belongs to the student's own semester. */
  mine?: () => boolean;
  onOpen: (entry: SubjectEntry) => void;
}) {
  const done = computed(() => doneIn(props.item()));
  const mine = computed(() => props.mine?.() === true);

  return (
    <View
      class="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4 active:scale-[0.99] active:bg-muted"
      onPress={() => props.onOpen(props.item())}
      role="button"
      accessibilityLabel={`${props.item().subject.name}, ${props.item().subject.credits} credits`}
    >
      <View class="w-12 items-center gap-0.5 rounded-2xl bg-muted py-2">
        <Text class="text-[16px] font-bold tabular-nums text-foreground">{props.item().subject.credits}</Text>
        <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">cr</Text>
      </View>
      <View class="flex-1 gap-1">
        <Row class="items-start gap-2">
          <Text class="flex-1 text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
            {props.item().subject.name}
          </Text>
          {mine() ? <Badge tone="mint">Yours</Badge> : null}
        </Row>
        <Text class="text-[11px] text-muted-foreground" numberOfLines={1}>
          {`${props.item().subject.code} · ${props.item().units.length} units · ${props.item().topics} topics`}
        </Text>
        <Row class="items-center gap-2">
          <Bar value={props.item().topics ? (done() / props.item().topics) * 100 : 0} class="h-1.5 flex-1" />
          <Text class="text-[10px] tabular-nums text-muted-foreground">{`${done()}/${props.item().topics}`}</Text>
        </Row>
      </View>
      <Icon name="chevron-right" size={18} class="text-muted-foreground" />
    </View>
  );
}

export function TopicRow(props: {
  topic: Topic;
  branch: string;
  sem: number;
  code: string;
  /** The paper's name, so the AI prompt can name it. */
  name: string;
  last: boolean;
  /** The live in-paper search term, so a matching row says so while typing. */
  query?: () => string;
  /** The topic a search result last jumped to. */
  focus?: () => string;
  /** Opens this paper's VVI sheet; offered only when the manifest has one. */
  onShortNote: () => void;
}) {
  // The row is keyed by topic id inside a keyed unit and paper, so these are
  // fixed for its lifetime: building them here keeps the JSX readable.
  const markKey = topicKey(props.branch, props.sem, props.code, props.topic.id);
  const saveKey = markKey;
  const hasBody = props.topic.body.trim().length > 0;
  const matched = computed(() => {
    const term = (props.query?.() ?? "").trim().toLowerCase();
    if (term.length < 2) return false;
    return props.topic.title.toLowerCase().includes(term) || props.topic.body.toLowerCase().includes(term);
  });
  const focused = computed(() => props.focus?.() === props.topic.id);

  return (
    <View class={focused() ? "bg-primary/8" : ""}>
      <Row class="items-start gap-1 py-1 pl-1 pr-3">
        {/* The checkbox is the progress control: 24 pt of box in a 44 pt
            target, so a tick is one thumb tap and never a reflow. */}
        <Check
          checked={studied()[markKey] === true}
          onPress={() => toggleTopic(props.branch, props.sem, props.code, props.topic.id)}
          label={`${props.topic.title}, studied`}
          class="mt-0.5"
        />
        <View
          class="flex-1 gap-1 py-3"
          onPress={() => toggleOpen(markKey)}
          role="button"
          accessibilityLabel={props.topic.title}
          accessibilityState={{ expanded: open()[markKey] === true }}
        >
          <Text
            class={`text-[14px] font-medium leading-5 ${
              studied()[markKey] ? "text-muted-foreground" : "text-foreground"
            }`}
            numberOfLines={open()[markKey] ? 0 : 2}
          >
            {props.topic.title}
          </Text>
          {matched() ? (
            <Row class="flex-wrap items-center gap-1.5">
              <Badge tone="ember">match</Badge>
            </Row>
          ) : null}
        </View>
        <View
          class="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          onPress={() => toggleSaved(saveKey)}
          role="button"
          accessibilityLabel={`${props.topic.title}, saved`}
          accessibilityState={{ selected: saved()[saveKey] === true }}
        >
          <Icon
            name="star"
            size={18}
            solid={saved()[saveKey] === true}
            class={saved()[saveKey] ? "text-primary-ink" : "text-muted-foreground"}
          />
        </View>
      </Row>
      {open()[markKey] ? (
        <View class="mb-2 ml-[48px] mr-3 gap-2 rounded-2xl bg-muted p-3">
          {hasBody ? (
            <Text class="text-[13px] leading-6 text-foreground" selectable>
              {props.topic.body}
            </Text>
          ) : null}
          {props.topic.hours ? <Muted class="text-[11px]">{props.topic.hours}</Muted> : null}
          {/* The one action a topic needs beyond reading it. Notes and papers
              live once on the paper, not on all forty topics of it. */}
          <AskAi
            class="border-t border-border pt-1"
            prompt={topicPrompt({
              subject: props.name,
              code: props.code,
              sem: props.sem,
              branch: props.branch.toUpperCase(),
              topic: props.topic.title,
              body: props.topic.body,
            })}
          />
          <View class="border-t border-border pt-1">
            <TopicActions
              branch={props.branch}
              sem={props.sem}
              code={props.code}
              name={props.name}
              topic={props.topic}
              markKey={markKey}
              onShortNote={props.onShortNote}
            />
          </View>
        </View>
      ) : null}
      {props.last ? null : <View class="ml-[48px] mr-3 h-px bg-border" />}
    </View>
  );
}

/**
 * One unit of a paper: a tappable header that carries the unit's own progress,
 * and its topics when it is open. Collapsed by default beyond the first unit,
 * so a 12-unit paper still reads as a list of units on a 320 pt phone.
 */
export function UnitBlock(props: {
  unit: () => Unit;
  index: number;
  branch: string;
  sem: number;
  code: string;
  /** The paper's name, handed down so a topic can prompt an AI with it. */
  name: string;
  open: () => boolean;
  onToggle: () => void;
  onMeasure: (y: number) => void;
  query: () => string;
  focus: () => string;
  /** Opens this paper's VVI sheet; handed to every topic row. */
  onShortNote: () => void;
}) {
  const total = computed(() => props.unit().topics.length);
  const done = computed(() => unitDone(props.unit(), props.branch, props.sem, props.code));
  const pct = computed(() => (total() ? (done() / total()) * 100 : 0));
  const hits = computed(() => (props.query().trim().length < 2 ? 0 : matchesIn([props.unit()], props.query()).length));
  // A unit titled "Unit 2" by the parser (the source only printed a number)
  // does not need the index chip beside it saying the same thing.
  const selfNumbered = computed(() =>
    new RegExp(`^(unit|module|part|section)\\s*0*${props.index + 1}$`, "i").test(props.unit().title.trim()),
  );

  return (
    <View class="gap-2">
      <View
        class="min-h-11 flex-row items-start gap-3 rounded-3xl border border-border bg-card px-4 py-3 active:bg-muted"
        onPress={props.onToggle}
        role="button"
        accessibilityLabel={`Unit ${props.index + 1}, ${props.unit().title}`}
        accessibilityState={{ expanded: props.open() }}
        onLayout={(bounds) => props.onMeasure(bounds.origin.y)}
      >
        {selfNumbered() ? null : (
          <View class="h-8 w-8 items-center justify-center rounded-xl bg-muted">
            <Text class="text-[13px] font-bold tabular-nums text-foreground">{props.index + 1}</Text>
          </View>
        )}
        <View class="flex-1 gap-1">
          <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
            {props.unit().title}
          </Text>
          <Muted class="text-[11px]" numberOfLines={1}>
            {props.unit().hours
              ? `${total()} ${total() === 1 ? "topic" : "topics"} · ${props.unit().hours}`
              : `${total()} ${total() === 1 ? "topic" : "topics"}`}
          </Muted>
          <Row class="items-center gap-2 pt-1">
            <Bar value={pct()} class="h-1.5 flex-1" />
            <Text class="text-[10px] tabular-nums text-muted-foreground">{`${done()}/${total()}`}</Text>
          </Row>
        </View>
        <View class="items-end gap-1">
          {hits() ? <Badge tone="ember">{`${hits()} match${hits() === 1 ? "" : "es"}`}</Badge> : null}
          <Text class="text-[13px] text-muted-foreground" accessibilityElementsHidden>
            {props.open() ? "−" : "+"}
          </Text>
        </View>
      </View>

      {props.open() ? (
        total() === 0 ? (
          <Card class="mx-1">
            <Muted>The source names this unit but prints no topic under it.</Muted>
          </Card>
        ) : (
          <Card class="gap-0 p-0">
            <Each of={props.unit().topics} key={(topic: Topic) => topic.id}>
              {(topic: () => Topic, topicIndex: () => number) => (
                <TopicRow
                  topic={topic()}
                  branch={props.branch}
                  sem={props.sem}
                  code={props.code}
                  name={props.name}
                  last={topicIndex() === total() - 1}
                  query={props.query}
                  focus={props.focus}
                  onShortNote={props.onShortNote}
                />
              )}
            </Each>
          </Card>
        )
      ) : null}
    </View>
  );
}

/** One in-paper search hit: the unit it lives in, and the words that matched. */
export function MatchRow(props: {
  item: () => SubjectMatch;
  term: () => string;
  onPress: () => void;
  last: boolean;
}) {
  return (
    <View>
      <View
        class="min-h-11 flex-row items-start gap-3 px-4 py-3 active:bg-muted"
        onPress={props.onPress}
        role="button"
        accessibilityLabel={`Unit ${props.item().unitIndex + 1}, ${props.item().title}`}
      >
        <Badge tone="mint">{`Unit ${props.item().unitIndex + 1}`}</Badge>
        <View class="flex-1 gap-1">
          <Highlight
            text={props.item().title}
            term={props.term()}
            class="text-[13px] font-semibold leading-5 text-foreground"
            numberOfLines={2}
          />
          {props.item().snippet ? (
            <Highlight
              text={props.item().snippet}
              term={props.term()}
              class="text-[12px] leading-5 text-muted-foreground"
              numberOfLines={2}
            />
          ) : (
            <Muted class="text-[11px]" numberOfLines={1}>
              {props.item().unitTitle}
            </Muted>
          )}
        </View>
        <Icon name="chevron-right" size={16} class="text-muted-foreground" />
      </View>
      {props.last ? null : <Divider class="ml-4" />}
    </View>
  );
}

/** The in-paper search results, or the honest card that says nothing matched. */
export function MatchList(props: { items: () => SubjectMatch[]; term: () => string; onJump: (match: SubjectMatch) => void }) {
  return (
    <View class="gap-3">
      {() => {
        const found = props.items();
        if (!found.length) {
          return (
            <Card class="gap-1">
              <Text class="text-[13px] font-semibold text-foreground">
                {`Nothing in this paper matches “${props.term().trim()}”`}
              </Text>
              <Muted class="text-[12px] leading-5">Every unit title and topic body here is searched.</Muted>
            </Card>
          );
        }
        return (
          <Card class="gap-0 p-0">
            <Each of={found} key={(match: SubjectMatch) => match.key}>
              {(match: () => SubjectMatch, index: () => number) => (
                <MatchRow
                  item={match}
                  term={props.term}
                  onPress={() => props.onJump(match())}
                  last={index() === found.length - 1}
                />
              )}
            </Each>
          </Card>
        );
      }}
    </View>
  );
}

export function HitRow(props: { item: () => Hit; term: () => string; onOpen: (hit: Hit) => void }) {
  return (
    <View
      class="gap-1.5 rounded-3xl border border-border bg-card p-4 active:bg-muted"
      onPress={() => props.onOpen(props.item())}
      role="button"
      accessibilityLabel={props.item().title || props.item().subject}
    >
      <Row class="items-center gap-2">
        <Badge tone="ember">{shortBranch(props.item().branch)}</Badge>
        <Badge tone="amber">{`Sem ${props.item().sem}`}</Badge>
        <View class="flex-1" />
        <Highlight text={props.item().code} term={props.term()} class="text-[11px] text-muted-foreground" numberOfLines={1} />
      </Row>
      <Highlight
        text={props.item().title || props.item().subject}
        term={props.term()}
        class="text-[14px] font-semibold leading-5 text-foreground"
        numberOfLines={2}
      />
      {props.item().snippet ? (
        <Highlight
          text={props.item().snippet}
          term={props.term()}
          class="text-[12px] leading-5 text-muted-foreground"
          numberOfLines={2}
        />
      ) : null}
      <Text class="text-[11px] text-muted-foreground" numberOfLines={1}>
        {props.item().topic
          ? `${props.item().subject} · ${props.item().topics} topics`
          : `${props.item().topics} topics · open the paper`}
      </Text>
    </View>
  );
}

/** A saved line: a branch heading, or something kept with its remove button. */
export function SavedLineView(props: { item: () => SavedLine; onOpen: (line: SavedLine) => void; onRemove: (line: SavedLine) => void }) {
  return (
    <View>
      {props.item().kind === "group" ? (
        <Row class="items-end justify-between gap-2 pb-1 pt-2">
          <Text class="flex-1 text-[12px] font-bold uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
            {props.item().label}
          </Text>
          <Muted class="text-[11px] tabular-nums">{props.item().hint}</Muted>
        </Row>
      ) : (
        <View class="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-4">
          <View class="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Icon
              name={props.item().topic ? "star" : "book"}
              size={17}
              solid={props.item().topic !== null}
              class="text-primary-ink"
            />
          </View>
          <View
            class="flex-1 gap-0.5"
            onPress={() => props.onOpen(props.item())}
            role="button"
            accessibilityLabel={`Open ${props.item().label}`}
          >
            <Text class="text-[14px] font-semibold text-foreground" numberOfLines={2}>
              {props.item().label}
            </Text>
            <Text class="text-[11px] text-muted-foreground" numberOfLines={1}>
              {props.item().hint}
            </Text>
          </View>
          <View
            class="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            onPress={() => props.onRemove(props.item())}
            role="button"
            accessibilityLabel={`Remove ${props.item().label}`}
          >
        <Icon name="x" size={14} class="text-muted-foreground" />
          </View>
        </View>
      )}
    </View>
  );
}

/** A GATE line: a section heading, or a topic that opens its detail. */
export function GateLineView(props: { item: () => GateLine; onToggle: (mark: string) => void }) {
  return (
    <View>
      {props.item().kind === "section" ? (
        <View class="gap-0.5 px-1 pb-1 pt-3">
          <Label>Section</Label>
          <Row class="items-end justify-between gap-2">
            <Text class="flex-1 text-[15px] font-semibold leading-5 text-foreground">{props.item().title}</Text>
            <Muted class="text-[11px]">{props.item().hint}</Muted>
          </Row>
        </View>
      ) : (
        <View class="gap-2 rounded-2xl bg-muted p-3">
          <View
            class="flex-row items-center gap-2 active:opacity-70"
            onPress={() => props.onToggle(props.item().mark)}
            role="button"
            accessibilityLabel={props.item().title}
            accessibilityState={{ expanded: open()[props.item().mark] === true }}
          >
            <View class="h-1.5 w-1.5 rounded-full bg-accent" />
            <Text class="flex-1 text-[13px] font-semibold leading-5 text-foreground" numberOfLines={2}>
              {props.item().title}
            </Text>
            {props.item().hint ? <Badge tone="mint">{props.item().hint}</Badge> : null}
            <Text class="text-[12px] text-muted-foreground">{open()[props.item().mark] ? "−" : "+"}</Text>
          </View>
          {open()[props.item().mark] ? (
            <Text class="text-[13px] leading-6 text-muted-foreground" selectable>
              {props.item().body}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** The line under the list bar after a removal: it says what went and puts it back. */
export function UndoLine(props: { label: string; onUndo: () => void; onDismiss: () => void }) {
  return (
    <View class="flex-row items-center gap-1 border-b border-border bg-accent/10 py-1 pl-4 pr-2">
      <Text class="flex-1 text-[12px] text-foreground" numberOfLines={1}>
        {`Removed “${props.label}”`}
      </Text>
      <Btn variant="link" class="min-h-9 px-2" label="Undo removal" onPress={props.onUndo}>
        Undo
      </Btn>
      <View
        class="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        onPress={props.onDismiss}
        role="button"
        accessibilityLabel="Dismiss undo"
      >
        <Icon name="x" size={13} class="text-muted-foreground" />
      </View>
    </View>
  );
}
