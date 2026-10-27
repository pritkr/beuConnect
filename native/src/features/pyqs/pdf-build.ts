/**
 * Build-time logic for the PYQ PDF index.
 *
 * `beu_dataset/beu_btech_question_papers.csv` lists 1,394 BEU papers; 299 of
 * them were actually downloaded. This module turns that table plus the files
 * on disk into the two artefacts `scripts/build-pyq-pdfs.mjs` writes:
 *
 *   public/data/pyq-pdfs.json               the site-side index
 *   src/features/pyqs/pdf-catalog.ts        the app's packed copy
 *
 * Nothing here touches the filesystem, so the rules below — which branch a
 * paper belongs to, which duplicated file wins, which year a paper is — are
 * testable in `qa/unit/pyq-pdfs.test.ts` without an app, a network or a disk.
 *
 * Three source quirks drive most of the code:
 *
 *  1. `branch_raw` is the most reliable branch column (it is the branch slug in
 *     the file name), but 54 of the 299 files have no branch at all and 38 say
 *     only "General / Unspecified". The subject code carries the branch in its
 *     first three digits, so that is the fallback.
 *  2. "Common / Legacy" and "First Year / Common" are not branches. Their
 *     papers are shared by every branch, and the app's syllabus has a `common`
 *     shelf for exactly that.
 *  3. Five papers exist twice under two names (the same exam downloaded from
 *     two branch folders). Two rows that read "2019" and open the same paper
 *     are a bug in a list, so the index keeps one.
 */

/** Where the site publishes every file: `public/PYQPDFs/<file>`. */
export const PDF_BASE = "https://beu.prit.eu.org/PYQPDFs/";

/** One PDF, decoded. Mirrors `PdfPaper` in the generated `pdf-catalog.ts`. */
export interface PdfPaper {
  /** The file name on disk, and under `public/PYQPDFs/`. */
  file: string;
  /** The absolute address the file is served from. */
  url: string;
  /** The exam year, e.g. 2019. Never 0 in a built index. */
  year: number;
  /** BEU's code for the paper, e.g. "105301". */
  subjectCode: string;
  /** The site's slug for the subject, e.g. "object-oriented-programming". */
  subjectSlug: string;
  subjectName: string;
  /** A branch code the app already uses: 101…161, "common", "it" or "other". */
  branchKey: string;
  branchName: string;
  /** 1–8; 0 when the source row names no semester. */
  semester: number;
  /** "v2" for a re-exam of the same year, "" for the ordinary paper. */
  variant: string;
}

/** The packed wire form. `pdf-catalog.ts` decodes it; nothing else reads it. */
export interface PdfWire {
  /** Generated-on date, ISO. */
  g: string;
  /** Base address, so a file name is the only path stored. */
  u: string;
  /** [branchKey, branchName] */
  b: [string, string][];
  /** Distinct subject slugs, indexed by the paper rows. */
  s: string[];
  /** Distinct subject names. */
  n: string[];
  /** Distinct variants, "" included. */
  v: string[];
  /** [file, year, subjectCode, slugIndex, nameIndex, branchIndex, semester, variantIndex] */
  p: [string, number, string, number, number, number, number, number][];
}

/**
 * The seven BEU branch codes the app's result data uses, plus the three
 * groupings a paper archive needs. `native/src/features/pyqs/api.ts` owns the
 * numeric names; `common` and `it` match the syllabus catalog's branch keys.
 */
export const BRANCH_NAMES: Record<string, string> = {
  "101": "Civil Engineering",
  "102": "Mechanical Engineering",
  "103": "Electrical Engineering",
  "104": "Electronics & Communication",
  "105": "Computer Science & Engineering",
  "110": "Electrical & Electronics",
  "161": "EEE (Specialization)",
  it: "Information Technology",
  common: "First year / common",
  other: "Other / electives",
};

/** Reading order for the index and the branch rails: codes, then the groupings. */
export const BRANCH_ORDER: string[] = ["101", "102", "103", "104", "105", "110", "161", "it", "common", "other"];

