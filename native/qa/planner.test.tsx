/**
 * The study planner screen — `src/features/planner`, mounted at 320 pt.
 *
 * Runs headless: `nsh test qa/planner.test.tsx`
 *
 * The planner is the one screen where a wrong number is a study plan the
 * student cannot follow. These tests mount it against the real bundled CSE
 * Sem 3 pack, with a saved course and exam date, and assert the three things
 * the screen owes: days that start today, an honest verdict when the syllabus
 * cannot fit, and ticks shared with the syllabus store.
 */

import { describe, expect, test } from "nsh/test";

import { open } from "nsh/test";

import { DOWN, PHONE, visible } from "./support";

/* ── fixtures ─────────────────────────────────────────────────────────── */

/** 10 days out from the clock below: two of them are the revision tail. */
const EXAM = "2026-11-20";
const NOW = new Date(2026, 10, 10, 9, 0, 0);

const PLAN = {
  branch: "cse",
  sem: 3,
  exam: EXAM,
  minutesPerDay: 60,
  at: 1,
};

const SAVED = { "beu.planner": JSON.stringify(PLAN) };

/** The first topic the plan puts on day 1 with nothing ticked. */
const FIRST = "Right Understanding";
/** The same topic's mark in `beu.syllabus.studied`. */
const FIRST_KEY = "cse|3|105306|u1-t1";

/** Mounts the planner alone, so another area's refactor cannot fail this file. */
async function openPlanner(storage: Record<string, string>) {
  const app = await open("./planner.harness.tsx", {
    ...PHONE,
    clock: { time: NOW },
    network: DOWN,
    storage: {
      "qa.route": JSON.stringify("planner"),
      "qa.params": JSON.stringify({}),
      ...storage,
    },
  });
  await app.waitFor("id:qa-page", { timeout: 8000 });
  return app;
}

/* ── tests ────────────────────────────────────────────────────────────── */

describe("planner", () => {
  test("a saved course lays out real days and keeps the tail for revision", async () => {
    const app = await openPlanner(SAVED);
    const text = visible(app);

    expect(text).toContain("CSE · SEMESTER 3");
    expect(text).toContain("10 days left");
    expect(text).toContain("DAY 1");
    expect(text).toContain("2 topics");
    expect(app.shows(`label:${FIRST}, studied`)).toBe(true);

    // 132 topics in eight study days is not a plan, and the screen says so.
    expect(text).toContain("At 60 min a day this course needs");
    expect(text).toContain("more days");
    expect(text).toContain("topics have no day before the exam");

    await app.press("text:Show all 10 days");
    expect(visible(app)).toContain("REVISION");
    expect(visible(app)).toContain("No new topics");
  }, 20000);

  test("a tick already made in Syllabus leaves the plan, and a tick here is written back", async () => {
    const app = await openPlanner({
      ...SAVED,
      "beu.syllabus.studied": JSON.stringify({ [FIRST_KEY]: true }),
    });

    // The mark seeded above is the shared store the syllabus screens write.
    expect(visible(app)).not.toContain(FIRST);
    const firstDay = "id:planner-day-1 >> label:Introduction, studied";
    expect(app.shows(firstDay)).toBe(true);

    await app.press(firstDay);
    await app.wait(80);

    const marks = JSON.parse(app.storage()["beu.syllabus.studied"] ?? "{}") as Record<string, boolean>;
    expect(marks["cse|3|105302|u1-t1"]).toBe(true);
    // The write merged into the newest copy instead of clobbering the other tick.
    expect(marks[FIRST_KEY]).toBe(true);
  }, 20000);

  test("no exam date shows the one action that sets it, and no invented day", async () => {
    const app = await openPlanner({
      "beu.planner": JSON.stringify({ ...PLAN, exam: "" }),
    });
    const text = visible(app);

    expect(text).toContain("No exam date");
    expect(text).toContain("Set the exam date");
    expect(text).not.toContain("Day 1");

    await app.press("text:Set the exam date");
    expect(visible(app)).toContain("MINUTES A DAY");
    expect(visible(app)).toContain("1 week");
  }, 20000);
});
