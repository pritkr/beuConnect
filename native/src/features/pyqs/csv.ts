/**
 * A small, dependency-free CSV reader that yields to the UI while it parses.
 *
 * The wide files have one row per student, so even a few thousand rows is
 * fine — but parsing them in one synchronous burst would drop frames on a
 * low-end phone. `parseCsvInChunks` reads a few hundred records per turn and
 * reports progress; the caller can cancel it when the screen goes away.
 *
 * Once a table is parsed, `toRows` builds each row's search text once and
 * `filterRows` / `sortRows` read that row, never the columns: a keystroke on a
 * 5,000-row file then costs one string scan per row instead of six, and no
 * cell is lowercased or number-parsed inside a comparator.
 */

export interface CsvTable {
  columns: string[];
  rows: string[][];
}

export interface CsvProgress {
  rows: number;
  /** 0..1, based on bytes consumed. */
  fraction: number;
}

interface RecordResult {
  fields: string[];
  next: number;
  done: boolean;
}

function readRecord(text: string, start: number): RecordResult {
  const fields: string[] = [];
  let field = "";
  let index = start;
  let quoted = false;
  let sawAny = false;

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      sawAny = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      fields.push(field);
      field = "";
      sawAny = true;
      index += 1;
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      index += 1;
      if (!sawAny && field.length === 0 && fields.length === 0) continue;
      fields.push(field);
      return { fields, next: index, done: false };
    }

    field += char;
    sawAny = true;
    index += 1;
  }

  if (!sawAny && field.length === 0 && fields.length === 0) {
    return { fields: [], next: index, done: true };
  }
  fields.push(field);
  return { fields, next: index, done: true };
}