/** Branch slugs used by the source's `branch_raw` column. */
const BRANCH_TOKENS: Record<string, string> = {
  ce: "101",
  civil: "101",
  me: "102",
  mech: "102",
  mechanical: "102",
  ee: "103",
  electrical: "103",
  ece: "104",
  ec: "104",
  cs: "105",
  cse: "105",
  eee: "110",
  it: "it",
};

/**
 * The first three digits of a subject code are the branch that owns it, in both
 * the 2011-era scheme (011 Civil, 021 Mech, 031 EE, 041 ECE, 051 CSE, 061 IT)
 * and today's (100 first year, 101 Civil … 110 EEE, 161 EEE-spec).
 */
const BRANCH_PREFIXES: Record<string, string> = {
  "011": "101",
  "021": "102",
  "031": "103",
  "041": "104",
  "051": "105",
  "061": "it",
  "100": "common",
  "101": "101",
  "102": "102",
  "103": "103",
  "104": "104",
  "105": "105",
  "110": "110",
  "161": "161",
  // First-year common papers carry the subject owner's block, not the branch's.
  "211": "common",
  "213": "common",
  "231": "common",
  "241": "common",
};

/* -------------------------------------------------------------------- text */

/** A CSV cell split on commas, with `"…"` quoting and `""` escapes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let at = 0; at < text.length; at += 1) {
    const character = text[at];
    if (quoted) {
      if (character !== '"') {
        cell += character;
      } else if (text[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") cell += character;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const head = (rows[0] ?? []).map((name) => name.replace(/^\uFEFF/, "").trim());
  return rows
    .slice(1)
    .filter((cells) => cells.some((value) => value.trim() !== ""))
    .map((cells) => {
      const record: Record<string, string> = {};
      head.forEach((name, index) => {
        record[name] = (cells[index] ?? "").trim();
      });
      return record;
    });
}

/** The first four-digit year in `text`, or 0. `"2019"`, `"2019-20"`, `"x 2019"`. */
export function yearOf(text: string): number {
  const match = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(String(text ?? ""));
  return match ? Number(match[1]) : 0;
}

/** The last four-digit year in `text` — a file name ends in the exam year. */
export function lastYearIn(text: string): number {
  const matches = String(text ?? "").match(/(?:19|20)\d{2}/g);
  return matches && matches.length > 0 ? Number(matches[matches.length - 1]) : 0;
}

/** A semester 1–8, or 0 when the source says nothing usable. */
export function semesterOf(text: string): number {
  const value = Math.round(Number(String(text ?? "").trim()));
  return Number.isFinite(value) && value >= 1 && value <= 8 ? value : 0;
}

/** The slug a subject name would have, when the source row has none. */
export function slugOf(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function words(value: string): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 0);
}

/** "Common / Legacy", "first-year-common" — a paper shared by every branch. */
function isShared(value: string): boolean {
  const text = String(value ?? "").toLowerCase();
  return text.includes("common") || text.includes("first-year") || text.includes("first year");
}

/* ------------------------------------------------------------------ branch */

/**
 * The branch a paper belongs to, from the most specific signal available.
 *
 * `branch_raw` names one branch → that branch. It names two (`ee-ece`) → the
 * paper is shared, so `common`. It says "common" or nothing → the subject code
 * decides, and a code we cannot place is `other` rather than a guess.
 */
export function branchKeyOf(record: Record<string, string>): string {
  const raw = new Set<string>();
  for (const word of words(record.branch_raw)) {
    const key = BRANCH_TOKENS[word];
    if (key) raw.add(key);
  }
  if (raw.size === 1) return [...raw][0] as string;
  if (raw.size > 1) return "common";
  if (isShared(record.branch_raw)) return "common";

  const normalized = new Set<string>();
  for (const word of words(record.branch_normalized)) {
    const key = BRANCH_TOKENS[word];
    if (key) normalized.add(key);
  }
  if (normalized.size === 1) return [...normalized][0] as string;
  if (normalized.size > 1) return "common";
  if (isShared(record.branch_normalized)) return "common";

  const code = String(record.subject_code ?? "").trim();
  return BRANCH_PREFIXES[code.slice(0, 3)] ?? "other";
}

/* ------------------------------------------------------------------- build */

/** How two files of the same paper rank: a real branch beats "shared". */
function duplicationRank(paper: PdfPaper): number {
  return paper.branchKey === "common" || paper.branchKey === "other" ? 1 : 0;
}

