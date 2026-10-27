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

function rosterCache(csv: string): Record<string, string> {
  return { "beu.cache.roster:21:105:1": entry(csv) };
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
        collegeCode: "105",
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
  collegeCode: "105",
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
  "21105157098,ASHA KUMARI,8.75,8.60,105,Government Engineering College Sheikhpura",
  "21105157102,Bharat Kumar,8.20,8.10,105,Government Engineering College Sheikhpura",
  "21105157190,Dev Raj,9.00,9.10,106,Sityog Institute of Technology",
].join("\n");

/* ── every screen at 320 pt ──────────────────────────────────────────── */

describe("results routes at 320 pt", () => {
  const CASES: { name: string; check: string }[] = [
    { name: "results", check: "Check your result" },
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

  test("college merit shows college places, not branch places", async () => {
    const app = await openRoute(
      "results.merit",
      { reg: REG, college: "105", batch: "21", branch: "105", sem: 1 },
      { network: DOWN, storage: rosterCache(ROSTER) },
    );
    await app.wait(500);
    await app.press("text:College 105 >> nth=0");
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