function uniqueColumns(values: string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base = (value || `Column ${index + 1}`).replace(/^\uFEFF/, "").trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export async function parseCsvInChunks(
  text: string,
  onProgress?: (progress: CsvProgress) => void,
  cancelled?: () => boolean,
  chunkSize = 250,
): Promise<CsvTable> {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let cursor = 0;
  let columns: string[] | null = null;
  const rows: string[][] = [];
  let sinceYield = 0;

  while (cursor < source.length) {
    const record = readRecord(source, cursor);
    cursor = record.next;
    if (record.fields.length === 0) {
      if (record.done) break;
      continue;
    }

    if (columns === null) {
      columns = uniqueColumns(record.fields);
    } else {
      const cells = record.fields.slice(0, columns.length);
      while (cells.length < columns.length) cells.push("");
      rows.push(cells);
      sinceYield += 1;
    }

    if (sinceYield >= chunkSize) {
      sinceYield = 0;
      onProgress?.({ rows: rows.length, fraction: source.length === 0 ? 1 : cursor / source.length });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (cancelled?.() === true) throw new Error("cancelled");
    }
    if (record.done) break;
  }

  onProgress?.({ rows: rows.length, fraction: 1 });
  return { columns: columns ?? [], rows };
}

/* ------------------------------------------------------------------ reading */

export function columnIndex(columns: string[], name: string): number {
  return columns.indexOf(name);
}

/** Columns that make sense in a compact phone row. */
export function preferredColumns(columns: string[]): string[] {
  const wanted = ["Name", "RegNo", "SGPA", "CGPA", "CollegeRank", "StateRank", "FailAny", "CollegeCode", "Branch", "Semester"];
  const present = wanted.filter((name) => columns.includes(name));
  return present.length > 0 ? present : columns.slice(0, 4);
}

/** The full set of report columns, minus JSON-only internals. */
export function detailColumns(columns: string[]): string[] {
  return columns.filter((name) => {
    if (name.includes("_ESE") || name.includes("_IA") || name.includes("_Total")) return false;
    return !["Type", "MonthYear", "ExamYear", "ExamHeld"].includes(name);
  });
}

export function sortableColumns(columns: string[]): string[] {
  const wanted = ["Name", "RegNo", "SGPA", "CGPA", "CollegeRank", "StateRank", "FailAny"];
  return wanted.filter((name) => columns.includes(name));
}

export function numericCell(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || /^fail$/i.test(trimmed)) return null;
  const parsed = Number.parseFloat(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export interface TableRow {
  key: string;
  cells: string[];
  /**
   * Lowercased blob of just the columns a reader searches, built once when the
   * file is turned into rows. Rebuilding it per keystroke costs more than the
   * filter itself on a multi-thousand-row table.
   */
  search?: string;
}

/** The report columns a search may match. Marks stay out of it. */
const SEARCH_COLUMNS = ["RegNo", "Name", "FatherName", "CollegeCode", "Branch", "Semester", "RollNo"];

function rowSearch(cells: string[], indices: number[]): string {
  let blob = "";
  for (const index of indices) {
    const value = cells[index];
    if (!value) continue;
    blob += `${blob ? " " : ""}${value}`;
  }
  return blob.toLowerCase();
}

export function toRows(table: CsvTable): TableRow[] {
  const regIndex = columnIndex(table.columns, "RegNo");
  const searchIndices = SEARCH_COLUMNS.map((name) => columnIndex(table.columns, name)).filter(
    (index) => index >= 0,
  );
  return table.rows.map((cells, index) => ({
    key: regIndex >= 0 && cells[regIndex] ? `${cells[regIndex]}-${index}` : `row-${index}`,
    cells,
    search: rowSearch(cells, searchIndices),
  }));
}

export function filterRows(rows: TableRow[], columns: string[], query: string): TableRow[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    // A pasted "kumar," or "24/CV/19." is the same word without its comma.
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return rows;

  const indices = SEARCH_COLUMNS.map((name) => columnIndex(columns, name)).filter(
    (index) => index >= 0,
  );
  return rows.filter((row) => {
    const haystack = row.search ?? rowSearch(row.cells, indices);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function sortRows(rows: TableRow[], columns: string[], key: string, direction: "asc" | "desc"): TableRow[] {
  const index = columnIndex(columns, key);
  if (index < 0) return rows;
  const factor = direction === "asc" ? 1 : -1;

  // Parse each key once, not once per comparison: a 3,000-row table makes
  // ~35,000 comparisons, and parsing a number in each of them is the sort.
  // Text is compared from a precomputed lowercase key, because `localeCompare`
  // builds a collator per call and QuickJS has no `Intl.Collator` to hoist.
  const decorated = rows.map((row) => {
    const raw = row.cells[index] ?? "";
    return { row, raw, text: raw.toLowerCase(), number: numericCell(raw) };
  });

  decorated.sort((left, right) => {
    const a = left.number;
    const b = right.number;
    if (a !== null && b !== null && a !== b) return (a - b) * factor;
    if (a !== null && b === null) return -1;
    if (a === null && b !== null) return 1;
    if (left.text === right.text) return 0;
    return (left.text < right.text ? -1 : 1) * factor;
  });

  return decorated.map((entry) => entry.row);
}

export interface ScoredRow {
  row: TableRow;
  /** 1-based place; equal scores share a place, the way a rank list does. */
  place: number;
  /** The raw cell, so the screen shows the file's own number, not a reformat. */
  value: string;
  score: number;
  /** Which column the score came from. */
  column: "CGPA" | "SGPA";
}

/**
 * The best rows of one published table.
 *
 * CGPA is used when any row carries one, otherwise SGPA — never a mix, and
 * never a made-up zero. A row with no score is not a candidate, so a table
 * without marks has no top three rather than a fake podium.
 */
export function topScored(rows: TableRow[], columns: string[], limit = 3): ScoredRow[] {
  const cgpa = columnIndex(columns, "CGPA");
  const sgpa = columnIndex(columns, "SGPA");
  const useCgpa =
    cgpa >= 0 && rows.some((row) => numericCell(row.cells[cgpa] ?? "") !== null);
  const index = useCgpa ? cgpa : sgpa;
  if (index < 0 || limit <= 0) return [];

  const scored: { row: TableRow; value: string; score: number }[] = [];
  for (const row of rows) {
    const value = row.cells[index] ?? "";
    const score = numericCell(value);
    if (score === null) continue;
    scored.push({ row, value: value.trim(), score });
  }
  scored.sort((left, right) => right.score - left.score || left.row.key.localeCompare(right.row.key));

  const out: ScoredRow[] = [];
  for (const entry of scored.slice(0, limit)) {
    const previous = out[out.length - 1];
    const place = previous && previous.score === entry.score ? previous.place : out.length + 1;
    out.push({
      row: entry.row,
      place,
      value: entry.value,
      score: entry.score,
      column: useCgpa ? "CGPA" : "SGPA",
    });
  }
  return out;
}
