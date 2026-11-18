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

import { SITE, fetchJson, fetchText, putCache, NetError } from "../../lib/net";
import { listEntries, readEntry } from "../../lib/cache";
import { COLLEGE_NAMES } from "./colleges";
import { parseAllPapers, paperBlockCount, type PaperTarget, type ParsedPaper } from "./paper-parse";

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
  /**
   * Lowercased haystack, built once when the manifest is parsed.
   *
   * A keystroke at the data browser would otherwise re-derive three labels per
   * row, thousands of times. Optional because `data.table` builds a throwaway
   * `Dataset` for the download; `searchDatasets` falls back to deriving it.
   */
  search?: string;
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

/**
 * Every spelling a reader might type for one dataset, lowercased once.
 *
 * The college appears by code, official name and the short name a student
 * actually uses ("GEC Sheikhpura"), and the branch by code, full label and
 * short label — so "gec", "105" and "cse" all find it. The semester appears as
 * a bare number and as "sem 3", because that is how the query is phrased but
 * not how the manifest stores it.
 */
export function datasetSearchText(dataset: Dataset): string {
  const college = dataset.college;
  return [
    `batch ${dataset.batch}`,
    `branch ${dataset.branch} ${branchLabel(dataset.branch)} ${shortBranchLabel(dataset.branch)}`,
    `sem ${dataset.sem} semester ${dataset.sem}`,
    `college ${college} ${collegeName(college)} ${shortCollegeName(college)}`,
  ]
    .join(" ")
    .toLowerCase();
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
        const dataset: Dataset = {
          id,
          batch,
          branch,
          sem,
          college,
          url: datasetUrl(batch, college, branch, sem),
        };
        dataset.search = datasetSearchText(dataset);
        out.push(dataset);
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

/** GEC Sheikhpura — the college this project is built around. */
export const HOME_COLLEGE = "157";

/** A profile branch path (`cse`, `mech`, …) → the code the manifest uses. */
const MANIFEST_BRANCH: Record<string, string> = {
  civil: "101",
  mech: "102",
  ee: "103",
  ece: "104",
  cse: "105",
  eee: "110",
};

export function manifestBranch(branch: string): string {
  return MANIFEST_BRANCH[branch.trim().toLowerCase()] ?? "";
}

/**
 * The same order the manifest builds, with one college lifted inside every
 * batch/branch/semester group: the student's own college, else GEC Sheikhpura,
 * then the rest by code. Lifting only the college keeps the groups intact — a
 * list that reordered the whole index by college would scatter the batches.
 */
export function prioritizeCollege(datasets: Dataset[], college: string): Dataset[] {
  const first = college !== "" ? college : HOME_COLLEGE;
  const rank = (code: string) => (code === first ? 0 : code === HOME_COLLEGE ? 1 : 2);
  return [...datasets].sort(
    (left, right) =>
      Number(right.batch) - Number(left.batch) ||
      left.branch.localeCompare(right.branch) ||
      right.sem - left.sem ||
      rank(left.college) - rank(right.college) ||
      left.college.localeCompare(right.college),
  );
}

/** Words that mean "semester" on their own, so `sem 3` narrows to semester 3. */
const SEMESTER_WORDS = new Set(["sem", "semester"]);

export function searchDatasets(datasets: Dataset[], query: string): Dataset[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 0);
  if (words.length === 0) return datasets;

  /*
   * "sem 3" is a semester filter, not a substring hunt: a bare "3" also lives
   * inside batch 23 and college 157, so a search that ignored the word would
   * answer with next year's table. The semester pair is taken out of the token
   * list and compared exactly; every other word still has to appear.
   */
  let wanted: number | null = null;
  const tokens: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (SEMESTER_WORDS.has(word) && index + 1 < words.length && /^\d{1,2}$/.test(words[index + 1])) {
      wanted = Number(words[index + 1]);
      index += 1;
      continue;
    }
    const inline = /^(?:sem|semester)(\d{1,2})$/.exec(word);
    if (inline) {
      wanted = Number(inline[1]);
      continue;
    }
    tokens.push(word);
  }

  return datasets.filter((dataset) => {
    if (wanted !== null && dataset.sem !== wanted) return false;
    const haystack = dataset.search ?? datasetSearchText(dataset);
    return tokens.every((token) => haystack.includes(token));
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
 * One subject page is 0.3–4.5 MB of markup for every paper that subject has
 * ever had; the same page parsed into questions averages 6.2 KB per paper
 * (measured over 88 live papers). That ratio is what makes "all my PYQs,
 * offline" fit in a 5 MB device store: the median course plan is 21 papers,
 * about 130 KB.
 *
 * One cache row per subject, written once per page load:
 *
 *   beu.cache.pyqs.papers.v2.<slug> → "<paper code>-<catalogue id>" → ParsedPaper
 *
 * Bump the version in the key whenever `ParsedPaper` or the id contract
 * changes: an old bundle then stops being read, and the next open rewrites it.
 * v2 dropped v1's page-id keys (`paper-100403-2025`), which no lookup could
 * ever match. (The launch warm-up drops `pyqs.page.*`, the raw-HTML rows 1.x
 * kept, and any surviving v1 bundle.)
 *
 * Reading a paper is therefore one Storage read, with no network and no
 * parsing. A fresh copy is fetched when the row is older than `REFRESH_AFTER`,
 * and an old row is still served if the network fails — a paper from last year
 * does not change.
 */
const PAPER_CACHE_PREFIX = "pyqs.papers.v2.";
const REFRESH_AFTER = 30 * 24 * 60 * 60 * 1000;
/**
 * How long a fresh bundle's *silence* is trusted. Every readable paper on the
 * page is in the bundle, so a miss right after a fetch means the page does not
 * have that paper. An hour stops a catalogue row the site has dropped from
 * re-downloading a few MB on every tap, while still letting a paper published
 * today appear the same day.
 */
const MISS_TRUST = 60 * 60 * 1000;

/** slug → papers, for the session; the Storage row is the durable copy. */
const bundles = new Map<string, Record<string, ParsedPaper>>();
const bundleAt = new Map<string, number>();

export function paperCacheKey(slug: string): string {
  return `${PAPER_CACHE_PREFIX}${slug}`;
}

/**
 * The papers a stored row holds, or null when the row is missing or not ours.
 *
 * `readEntry` (not `getCache`) because the bundle also needs the write time:
 * `getCache` unwraps the row and returns only its value, which made every
 * cold start read a bundle it could not recognise and re-download the page.
 */
function parseBundle(raw: string | null, at: number): { papers: Record<string, ParsedPaper>; at: number } | null {
  if (!raw) return null;
  try {
    const papers = JSON.parse(raw) as Record<string, ParsedPaper>;
    if (!papers || typeof papers !== "object" || Array.isArray(papers)) return null;
    return { papers, at };
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
  const entry = await readEntry(paperCacheKey(slug));
  const stored = entry ? parseBundle(entry.value, entry.at) : null;
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
  // The markup is not kept: one page is a few MB, and the parsed papers that
  // follow average ~6 KB each. One cache row per subject, not a page plus a copy.
  return withRetry(() => fetchText(paperPageUrl(slug), { timeout: 35000 }));
}

/** Fetches one subject page, parses every paper on it and caches the result. */
async function pullSubject(slug: string): Promise<{ count: number; blocks: number }> {
  const html = await fetchSubjectPage(slug);
  const parsed = parseAllPapers(html);
  const blocks = paperBlockCount(html);
  if (parsed.length === 0) return { count: 0, blocks };
  const papers: Record<string, ParsedPaper> = {};
  for (const entry of parsed) papers[entry.id] = entry.paper;
  return { count: await writePapers(slug, papers), blocks };
}

/**
 * One paper out of a bundle. A target with a code uses the exact key; an old
 * link without one falls back to a unique suffix match, never a guess between
 * two codes that both published the same year.
 */
function findPaper(papers: Record<string, ParsedPaper>, target: PaperTarget): ParsedPaper | undefined {
  if (target.code !== "") {
    const exact = papers[`${target.code}-${target.id}`];
    if (exact) return exact;
  }
  const suffix = `-${target.id}`;
  const matches = Object.keys(papers).filter((key) => key.endsWith(suffix));
  return matches.length === 1 ? papers[matches[0]] : undefined;
}

/** The paper the page did not give us, with the reason why. */
function missingPaper(target: PaperTarget, reason: "absent" | "unreadable"): ParsedPaper {
  return {
    found: false,
    reason,
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

/** Fetches and parses one paper out of its subject page. */
export async function loadPaper(slug: string, target: PaperTarget): Promise<ParsedPaper> {
  const cached = await readPapers(slug);
  if (cached) {
    const hit = findPaper(cached.papers, target);
    if (hit) {
      // A bundle older than the refresh window updates itself in the
      // background; the paper on screen is readable immediately either way.
      if (Date.now() - cached.at > REFRESH_AFTER) void pullSubject(slug).catch(() => undefined);
      return hit;
    }
    // The bundle holds every readable paper on the page, so a recent miss is a
    // fact: fetching the same page again cannot change it. Without this, a
    // catalogue row the site has dropped re-downloads a few MB on every tap.
    if (Date.now() - cached.at <= MISS_TRUST) return missingPaper(target, "absent");
  }
  const pulled = await pullSubject(slug);
  const fresh = await readPapers(slug);
  const hit = fresh ? findPaper(fresh.papers, target) : undefined;
  if (hit) return hit;

  // The page loaded but this paper is not on it: the screen says so, and the
  // PDF/site links stay available. A page with blocks and no readable paper is
  // markup drift, not an absent paper, and must not claim the latter.
  return missingPaper(target, pulled.blocks > 0 && pulled.count === 0 ? "unreadable" : "absent");
}

/**
 * Downloads and caches every paper of one subject. Returns the paper count, or
 * 0 when the page has nothing the parser can read.
 */
export async function prefetchSubject(slug: string): Promise<number> {
  try {
    return (await pullSubject(slug)).count;
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
