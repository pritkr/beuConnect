/**
 * Results — reading a BEU result out of the portal's own page.
 *
 * BEU moved its result lookup behind a captcha and a Cloudflare Turnstile
 * widget, so the app cannot ask its JSON API any more. What it can do is put the
 * university's own page in a WebView, let the student solve the captcha, and
 * read the page BEU renders for them. That page is the only source of truth.
 *
 * This module turns that HTML into the native model. It is deliberately
 * tolerant, because the page has changed shape twice in two years:
 *
 *   1. The Angular page (`/result-three`) puts labels in `<strong>` cells with
 *      the value beside them, a table per section (THEORY / PRACTICAL) with a
 *      header row, and one SGPA / CGPA table with a semester column per paper.
 *   2. The older ASP.NET page puts `<b>Label:</b>` in one cell with the value
 *      in the next, and one table per subject group with no section heading.
 *
 * So it works in three passes, from most structured to least:
 *
 *   tables  → header cells are matched by name; each data row becomes a paper
 *   labels  → "Registration No:", "Student Name:", "Semester:" pairs
 *   text    → SGPA / CGPA fall out of the SGPA table's own row and column
 *
 * Nothing here throws, touches the network or depends on a package: the app
 * bundle has no DOM, and this runs on the phone. Anything unusable returns
 * `null`, and the screen says so instead of inventing a result.
 */

import type { ResultSubject } from "./data";

/** What a captured page is expected to say. Missing facts stay empty. */
export interface ParsedResult {
  reg: string;
  name: string;
  fatherName: string;
  motherName: string;
  collegeCode: string;
  collegeName: string;
  course: string;
  semester: number;
  examYear: string;
  examHeld: string;
  sgpa: number | null;
  cgpa: number | null;
  /** BEU's own eight-slot semester history, where the page prints it. */
  history: (number | null)[];
  subjects: ResultSubject[];
  status: "PASS" | "FAIL" | "";
  failed: string[];
  credits: number | null;
}

/* ------------------------------------------------------------------ text */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  times: "×",
  deg: "°",
};

/** Resolves the entities BEU's pages actually use, and leaves the rest alone. */
function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.charAt(0) === "#") {
      const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** The visible text of a fragment: no tags, no runs of whitespace. */
export function htmlToText(fragment: string): string {
  const text = fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|section|header|footer|td|th)>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decode(text).replace(/[\s\u00a0]+/g, " ").trim();
}

/** Drops the parts of a document that carry no marks and a lot of bytes. */
function cleanDocument(html: string): string {
  let doc = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ");
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(doc);
  if (body && body[1].length > 40) doc = body[1];
  return doc;
}

/* ----------------------------------------------------------------- tables */

interface Table {
  html: string;
  /** The markup just before the table, for its section heading. */
  before: string;
}

function tablesOf(html: string): Table[] {
  const tables: Table[] = [];
  const pattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    tables.push({ html: match[1], before: html.slice(Math.max(0, match.index - 400), match.index) });
    match = pattern.exec(html);
  }
  return tables;
}

function rowsOf(tableHtml: string): string[] {
  const rows: string[] = [];
  const pattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match = pattern.exec(tableHtml);
  while (match !== null) {
    rows.push(match[1]);
    match = pattern.exec(tableHtml);
  }
  return rows;
}

function cellsOf(rowHtml: string): string[] {
  const cells: string[] = [];
  const pattern = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match = pattern.exec(rowHtml);
  while (match !== null) {
    cells.push(match[2]);
    match = pattern.exec(rowHtml);
  }
  return cells;
}

/** A row of pure `<th>` is a header; a row that also has `<td>` is data. */
function isHeaderRow(rowHtml: string): boolean {
  return /<th\b/i.test(rowHtml) && !/<td\b/i.test(rowHtml);
}

const norm = (value: string): string =>
  htmlToText(value)
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ----------------------------------------------------------------- labels */

interface Detail {
  label: string;
  value: string;
}

/**
 * "Registration No: 21105157098" pairs, from any cell that carries both, or
 * from a cell that carries the label and the next cell that carries the value.
 */
