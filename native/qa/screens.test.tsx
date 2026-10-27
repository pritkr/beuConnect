/**
 * The screens a student reaches in their first five minutes.
 *
 * Runs headless: `nsh test qa/screens.test.tsx`
 *
 * One screen per test, one mount each. The network is down everywhere: what a
 * student sees offline is the only thing this file asserts, because that is the
 * case that used to break (a saved result that would not open, a cached board
 * that rendered blank).
 *
 * Assertions are anchored to **data the app ships** — a subject code from the
 * bundle, a notice title from the seeded board, a cached SGPA — not to copy, so
 * a wording change does not turn the suite red. Where a `testID` exists, it is
 * used instead of text.
 *
 * Not covered here, on purpose: Tools, PYQs and Settings. They are large,
 * self-contained areas with their own pure-logic and data contracts
 * (`qa/unit/logic.test.ts`, `qa/data.test.ts`), and mounting them every run was
 * the bulk of the old suite's cost.
 */

import { describe, expect, test } from "nsh/test";

import type { ResultData } from "../src/features/results/data";
import { DOWN, ONBOARDED, awaitNav, openRoute, visible } from "./support";

const REG = "21105157098";
const SPACED = "2110-5157-098";
/** 24 batch: in Sem 4 from July 2026, whatever a stored profile claims. */
const REG_24 = "24105157010";

/* ── fixtures ─────────────────────────────────────────────────────────── */

/** What `results` caches for one semester: `{at, value}` inside `{at, data}`. */
function savedResult(): Record<string, string> {
  const at = Date.now();
  const data: ResultData = {
    reg: REG, name: "Asha Kumari", fatherName: "", motherName: "",
    collegeCode: "105", collegeName: "Government Engineering College Sheikhpura",
    branchCode: "105", branchName: "Computer Science & Engineering",
    semester: 1, examYear: "2024", examHeld: "Dec 2023", course: "B.Tech",
    sgpa: 8.75, cgpa: 8.6,
    history: [8.75, null, null, null, null, null, null, null],
    subjects: [
      { code: "101", name: "Mathematics I", kind: "theory", ese: "70", ia: "20", total: "90", grade: "A+", credit: "4" },
      { code: "102", name: "Physics", kind: "theory", ese: "55", ia: "18", total: "73", grade: "B+", credit: "3" },
    ],
    status: "PASS", failed: [], credits: 7, stateRank: null, collegeRank: null,
    source: "live", savedAt: at,
  };
  return {
    [`beu.cache.result:${REG}:1`]: JSON.stringify({
      at,
      value: JSON.stringify({ at, data }),
    }),
  };
}

/** The notice board as the site publishes it, in the shape the parser reads. */
const NOTICE_TITLE = "B.Tech 3rd Semester Exam Schedule";
const BOARD_HTML = `
<article class="notice-card" data-category="Important" data-course="B.Tech" data-semester="3rd">
  <h2>${NOTICE_TITLE}</h2>
  <time datetime="${new Date(Date.now() - 12 * 3600_000).toISOString()}"></time>
  <a class="notice-link" href="https://beu-bih.ac.in/files/exam-schedule.pdf">Download</a>
</article>
<article class="notice-card" data-category="General" data-course="MCA" data-semester="1st">
  <h2>MCA 1st Semester Registration</h2>
  <time datetime="${new Date(Date.now() - 4 * 86_400_000).toISOString()}"></time>
</article>
`;

const NOTES_MANIFEST = {
  updatedAt: "2026-10-26",
  subjects: [
    {
      id: "cse-1-100102", branch: "cse", sem: 1, code: "100102",
      name: "Engineering Mathematics–I",
      vvi: [
        { topic: "Rolle's theorem", note: "Rolle needs f(a) = f(b).", marks: 7, confidence: "high" },
        { topic: "Eigenvalues", note: "Solve |A − λI| = 0.", marks: 8, confidence: "medium" },
      ],
      files: [{ id: "cse-1-100102-unit1", title: "Unit 1 — Calculus", kind: "handwritten", pages: 24, bytes: 2_400_000, url: "https://beu.prit.eu.org/notes/cse/1/100102/u1.pdf", updatedAt: "2026-10-20" }],
    },
    { id: "cse-1-100111", branch: "cse", sem: 1, code: "100111", name: "Programming for Problem Solving", vvi: [], files: [] },
    { id: "cse-3-105302", branch: "cse", sem: 3, code: "105302", name: "Data Structure & Algorithms", vvi: [], files: [] },
  ],
};