/** Reading order: branch, semester, subject, newest paper first. */
export function comparePapers(left: PdfPaper, right: PdfPaper): number {
  const branch = BRANCH_ORDER.indexOf(left.branchKey) - BRANCH_ORDER.indexOf(right.branchKey);
  if (branch !== 0) return branch;
  if (left.semester !== right.semester) return left.semester - right.semester;
  const code = left.subjectCode.localeCompare(right.subjectCode);
  if (code !== 0) return code;
  if (left.year !== right.year) return right.year - left.year;
  const variant = left.variant.localeCompare(right.variant);
  if (variant !== 0) return variant;
  return left.file.localeCompare(right.file);
}

/** One row per real paper: the same code, year and variant appears only once. */
export function dedupePapers(papers: PdfPaper[]): PdfPaper[] {
  const ordered = papers
    .slice()
    .sort((left, right) => duplicationRank(left) - duplicationRank(right) || left.file.localeCompare(right.file));
  const seen = new Set<string>();
  const kept: PdfPaper[] = [];
  for (const paper of ordered) {
    const key = `${paper.subjectCode}|${paper.year}|${paper.variant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(paper);
  }
  return kept;
}

/**
 * The index, from the CSV rows and the files that exist.
 *
 * `files` is the set of names under `public/PYQPDFs` — a row whose PDF was
 * never downloaded is skipped rather than listed with a dead link, and a file
 * with no row cannot be described, so both halves of the join are required.
 */
export function buildPapers(records: Record<string, string>[], files: Iterable<string>): PdfPaper[] {
  const present = files instanceof Set ? (files as Set<string>) : new Set(files);
  const candidates: PdfPaper[] = [];

  for (const record of records) {
    const file = String(record.filename ?? "").trim();
    if (file === "" || !present.has(file)) continue;

    const subjectCode = String(record.subject_code ?? "").trim();
    const year = yearOf(record.exam_year) || lastYearIn(file);
    if (subjectCode === "" || year === 0) continue;

    const branchKey = branchKeyOf(record);
    const subjectName = String(record.subject_name ?? "").trim() || subjectCode;
    candidates.push({
      file,
      url: `${PDF_BASE}${encodeURIComponent(file)}`,
      year,
      subjectCode,
      subjectSlug: String(record.subject_slug ?? "").trim() || slugOf(subjectName),
      subjectName,
      branchKey,
      branchName: BRANCH_NAMES[branchKey] ?? branchKey,
      semester: semesterOf(record.semester),
      variant: String(record.variant_tag ?? "").trim().toLowerCase(),
    });
  }

  return dedupePapers(candidates).sort(comparePapers);
}

/** Distinct values in first-seen order, with a lookup into the list. */
function dictionary(values: string[]): { list: string[]; index: (value: string) => number } {
  const list: string[] = [];
  const at = new Map<string, number>();
  for (const value of values) {
    if (at.has(value)) continue;
    at.set(value, list.length);
    list.push(value);
  }
  return { list, index: (value: string) => at.get(value) ?? 0 };
}

/** Packs the index for the app: repeated names become one dictionary entry. */
export function packPapers(papers: PdfPaper[], generated: string): PdfWire {
  const branches = dictionary(papers.map((paper) => paper.branchKey));
  const slugs = dictionary(papers.map((paper) => paper.subjectSlug));
  const names = dictionary(papers.map((paper) => paper.subjectName));
  const variants = dictionary(papers.map((paper) => paper.variant));
  const branchNames = branches.list.map((key) => {
    const found = papers.find((paper) => paper.branchKey === key);
    return [key, found?.branchName ?? BRANCH_NAMES[key] ?? key] as [string, string];
  });

  return {
    g: generated,
    u: PDF_BASE,
    b: branchNames,
    s: slugs.list,
    n: names.list,
    v: variants.list,
    p: papers.map((paper) => [
      paper.file,
      paper.year,
      paper.subjectCode,
      slugs.index(paper.subjectSlug),
      names.index(paper.subjectName),
      branches.index(paper.branchKey),
      paper.semester,
      variants.index(paper.variant),
    ]),
  };
}
