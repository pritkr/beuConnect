/**
 * Read-side helpers over the generated BEU catalog.
 *
 * The catalog is a compact JSON snapshot (see ./scripts/generate_catalog.py).
 * It is parsed once, lazily, so opening the app does not pay for 1000 papers
 * unless the student actually visits this area.
 *
 * Two facts shape everything below:
 *
 * 1. The shelf is the **syllabus**, not the paper archive. Every subject the
 *    syllabus ships has a row, including the ones with no paper yet, so a
 *    student can always find their code. Papers hang off those rows by code.
 * 2. Papers live once in a shared table; a row carries indexes into it. The
 *    same first-year paper is therefore reachable from CSE, ECE, EE and EEE
 *    without being stored four times or being counted four times.
 *
 * The snapshot files this reads come in two shapes, from the same generator:
 *
 * - **packed** (the shipping file, via `scripts/pack-pyq-catalog.mjs`): rows
 *   carry `code` / `legacy` / `elective` and index a shared `papers` table.
 * - **readable** (the generator's direct output): papers sit inline on each
 *   row, syllabus rows are the ones that carry `type`, and archive rows
 *   (older schemes, IT) do not. `hydrate` derives the missing fields so every
 *   consumer below sees one shape.
 */

import { RAW, type CatalogBranch, type CatalogPaper } from "./catalog-data";

export type { CatalogBranch, CatalogPaper };

/** A subject row before hydration. Both snapshot shapes fold into this. */
interface RawSubject {
  key: string;
  slug: string;
  name: string;
  branch: string;
  sem: number;
  code?: string;
  codes: string[];
  type?: string;
  credits?: number;
  elective?: boolean;
  legacy?: boolean;
  papers?: CatalogPaper[];
  paperIds?: number[];
}

interface RawCatalog {
  generated: string;
  branches: CatalogBranch[];
  subjects: RawSubject[];
  years: number[];
  /* Packed shape only; readable rows carry papers inline. */
  papers?: CatalogPaper[];
}

/** A syllabus subject with its papers resolved. */
export interface CatalogSubject {
  key: string;
  slug: string;
  name: string;
  branch: string;
  sem: number;
  /** The syllabus code for this row; empty for an older-scheme row. */
  code: string;
  codes: string[];
  type: "theory" | "lab";
  credits: number;
  elective: boolean;
  /** No syllabus row carries this code: an older scheme, IT, or an elective. */
  legacy: boolean;
  papers: CatalogPaper[];
}

export interface CatalogData {
  generated: string;
  branches: CatalogBranch[];
  subjects: CatalogSubject[];
  /** Unique papers; the same first-year paper is counted once, not per branch. */
  papers: CatalogPaper[];
  years: number[];
}

/** `s` rows and a `p` table mark the packed wire form (see the packer above). */
type PackedCatalog = {
  g: string;
  b: [string, string][];
  y: number[];
  t: string[];
  v: string[];
  h: string[];
  m: (string | number)[];
  c: string[];
  n: string[];
  s2: ("theory" | "lab")[];
  s: [number, number, number, string, string, string[], number, number, number, number[]][];
  p: [number, number, number, string, number, number, number, number][];
};

/** BEU runs eight semesters; the rail shows all of them, even an unlisted one. */
export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

let cached: CatalogData | null = null;
let cachedVersion = -1;
let source: RawCatalog | null = null;
let sourceVersion = -1;
let sourceShape: CatalogShape = "packed";

/** What the live feed can offer: a raw snapshot and the version that names it. */
export interface CatalogFeed {
  version: number;
  raw: string;
}

/**
 * Where the snapshot comes from. The bundled copy is the default, so this
 * module — and every CLI that audits the catalogue — stays free of the live
 * feed and its `nsh` dependency. `./catalog.ts` binds the feed in the app.
 */
let readFeed: () => CatalogFeed = () => ({ version: 0, raw: RAW });

/** Which snapshot shape is loaded — checkable by the audit and the QA gates. */
export type CatalogShape = "packed" | "readable";

/** Point the catalogue at a feed; resets both caches so the next read re-decodes. */
export function bindCatalogFeed(read: () => CatalogFeed): void {
  readFeed = read;
  cached = null;
  source = null;
  cachedVersion = -1;
  sourceVersion = -1;
}

function feed(): CatalogFeed {
  try {
    return readFeed();
  } catch {
    return { version: 0, raw: RAW };
  }
}

