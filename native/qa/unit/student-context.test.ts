/**
 * Student context — one parse, one saved copy, one set of headers.
 *
 * Runs headless: `./scripts/check.sh test-only qa/unit/student-context.test.ts`
 *
 * The layout is pinned with real numbers from the GEC Sheikhpura roster
 * (`YYBBBCCCXXX`), including a lateral serial (`9XX`), because the branch and
 * college slices are the join keys the worker and GA4 both rely on.
 */

import { describe, expect, test } from "nsh/test";
import { headersFor } from "../../src/lib/net";
import { currentStudent, parseStudent, setStudent, studentHeaders } from "../../src/lib/student-context";

const REGULAR = "25105157001";
const LATERAL = "25105157901";

describe("parsing a registration number", () => {
  test("batch, branch and college come out in BEU's order", () => {
    const student = parseStudent(REGULAR);
    expect(student?.batch).toBe(2025);
    expect(student?.branch).toBe("105");
    expect(student?.college).toBe("157");
  });

  test("a lateral serial keeps the same layout", () => {
    const student = parseStudent(LATERAL);
    expect(student?.branch).toBe("105");
    expect(student?.college).toBe("157");
  });

  test("punctuation and spaces are not part of the number", () => {
    expect(parseStudent(" 2510-5157-001 ")?.reg).toBe(REGULAR);
  });

  test("fewer than eight digits is not a registration number", () => {
    expect(parseStudent("")).toBeNull();
    expect(parseStudent("1234567")).toBeNull();
    expect(parseStudent("not a number")).toBeNull();
  });

  test("names are optional and capped", () => {
    const student = parseStudent(REGULAR, { branchName: "CSE", collegeName: "x".repeat(200) });
    expect(student?.branchName).toBe("CSE");
    expect(student?.collegeName.length).toBe(100);
  });

  test("the hash is ten hex characters and stable", () => {
    const first = parseStudent(REGULAR)?.hash ?? "";
    const again = parseStudent(REGULAR)?.hash ?? "";
    const other = parseStudent(LATERAL)?.hash ?? "";
    expect(first).toMatch(/^[0-9a-f]{10}$/);
    expect(first).toBe(again);
    expect(first).not.toBe(other);
  });
});

describe("student headers", () => {
  test("no saved number means no headers", () => {
    setStudent("");
    expect(currentStudent()).toBeNull();
    expect(studentHeaders()).toEqual({});
  });

  test("a request to our own API carries the context", async () => {
    setStudent(REGULAR, { branchName: "CSE", collegeName: "GEC Sheikhpura" });
    const headers = await headersFor("https://beu.prit.eu.org/api/track");
    expect(headers?.["x-beu-reg"]).toBe(REGULAR);
    expect(headers?.["x-beu-branch"]).toBe("105");
    expect(headers?.["x-beu-college"]).toBe("157");
    expect(headers?.["x-beu-batch"]).toBe("2025");
    expect(headers?.["x-beu-student"]).toBe(currentStudent()?.hash);
  });

  test("a caller's own header wins over the context", async () => {
    setStudent(REGULAR);
    const headers = await headersFor("https://beu.prit.eu.org/api/track", { "x-beu-branch": "010" });
    expect(headers?.["x-beu-branch"]).toBe("010");
  });

  test("third-party hosts never see a registration number", async () => {
    setStudent(REGULAR);
    expect(await headersFor("https://api.github.com/repos/pritkr/beuconnect")).toBe(undefined);
    expect(await headersFor("https://beu-bih.ac.in/result")).toBe(undefined);
    expect(await headersFor("https://rptbalyjcevtxoxyvzli.supabase.co/rest/v1/x")).toBe(undefined);
  });
});
