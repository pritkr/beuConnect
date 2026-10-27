/**
 * Results area — the data layer.
 *
 * Three upstream shapes are folded into one native model:
 *
 *  1. `/api/result?format=json` — the live BEU lookup. Slow, occasionally 502;
 *     every call is retried once and then falls back to the last good copy.
 *  2. `/data/students_{batch}_all_{branch}_sem{n}.csv` — the published branch
 *     roster used by the result table, rank and merit list.
 *  3. `/data/wide_{batch}_{college}_{branch}_sem{n}.csv` — the same roster with
 *     per-paper ESE / IA / total / grade, eighth-semester history, the state
 *     rank and the college rank. This is what keeps a result readable when the
 *     university server is down.
 *
 * Everything here is dependency-free, strict, and safe to call offline: the
 * helpers in `lib/net` serve the last cached copy when a request fails.
 */

import { NetError, SITE, fetchJson, fetchText, getCache, putCache, readStore, writeStore } from "../../lib/net";
import { collegeName } from "./colleges";
import type { ParsedResult } from "./parse-html";

/* ------------------------------------------------------------------ shapes */

export interface BranchDef {
  code: string;
  name: string;
  short: string;
}

export type ResultSource = "live" | "cache" | "csv";

export interface ResultSubject {
  code: string;
  name: string;
  kind: "theory" | "practical";
  ese: string;
  ia: string;
  total: string;
  grade: string;
  credit: string;
}

export interface ResultData {
  reg: string;
  name: string;
  fatherName: string;
  motherName: string;
  collegeCode: string;
  collegeName: string;
  branchCode: string;
  branchName: string;
  semester: number;
  examYear: string;
  examHeld: string;
  course: string;
  sgpa: number | null;
  cgpa: number | null;
  /** SGPA of all eight semesters, `null` where BEU has published nothing. */
  history: (number | null)[];
  subjects: ResultSubject[];
  status: "PASS" | "FAIL" | "";
  failed: string[];
  credits: number | null;
  stateRank: number | null;
  collegeRank: number | null;
  source: ResultSource;
  /** When this copy was fetched (ms), or when the cached copy was saved. */
  savedAt: number;
}

export interface RankRow {
  reg: string;
  name: string;
  sgpa: number | null;
  cgpa: number | null;
  sgpaText: string;
  cgpaText: string;
  collegeCode: string;
  collegeName: string;
  /** Rank by CGPA across every college of the branch. */
  rank: number | null;
  /** Rank by CGPA inside the student's own college. */
  collegeRank: number | null;
}

export interface RegInfo {
  /** As typed, trimmed and upper-cased: `21101107003`. */
  reg: string;
  /** Digits only. */
  numeric: string;
  batch: string;
  branch: string;
  college: string;
  lateral: boolean;
}

export interface RankReport {
  student: RankRow;
  /** Students with a CGPA in the branch roster. */
  branchTotal: number;
  /** Students with a CGPA in the student's college, from the same roster. */
  collegeTotal: number;
  /** Official BEU state rank, when the wide CSV carries one. */
  stateRank: number | null;
  /** Percentile inside the branch: 100 is the top of the list. */
  percentile: number;
  result: ResultData | null;
}

export interface BattleSide {
  reg: string;
  data: ResultData;
}

export interface BattleLine {
  code: string;
  label: string;
  a: string;
  b: string;
  aValue: number | null;
  bValue: number | null;
  outcome: "a" | "b" | "tie" | "none";
}

export interface BattleReport {
  a: BattleSide;
  b: BattleSide;
  lines: BattleLine[];
  wins: { a: number; b: number; tie: number };
  verdict: "a" | "b" | "tie";
  headline: string;
}

/* --------------------------------------------------------------- constants */

export const BRANCHES: BranchDef[] = [
  { code: "101", name: "Civil Engineering", short: "Civil" },
  { code: "102", name: "Mechanical Engineering", short: "Mechanical" },
  { code: "103", name: "Electrical Engineering", short: "Electrical" },
  { code: "104", name: "Electronics & Communication Engineering", short: "ECE" },
  { code: "105", name: "Computer Science & Engineering", short: "CSE" },
  { code: "110", name: "Electrical & Electronics Engineering", short: "EEE" },
  { code: "161", name: "Electrical & Electronics Engineering (161)", short: "EEE" },
];

/**
 * Which (batch, branch) tables BEU has published, per semester. Mirrors the
 * `students_{batch}_all_{branch}_sem{n}.csv` files on the site, so the app can
 * offer only combinations that exist instead of fetching 404s.
 */