const NOTES_CACHE = {
  ...ONBOARDED,
  "beu.profile": JSON.stringify({ reg: "26105157010", branch: "cse", sem: 1, college: "157" }),
  "beu.cache.notes.manifest": JSON.stringify({ at: Date.now(), value: JSON.stringify(NOTES_MANIFEST) }),
};

/* ── the screens ──────────────────────────────────────────────────────── */

describe("home", () => {
  test("opens offline, with real doors and no invented numbers", async () => {
    const app = await openRoute("home", {}, { network: DOWN, storage: {} });
    const text = visible(app);
    expect(app.shows("id:home-scroll")).toBe(true);
    // A door the app added and once forgot to link.
    expect(text).toContain("Notes & VVI");
    // Nothing is saved, so nothing may be claimed: no SGPA, no attendance.
    expect(text).not.toContain("SGPA");
  }, 20000);
});

describe("syllabus", () => {
  test("opens on the class's semester, not a stale saved pick", async () => {
    const app = await openRoute("syllabus", {}, {
      network: DOWN,
      storage: {
        "beu.profile": JSON.stringify({ reg: REG_24, branch: "cse", sem: 1, college: "157" }),
        "beu.syllabus.course": JSON.stringify({ branch: "cse", sem: 1, at: 1 }),
      },
    });
    const text = visible(app);
    // The saved pick says Sem 1; a 24-batch student is in Sem 4, and the
    // header is what says which semester the list below it belongs to.
    expect(text).toContain("CSE · Sem 4");
    expect(text).toContain("Computer Organization");
  }, 20000);

  test("a paper opens with its own units", async () => {
    const app = await openRoute(
      "syllabus.subject",
      { branch: "cse", sem: 1, code: "100110" },
      { network: DOWN, storage: ONBOARDED },
    );
    const text = visible(app);
    expect(app.shows("id:subject-scroll")).toBe(true);
    expect(text).toContain("Engineering Physics");
    // Units are the paper's body: a title bar over nothing is the bug this
    // catches (the old blank-paper regression).
    expect(text.toLowerCase()).toContain("unit");
  }, 20000);

  test("a topic hands YouTube a real search, copies its words and opens the VVI note", async () => {
    const app = await openRoute(
      "syllabus.subject",
      { branch: "cse", sem: 1, code: "100102" },
      { network: DOWN, storage: NOTES_CACHE },
    );
    await app.press("label:Elementary Row operations");
    await app.waitFor("label:Search YouTube for Elementary Row operations");

    // The VVI sheet exists in the manifest, so the door to it exists too.
    expect(app.shows("label:Short note for Engineering Mathematics–I")).toBe(true);

    // YouTube is a search, never an answer the app invented.
    await app.press("label:Search YouTube for Elementary Row operations");
    await app.waitUntil(() => app.openedUrls().length > 0);
    const search = app.openedUrls()[0];
    expect(search.startsWith("https://www.youtube.com/results?search_query=")).toBe(true);
    expect(decodeURIComponent(search)).toContain("Engineering Mathematics–I Elementary Row operations");

    await app.press("label:Copy Elementary Row operations");
    await app.waitUntil(() => (app.clipboard() ?? "").includes("Elementary Row operations"));
    expect(app.clipboard() ?? "").toContain("100102");

    await app.press("label:Short note for Engineering Mathematics–I");
    const entry = await awaitNav(app, "notes.subject");
    expect(entry.params.code).toBe("100102");
    expect(Number(entry.params.sem)).toBe(1);
    expect(entry.params.branch).toBe("cse");
  }, 20000);
});

