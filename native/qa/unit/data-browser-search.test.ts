/**
 * Data browser — the two pure contracts behind the dataset list and the result
 * table. Synthetic rows only.
 *
 *  - **Search is order-independent and indexed.** A reader types "kumar suraj"
 *    or "gec sheikhpura", not the column order, and the haystack is built once
 *    when the rows are parsed instead of on every keystroke.
 *  - **The top three are read, not invented.** CGPA wins when the file carries
 *    it, SGPA is the fallback, a row with no mark is never a candidate, and a
 *    tie keeps a stable order.
 *
 * Run: `nsh test qa/unit/data-browser-search.test.ts`
 */

import { describe, expect, test } from "nsh/test";

import type { Dataset, Manifest } from "../../src/features/pyqs/api";
import {
  datasetSearchText,
  datasetsFromManifest,
  prioritizeCollege,
  searchDatasets,
} from "../../src/features/pyqs/api";
import type { CsvTable, TableRow } from "../../src/features/pyqs/csv";
import { filterRows, sortRows, topScored, toRows } from "../../src/features/pyqs/csv";

const COLUMNS = ["RegNo", "Name", "FatherName", "SGPA", "CGPA", "CollegeRank", "Branch", "Semester"];

function table(rows: string[][], columns: string[] = COLUMNS): CsvTable {
  return { columns, rows };
}

/** A row with no real name, registration or father's name in it. */
function row(reg: string, name: string, father: string, sgpa: string, cgpa: string, rank = ""): string[] {
  return [reg, name, father, sgpa, cgpa, rank, "105", "3"];
}

const ROWS = table([
  row("24/CV/19", "SURAJ KUMAR", "RAM KUMAR", "8.10", "7.90", "12"),
  row("24/CV/20", "SURAJ KUMAR RAM", "MOHAN RAM", "9.25", "8.80", "3"),
  row("24/EE/01", "ANITA VERMA", "SURESH VERMA", "7.40", "7.10"),
]);

const PARSED: TableRow[] = toRows(ROWS);

function keys(rows: TableRow[]): string[] {
  return rows.map((entry) => entry.key);
}

describe("filterRows", () => {
  test("an empty query returns the input array, not a copy", () => {
    expect(filterRows(PARSED, COLUMNS, "")).toBe(PARSED);
    expect(filterRows(PARSED, COLUMNS, "   ")).toBe(PARSED);
  });

  test("tokens match in any order", () => {
    // "kumar suraj" is the reverse of the stored name, and still finds both.
    expect(keys(filterRows(PARSED, COLUMNS, "kumar suraj"))).toEqual([
      "24/CV/19-0",
      "24/CV/20-1",
    ]);
    expect(keys(filterRows(PARSED, COLUMNS, "suraj kumar"))).toEqual([
      "24/CV/19-0",
      "24/CV/20-1",
    ]);
  });

  test("a partial registration number matches, punctuation included", () => {
    expect(keys(filterRows(PARSED, COLUMNS, "24/CV"))).toEqual(["24/CV/19-0", "24/CV/20-1"]);
    expect(keys(filterRows(PARSED, COLUMNS, "24/cv/19"))).toEqual(["24/CV/19-0"]);
    expect(keys(filterRows(PARSED, COLUMNS, "cv 20"))).toEqual(["24/CV/20-1"]);
  });

  test("a father's name is searchable, and a miss returns nothing", () => {
    expect(keys(filterRows(PARSED, COLUMNS, "mohan"))).toEqual(["24/CV/20-1"]);
    expect(filterRows(PARSED, COLUMNS, "nobody here")).toEqual([]);
  });

  test("punctuation pasted around a word does not hide it", () => {
    // A registration copied with its trailing comma, a name copied with one.
    expect(keys(filterRows(PARSED, COLUMNS, "kumar, suraj"))).toEqual([
      "24/CV/19-0",
      "24/CV/20-1",
    ]);
    expect(keys(filterRows(PARSED, COLUMNS, "24/CV/19,"))).toEqual(["24/CV/19-0"]);
  });

  test("every row has a search blob built once at parse time", () => {
    expect(PARSED.every((entry) => typeof entry.search === "string" && entry.search.length > 0)).toBe(true);
    expect(PARSED[0].search).toContain("suraj kumar");
  });
});