const COVERAGE: Record<string, Record<string, number[]>> = {
  "21": {
    "101": [1, 2, 3, 4, 5, 6, 7, 8],
    "102": [1, 2, 3, 4, 5, 6, 7, 8],
    "103": [1, 2, 3, 4, 5, 6, 7, 8],
    "104": [1, 2, 3, 4, 5, 6, 7, 8],
    "105": [1, 8],
    "110": [8],
  },
  "22": {
    "101": [1, 2, 3, 4, 5, 6],
    "102": [1, 2, 3, 4, 5, 6],
    "103": [1, 2, 3, 4, 5, 6],
    "104": [1, 2, 3, 4, 5, 6],
    "105": [1, 2, 3, 4, 5, 6],
    "110": [5, 6],
  },
  "23": {
    "101": [1, 2, 3, 4],
    "102": [1, 2, 3, 4],
    "103": [1, 2, 3, 4],
    "104": [1, 2, 3, 4],
    "105": [1, 2, 3, 4],
    "110": [3, 4],
  },
  "24": {
    "101": [1, 2],
    "102": [1, 2],
    "103": [1, 2],
    "104": [1, 2],
    "105": [1, 2],
    "110": [1, 2],
  },
  "25": { "101": [1], "102": [1], "103": [1], "104": [1], "105": [1], "161": [1] },
};

export const SEMESTERS: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Batches newest first: `["25", "24", …]`. */
export function batches(): string[] {
  return Object.keys(COVERAGE).sort((a, b) => Number(b) - Number(a));
}

/** Branches that have any table for `batch`. */
export function branchesFor(batch: string): BranchDef[] {
  const map = COVERAGE[batch];
  if (!map) return [];
  return BRANCHES.filter((branch) => Array.isArray(map[branch.code]));
}

/** Semesters published for one batch + branch. */
export function semsFor(batch: string, branch: string): number[] {
  return COVERAGE[batch]?.[branch] ?? [];
}

export function hasCoverage(batch: string, branch: string, sem: number): boolean {
  return semsFor(batch, branch).indexOf(sem) >= 0;
}

/**
 * The semester a batch is sitting in today.
 *
 * BEU runs two semesters a year — the odd one from July, the even one from
 * January — so a batch's first semester begins in the July of its admission
 * year. The 2024 batch is the exception: those admissions ran late and their
 * first semester began in January 2025. Counting sessions from that start is
 * what a student is actually attending, which the roster cannot say: the roster
 * only knows what has already been *published*, and publication lags the class.
 *
 * Today (October 2026) that gives:
 *
 *   26 batch → Sem 1    25 → Sem 3    24 → Sem 4    23 → Sem 7
 *
 * Lateral-entry students (registration serial ≥ 900) join in the third
 * semester, so they sit two behind their batch.
 */
export function currentSemester(batch: string, lateral = false, at: Date = new Date()): number {
  const short = Number.parseInt(batch, 10);
  if (!Number.isFinite(short)) return 1;
  const year = short < 100 ? 2000 + short : short;

  // A session is identified by its year and half: July is the odd semester,
  // January the even one. January 2025 → 4050, July 2026 → 4053.
  const session = (when: Date): number => when.getFullYear() * 2 + (when.getMonth() >= 6 ? 1 : 0);
  const first = year === 2024 ? (year + 1) * 2 : year * 2 + 1;

  const attended = session(at) - first + 1;
  const semester = lateral ? attended - 2 : attended;
  return Math.min(8, Math.max(1, semester));
}

export function branchName(code: string): string {
  const found = BRANCHES.find((branch) => branch.code === code);
  return found ? found.name : code ? `Branch ${code}` : "";
}

export function branchShort(code: string): string {
  const found = BRANCHES.find((branch) => branch.code === code);
  return found ? found.short : code;
}

/* --------------------------------------------------------------- utilities */

const PAUSE = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Strips a score of its decorations: `"8.67"`, `" 9.1 "`, `"A+"`, `"N/A"`. */
export function score(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim();
  if (!text || text === "-" || text === "N/A" || text.toUpperCase() === "NULL" || text.toUpperCase() === "NA") return null;
  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function fixed(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** Reads a BEU registration number: batch, branch and college live in it. */
export function parseReg(raw: string): RegInfo | null {
  const reg = raw.trim().toUpperCase().replace(/\s+/g, "");
  const numeric = reg.replace(/\D/g, "");
  if (numeric.length < 8) return null;
  const serial = numeric.slice(8);
  const serialValue = serial ? Number.parseInt(serial, 10) : 0;
  return {
    reg,
    numeric,
    batch: numeric.slice(0, 2),
    branch: numeric.slice(2, 5),
    college: numeric.slice(5, 8),
    lateral: Number.isFinite(serialValue) && serialValue >= 900,
  };
}

/** A registration number as digits only, for comparisons. */
export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Splits a CSV document into rows, honouring quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.length > 1 || (row[0] ?? "").trim() !== "") rows.push(row);
  return rows;
}

/** CSV rows as records keyed by the (trimmed) header row. */
export function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

/** Reads the first of several possible column names, case-insensitively. */
function pick(record: Record<string, string>, names: string[]): string {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
    const lower = name.toLowerCase();
    const match = Object.keys(record).find((key) => key.toLowerCase() === lower);
    if (match !== undefined) return record[match];
  }
  return "";
}

