/**
 * Results — the screens' honesty rules, mounted headless with the network down.
 *
 * Every screen here reads a copy the app already holds, so what is asserted is
 * what a student sees offline: a trend only appears with two real semesters, a
 * rank takes the saved identity's name, a college merit list shows college
 * places, and a level battle still counts its papers.
 */

import { describe, expect, test } from "nsh/test";

import type { ResultData } from "../src/features/results/data";
import { DOWN, expectPage, openRoute, visible } from "./support";

const REG = "21105157098";
const TWIN = "21105157150";

/* ── cache fixtures, in the shape `lib/net` writes ───────────────────── */

function entry(value: string): string {
  return JSON.stringify({ at: Date.now(), value });
}

function resultCache(data: ResultData): Record<string, string> {
  return {
    [`beu.cache.result:${data.reg}:${data.semester}`]: entry(JSON.stringify({ at: Date.now(), data })),
  };
}

function rosterCache(csv: string, sem = 1): Record<string, string> {
  return { [`beu.cache.roster:21:105:${sem}`]: entry(csv) };
}

function identityCache(name: string): Record<string, string> {
  return {
    [`beu.cache.identity:${REG}`]: entry(
      JSON.stringify({
        reg: REG,
        name,
        cgpa: 8.6,
        sgpa: 8.75,
        branchCode: "105",
        branchName: "Computer Science & Engineering",
        collegeCode: "157",
        collegeName: "Government Engineering College Sheikhpura",
        semester: 1,
        source: "cache",
        at: Date.now(),
      }),
    ),
  };
}

const ASHA: ResultData = {
  reg: REG,
  name: "Asha Kumari",
  fatherName: "",
  motherName: "",
  collegeCode: "157",
  collegeName: "Government Engineering College Sheikhpura",
  branchCode: "105",
  branchName: "Computer Science & Engineering",
  semester: 1,
  examYear: "2024",
  examHeld: "Dec 2023",
  course: "B.Tech",
  sgpa: 8.75,
  cgpa: 8.6,
  history: [8.75, null, null, null, null, null, null, null],
  subjects: [
    { code: "101", name: "Mathematics I", kind: "theory", ese: "70", ia: "20", total: "90", grade: "A+", credit: "4" },
    { code: "102", name: "Physics", kind: "theory", ese: "55", ia: "18", total: "73", grade: "B+", credit: "3" },
  ],
  status: "PASS",
  failed: [],
  credits: 7,
  stateRank: null,
  collegeRank: null,
  source: "live",
  savedAt: Date.now(),
};

const ASHA_SEM2: ResultData = {
  ...ASHA,
  semester: 2,
  sgpa: 8.2,
  cgpa: 8.4,
  history: [8.75, 8.2, null, null, null, null, null, null],
};

/** The same result twice: every counted paper is level. */
const ASHA_TWIN: ResultData = { ...ASHA, reg: TWIN, name: "Asha Rani" };

/** The same papers, but no total on either side and no CGPA/SGPA to fall back on. */
const ASHA_BLANK: ResultData = {
  ...ASHA_TWIN,
  sgpa: null,
  cgpa: null,
  history: [null, null, null, null, null, null, null, null],
  subjects: ASHA.subjects.map((paper) => ({ ...paper, total: "", grade: "" })),
};

const ROSTER = [
  "RegNo,Name,SGPA,Cur. CGPA,CollegeCode,CollegeName",
  "21105157098,ASHA KUMARI,8.75,8.60,157,Government Engineering College Sheikhpura",
  "21105157102,Bharat Kumar,8.20,8.10,157,Government Engineering College Sheikhpura",
  "21105157190,Dev Raj,9.00,9.10,106,Sityog Institute of Technology",
].join("\n");

/** Semester 1 as BEU publishes it: an SGPA, no CGPA, so nobody has a rank. */
const ROSTER_NO_CGPA = [
  "RegNo,Name,SGPA,Cur. CGPA,CollegeCode,CollegeName",
  "21105157098,ASHA KUMARI,8.75,,157,Government Engineering College Sheikhpura",
  "21105157102,Bharat Kumar,8.20,,157,Government Engineering College Sheikhpura",
  "21105157190,Dev Raj,9.00,,106,Sityog Institute of Technology",
  "21105157150,Tara Devi,8.90,,157,Government Engineering College Sheikhpura",
].join("\n");

/** The batch's newest published table, with a CGPA for every row. */
const ROSTER_SEM8 = [
  "RegNo,Name,SGPA,Cur. CGPA,CollegeCode,CollegeName",
  "21105157098,ASHA KUMARI,8.75,8.60,157,Government Engineering College Sheikhpura",
  "21105157102,Bharat Kumar,8.20,8.10,157,Government Engineering College Sheikhpura",
  "21105157190,Dev Raj,9.00,9.10,106,Sityog Institute of Technology",
  "21105157150,Tara Devi,8.90,8.70,157,Government Engineering College Sheikhpura",
].join("\n");