describe("results", () => {
  test("a result saved on the device opens with the network down", async () => {
    const app = await openRoute(
      "results",
      // The same student, typed with dashes: the cache key is digits only.
      { reg: SPACED, sem: 1 },
      { network: DOWN, storage: savedResult() },
    );
    await app.wait(2600);
    const text = visible(app);
    expect(text).toContain("Asha Kumari");
    expect(text).toContain("8.75");
    expect(text).toContain("Mathematics I");
  }, 30000);

  test("with nothing saved and BEU down, the failure offers a retry", async () => {
    const app = await openRoute("results", { reg: REG, sem: 1 }, { network: DOWN });
    await app.wait(2600);
    const text = visible(app);
    if (!text.includes("No result this time")) {
      throw new Error(`the failure was not reported to the user.\n  rendered: ${text.slice(0, 400)}`);
    }
    // A screen that drops the retry strands the student.
    expect(app.shows("text:Try again")).toBe(true);
  }, 30000);
});

describe("notes", () => {
  test("the shelf reads the cached manifest and the class's own semester", async () => {
    const app = await openRoute("notes", {}, { network: DOWN, storage: NOTES_CACHE });
    const text = visible(app);
    // Sem 1 subjects, from the manifest.
    expect(text).toContain("Engineering Mathematics–I");
    expect(text).toContain("Programming for Problem Solving");
    // Counts come from the manifest, not from a placeholder.
    expect(text).toContain("2 VVI");
    expect(text).toContain("1 note");
    // A Sem 3 subject is not on a Sem 1 shelf.
    expect(text).not.toContain("Data Structure & Algorithms");
  }, 20000);
});

describe("search", () => {
  test("a syllabus code finds its subject with the network down", async () => {
    const app = await openRoute("search", {}, { network: DOWN, storage: ONBOARDED });
    await app.type("id:search-input", "100110");
    await app.wait(200);
    const text = visible(app);
    expect(text).toContain("Engineering Physics");
    // The exact code leads the lab paper that only shares its prefix.
    expect(text.indexOf("Engineering Physics")).toBeLessThan(text.indexOf("Engineering Physics Lab"));
  }, 30000);
});

describe("notices", () => {
  test("the board renders its cached copy, counts and all", async () => {
    const app = await openRoute("notices", {}, {
      network: DOWN,
      // The board's fetch retries on a real `setTimeout`, so a manual clock
      // would never let the offline path settle.
      clock: null,
      storage: {
        ...ONBOARDED,
        "beu.cache.notices.board.v1": JSON.stringify({ at: Date.now(), value: BOARD_HTML }),
      },
    });
    expect(app.shows("id:notices-board")).toBe(true);
    // The board hydrates from the cached copy after the page mounts.
    await app.waitFor("text:Offline copy", { timeout: 5000 });
    const text = visible(app);
    // Two real rows, counted from the HTML — not a placeholder.
    expect(text).toContain("2 unread of 2 notices");
    // A cached board says it is one.
    expect(text).toContain("Offline copy");
  }, 30000);

  test("mark all read clears every badge, and undo restores the exact list", async () => {
    const app = await openRoute("notices", {}, {
      network: DOWN,
      clock: null,
      storage: {
        ...ONBOARDED,
        "beu.cache.notices.board.v1": JSON.stringify({ at: Date.now(), value: BOARD_HTML }),
      },
    });
    await app.waitUntil(() => visible(app).includes("2 unread of 2 notices"), { timeout: 5000 });
    await app.press("text:Mark all read");
    // The undo bar names what happened before it offers the way back.
    await app.waitFor("text:Marked 2 notices read", { timeout: 5000 });
    await app.waitUntil(() => visible(app).includes("0 unread of 2 notices"), { timeout: 5000 });
    expect(app.storage()["beu.notices.read.v1"]).toContain("n");

    await app.press("text:Undo");
    await app.waitUntil(() => visible(app).includes("2 unread of 2 notices"), { timeout: 5000 });
    expect(visible(app)).not.toContain("Marked 2 notices read");
  }, 30000);
});

describe("first run", () => {
  test("skipping records the decision and writes no profile", async () => {
    const app = await openRoute("onboarding", {}, { network: DOWN });
    expect(visible(app)).toContain("Every mark, every paper, one place.");

    await app.press("text:Skip for now");
    await app.wait(200);
    const stored = app.storage();
    const flag = stored["beu.onboarding"];
    expect(flag === undefined).toBe(false);
    if (flag) expect(JSON.parse(flag).done).toBe(true);
    // Skipping is not a profile: nothing may claim a registration number.
    expect(stored["beu.profile"]).toBe(undefined);
  }, 20000);
});
