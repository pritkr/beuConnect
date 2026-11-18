/**
 * CSV, read the way the site writes it.
 *
 * The published tables are RFC-4180 enough to need quotes — a student's name can
 * contain a comma — and no file is big enough to need streaming on the phone.
 * `parseCsv` is the whole reader: quoted fields, doubled quotes, CRLF or LF, a
 * trailing empty line.
 *
 * This file exists because the roster screens and the result tables read the
 * same family of files. `features/results/data.ts`, `features/pyqs/pdf-build.ts`
 * and `features/pyqs/csv.ts` still carry their own readers, written before this
 * one; they are not wrong, only duplicated, and moving them is a separate change
 * (`docs/BLOCKERS.md`).
 */

/** Rows of fields. Blank lines are dropped; every other row keeps its cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const source = text.replace(/^\uFEFF/, "");

  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
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
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

/** The same rows keyed by a trimmed header, first row wins. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((name) => name.trim());
  return rows.map((cells) => {
    const record: Record<string, string> = {};
    for (let index = 0; index < keys.length; index += 1) {
      if (keys[index] !== "") record[keys[index]] = (cells[index] ?? "").trim();
    }
    return record;
  });
}
