/**
 * Network + parsing data layer for the PYQ and data-browser screens.
 *
 * Everything is read from the published site (the only allow-listed host):
 *
 *   GET /pyqs/<subject-slug>/              server-rendered papers, parsed natively
 *   GET /data/manifest/index.json          { batch: { branch: [sem8_157.json, …] } }
 *   GET /data/wide_<batch>_<college>_<branch>_sem<sem>.csv
 *
 * `fetchText`/`fetchJson` handle timeouts and keep the last good copy in Storage,
 * so a paper or table opens offline once it has been seen.
 */

import { SITE, fetchJson, fetchText, getCache, putCache, NetError } from "../../lib/net";
import { listEntries } from "../../lib/cache";
import { COLLEGE_NAMES } from "./colleges";
import { parseAllPapers, type PaperTarget, type ParsedPaper } from "./paper-parse";

/* ----------------------------------------------------------------- datasets */

export interface Dataset {
  /** Stable key: batch|branch|sem|college. */
  id: string;
  batch: string;
  branch: string;
  sem: number;
  college: string;
  /** Absolute CSV URL on the site. */
  url: string;
}

export interface Manifest {
  [batch: string]: {
    [branch: string]: string[];
  };
}

const BRANCHES: Record<string, string> = {
  "101": "Civil Engineering",
  "102": "Mechanical Engineering",
  "103": "Electrical Engineering",
  "104": "Electronics & Communication",
  "105": "Computer Science & Engineering",
  "110": "Electrical & Electronics",
  "161": "EEE (Specialization)",
};

export function branchLabel(code: string): string {
  return BRANCHES[code] ?? `Branch ${code}`;
}

export function shortBranchLabel(code: string): string {
  const name = BRANCHES[code];
  if (!name) return code;
  if (name === "Computer Science & Engineering") return "CSE";
  if (name === "Electronics & Communication") return "ECE";
  if (name === "Electrical & Electronics") return "EEE";
  if (name === "Civil Engineering") return "Civil";
  if (name === "Mechanical Engineering") return "Mech";
  if (name === "Electrical Engineering") return "EE";
  return name;
}

export function collegeName(code: string): string {
  return COLLEGE_NAMES[code] ?? `College ${code}`;
}

export function shortCollegeName(code: string): string {
  const name = COLLEGE_NAMES[code];
  if (!name) return `College ${code}`;
  return name
    .replace(/^Government Engineering College,\s*/i, "GEC ")
    .replace(/^Government College of Engineering,?\s*/i, "GCE ")
    .replace(/\s*\(.*\)$/, "")
    .trim();
}

export function datasetHint(dataset: Dataset): string {
  return `Batch ${dataset.batch} · ${shortBranchLabel(dataset.branch)} · Sem ${dataset.sem}`;
}

export function datasetTitle(dataset: Dataset): string {
  return collegeName(dataset.college);
}

const PATH_RE = /sem(\d+)_([A-Za-z0-9]+)\.json$/;

/** Absolute CSV URL for one manifest entry. */
export function datasetUrl(batch: string, college: string, branch: string, sem: number): string {
  return `${SITE}/data/wide_${batch}_${college}_${branch}_sem${sem}.csv`;
}