describe("sortRows", () => {
  test("a numeric column sorts by value in both directions", () => {
    expect(keys(sortRows(PARSED, COLUMNS, "SGPA", "asc"))).toEqual([
      "24/EE/01-2",
      "24/CV/19-0",
      "24/CV/20-1",
    ]);
    expect(keys(sortRows(PARSED, COLUMNS, "SGPA", "desc"))).toEqual([
      "24/CV/20-1",
      "24/CV/19-0",
      "24/EE/01-2",
    ]);
  });

  test("a missing number sorts last in either direction", () => {
    const holes = toRows(
      table([
        row("A", "ALPHA", "", "", ""),
        row("B", "BETA", "", "8.00", ""),
      ]),
    );
    expect(keys(sortRows(holes, COLUMNS, "SGPA", "asc"))).toEqual(["B-1", "A-0"]);
    expect(keys(sortRows(holes, COLUMNS, "SGPA", "desc"))).toEqual(["B-1", "A-0"]);
  });

  test("a text column sorts case-insensitively", () => {
    expect(keys(sortRows(PARSED, COLUMNS, "Name", "asc"))).toEqual([
      "24/EE/01-2",
      "24/CV/19-0",
      "24/CV/20-1",
    ]);
  });
});

const MANIFEST: Manifest = {
  "24": {
    "105": ["sem3_157.json", "sem4_157.json"],
    "101": ["sem3_110.json"],
  },
  "23": {
    "105": ["sem3_157.json"],
  },
};

function datasetIds(datasets: { id: string }[]): string[] {
  return datasets.map((dataset) => dataset.id);
}

describe("searchDatasets", () => {
  const all = datasetsFromManifest(MANIFEST);

  test("the manifest parse precomputes the haystack", () => {
    expect(all.length).toBe(4);
    expect(all.every((dataset) => typeof dataset.search === "string")).toBe(true);
    expect(datasetSearchText(all[0])).toContain("sem 3");
  });

  test("an empty query returns the input array", () => {
    expect(searchDatasets(all, "")).toBe(all);
    expect(searchDatasets(all, "   ")).toBe(all);
  });

  test("the short college name and the short branch name both match", () => {
    // "GEC Sheikhpura" is what the short name resolves to; nobody types the
    // full "Government Engineering College, Sheikhpura".
    expect(datasetIds(searchDatasets(all, "gec sheikhpura")).sort()).toEqual([
      "23|105|3|157",
      "24|105|3|157",
      "24|105|4|157",
    ]);
    expect(datasetIds(searchDatasets(all, "cse")).sort()).toEqual([
      "23|105|3|157",
      "24|105|3|157",
      "24|105|4|157",
    ]);
  });

  test("a college code and a batch narrowing work together", () => {
    expect(datasetIds(searchDatasets(all, "157 24")).sort()).toEqual([
      "24|105|3|157",
      "24|105|4|157",
    ]);
    expect(datasetIds(searchDatasets(all, "110")).sort()).toEqual(["24|101|3|110"]);
  });

  test("`sem 3` means semester three, not any batch containing a three", () => {
    expect(datasetIds(searchDatasets(all, "sem 3")).sort()).toEqual([
      "23|105|3|157",
      "24|101|3|110",
      "24|105|3|157",
    ]);
    // "cse 3" narrows CSE to semester three in both batches.
    expect(datasetIds(searchDatasets(all, "cse 3")).sort()).toEqual([
      "23|105|3|157",
      "24|105|3|157",
    ]);
  });

  test("a semester word keeps the year out of it", () => {
    // Batch 23 also contains a "3": only the semester word may decide it.
    const tricky = datasetsFromManifest({
      "23": { "105": ["sem4_157.json"] },
      "24": { "105": ["sem3_157.json"] },
    });
    expect(datasetIds(searchDatasets(tricky, "cse sem 3"))).toEqual(["24|105|3|157"]);
    expect(datasetIds(searchDatasets(tricky, "sem4"))).toEqual(["23|105|4|157"]);
    expect(datasetIds(searchDatasets(tricky, "semester 4"))).toEqual(["23|105|4|157"]);
  });
});