/** One student without a CGPA in a table where everybody else has one. */
const ROSTER_ONE_UNRANKED = [
  "RegNo,Name,SGPA,Cur. CGPA,CollegeCode,CollegeName",
  "21105157098,ASHA KUMARI,8.75,,157,Government Engineering College Sheikhpura",
  "21105157102,Bharat Kumar,8.20,8.10,157,Government Engineering College Sheikhpura",
  "21105157190,Dev Raj,9.00,9.10,106,Sityog Institute of Technology",
  "21105157150,Tara Devi,8.90,8.70,157,Government Engineering College Sheikhpura",
].join("\n");

/* ── every screen at 320 pt ──────────────────────────────────────────── */

describe("results routes at 320 pt", () => {
  const CASES: { name: string; check: string }[] = [
    { name: "results", check: "Check semester" },
    { name: "results.table", check: "Who is on top?" },
    { name: "results.rank", check: "Where you stand." },
    { name: "results.merit", check: "The toppers." },
    { name: "results.battle", check: "Two results. One winner." },
    { name: "results.portal", check: "BEU result portal" },
    { name: "results.web", check: "BEU result page" },
  ];

  for (const item of CASES) {
    test(`${item.name} renders`, async () => {
      const app = await openRoute(item.name, {}, { network: DOWN });
      expectPage(app, item.name);
      expect(visible(app)).toContain(item.check);
    }, 20000);
  }
});

/* ── trend ───────────────────────────────────────────────────────────── */

describe("results trend", () => {
  test("one known semester is not a trend", async () => {
    const app = await openRoute("results", { reg: REG, sem: 1 }, {
      network: DOWN,
      storage: resultCache(ASHA),
    });
    await app.wait(400);

    const text = visible(app);
    // The chart would be a single invented point; the card says what would fill it.
    expect(text.toLowerCase()).toContain("semester trend");
    expect(text).toContain("Only one semester is known");
    expect(app.shows("id:sgpa-trend")).toBe(false);
  }, 20000);

  test("two semesters draw, and each point names its source", async () => {
    const app = await openRoute("results", { reg: REG, sem: 2 }, {
      network: DOWN,
      storage: resultCache(ASHA_SEM2),
    });
    await app.wait(400);

    const text = visible(app);
    expect(text).toContain("Best 8.75 in semester 1 · latest 8.20 in semester 2 · down 0.55");
    expect(text).toContain("Semester 2 from this result");
    expect(text).toContain("1 from BEU's history");
    expect(app.shows("id:sgpa-trend")).toBe(true);
  }, 20000);
});

/* ── rank / merit ────────────────────────────────────────────────────── */