function detailsOf(tables: Table[]): Detail[] {
  const out: Detail[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: string): void => {
    const key = norm(label);
    if (!key || key.length > 60 || seen.has(key)) return;
    const clean = htmlToText(value);
    if (!clean || clean.length > 160) return;
    seen.add(key);
    out.push({ label: htmlToText(label), value: clean });
  };

  for (const table of tables) {
    for (const row of rowsOf(table.html)) {
      const cells = cellsOf(row).map((cell) => htmlToText(cell));
      for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        const colon = cell.indexOf(":");
        if (colon <= 0) continue;
        const label = cell.slice(0, colon);
        const inline = cell.slice(colon + 1).trim();
        if (inline) add(label, inline);
        else if (index + 1 < cells.length) add(label, cells[index + 1]);
      }
    }
  }
  return out;
}

function valueOf(details: Detail[], keys: string[]): string {
  for (const key of keys) {
    for (const detail of details) {
      if (norm(detail.label) === key) return detail.value;
    }
  }
  for (const key of keys) {
    for (const detail of details) {
      if (norm(detail.label).startsWith(key)) return detail.value;
    }
  }
  return "";
}

const REG_KEYS = ["registration no", "registration number", "registration", "reg no", "redg no", "regd no", "enrollment no", "enrolment no"];
const NAME_KEYS = ["student name", "name of student", "candidates name", "candidate name", "students name", "name"];
const FATHER_KEYS = ["fathers name", "father name", "father"];
const MOTHER_KEYS = ["mothers name", "mother name", "mother"];
const COLLEGE_KEYS = ["college name", "institute name", "college", "institute"];
const COURSE_KEYS = ["course name", "programme name", "course", "programme", "program"];
const SEM_KEYS = ["semester", "sem"];
const HELD_KEYS = ["examination month year", "exam held", "examination held", "examination month", "examination", "exam"];
const REMARK_KEYS = ["remarks", "final result", "result", "status", "fail any"];

/* ----------------------------------------------------------------- values */

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** "V", "5", "SEM-III" → 5; anything else → 0. */
function semesterOf(value: string): number {
  const simple = /^\s*(?:sem(?:ester)?\s*[-.:]?\s*)?([1-8])\s*$/i.exec(value);
  if (simple) return Number(simple[1]);
  const roman = /^\s*(?:sem(?:ester)?\s*[-.:]?\s*)?([IVX]{1,4})\s*$/i.exec(value);
  if (roman) {
    const index = ROMAN.indexOf(roman[1].toUpperCase());
    if (index > 0) return index;
  }
  const loose = /(?:^|\D)([1-8])(?:\D|$)/.exec(value);
  return loose ? Number(loose[1]) : 0;
}

/** The first number in a cell, if it is on the ten-point scale. */
function scoreOf(value: string): number | null {
  const match = /-?\d+(?:\.\d+)?/.exec(value.replace(/,/g, ""));
  if (!match) return null;
  const number = Number.parseFloat(match[0]);
  if (!Number.isFinite(number) || number < 0 || number > 10.5) return null;
  return number;
}

/** "105 - Government Engineering College" → code 105, name without it. */
function splitCode(value: string): { code: string; name: string } {
  const match = /^\s*([0-9A-Z]{2,6})\s*[-–—]\s*(.+)$/i.exec(value);
  if (match) return { code: match[1].trim(), name: match[2].trim() };
  return { code: "", name: value.trim() };
}

/* --------------------------------------------------------------- subjects */

interface Columns {
  code: number;
  name: number;
  ese: number;
  ia: number;
  total: number;
  grade: number;
  credit: number;
}

function columnsOf(header: string[]): Columns | null {
  const columns: Columns = { code: -1, name: -1, ese: -1, ia: -1, total: -1, grade: -1, credit: -1 };
  header.forEach((cell, index) => {
    const key = norm(cell);
    if (!key) return;
    const set = (field: keyof Columns): void => {
      if (columns[field] < 0) columns[field] = index;
    };
    if (columns.code < 0 && key.includes("code") && !key.includes("grade")) set("code");
    else if (columns.name < 0 && (key.includes("subject name") || key.includes("paper name") || key === "subject" || key === "paper" || key === "name")) set("name");
    else if (columns.ese < 0 && (key === "ese" || key.includes("end sem") || key.includes("external"))) set("ese");
    else if (columns.ia < 0 && (key === "ia" || key.includes("internal") || key === "cea" || key.includes("mid sem"))) set("ia");
    else if (columns.total < 0 && (key.includes("total") || key.includes("marks obtained") || key === "marks")) set("total");
    else if (columns.grade < 0 && key.includes("grade")) set("grade");
    else if (columns.credit < 0 && key.includes("credit")) set("credit");
  });

  const mapped = Object.values(columns).filter((index) => index >= 0).length;
  const identified = columns.code >= 0 || columns.name >= 0;
  const scored = columns.total >= 0 || columns.grade >= 0;
  return mapped >= 3 && identified && scored ? columns : null;
}