/** Packed wire form → the readable shape. Same mapping as the packer's `decode`. */
function expandPacked(wire: PackedCatalog): Required<RawCatalog> {
  const branches: CatalogBranch[] = wire.b.map(([key, name]) => ({ key, name }));
  const papers: CatalogPaper[] = wire.p.map(([code, year, variant, id, questions, title, marks, time]) => ({
    code: wire.c[code],
    year: wire.y[year],
    variant: wire.v[variant],
    id,
    questions,
    title: wire.t[title],
    marks: typeof wire.m[marks] === "number" ? (wire.m[marks] as number) : 0,
    time: wire.h[time],
  }));
  const subjects: RawSubject[] = wire.s.map(
    ([branch, sem, name, key, code, codes, type, credits, flags, paperIds]) => ({
      key,
      slug: key.slice(`${wire.b[branch][0]}|${sem}|`.length),
      name: wire.n[name],
      branch: wire.b[branch][0],
      sem,
      code,
      codes,
      type: wire.s2[type],
      credits,
      elective: (flags & 1) === 1,
      legacy: (flags & 2) === 2,
      paperIds,
    }),
  );
  return { generated: wire.g, branches, papers, subjects, years: wire.y };
}

/** `JSON.parse` either shape: a `p` table means packed, inline papers mean readable. */
function parseSnapshot(raw: string): RawCatalog {
  const parsed = JSON.parse(raw) as RawCatalog & Partial<PackedCatalog>;
  if (parsed.p === undefined && parsed.s === undefined) return parsed;
  return expandPacked(parsed as unknown as PackedCatalog);
}

function hydrate(raw: RawCatalog): CatalogData {
  const papers = Array.isArray(raw.papers) ? raw.papers : sharedPapers(raw.subjects);
  return {
    generated: raw.generated,
    branches: raw.branches,
    papers,
    years: raw.years,
    subjects: raw.subjects.map((entry) => {
      /* A syllabus row carries type and credits; archive rows (older schemes,
       * IT) do not. The packed file states legacy outright; the readable one
       * answers through the missing type — either way the shelf's ordering
       * must not be shaded by archive rows. */
      const legacy =
        entry.legacy === true || (entry.legacy === undefined && typeof entry.type !== "string");
      const kind = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
      const inline = entry.papers ?? [];
      const ids = entry.paperIds;
      const rowPapers = ids ? ids.map((index) => papers[index]).filter((paper): paper is CatalogPaper => paper !== undefined) : inline;
      return {
        key: entry.key,
        slug: entry.slug,
        name: entry.name,
        branch: entry.branch,
        sem: entry.sem,
        code: typeof entry.code === "string" ? entry.code : "",
        codes: entry.codes,
        type: kind === "lab" || kind === "practical" ? ("lab" as const) : ("theory" as const),
        credits: Number.isFinite(entry.credits) ? (entry.credits as number) : 0,
        elective: entry.elective === true,
        legacy,
        papers: rowPapers,
      };
    }),
  };
}