describe("results rank and merit", () => {
  test("rank names the student from the saved identity, not the roster capitals", async () => {
    const app = await openRoute("results.rank", { reg: REG, sem: 1 }, {
      network: DOWN,
      storage: { ...rosterCache(ROSTER), ...identityCache("Asha Kumari") },
    });
    await app.wait(500);

    const text = visible(app);
    expect(text).toContain("Asha Kumari");
    expect(text).not.toContain("ASHA KUMARI");
  }, 20000);

  test("a typed number opens its own table, so college rank and rivals exist", async () => {
    const app = await openRoute("results.rank", {}, {
      network: DOWN,
      storage: { ...rosterCache(ROSTER_NO_CGPA, 1), ...rosterCache(ROSTER_SEM8, 8) },
    });
    await app.wait(300);

    // Before a number is typed the screen must not claim batch 20 has no table.
    expect(visible(app)).not.toContain("No roster for batch 20");

    await app.type("label:Registration number", REG);
    await app.wait(200);
    // The form names the typed batch before Find is pressed.
    expect(visible(app)).toContain("BATCH 2021 · CSE");
    // Batch 21 is in semester 8: the button follows the number, not a stale 1.
    await app.press("text:Find semester 8 rank");
    await app.wait(500);

    const text = visible(app);
    expect(text).toContain("SEMESTER 8");
    expect(text).toContain("COLLEGE RANK");
    expect(text).toContain("of 3 ranked");
    expect(text).toContain("Tara Devi");
    expect(text).not.toContain("No CGPA published");

    // The college scope counts only GEC Sheikhpura, and lists its students.
    await app.press("text:GEC Sheikhpura >> nth=0");
    await app.wait(300);
    const collegeText = visible(app);
    expect(collegeText).toContain("RANK IN GEC SHEIKHPURA");
    expect(collegeText).toContain("GEC Sheikhpura rank 2 of 3 students by CGPA.");
  }, 20000);

  test("a semester without a number is a hint, not a table choice", async () => {
    const app = await openRoute("results.rank", { sem: 1 }, {
      network: DOWN,
      storage: { ...rosterCache(ROSTER_NO_CGPA, 1), ...rosterCache(ROSTER_SEM8, 8) },
    });
    await app.wait(300);

    await app.type("label:Registration number", REG);
    await app.wait(200);
    await app.press("text:Find semester 8 rank");
    await app.wait(500);

    expect(visible(app)).toContain("of 3 ranked");
  }, 20000);

  test("a table with no CGPA explains itself and offers the newest one", async () => {
    const app = await openRoute("results.rank", { reg: REG, sem: 1 }, {
      network: DOWN,
      storage: { ...rosterCache(ROSTER_NO_CGPA, 1), ...rosterCache(ROSTER_SEM8, 8) },
    });
    await app.wait(500);

    let text = visible(app);
    expect(text).toContain("NO CGPA IN THIS TABLE");
    expect(text).toContain("SGPAs only");
    expect(text).toContain("Open semester 8");
    expect(text).not.toContain("of 0 ranked");

    await app.press("text:Open semester 8");
    await app.wait(500);
    text = visible(app);
    expect(text).toContain("of 3 ranked");
    expect(text).toContain("Tara Devi");
  }, 20000);

  test("a student with no CGPA is not shown as rank zero", async () => {
    const app = await openRoute("results.rank", { reg: REG, sem: 1 }, {
      network: DOWN,
      storage: rosterCache(ROSTER_ONE_UNRANKED),
    });
    await app.wait(500);

    const text = visible(app);
    expect(text).toContain("not ranked · 3 ranked here");
    expect(text).toContain("not in this order");
    expect(text).toContain("No CGPA published, so no rank.");
    expect(text).not.toContain("of 0 ranked");
    // There is no place to compare, so the rivals card is not a row of dashes.
    expect(text).not.toContain("NEAREST RIVALS");
  }, 20000);

  test("a number from an unpublished batch says so before Find", async () => {
    const app = await openRoute("results.rank", {}, {
      network: DOWN,
      storage: { ...rosterCache(ROSTER_NO_CGPA, 1), ...rosterCache(ROSTER_SEM8, 8) },
    });
    await app.wait(300);

    await app.type("label:Registration number", "27105157098");
    await app.wait(200);

    const text = visible(app);
    expect(text).toContain("BEU has published no roster for this batch and branch yet.");
    expect(text).toContain("No table to read");
    expect(text).not.toContain("FIND SEMESTER 1 RANK");
  }, 20000);

  test("a class ahead of the newest table says which table it is reading", async () => {
    const app = await openRoute("results.rank", {}, { network: DOWN, storage: {} });
    await app.wait(300);

    await app.type("label:Registration number", "24105157098");
    await app.wait(200);

    const text = visible(app);
    expect(text).toContain("Your class is in semester");
    expect(text).toContain("BEU's newest published table is semester 2.");
    expect(text).toContain("Find semester 2 rank");
  }, 20000);

  test("a rank opened from the register lands on a published table", async () => {
    const app = await openRoute("results.rank", { reg: REG, sem: 5 }, {
      network: DOWN,
      storage: { ...rosterCache(ROSTER_NO_CGPA, 1), ...rosterCache(ROSTER_SEM8, 8) },
    });
    await app.wait(500);

    const text = visible(app);
    expect(text).toContain("SEMESTER 8");
    expect(text).toContain("of 3 ranked");
    expect(text).toContain("Tara Devi");
  }, 20000);

  test("college merit shows college places, not branch places", async () => {
    const app = await openRoute(
      "results.merit",
      { reg: REG, college: "157", batch: "21", branch: "105", sem: 1 },
      { network: DOWN, storage: rosterCache(ROSTER) },
    );
    await app.wait(500);
    await app.press("text:GEC Sheikhpura >> nth=0");
    await app.wait(300);

    const texts = app.texts();
    const at = texts.indexOf("ASHA KUMARI");
    expect(at).toBeGreaterThan(1);
    // Dev Raj (college 106) is above her on the branch table, so a branch medal
    // here would read 2; the college list must read 1.
    expect(texts[at - 2]).toBe("1");
  }, 20000);
});

/* ── battle ──────────────────────────────────────────────────────────── */

describe("results battle", () => {
  test("a level battle still counts its tied papers", async () => {
    const app = await openRoute("results.battle", { a: REG, b: TWIN, sem: 1 }, {
      network: DOWN,
      storage: { ...resultCache(ASHA), ...resultCache(ASHA_TWIN) },
    });
    await app.wait(500);

    const text = visible(app);
    // Two level papers are two counted papers, not "no paper on both copies".
    expect(text).toContain("Level");
    expect(text).toContain("2 tied");
    expect(text).not.toContain("No paper is on both copies");
    expect(text).not.toContain("A wins");
  }, 20000);

  test("a paper one side has no total for is left out, and no winner is named", async () => {
    const app = await openRoute("results.battle", { a: REG, b: TWIN, sem: 1 }, {
      network: DOWN,
      storage: { ...resultCache(ASHA), ...resultCache(ASHA_BLANK) },
    });
    await app.wait(500);

    const text = visible(app);
    // Two papers exist, but neither has a total on both copies: missing data,
    // not two losses for B.
    expect(text).toContain("No paper has a total on both sides");
    expect(text).toContain("No call");
    expect(text).not.toContain("A wins");
  }, 20000);
});
