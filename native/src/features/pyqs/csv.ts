/**
 * A small, dependency-free CSV reader that yields to the UI while it parses.
 *
 * The wide files have one row per student, so even a few thousand rows is
 * fine — but parsing them in one synchronous burst would drop frames on a
 * low-end phone. `parseCsvInChunks` reads a few hundred records per turn and
 * reports progress; the caller can cancel it when the screen goes away.
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
}

export function toRows(table: CsvTable): TableRow[] {
  const regIndex = columnIndex(table.columns, "RegNo");
  return table.rows.map((cells, index) => ({
    key: regIndex >= 0 && cells[regIndex] ? `${cells[regIndex]}-${index}` : `row-${index}`,
    cells,
  }));
}

export function filterRows(rows: TableRow[], columns: string[], query: string): TableRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  const indices = ["RegNo", "Name", "FatherName", "CollegeCode", "Branch", "Semester"]
    .map((name) => columnIndex(columns, name))
    .filter((index) => index >= 0);
  return rows.filter((row) => {
    for (const index of indices) {
      if ((row.cells[index] ?? "").toLowerCase().includes(needle)) return true;
    }
    return false;
  });
}

export function sortRows(rows: TableRow[], columns: string[], key: string, direction: "asc" | "desc"): TableRow[] {
  const index = columnIndex(columns, key);
  if (index < 0) return rows;
  const factor = direction === "asc" ? 1 : -1;
  const copy = rows.slice();
  copy.sort((left, right) => {
    const a = left.cells[index] ?? "";
    const b = right.cells[index] ?? "";
    const na = numericCell(a);
    const nb = numericCell(b);
    if (na !== null && nb !== null && na !== nb) return (na - nb) * factor;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) * factor;
  });
  return copy;
}