describe("topScored", () => {
  const TOP_COLUMNS = ["RegNo", "Name", "SGPA", "CGPA"];

  test("CGPA is used when the file carries it", () => {
    const rows = toRows(
      table(
        [
          ["A", "ALPHA", "9.50", "8.10"],
          ["B", "BETA", "8.00", "8.90"],
          ["C", "GAMMA", "9.90", "7.50"],
        ],
        TOP_COLUMNS,
      ),
    );
    const top = topScored(rows, TOP_COLUMNS, 3);
    expect(top.map((entry) => entry.column)).toEqual(["CGPA", "CGPA", "CGPA"]);
    expect(top.map((entry) => entry.value)).toEqual(["8.90", "8.10", "7.50"]);
    expect(top.map((entry) => entry.place)).toEqual([1, 2, 3]);
  });

  test("SGPA is the fallback when the file has no CGPA", () => {
    const columns = ["RegNo", "Name", "SGPA"];
    const rows = toRows(
      table(
        [
          ["A", "ALPHA", "8.10"],
          ["B", "BETA", "8.90"],
        ],
        columns,
      ),
    );
    const top = topScored(rows, columns, 3);
    expect(top.map((entry) => `${entry.row.key}:${entry.column}:${entry.value}`)).toEqual([
      "B-1:SGPA:8.90",
      "A-0:SGPA:8.10",
    ]);
  });

  test("a row with no mark is not a candidate, and no score means no strip", () => {
    const rows = toRows(
      table(
        [
          ["A", "ALPHA", "", ""],
          ["B", "BETA", "FAIL", ""],
          ["C", "GAMMA", "8.40", ""],
        ],
        TOP_COLUMNS,
      ),
    );
    expect(topScored(rows, TOP_COLUMNS, 3).map((entry) => entry.row.key)).toEqual(["C-2"]);
    expect(topScored(rows, ["RegNo", "Name"], 3)).toEqual([]);
  });

  test("a tie keeps a stable order and shares the place", () => {
    const columns = ["RegNo", "Name", "SGPA"];
    const rows = toRows(
      table(
        [
          ["C", "GAMMA", "8.50"],
          ["A", "ALPHA", "8.50"],
          ["B", "BETA", "9.00"],
        ],
        columns,
      ),
    );
    const top = topScored(rows, columns, 3);
    expect(top.map((entry) => entry.row.key)).toEqual(["B-2", "A-1", "C-0"]);
    expect(top.map((entry) => entry.place)).toEqual([1, 2, 2]);
  });

  test("a limit below the candidate count cuts honestly", () => {
    const rows = toRows(
      table(
        [
          ["A", "ALPHA", "8.10"],
          ["B", "BETA", "8.90"],
          ["C", "GAMMA", "7.50"],
        ],
        ["RegNo", "Name", "SGPA"],
      ),
    );
    expect(topScored(rows, ["RegNo", "Name", "SGPA"], 2).map((entry) => entry.value)).toEqual([
      "8.90",
      "8.10",
    ]);
  });
});

describe("prioritizeCollege", () => {
  const MANIFEST: Manifest = {
    "24": { "105": ["sem4_102.json", "sem4_157.json", "sem4_110.json"] },
    "23": { "105": ["sem7_102.json", "sem7_157.json"] },
  };
  const ALL: Dataset[] = datasetsFromManifest(MANIFEST);

  test("the student's college leads, then Sheikhpura, inside every group", () => {
    const ordered = prioritizeCollege(ALL, "110");
    expect(ordered.map((dataset) => `${dataset.batch}:${dataset.college}`)).toEqual([
      "24:110",
      "24:157",
      "24:102",
      "23:157",
      "23:102",
    ]);
  });

  test("no saved college still opens on Sheikhpura", () => {
    expect(prioritizeCollege(ALL, "").map((dataset) => dataset.college)).toEqual([
      "157",
      "102",
      "110",
      "157",
      "102",
    ]);
  });

  test("the input list is not rewritten", () => {
    prioritizeCollege(ALL, "110");
    expect(ALL.map((dataset) => dataset.college)).toEqual(["102", "110", "157", "102", "157"]);
  });
});