/* ------------------------------------------------------------------- http */

async function getText(url: string, cacheKey: string, timeout = 20000): Promise<string> {
  let lastError: unknown = new NetError("Network request failed");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // `cacheMaxAge: 0` keeps the cached copy forever, which is what makes the
      // tables readable on a dead connection.
      return await fetchText(url, { cacheKey, cacheMaxAge: 0, timeout });
    } catch (error) {
      lastError = error;
      if (error instanceof NetError && (error.status === 404 || error.status === 400)) throw error;
      if (attempt === 0) await PAUSE(800);
    }
  }
  throw lastError instanceof Error ? lastError : new NetError("Network request failed");
}

function rosterUrl(batch: string, branch: string, sem: number): string {
  return `${SITE}/data/students_${batch}_all_${branch}_sem${sem}.csv`;
}

function wideUrl(batch: string, college: string, branch: string, sem: number): string {
  return `${SITE}/data/wide_${batch}_${college}_${branch}_sem${sem}.csv`;
}

function resultUrl(reg: string, sem: number): string {
  return `${SITE}/api/result?reg=${encodeURIComponent(reg)}&sem=${sem}&format=json`;
}

/* ------------------------------------------------------------- rank maths */

export function sortByCgpa(rows: RankRow[]): RankRow[] {
  return rows.slice().sort((a, b) => {
    if (a.cgpa === null && b.cgpa === null) return a.reg.localeCompare(b.reg);
    if (a.cgpa === null) return 1;
    if (b.cgpa === null) return -1;
    if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa;
    if (a.sgpa === null && b.sgpa === null) return a.reg.localeCompare(b.reg);
    if (a.sgpa === null) return 1;
    if (b.sgpa === null) return -1;
    if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
    return a.reg.localeCompare(b.reg);
  });
}

/** Competition ranking on a sorted list: ties share a rank, then it skips. */
function assignRanks(rows: RankRow[], key: "rank" | "collegeRank"): void {
  let rank = 0;
  let seen = 0;
  let previous: number | null = null;
  for (const row of rows) {
    if (row.cgpa === null) {
      row[key] = null;
      continue;
    }
    seen += 1;
    if (previous === null || Math.abs(row.cgpa - previous) > 1e-9) {
      rank = seen;
      previous = row.cgpa;
    }
    row[key] = rank;
  }
}

export function ranked(rows: RankRow[]): RankRow[] {
  const sorted = sortByCgpa(rows);
  assignRanks(sorted, "rank");
  const buckets = new Map<string, RankRow[]>();
  for (const row of sorted) {
    const bucket = buckets.get(row.collegeCode);
    if (bucket) bucket.push(row);
    else buckets.set(row.collegeCode, [row]);
  }
  for (const bucket of buckets.values()) assignRanks(bucket, "collegeRank");
  return sorted;
}

/* ------------------------------------------------------------- live result */

interface PayloadSubject {
  code?: string;
  name?: string;
  ese?: string;
  ia?: string;
  total?: string;
  grade?: string;
  credit?: string;
}

export interface ResultPayload {
  examYear?: string;
  exam_held?: string;
  semester?: string;
  redg_no?: string;
  name?: string;
  father_name?: string;
  mother_name?: string;
  college_code?: string;
  college_name?: string;
  course_code?: string;
  course?: string;
  theorySubjects?: PayloadSubject[];
  practicalSubjects?: PayloadSubject[];
  sgpa?: (string | null)[];
  cgpa?: string;
  fail_any?: string;
  failed_subjects?: (string | { code?: string; name?: string })[];
  backlog_subjects?: (string | { code?: string; name?: string })[];
}

interface PayloadEnvelope {
  status?: number;
  message?: string;
  data?: ResultPayload;
}

interface CacheEnvelope {
  at: number;
  data: ResultData;
}

function toSubject(subject: PayloadSubject, kind: "theory" | "practical"): ResultSubject {
  return {
    code: (subject.code ?? "").trim(),
    name: (subject.name ?? "").trim(),
    kind,
    ese: (subject.ese ?? "").trim(),
    ia: (subject.ia ?? "").trim(),
    total: (subject.total ?? "").trim(),
    grade: (subject.grade ?? "").trim(),
    credit: (subject.credit ?? "").trim(),
  };
}

function failedNames(payload: ResultPayload): string[] {
  const list = payload.failed_subjects ?? payload.backlog_subjects ?? [];
  return list.map((entry) => {
    if (typeof entry === "string") return entry.trim();
    return (entry.name ?? entry.code ?? "").trim();
  }).filter((name) => name !== "");
}

function creditsOf(subjects: ResultSubject[]): number | null {
  let total = 0;
  let counted = 0;
  for (const subject of subjects) {
    const credit = score(subject.credit);
    if (credit !== null && credit > 0) {
      total += credit;
      counted += 1;
    }
  }
  return counted === 0 ? null : Math.round(total * 100) / 100;
}