/** "PRACTICAL" wins only when it is the last section heading before the table. */
function sectionOf(before: string): "theory" | "practical" | "" {
  const text = htmlToText(before).toLowerCase().slice(-160);
  const practical = text.lastIndexOf("practical");
  const theory = text.lastIndexOf("theory");
  if (practical > theory && practical >= 0) return "practical";
  if (theory >= 0) return "theory";
  return "";
}

function subjectFrom(cells: string[], columns: Columns, section: "theory" | "practical" | ""): ResultSubject | null {
  const at = (index: number): string => (index >= 0 && index < cells.length ? cells[index].trim() : "");
  const code = at(columns.code);
  const name = at(columns.name);
  if (/^subject\s*(name|code)?$/i.test(name)) return null;
  if (!code && !name) return null;

  const subject: ResultSubject = {
    code,
    name,
    kind: section === "practical" || (!section && /P$/i.test(code)) ? "practical" : "theory",
    ese: at(columns.ese),
    ia: at(columns.ia),
    total: at(columns.total),
    grade: at(columns.grade),
    credit: at(columns.credit),
  };
  if (!subject.ese && !subject.ia && !subject.total && !subject.grade) return null;
  return subject;
}

/* ------------------------------------------------------------- SGPA table */

interface Scores {
  sgpa: number | null;
  cgpa: number | null;
  /** One slot per semester, where the page prints a value for it. */
  series: (number | null)[];
}

/** "I"…"VIII", "1"…"8", "SEM-III" → 3; anything else → 0. */
function columnSemester(label: string): number {
  const value = label.trim().toUpperCase().replace(/^SEM(?:ESTER)?\s*[-.:]?\s*/, "");
  const roman = ROMAN.indexOf(value);
  if (roman > 0 && roman <= 8) return roman;
  return /^[1-8]$/.test(value) ? Number(value) : 0;
}

/**
 * The SGPA / CGPA table: a header naming each semester and "Cur. CGPA", and a
 * row that starts with "SGPA". The student's semester is a column, not a label,
 * so the header is what says which value is theirs.
 */
function scoresFromTable(table: Table, semester: number): Scores {
  const rows = rowsOf(table.html);
  const empty: Scores = { sgpa: null, cgpa: null, series: [null, null, null, null, null, null, null, null] };
  if (!rows.length) return empty;

  const headerIndex = rows.findIndex(isHeaderRow);
  const header = cellsOf(rows[headerIndex >= 0 ? headerIndex : 0]).map((cell) => htmlToText(cell));
  const keys = header.map(norm);
  const body = rows.filter((row, index) => index !== headerIndex && !isHeaderRow(row)).map(cellsOf);

  const cgpaColumn = keys.findIndex((key) => key.includes("cgpa"));
  let cgpa: number | null = null;
  if (cgpaColumn >= 0) {
    for (const cells of body) {
      const value = cells.length === 1 ? scoreOf(htmlToText(cells[0])) : scoreOf(htmlToText(cells[cgpaColumn] ?? ""));
      if (value !== null) {
        cgpa = value;
        break;
      }
    }
  }

  const sgpaRow = body.find((cells) => cells.length > 0 && norm(cells[0]) === "sgpa");
  if (!sgpaRow) return { sgpa: null, cgpa, series: empty.series };

  const values = sgpaRow.map((cell) => htmlToText(cell));
  // Every semester the page prints, so the trend after one capture carries the
  // same eight bars the live payload does.
  const filled: (number | null)[] = [null, null, null, null, null, null, null, null];
  header.forEach((cell, index) => {
    const sem = columnSemester(cell);
    const value = scoreOf(values[index] ?? "");
    if (sem > 0 && value !== null) filled[sem - 1] = value;
  });

  const column = header.findIndex((cell) => semester > 0 && columnSemester(cell) === semester);
  const sgpaColumn = column >= 0 ? column : keys.findIndex((key) => key === "sgpa");

  let sgpa: number | null = null;
  if (sgpaColumn > 0 && sgpaColumn < values.length) sgpa = scoreOf(values[sgpaColumn]);
  if (sgpa === null) {
    // No column matched: trust a single score in the row, never a guess between
    // several. A wrong SGPA is worse than a missing one.
    const candidates = values
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.index !== 0 && entry.index !== cgpaColumn)
      .map((entry) => scoreOf(entry.value))
      .filter((value): value is number => value !== null);
    if (candidates.length === 1) sgpa = candidates[0];
  }

  return { sgpa, cgpa, series: filled };
}

