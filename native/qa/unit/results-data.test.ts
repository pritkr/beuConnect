/**
 * Results logic — the parsing and ranking helpers, without the network.
 *
 * Runs headless, no app opened: `nsh test qa/unit/results-data.test.ts`
 *
 * Everything here is a pure export of `src/features/results/{data,shared}`:
 * CSV reading, score/registration normalisation, ranking, the wide-row reader
 * and the portal payload guard. None of these touch `fetch`, so the suite is
 * fast and cannot flake on BEU being down. Fixtures are inline and tiny on
 * purpose (BUILD_SPEC: bundle-free runtime).
 *
 * The cache key itself (`result:<digits>:<sem>`) is module-private; its
 * behaviour is covered end-to-end in `qa/results.test.tsx` (a result saved
 * under a digits-only key opens when the same number is typed with dashes).
 * Here only the normalisation it depends on — `digits` — is asserted.
 */

import { describe, expect, test } from "nsh/test";
import type { RankRow } from "../../src/features/results/data";
import {
  csvRecords,
  digits,
  parseCsv,
  parseReg,
  payloadFrom,
  ranked,
  score,
  sortByCgpa,
  wideFromRecord,
} from "../../src/features/results/data";
import { cleanReg, errorMessage, isValidReg, normalizeSelection } from "../../src/features/results/shared";

describe("csv", () => {
  test("reads quoted fields, escaped quotes and CRLF", () => {
    const rows = parseCsv(
      'RegNo,Name,CGPA\r\n21105157098,"Kumari, Asha",8.60\r\n\r\n21105157102,"He said ""hi""",7.40\r\n',
    );
    expect(rows).toEqual([
      ["RegNo", "Name", "CGPA"],
      ["21105157098", "Kumari, Asha", "8.60"],
      ["21105157102", 'He said "hi"', "7.40"],
    ]);
  });

  test("an empty document is no rows", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  test("records key by the trimmed header and pad short rows", () => {
    const records = csvRecords("RegNo, Name \n21105157098, Asha\n21105157102\n");
    expect(records).toEqual([
      { RegNo: "21105157098", Name: "Asha" },
      { RegNo: "21105157102", Name: "" },
    ]);
  });

  test("a header alone is no records", () => {
    expect(csvRecords("RegNo,Name\n")).toEqual([]);
  });
});

describe("normalisation", () => {
  test("score strips decoration and rejects non-numbers", () => {
    expect(score("8.67")).toBe(8.67);
    expect(score(" 9.1 ")).toBe(9.1);
    expect(score("8.67 CGPA")).toBe(8.67);
    for (const value of ["", "-", "N/A", "NA", "NULL", "A+", "abc", null, undefined]) {
      expect(score(value)).toBeNull();
    }
  });

  test("parseReg reads batch, branch, college and lateral entry", () => {
    const direct = parseReg("21105157098");
    expect(direct === null).toBe(false);
    if (direct) {
      expect(direct.numeric).toBe("21105157098");
      expect(direct.batch).toBe("21");
      expect(direct.branch).toBe("105");
      expect(direct.college).toBe("157");
      expect(direct.lateral).toBe(false);
    }

    // Serial 901 is a lateral-entry student.
    expect(parseReg("21105157901")?.lateral).toBe(true);
    // Spaces and case are decoration, not data.
    expect(parseReg(" 2110 5157 098 ")?.reg).toBe("21105157098");
    // Under eight digits there is nothing to read.
    expect(parseReg("2110515")).toBeNull();
  });

  test("digits is the cache-key normalisation", () => {
    expect(digits("2110-5157-098")).toBe("21105157098");
    expect(digits("21105157098")).toBe("21105157098");
    expect(digits("beu 21105157098")).toBe("21105157098");
  });

  test("cleanReg and isValidReg agree with what the field allows", () => {
    expect(cleanReg(" 2110-5157-098 ")).toBe("21105157098");
    expect(isValidReg("21105157098")).toBe(true);
    expect(isValidReg("2110515")).toBe(false);
  });

  test("errorMessage never shows nothing", () => {
    expect(errorMessage(new Error("BEU is down"))).toBe("BEU is down");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(new Error("   "))).toContain("Something went wrong");
    expect(errorMessage(undefined)).toContain("Something went wrong");
  });
});