function blankHistory(): (number | null)[] {
  return [null, null, null, null, null, null, null, null];
}

function fromPayload(info: RegInfo, sem: number, payload: ResultPayload): ResultData {
  const subjects = [
    ...(payload.theorySubjects ?? []).map((subject) => toSubject(subject, "theory")),
    ...(payload.practicalSubjects ?? []).map((subject) => toSubject(subject, "practical")),
  ].filter((subject) => subject.name !== "" || subject.code !== "");

  const history = blankHistory();
  (payload.sgpa ?? []).slice(0, 8).forEach((value, index) => {
    history[index] = score(value);
  });

  const failed = failedNames(payload);
  const remarks = (payload.fail_any ?? "").toUpperCase();
  const status: ResultData["status"] =
    failed.length > 0 || remarks.indexOf("FAIL") >= 0
      ? "FAIL"
      : remarks.indexOf("PASS") >= 0 || subjects.length > 0
        ? "PASS"
        : "";

  const collegeCode = (payload.college_code ?? "").trim() || info.college;
  const sgpaNow = score(payload.sgpa?.[sem - 1] ?? "") ?? history[sem - 1];

  return {
    reg: (payload.redg_no ?? "").trim() || info.reg,
    name: (payload.name ?? "").trim(),
    fatherName: (payload.father_name ?? "").trim(),
    motherName: (payload.mother_name ?? "").trim(),
    collegeCode,
    collegeName: (payload.college_name ?? "").trim() || collegeName(collegeCode),
    branchCode: info.branch,
    branchName: branchName(info.branch),
    semester: sem,
    examYear: (payload.examYear ?? "").trim(),
    examHeld: (payload.exam_held ?? "").trim(),
    course: (payload.course ?? "").trim(),
    sgpa: sgpaNow,
    cgpa: score(payload.cgpa),
    history,
    subjects,
    status,
    failed,
    credits: creditsOf(subjects),
    stateRank: null,
    collegeRank: null,
    source: "live",
    savedAt: Date.now(),
  };
}

async function fetchLive(reg: string, sem: number): Promise<ResultPayload> {
  const envelope = await fetchJson<PayloadEnvelope>(resultUrl(reg, sem), { timeout: 12000 });
  if (envelope.status === 200 && envelope.data) return envelope.data;
  throw new NetError(
    envelope.message || "BEU did not return a result for that semester.",
    typeof envelope.status === "number" ? envelope.status : 0,
  );
}

/* ---------------------------------------------------------- wide CSV shape */

export interface WideRow {
  reg: string;
  name: string;
  fatherName: string;
  motherName: string;
  collegeCode: string;
  branch: string;
  semester: string;
  examYear: string;
  examHeld: string;
  history: (number | null)[];
  cgpa: number | null;
  failAny: string;
  stateRank: number | null;
  collegeRank: number | null;
  subjects: ResultSubject[];
}

/** Turns one wide-CSV record into `WideRow`, reading `<code>_ESE` triples. */
export function wideFromRecord(record: Record<string, string>): WideRow {
  const history = blankHistory();
  const rawHistory = pick(record, ["SGPA_History"]);
  if (rawHistory) {
    rawHistory.split("|").slice(0, 8).forEach((value, index) => {
      history[index] = score(value);
    });
  }

  const codes: string[] = [];
  for (const key of Object.keys(record)) {
    if (!key.endsWith("_ESE")) continue;
    const code = key.slice(0, -4);
    if (code && codes.indexOf(code) < 0) codes.push(code);
  }

  const subjects: ResultSubject[] = codes.map((code) => ({
    code,
    name: "",
    kind: code.endsWith("P") ? "practical" : "theory",
    ese: pick(record, [`${code}_ESE`]),
    ia: pick(record, [`${code}_IA`]),
    total: pick(record, [`${code}_Total`]),
    grade: pick(record, [`${code}_Grade`]),
    credit: "",
  }));

  return {
    reg: pick(record, ["RegNo", "RegistrationNo", "Reg No"]),
    name: pick(record, ["Name", "StudentName"]),
    fatherName: pick(record, ["FatherName", "Father Name"]),
    motherName: pick(record, ["MotherName", "Mother Name"]),
    collegeCode: pick(record, ["CollegeCode", "College Code"]),
    branch: pick(record, ["Branch"]),
    semester: pick(record, ["Semester"]),
    examYear: pick(record, ["ExamYear", "Exam Year"]),
    examHeld: pick(record, ["ExamHeld", "Exam Held"]),
    history,
    cgpa: score(pick(record, ["CGPA", "Cur. CGPA", "Current CGPA"])),
    failAny: pick(record, ["FailAny", "Fail Any"]).toUpperCase(),
    stateRank: score(pick(record, ["StateRank", "State Rank"])),
    collegeRank: score(pick(record, ["CollegeRank", "College Rank"])),
    subjects,
  };
}