/** Converts the manifest into one row per published dataset. */
export function datasetsFromManifest(payload: Manifest): Dataset[] {
  const out: Dataset[] = [];
  const seen = new Set<string>();
  for (const batch of Object.keys(payload)) {
    const branches = payload[batch];
    if (!branches || typeof branches !== "object") continue;
    for (const branch of Object.keys(branches)) {
      const files = branches[branch];
      if (!Array.isArray(files)) continue;
      for (const file of files) {
        if (typeof file !== "string") continue;
        const match = PATH_RE.exec(file);
        if (!match) continue;
        const sem = Number(match[1]);
        const college = match[2];
        if (!Number.isFinite(sem) || !college) continue;
        const id = `${batch}|${branch}|${sem}|${college}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          batch,
          branch,
          sem,
          college,
          url: datasetUrl(batch, college, branch, sem),
        });
      }
    }
  }
  return out.sort(
    (left, right) =>
      Number(right.batch) - Number(left.batch) ||
      left.branch.localeCompare(right.branch) ||
      right.sem - left.sem ||
      left.college.localeCompare(right.college),
  );
}

export function searchDatasets(datasets: Dataset[], query: string): Dataset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return datasets;
  return datasets.filter((dataset) => {
    const haystack = `${dataset.batch} ${dataset.branch} ${branchLabel(dataset.branch)} ${dataset.sem} ${dataset.college} ${collegeName(
      dataset.college,
    )}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown = new NetError("The request failed.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (error instanceof NetError && error.status === 404) throw error;
      if (attempt === 0) await sleep(400);
    }
  }
  throw lastError;
}

const MANIFEST_URL = `${SITE}/data/manifest/index.json`;
const MANIFEST_CACHE = "pyqs.manifest.v1";

export function loadDatasets(): Promise<Dataset[]> {
  return withRetry(() =>
    fetchJson<Manifest>(MANIFEST_URL, {
      cacheKey: MANIFEST_CACHE,
      cacheMaxAge: 0,
      revalidate: true,
      timeout: 25000,
    }),
  ).then((payload) => datasetsFromManifest(payload));
}

const CSV_CACHE_PREFIX = "pyqs.csv.";

export function loadDatasetCsv(dataset: Dataset): Promise<string> {
  return withRetry(() =>
    fetchText(dataset.url, {
      cacheKey: `${CSV_CACHE_PREFIX}${dataset.id}`,
      // A batch's table never changes once published, so the copy on the
      // device is good forever and a stale screen opens instantly.
      cacheMaxAge: 0,
      revalidate: true,
      timeout: 45000,
    }),
  );
}

/* -------------------------------------------------------------------- papers */

/**
 * Papers are cached **parsed**, not as HTML.
 *
 * One subject page is ~390 KB of markup for every paper that subject has ever
 * had; the same page parsed into questions is ~9 KB. That ratio is what makes
 * "all my PYQs, offline" fit in a 5 MB device store: a semester of subjects
 * costs a few hundred kilobytes, not ten megabytes.
 *
 * One cache row per subject, written once per page load:
 *
 *   beu.cache.pyqs.papers.v1.<slug> → "<id>" → ParsedPaper
 *
 * Bump the `v1` in the key whenever `ParsedPaper` changes shape: an old bundle
 * then stops being read, and the next open rewrites it. (The launch warm-up
 * also drops `pyqs.page.*`, the raw-HTML rows 1.x kept.)
 *
 * Reading a paper is therefore one Storage read, with no network and no
 * parsing. A fresh copy is fetched when the row is older than `REFRESH_AFTER`,
 * and an old row is still served if the network fails — a paper from last year
 * does not change.
 */
const PAPER_CACHE_PREFIX = "pyqs.papers.v1.";
const REFRESH_AFTER = 30 * 24 * 60 * 60 * 1000;

/** slug → papers, for the session; the Storage row is the durable copy. */
const bundles = new Map<string, Record<string, ParsedPaper>>();
const bundleAt = new Map<string, number>();

export function paperCacheKey(slug: string): string {
  return `${PAPER_CACHE_PREFIX}${slug}`;
}

function parseBundle(raw: string | null): { papers: Record<string, ParsedPaper>; at: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; value?: unknown };
    if (!parsed || typeof parsed.value !== "string") return null;
    const papers = JSON.parse(parsed.value) as Record<string, ParsedPaper>;
    if (!papers || typeof papers !== "object" || Array.isArray(papers)) return null;
    return { papers, at: typeof parsed.at === "number" ? parsed.at : 0 };
  } catch {
    return null;
  }
}

/** The cached bundle for `slug`, from memory or Storage. */
export async function readPapers(
  slug: string,
): Promise<{ papers: Record<string, ParsedPaper>; at: number } | null> {
  const remembered = bundles.get(slug);
  if (remembered) return { papers: remembered, at: bundleAt.get(slug) ?? 0 };
  const stored = parseBundle(await getCache(paperCacheKey(slug), 0));
  if (!stored) return null;
  bundles.set(slug, stored.papers);
  bundleAt.set(slug, stored.at);
  return stored;
}