/** A roster row, with only the fields the ranking reads. */
function row(reg: string, cgpa: number | null, collegeCode = "105"): RankRow {
  return {
    reg,
    name: reg,
    sgpa: cgpa,
    cgpa,
    sgpaText: "",
    cgpaText: "",
    collegeCode,
    collegeName: "",
    rank: null,
    collegeRank: null,
  };
}

describe("ranking", () => {
  const rows = [
    row("21105157110", 8.0),
    row("21105157098", 9.0),
    row("21105157102", 9.0),
    row("21105157120", 8.0, "106"),
    row("21105157130", null, "106"),
  ];

  test("sorts by CGPA, missing last, registration as the tie-break", () => {
    expect(sortByCgpa(rows).map((entry) => entry.reg)).toEqual([
      "21105157098",
      "21105157102",
      "21105157110",
      "21105157120",
      "21105157130",
    ]);
  });

  test("ties share a rank and the next rank skips", () => {
    const rankedRows = ranked(rows);
    expect(rankedRows.map((entry) => entry.rank)).toEqual([1, 1, 3, 3, null]);
  });

  test("college rank is counted inside each college", () => {
    const rankedRows = ranked(rows);
    expect(rankedRows.map((entry) => entry.collegeRank)).toEqual([1, 1, 3, 1, null]);
  });

  test("ranking does not mutate the order it was given", () => {
    const before = rows.map((entry) => entry.reg);
    ranked(rows);
    expect(rows.map((entry) => entry.reg)).toEqual(before);
  });
});

describe("wide csv rows", () => {
  test("reads history, papers, ranks and CGPA aliases", () => {
    const wide = wideFromRecord({
      RegNo: "21105157098",
      Name: "Asha Kumari",
      "Cur. CGPA": "8.60",
      SGPA_History: "8.75|8.10|||",
      "101_ESE": "70",
      "101_IA": "20",
      "101_Total": "90",
      "101_Grade": "A+",
      "102P_ESE": "25",
      "102P_IA": "10",
      "102P_Total": "35",
      "102P_Grade": "A",
      StateRank: "42",
    });

    expect(wide.reg).toBe("21105157098");
    expect(wide.cgpa).toBe(8.6);
    expect(wide.history.slice(0, 3)).toEqual([8.75, 8.1, null]);
    expect(wide.stateRank).toBe(42);
    expect(wide.subjects.map((subject) => subject.code)).toEqual(["101", "102P"]);
    expect(wide.subjects[0].grade).toBe("A+");
    // A trailing `P` is a practical paper.
    expect(wide.subjects[1].kind).toBe("practical");
    expect(wide.subjects[0].kind).toBe("theory");
  });

  test("a row with no marks is honest about it", () => {
    const wide = wideFromRecord({ RegNo: "1", Name: "Nobody" });
    expect(wide.subjects).toEqual([]);
    expect(wide.cgpa).toBeNull();
    expect(wide.history.length).toBe(8);
  });
});

describe("portal payload", () => {
  test("accepts the envelope and the bare payload", () => {
    expect(payloadFrom({ status: 200, data: { name: "Asha" } })?.name).toBe("Asha");
    expect(payloadFrom({ redg_no: "21105157098" })?.redg_no).toBe("21105157098");
    expect(payloadFrom({ theorySubjects: [] })?.theorySubjects).toEqual([]);
  });

  test("rejects anything it could cache as a blank result", () => {
    expect(payloadFrom({ status: 200, message: "captcha" })).toBeNull();
    expect(payloadFrom({ data: {} })).toBeNull();
    expect(payloadFrom({})).toBeNull();
    expect(payloadFrom(null)).toBeNull();
    expect(payloadFrom("nope")).toBeNull();
  });
});

describe("table selection", () => {
  test("reads a two-digit batch out of a four-digit year", () => {
    const selection = normalizeSelection({ batch: "2021", branch: "civil", sem: 3 });
    expect(selection.batch).toBe("21");
    expect(selection.branch).toBe("101");
    expect(selection.sem).toBe(3);
  });

  test("falls back to something BEU has published", () => {
    expect(normalizeSelection({ batch: "99" }).batch).toBe("25");
    expect(normalizeSelection({ batch: "25", branch: "zzz" }).branch).toBe("101");
    expect(normalizeSelection({ batch: "25", branch: "161", sem: 9 }).sem).toBe(1);
  });

  test("accepts a branch by code, short name or full name", () => {
    for (const branch of ["105", "cse", "Computer Science & Engineering"]) {
      expect(normalizeSelection({ batch: "24", branch, sem: 1 }).branch).toBe("105");
    }
  });
});