async function loadWide(batch: string, college: string, branch: string, sem: number): Promise<WideRow[]> {
  const text = await getText(
    wideUrl(batch, college, branch, sem),
    `wide:${batch}:${college}:${branch}:${sem}`,
    20000,
  );
  return csvRecords(text).map(wideFromRecord).filter((row) => row.reg !== "");
}

function fromWide(info: RegInfo, sem: number, wide: WideRow): ResultData {
  const sgpa = wide.history[sem - 1];
  return {
    reg: wide.reg || info.reg,
    name: wide.name,
    fatherName: wide.fatherName,
    motherName: wide.motherName,
    collegeCode: wide.collegeCode || info.college,
    collegeName: collegeName(wide.collegeCode || info.college),
    branchCode: wide.branch || info.branch,
    branchName: branchName(wide.branch || info.branch),
    semester: sem,
    examYear: wide.examYear,
    examHeld: wide.examHeld,
    course: wide.branch ? `B.Tech · ${branchShort(wide.branch)}` : "B.Tech",
    sgpa,
    cgpa: wide.cgpa,
    history: wide.history,
    subjects: wide.subjects,
    status: wide.failAny === "FAIL" ? "FAIL" : wide.failAny === "PASS" ? "PASS" : "",
    failed: wide.subjects
      .filter((subject) => subject.grade.toUpperCase() === "F")
      .map((subject) => subject.code),
    credits: creditsOf(wide.subjects),
    stateRank: wide.stateRank,
    collegeRank: wide.collegeRank,
    source: "csv",
    savedAt: Date.now(),
  };
}

/* -------------------------------------------------------------- roster load */

export async function loadRoster(batch: string, branch: string, sem: number): Promise<RankRow[]> {
  if (!hasCoverage(batch, branch, sem)) {
    throw new NetError(`BEU has not published the ${branchShort(branch)} table for semester ${sem}.`, 404);
  }
  const text = await getText(rosterUrl(batch, branch, sem), `roster:${batch}:${branch}:${sem}`, 20000);
  const rows = csvRecords(text).map((record) => {
    const cgpaText = pick(record, ["Cur. CGPA", "Cur.CGPA", "Current CGPA", "CGPA"]);
    const sgpaText = pick(record, ["SGPA", "Sgpa"]);
    return {
      reg: pick(record, ["RegNo", "RegistrationNo", "Registration No", "Reg No"]),
      name: pick(record, ["Name", "StudentName", "Student Name"]),
      sgpa: score(sgpaText),
      cgpa: score(cgpaText),
      sgpaText: sgpaText || "—",
      cgpaText: cgpaText || "—",
      collegeCode: pick(record, ["CollegeCode", "College Code"]),
      collegeName: pick(record, ["CollegeName", "College Name"]) || "",
      rank: null,
      collegeRank: null,
    } satisfies RankRow;
  }).filter((row) => row.reg !== "" && row.name !== "");

  return ranked(
    rows.map((row) => ({
      ...row,
      collegeName: row.collegeName || collegeName(row.collegeCode),
    })),
  );
}

export async function loadRosterRow(batch: string, branch: string, sem: number, reg: string): Promise<RankRow | null> {
  const rows = await loadRoster(batch, branch, sem);
  const numeric = digits(reg);
  return rows.find((row) => digits(row.reg) === numeric) ?? null;
}

/* ------------------------------------------------------------ result lookup */

const resultKey = (reg: string, sem: number) => `result:${digits(reg)}:${sem}`;

/**
 * BEU publishes names in capitals. Title-case only a name that is entirely
 * uppercase, so "Md. Aftab Alam" and "D'Souza" keep the casing they were given.
 */
export function displayName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  if (clean === "" || clean !== clean.toUpperCase()) return clean;
  return clean
    .toLowerCase()
    .split(" ")
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Mirrors the name-bearing part of a result into the identity cache, the one
 * Home reads. `identity.ts` owns the reader; the writer lives here so that every
 * path which produces a result — live, cached, roster table, captcha portal —
 * updates Home in the same line it updates Results.
 */
async function rememberIdentity(data: ResultData): Promise<void> {
  if (data.name.trim() === "") return;
  try {
    await putCache(
      `identity:${digits(data.reg)}`,
      JSON.stringify({
        reg: digits(data.reg),
        name: displayName(data.name),
        cgpa: data.cgpa,
        sgpa: data.sgpa,
        branchCode: data.branchCode,
        branchName: data.branchName,
        collegeCode: data.collegeCode,
        collegeName: data.collegeName,
        semester: data.semester,
        source: "result",
        at: data.savedAt,
      }),
    );
  } catch {
    /* best effort: Home falls back to the roster */
  }
}

/**
 * The one entry point for "show me my result": a fresh saved copy, then the live
 * API, then the last saved copy, then the published wide table. Throws only when
 * all of them fail.
 *
 * A result for a finished semester cannot change, so a copy saved in the last ten
 * minutes is served without touching the network at all — repeat lookups are
 * instant, and the server being down cannot make a screen that already worked
 * start failing.
 */