/** Writes a parsed subject page. Returns how many papers it holds. */
async function writePapers(slug: string, papers: Record<string, ParsedPaper>): Promise<number> {
  const count = Object.keys(papers).length;
  bundles.set(slug, papers);
  bundleAt.set(slug, Date.now());
  await putCache(paperCacheKey(slug), JSON.stringify(papers));
  return count;
}

export function paperPageUrl(slug: string): string {
  return `${SITE}/pyqs/${encodeURIComponent(slug)}/`;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof NetError && error.status === 404;
}

export function errorMessage(error: unknown): string {
  if (error instanceof NetError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

async function fetchSubjectPage(slug: string): Promise<string> {
  // The markup is not kept: it is ~390 KB, and the parsed papers that follow
  // are ~9 KB. One cache row per subject, not one big page plus a copy.
  return withRetry(() => fetchText(paperPageUrl(slug), { timeout: 35000 }));
}

/** Fetches one subject page, parses every paper on it and caches the result. */
async function pullSubject(slug: string): Promise<number> {
  const html = await fetchSubjectPage(slug);
  const parsed = parseAllPapers(html);
  const papers: Record<string, ParsedPaper> = {};
  for (const entry of parsed) papers[entry.id] = entry.paper;
  if (parsed.length === 0) return 0;
  return writePapers(slug, papers);
}

/** Fetches and parses one paper out of its subject page. */
export async function loadPaper(slug: string, target: PaperTarget): Promise<ParsedPaper> {
  const cached = await readPapers(slug);
  if (cached) {
    const hit = cached.papers[target.id];
    if (hit) {
      // A bundle older than the refresh window updates itself in the
      // background; the paper on screen is readable immediately either way.
      if (Date.now() - cached.at > REFRESH_AFTER) void pullSubject(slug).catch(() => undefined);
      return hit;
    }
  }
  await pullSubject(slug);
  const fresh = await readPapers(slug);
  const hit = fresh?.papers[target.id];
  if (hit) return hit;

  // The page loaded but this paper is not on it: the screen says so, and the
  // PDF/site links stay available.
  return {
    found: false,
    year: target.year,
    code: target.code,
    title: "",
    time: "",
    fullMarks: "",
    instructions: [],
    sections: [],
    questionCount: 0,
  };
}

/**
 * Downloads and caches every paper of one subject. Returns the paper count, or
 * 0 when the page has nothing the parser can read.
 */
export async function prefetchSubject(slug: string): Promise<number> {
  try {
    return await pullSubject(slug);
  } catch {
    return 0;
  }
}

export interface CachedPapers {
  slug: string;
  papers: number;
  at: number;
}

/** Every subject that has an offline paper bundle, newest first. */
export async function cachedPapers(): Promise<CachedPapers[]> {
  const rows = await listEntries();
  const out: CachedPapers[] = [];
  for (const row of rows) {
    if (!row.key.startsWith(PAPER_CACHE_PREFIX)) continue;
    const slug = row.key.slice(PAPER_CACHE_PREFIX.length);
    const stored = await readPapers(slug);
    out.push({ slug, papers: stored ? Object.keys(stored.papers).length : 0, at: row.at });
  }
  return out.sort((left, right) => right.at - left.at);
}

/** How many papers this device can open with no connection. */
export async function cachedPaperCount(): Promise<number> {
  const rows = await cachedPapers();
  return rows.reduce((total, row) => total + row.papers, 0);
}

/**
 * The subjects with a paper bundle on this device, for the shelf's badge.
 *
 * One scan of the cache, not one read per subject: the shelf renders hundreds
 * of rows and must not touch Storage once per row.
 */
export async function cachedPaperSlugs(): Promise<Set<string>> {
  const rows = await listEntries();
  const slugs = new Set<string>();
  for (const row of rows) {
    if (row.key.startsWith(PAPER_CACHE_PREFIX)) slugs.add(row.key.slice(PAPER_CACHE_PREFIX.length));
  }
  return slugs;
}

/** How many parsed questions a paper has, for the "structured" badge. */
export function structuredLabel(paper: ParsedPaper): string {
  if (!paper.found) return "No structured questions";
  return `${paper.questionCount} question${paper.questionCount === 1 ? "" : "s"}`;
}