/* ------------------------------------------------------------------ parse */

export interface ParseFallback {
  /** The registration number the student typed, when the page omits it. */
  reg?: string;
  /** The semester the student asked for, when the page omits it. */
  sem?: number;
}

/**
 * A captured BEU result page as the native model, or `null` when the page does
 * not hold a result. Never throws.
 */
export function parseResultHtml(html: string, fallback: ParseFallback = {}): ParsedResult | null {
  try {
    if (typeof html !== "string" || html.length < 40) return null;

    const doc = cleanDocument(html);
    const tables = tablesOf(doc);
    const details = detailsOf(tables);

    const subjects: ResultSubject[] = [];
    let sgpa: number | null = null;
    let cgpa: number | null = null;
    let history: (number | null)[] = [null, null, null, null, null, null, null, null];
    const semesterHint = semesterOf(valueOf(details, SEM_KEYS)) || (fallback.sem ?? 0);

    for (const table of tables) {
      const rows = rowsOf(table.html);
      if (!rows.length) continue;

      const headerIndex = rows.findIndex(isHeaderRow);
      const headerRow = headerIndex >= 0 ? rows[headerIndex] : rows[0];
      const columns = columnsOf(cellsOf(headerRow).map((cell) => htmlToText(cell)));
      if (columns) {
        const section = sectionOf(table.before);
        for (const row of rows) {
          if (isHeaderRow(row)) continue;
          const subject = subjectFrom(cellsOf(row).map((cell) => htmlToText(cell)), columns, section);
          if (subject) subjects.push(subject);
        }
        continue;
      }

      if (sgpa === null || cgpa === null) {
        const scores = scoresFromTable(table, semesterHint);
        if (scores.sgpa !== null && sgpa === null) sgpa = scores.sgpa;
        if (scores.cgpa !== null && cgpa === null) cgpa = scores.cgpa;
        if (scores.series.some((value) => value !== null)) history = scores.series;
      }
    }

    if (sgpa === null) sgpa = scoreOf(valueOf(details, ["sgpa"]));
    if (cgpa === null) cgpa = scoreOf(valueOf(details, ["cur cgpa", "current cgpa", "cgpa"]));

    const text = htmlToText(doc);
    const remarks = valueOf(details, REMARK_KEYS).toUpperCase();
    const semester = semesterOf(valueOf(details, SEM_KEYS)) || (fallback.sem ?? 0);
    const reg = valueOf(details, REG_KEYS).replace(/[^0-9A-Za-z]/g, "") || (fallback.reg ?? "");
    const examHeld = valueOf(details, HELD_KEYS);
    const college = splitCode(valueOf(details, COLLEGE_KEYS));
    const course = splitCode(valueOf(details, COURSE_KEYS));

    const usable = subjects.length > 0 || sgpa !== null || cgpa !== null;
    if (!usable || semester < 1) return null;

    const failed = subjects
      .filter((subject) => /^(F|FAIL|FAILED)$/i.test(subject.grade.trim()))
      .map((subject) => subject.code || subject.name)
      .filter((code) => code !== "");

    const status: ParsedResult["status"] =
      remarks.includes("FAIL") || failed.length > 0
        ? "FAIL"
        : remarks.includes("PASS") || subjects.length > 0 || sgpa !== null
          ? "PASS"
          : "";

    let credits = 0;
    let counted = 0;
    for (const subject of subjects) {
      const credit = scoreOf(subject.credit);
      if (credit !== null && credit > 0) {
        credits += credit;
        counted += 1;
      }
    }

    const yearFromHeld = /(20\d{2})/.exec(examHeld);
    const yearFromText = /(20\d{2})/.exec(text.slice(0, 400));

    return {
      reg,
      name: valueOf(details, NAME_KEYS),
      fatherName: valueOf(details, FATHER_KEYS),
      motherName: valueOf(details, MOTHER_KEYS),
      collegeCode: college.code,
      collegeName: college.name,
      course: course.name,
      semester,
      examYear: yearFromHeld ? yearFromHeld[1] : yearFromText ? yearFromText[1] : "",
      examHeld,
      sgpa,
      cgpa,
      history,
      subjects,
      status,
      failed,
      credits: counted > 0 ? Math.round(credits * 100) / 100 : null,
    };
  } catch {
    return null;
  }
}