export async function loadResult(rawReg: string, sem: number): Promise<ResultData> {
  const info = parseReg(rawReg);
  if (!info) throw new NetError("That registration number is too short. BEU numbers have at least 8 digits.", 400);

  const fresh = await getCache(resultKey(info.reg, sem), 10 * 60 * 1000);
  if (fresh) {
    try {
      const envelope = JSON.parse(fresh) as CacheEnvelope;
      if (envelope && envelope.data) return { ...envelope.data, source: "cache", savedAt: envelope.at };
    } catch {
      /* corrupt cache: a live fetch below will replace it */
    }
  }

  let live: ResultPayload | null = null;
  let failure: unknown = null;

  for (let attempt = 0; attempt < 2 && live === null; attempt += 1) {
    try {
      live = await fetchLive(info.reg, sem);
    } catch (error) {
      failure = error;
      // A 4xx/5xx is deterministic: retrying it only makes the student wait.
      if (error instanceof NetError && error.status !== 0) break;
      if (attempt === 0) await PAUSE(900);
    }
  }

  if (live) {
    const data = fromPayload(info, sem, live);
    await putCache(resultKey(info.reg, sem), JSON.stringify({ at: data.savedAt, data } satisfies CacheEnvelope));
    await rememberIdentity(data);
    return data;
  }

  const cached = await getCache(resultKey(info.reg, sem), 0);
  if (cached) {
    try {
      const envelope = JSON.parse(cached) as CacheEnvelope;
      if (envelope && envelope.data) {
        const restored = { ...envelope.data, source: "cache" as const, savedAt: envelope.at };
        await rememberIdentity(restored);
        return restored;
      }
    } catch {
      /* corrupt cache: fall through to the published table */
    }
  }

  try {
    const rows = await loadWide(info.batch, info.college, info.branch, sem);
    const numeric = digits(info.reg);
    const wide = rows.find((row) => digits(row.reg) === numeric);
    if (wide) {
      const data = fromWide(info, sem, wide);
      await putCache(resultKey(info.reg, sem), JSON.stringify({ at: data.savedAt, data } satisfies CacheEnvelope));
      await rememberIdentity(data);
      return data;
    }
  } catch {
    /* not published for that college: keep the original failure below */
  }

  throw explain(failure);
}

/**
 * Turns whatever the network threw into something a student can act on. The
 * upstream answer today is a 502/530 from BEU's own gateway, which is not a
 * failure the student caused and not one a retry fixes.
 */
function explain(failure: unknown): Error {
  if (failure instanceof NetError) {
    if (failure.status >= 500) {
      return new NetError(
        `BEU's result server is answering with an error (${failure.status}). The fast path is down; the captcha portal still works.`,
        failure.status,
      );
    }
    return failure;
  }
  if (failure instanceof Error) return failure;
  return new NetError("No result found for that registration number and semester.", 404);
}