/** Unique papers across rows, in file order; a row's own papers are never merged. */
function sharedPapers(subjects: RawSubject[]): CatalogPaper[] {
  const seen = new Set<string>();
  const out: CatalogPaper[] = [];
  for (const subject of subjects) {
    for (const paper of subject.papers ?? []) {
      const id = `${paper.code}|${paper.year}|${paper.variant}|${paper.id}|${paper.questions}|${paper.title}|${paper.marks}|${paper.time}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(paper);
    }
  }
  return out;
}

export function catalog(): CatalogData {
  const snapshot = catalogSource();
  if (cached === null || cachedVersion !== sourceVersion) {
    cachedVersion = sourceVersion;
    try {
      cached = hydrate(snapshot);
    } catch {
      cached = { generated: "", branches: [], subjects: [], papers: [], years: [] };
    }
  }
  return cached;
}

/**
 * The snapshot before hydration, in either shape.
 *
 * The shelf never needs this — `catalog()` resolves the papers — but the audit
 * and `qa/unit/pyq-catalog.test.ts` do: a packed row that points at a paper
 * the table does not have must be reported, not silently dropped on the way
 * in. `catalogShape()` says which shape replied.
 */
export function catalogSource(): RawCatalog {
  const next = feed();
  if (source === null || sourceVersion !== next.version) {
    sourceVersion = next.version;
    try {
      const parsed = parseSnapshot(next.raw);
      source = parsed;
      sourceShape = Array.isArray(parsed.papers) ? "packed" : "readable";
    } catch {
      sourceShape = "readable";
      source = { generated: "", branches: [], subjects: [], years: [] };
    }
  }
  return source;
}

/** `packed` when the loaded snapshot carries a shared papers table. */
export function catalogShape(): CatalogShape {
  catalogSource();
  return sourceShape;
}

export function branches(): CatalogBranch[] {
  const subjects = catalog().subjects;
  return catalog().branches.filter((branch) => subjects.some((subject) => subject.branch === branch.key));
}

export function branchName(key: string): string {
  return catalog().branches.find((branch) => branch.key === key)?.name ?? key;
}

export function shortBranchName(key: string): string {
  const name = branchName(key);
  if (name.startsWith("First year")) return "First year";
  return name
    .replace("Computer Science & Engineering", "CSE")
    .replace("Electronics & Communication Engineering", "ECE")
    .replace("Electronics & Communication", "ECE")
    .replace("Electrical & Electronics Engineering", "EEE")
    .replace("Electrical & Electronics", "EEE")
    .replace("Information Technology", "IT")
    .replace("Civil Engineering", "Civil")
    .replace("Mechanical Engineering", "Mech")
    .replace("Electrical Engineering", "EE")
    .replace(" Engineering", "")
    .trim();
}

export function allSubjects(): CatalogSubject[] {
  return catalog().subjects;
}

/** Every syllabus row for a branch and/or semester, in no particular order. */
export function subjectsOf(branch: string | null, sem: number | null): CatalogSubject[] {
  return catalog().subjects.filter(
    (subject) => (branch === null || subject.branch === branch) && (sem === null || subject.sem === sem),
  );
}

/** The semesters a branch actually lists subjects for. */
export function semestersOf(branch: string | null): number[] {
  const present = new Set<number>();
  for (const subject of catalog().subjects) {
    if (branch === null || subject.branch === branch) present.add(subject.sem);
  }
  return [...present].sort((left, right) => left - right);
}

/* --------------------------------------------------------------- ordering */

/**
 * Are the odd semesters in session? BEU's session runs Jul–Dec (odd) and
 * Jan–Jun (even); `now.getMonth()` is 0-based, so 6 is July.
 */
export function isOddSession(now: Date): boolean {
  return now.getMonth() >= 6;
}

/** The four semesters in session on `now`, lowest first. */
export function activeSemesters(now: Date = new Date()): number[] {
  const odd = isOddSession(now);
  return SEMESTERS.filter((sem) => (sem % 2 === 1) === odd);
}

/**
 * All eight semesters with the in-session ones first: in October that is
 * 1 · 3 · 5 · 7 · 2 · 4 · 6 · 8. The rail reads in this order, so the
 * subjects a student can sit this term are never four scrolls away.
 */
export function orderedSemesters(now: Date = new Date()): number[] {
  const active = activeSemesters(now);
  return [...active, ...SEMESTERS.filter((sem) => !active.includes(sem))];
}

export function latestYearOf(subject: CatalogSubject): number {
  let latest = 0;
  for (const paper of subject.papers) if (paper.year > latest) latest = paper.year;
  return latest;
}

export interface OrderOptions {
  /** The student's own semester, if known: it comes before every other row. */
  current?: number | null;
  /** The clock the session is read from; tests pass a fixed date. */
  now?: Date;
}

/**
 * The shelf's order: the student's semester first, then the semesters in
 * session, then the rest; inside a semester the subjects with papers lead,
 * newest papers before oldest, theory before labs, then alphabetically.
 *
 * This is the one function the browse screen and the QA contract share, so a
 * "missing" subject cannot hide behind a menu that never lists its semester.
 */
export function orderSubjects(rows: CatalogSubject[], options: OrderOptions = {}): CatalogSubject[] {
  const now = options.now ?? new Date();
  const active = activeSemesters(now);
  const current = options.current ?? null;

  const semRank = (sem: number): number => {
    if (current !== null && sem === current) return 0;
    const at = active.indexOf(sem);
    if (at >= 0) return 1 + at;
    return 1 + active.length + sem;
  };

  return rows.slice().sort((left, right) => {
    const bySem = semRank(left.sem) - semRank(right.sem);
    if (bySem !== 0) return bySem;

    const leftPapers = left.papers.length;
    const rightPapers = right.papers.length;
    if ((leftPapers > 0) !== (rightPapers > 0)) return leftPapers > 0 ? -1 : 1;

    if (left.type !== right.type) return left.type === "lab" ? 1 : -1;

    const byYear = latestYearOf(right) - latestYearOf(left);
    if (byYear !== 0) return byYear;

    if (leftPapers !== rightPapers) return rightPapers - leftPapers;
    return left.name.localeCompare(right.name);
  });
}

/* ----------------------------------------------------------------- lookup */

export function findSubject(branch: string, sem: number, slug: string): CatalogSubject | undefined {
  return catalog().subjects.find(
    (subject) => subject.branch === branch && subject.sem === sem && subject.slug === slug,
  );
}

export function findSubjectBySlug(slug: string): CatalogSubject[] {
  return catalog().subjects.filter((subject) => subject.slug === slug);
}

/**
 * The row a code belongs to, preference in this order: a current-scheme row
 * whose own code it is, then a current-scheme row that lists it, then any row
 * whose own code it is. BEU reuses numbers across schemes (105301 is Digital
 * Electronics today, Formal Languages in a 2013 paper), so without the
 * preference a student could type the current code and land on an older-scheme
 * row that merely borrowed it.
 */
export function findSubjectByCode(branch: string, sem: number, code: string): CatalogSubject | undefined {
  const rows = catalog().subjects.filter(
    (subject) => subject.branch === branch && subject.sem === sem && subject.codes.includes(code),
  );
  return (
    rows.find((subject) => !subject.legacy && subject.code === code) ??
    rows.find((subject) => !subject.legacy) ??
    rows[0]
  );
}

export function findPaper(
  subject: CatalogSubject,
  code: string,
  year: number,
  variant: string,
  id: string,
  title = "",
): CatalogPaper | undefined {
  return subject.papers.find(
    (paper) =>
      paper.year === year &&
      (paper.code === code || code === "") &&
      (paper.variant === variant || variant === "") &&
      (paper.id === id || id === "") &&
      (paper.title === title || title === ""),
  );
}

export function subjectKey(subject: CatalogSubject): string {
  return subject.key;
}

export function paperKey(subject: CatalogSubject, paper: CatalogPaper): string {
  return `${subject.key}|${paper.code}|${paper.year}|${paper.variant}|${paper.id}|${paper.title}`;
}

/** "2019" + variant "v4" → "2019 · V4". */
export function paperLabel(paper: CatalogPaper): string {
  return paper.variant ? `${paper.year} · ${paper.variant.toUpperCase()}` : String(paper.year);
}

/** Unique papers in the shared table, not paper-rows across branches. */
export function totalPapers(): number {
  return catalog().papers.length;
}

export function yearsOf(subject: CatalogSubject): number[] {
  return [...new Set(subject.papers.map((paper) => paper.year))].sort((left, right) => right - left);
}

export function paperCountOf(subject: CatalogSubject): number {
  return subject.papers.length;
}

/** "4 papers · 2017–2024", or an honest empty-state line. */
export function paperSummary(subject: CatalogSubject): string {
  const count = subject.papers.length;
  if (count === 0) return "No papers yet";
  const years = yearsOf(subject);
  const oldest = years[years.length - 1] ?? 0;
  const newest = years[0] ?? 0;
  const span = oldest === newest ? String(newest) : `${oldest}–${newest}`;
  return `${count} paper${count === 1 ? "" : "s"} · ${span}`;
}

/** Ranks matches so a subject-name hit beats a code hit, then alphabetically. */
export function searchSubjects(query: string, branch: string | null, sem: number | null): CatalogSubject[] {
  const needle = query.trim().toLowerCase();
  const base = subjectsOf(branch, sem);
  if (!needle) return base;

  const scored: { subject: CatalogSubject; score: number }[] = [];
  for (const subject of base) {
    const name = subject.name.toLowerCase();
    const codeHit = subject.codes.some((code) => code.toLowerCase().includes(needle));
    const yearHit = subject.papers.some((paper) => String(paper.year).includes(needle));
    let score = 0;
    if (name === needle) score = 100;
    else if (name.startsWith(needle)) score = 80;
    else if (name.includes(needle)) score = 60;
    else if (codeHit) score = 40;
    else if (yearHit) score = 20;
    if (score > 0) scored.push({ subject, score });
  }
  return scored
    .sort((left, right) => right.score - left.score || left.subject.name.localeCompare(right.subject.name))
    .map((row) => row.subject);
}

/** A short search-result hint: "CSE · Sem 3 · 4 papers". */
export function subjectHint(subject: CatalogSubject): string {
  return `${shortBranchName(subject.branch)} · Sem ${subject.sem} · ${subject.papers.length} paper${
    subject.papers.length === 1 ? "" : "s"
  }`;
}

export function subjectCodes(subject: CatalogSubject): string {
  return subject.codes.filter((code) => code && code !== "---").join(" · ");
}