/** Whether a saved copy exists for this reg + semester. */
export async function savedCopy(reg: string, sem: number): Promise<number | null> {
  const cached = await getCache(resultKey(reg, sem), 0);
  if (!cached) return null;
  try {
    const envelope = JSON.parse(cached) as CacheEnvelope;
    return typeof envelope.at === "number" ? envelope.at : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- portal capture */

/** Envelope keys BEU (and its Angular client) have used around the payload. */
const ENVELOPE_KEYS = ["data", "result", "results", "payload", "response", "body"] as const;

/**
 * A result record always carries at least one of these; an error body
 * (`{status, message}`) carries none. The marker set is what the server has
 * actually sent over the years, across every envelope shape.
 */
const PAYLOAD_MARKERS = [
  "redg_no",
  "name",
  "semester",
  "theorySubjects",
  "practicalSubjects",
  "sgpa",
  "cgpa",
] as const;

function looksLikePayload(record: Record<string, unknown>): boolean {
  return PAYLOAD_MARKERS.some((key) => {
    const value = record[key];
    return value !== undefined && value !== null && value !== "";
  });
}

/**
 * The BEU portal answers with `{status, data}`, a proxy may wrap that again, and
 * some deployments answer with the payload itself. Depth is bounded and cycles are
 * impossible (JSON), so a short walk finds the payload in every shape we have seen
 * and rejects an error body rather than caching a blank result.
 */
export function payloadFrom(input: unknown): ResultPayload | null {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;

  const walk = (node: unknown, depth: number): ResultPayload | null => {
    if (!node || typeof node !== "object" || depth > 4) return null;
    const record = node as Record<string, unknown>;
    if (looksLikePayload(record)) return record as ResultPayload;
    for (const key of ENVELOPE_KEYS) {
      const hit = walk(record[key], depth + 1);
      if (hit) return hit;
    }
    if (Array.isArray(node)) {
      for (const entry of node) {
        const hit = walk(entry, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };

  return walk(value, 0);
}

/**
 * Saves a result captured from the InAppBrowser portal (the captcha route), under
 * the same key the live path uses, so every other screen — rank, battle, recents —
 * sees it exactly like a normal fetch.
 */
export async function captureResult(rawReg: string, sem: number, payload: ResultPayload): Promise<ResultData> {
  const info = parseReg(rawReg);
  if (!info) throw new NetError("That registration number is too short. BEU numbers have at least 8 digits.", 400);
  const data = fromPayload(info, sem, payload);
  await putCache(resultKey(info.reg, sem), JSON.stringify({ at: data.savedAt, data } satisfies CacheEnvelope));
  await rememberIdentity(data);
  return data;
}

/**
 * Saves a result read out of the BEU result page itself (`results.web`), where
 * the student solved the captcha. The page is the source, so the copy is marked
 * live; everything the page did not state is filled from the registration
 * number, which encodes the batch, branch and college.
 */
export async function saveParsedResult(parsed: ParsedResult, typedReg = ""): Promise<ResultData> {
  const info = parseReg(parsed.reg || typedReg);
  const semester = Math.min(8, Math.max(1, parsed.semester));
  const history = blankHistory();
  // The page prints every semester it knows; this result's own column wins.
  parsed.history.forEach((value, index) => {
    if (value !== null) history[index] = value;
  });
  if (parsed.sgpa !== null) history[semester - 1] = parsed.sgpa;
  const collegeCode = parsed.collegeCode || info?.college || "";

  const data: ResultData = {
    reg: parsed.reg || info?.reg || typedReg,
    name: displayName(parsed.name),
    fatherName: displayName(parsed.fatherName),
    motherName: displayName(parsed.motherName),
    collegeCode,
    collegeName: parsed.collegeName || collegeName(collegeCode),
    branchCode: info?.branch ?? "",
    branchName: branchName(info?.branch ?? ""),
    semester,
    examYear: parsed.examYear,
    examHeld: parsed.examHeld,
    course: parsed.course,
    sgpa: parsed.sgpa,
    cgpa: parsed.cgpa,
    history,
    subjects: parsed.subjects,
    status: parsed.status,
    failed: parsed.failed,
    credits: parsed.credits,
    stateRank: null,
    collegeRank: null,
    source: "live",
    savedAt: Date.now(),
  };

  await putCache(resultKey(data.reg, semester), JSON.stringify({ at: data.savedAt, data } satisfies CacheEnvelope));
  await rememberIdentity(data);
  return data;
}

/* ------------------------------------------------------------------- rank */

export async function loadRank(rawReg: string, sem: number): Promise<RankReport> {
  const info = parseReg(rawReg);
  if (!info) throw new NetError("That registration number is too short. BEU numbers have at least 8 digits.", 400);

  const roster = await loadRoster(info.batch, info.branch, sem);
  const numeric = digits(info.reg);
  const student = roster.find((row) => digits(row.reg) === numeric);

  if (!student) {
    throw new NetError(
      `This registration number is not in the ${branchShort(info.branch)} semester ${sem} table. Try another semester.`,
      404,
    );
  }

  const branchTotal = roster.filter((row) => row.cgpa !== null).length;
  const own = roster.filter((row) => row.collegeCode === student.collegeCode && row.cgpa !== null);
  const collegeTotal = own.length;
  const rank = student.rank ?? 0;
  const percentile = branchTotal <= 1 || rank <= 0 ? 100 : Math.round(((branchTotal - rank) / (branchTotal - 1)) * 1000) / 10;

  let result: ResultData | null = null;
  try {
    result = await loadResult(info.reg, sem);
  } catch {
    result = null;
  }

  return {
    student,
    branchTotal,
    collegeTotal,
    stateRank: result?.stateRank ?? null,
    percentile,
    result,
  };
}

/* ------------------------------------------------------------------ merit */

export async function loadMerit(options: {
  batch: string;
  branch: string;
  sem: number;
  college?: string;
  limit?: number;
}): Promise<RankRow[]> {
  const rows = await loadRoster(options.batch, options.branch, options.sem);
  const filtered = options.college ? rows.filter((row) => row.collegeCode === options.college) : rows;
  const rankable = filtered.filter((row) => row.cgpa !== null);
  const limit = options.limit ?? 200;
  return rankable.slice(0, limit);
}

/* ----------------------------------------------------------------- battle */

function subjectLabel(subject: ResultSubject | undefined, code: string): string {
  if (subject && subject.name) return subject.name;
  return code ? `Paper ${code}` : "Paper";
}

function compare(a: ResultData, b: ResultData): { lines: BattleLine[]; wins: { a: number; b: number; tie: number }; verdict: "a" | "b" | "tie"; headline: string } {
  const codes: string[] = [];
  for (const subject of a.subjects) if (subject.code && codes.indexOf(subject.code) < 0) codes.push(subject.code);
  for (const subject of b.subjects) if (subject.code && codes.indexOf(subject.code) < 0) codes.push(subject.code);

  const lines: BattleLine[] = codes.map((code) => {
    const left = a.subjects.find((subject) => subject.code === code);
    const right = b.subjects.find((subject) => subject.code === code);
    const aValue = score(left?.total ?? "");
    const bValue = score(right?.total ?? "");
    let outcome: BattleLine["outcome"] = "none";
    if (aValue !== null && bValue !== null) {
      outcome = aValue === bValue ? "tie" : aValue > bValue ? "a" : "b";
    } else if (aValue !== null) {
      outcome = "a";
    } else if (bValue !== null) {
      outcome = "b";
    }
    return {
      code,
      label: subjectLabel(left ?? right, code),
      a: left?.total || left?.grade || "—",
      b: right?.total || right?.grade || "—",
      aValue,
      bValue,
      outcome,
    };
  });

  const wins = { a: 0, b: 0, tie: 0 };
  for (const line of lines) {
    if (line.outcome === "a") wins.a += 1;
    else if (line.outcome === "b") wins.b += 1;
    else if (line.outcome === "tie") wins.tie += 1;
  }

  let verdict: "a" | "b" | "tie" = "tie";
  if (wins.a !== wins.b) verdict = wins.a > wins.b ? "a" : "b";
  else if (a.cgpa !== null && b.cgpa !== null && a.cgpa !== b.cgpa) verdict = a.cgpa > b.cgpa ? "a" : "b";
  else if (a.sgpa !== null && b.sgpa !== null && a.sgpa !== b.sgpa) verdict = a.sgpa > b.sgpa ? "a" : "b";

  const winner = verdict === "a" ? a : b;
  const loser = verdict === "a" ? b : a;
  const headline =
    verdict === "tie"
      ? "Dead heat — nothing separates these two."
      : `${winner.name || "Student A"} takes it ${Math.max(wins.a, wins.b)}–${Math.min(wins.a, wins.b)} over ${loser.name || "Student B"}`;

  return { lines, wins, verdict, headline };
}

export async function loadBattle(aReg: string, bReg: string, sem: number): Promise<BattleReport> {
  const [a, b] = await Promise.all([loadResult(aReg, sem), loadResult(bReg, sem)]);
  const compared = compare(a, b);
  return { a: { reg: a.reg, data: a }, b: { reg: b.reg, data: b }, ...compared };
}

/** The clipboard-ready summary of a battle. */
export function battleSummary(report: BattleReport): string {
  const a = report.a.data;
  const b = report.b.data;
  const rows = report.lines.slice(0, 12).map((line) => {
    const mark = line.outcome === "a" ? "→" : line.outcome === "b" ? "←" : "=";
    return `${mark} ${line.label}: ${line.a} vs ${line.b}`;
  });
  return [
    `BEUConnect result battle · Semester ${a.semester}`,
    `${a.name || "Student A"} (${a.reg}) ${fixed(a.sgpa)} / ${fixed(a.cgpa)}`,
    `${b.name || "Student B"} (${b.reg}) ${fixed(b.sgpa)} / ${fixed(b.cgpa)}`,
    `Papers ${report.wins.a}–${report.wins.b} (${report.wins.tie} tied)`,
    report.headline,
    ...rows,
    "beu.prit.eu.org",
  ].join("\n");
}

/* -------------------------------------------------------------- persistence */

export interface RecentLookup {
  reg: string;
  sem: number;
  name: string;
  at: number;
}

const RECENT_KEY = "results.recent";
const TABLE_KEY = "results.table.prefs";

export async function readRecent(): Promise<RecentLookup[]> {
  const rows = await readStore<RecentLookup[]>(RECENT_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row.reg === "string") : [];
}

export async function rememberLookup(entry: RecentLookup): Promise<void> {
  const rows = await readRecent();
  const numeric = digits(entry.reg);
  const next = [entry, ...rows.filter((row) => !(digits(row.reg) === numeric && row.sem === entry.sem))].slice(0, 8);
  await writeStore(RECENT_KEY, next);
}

export async function forgetRecent(): Promise<void> {
  await writeStore(RECENT_KEY, [] as RecentLookup[]);
}

export interface TablePrefs {
  batch: string;
  branch: string;
  sem: number;
  college: string;
}

export async function readTablePrefs(): Promise<TablePrefs> {
  const fallback: TablePrefs = { batch: batches()[0] ?? "25", branch: "105", sem: 1, college: "" };
  const stored = await readStore<TablePrefs | null>(TABLE_KEY, null);
  if (!stored || typeof stored.batch !== "string" || typeof stored.branch !== "string") return fallback;
  return {
    batch: stored.batch,
    branch: stored.branch,
    sem: Number(stored.sem) || 1,
    college: typeof stored.college === "string" ? stored.college : "",
  };
}

export async function writeTablePrefs(prefs: TablePrefs): Promise<void> {
  await writeStore(TABLE_KEY, prefs);
}
