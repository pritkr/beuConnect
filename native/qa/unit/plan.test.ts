/**
 * The study planner's arithmetic — `src/features/planner/plan.ts`, no engine.
 *
 * Runs headless: `nsh test qa/unit/plan.test.ts`
 *
 * The plan a student acts on is a pure function of five values: the units, the
 * topics already ticked, the exam date, the minutes a day, and today. These
 * tests pin the promises made on screen: a day never asks for more than the
 * pace allows, the last days are kept for revision, two heavy units never land
 * on one day, and an impossible deadline is reported with one concrete fix
 * instead of a plan that quietly drops topics.
 */

import { describe, expect, test } from "nsh/test";

import type { PlanUnitSeed } from "../../src/features/planner/plan";
import { revisionDaysFor, scheduleFor, targetFor } from "../../src/features/planner/plan";

/* ── fixtures ─────────────────────────────────────────────────────────── */

const NOW = "2026-11-10";
const COURSE = { branch: "cse", sem: 3 };

/** Nine topics across three papers: enough to need several days at 60 min. */
const UNITS: PlanUnitSeed[] = [
  {
    code: "105302",
    subject: "Data Structure & Algorithms",
    title: "Unit 1",
    topicIds: ["u1-t1", "u1-t2", "u1-t3"],
    topicTitles: ["Arrays", "Stacks", "Queues"],
  },
  {
    code: "105303",
    subject: "Operating Systems",
    title: "Unit 1",
    topicIds: ["u1-t1", "u1-t2"],
    topicTitles: ["Processes", "Deadlock"],
  },
  {
    code: "105304",
    subject: "Database Management",
    title: "Unit 1",
    topicIds: ["u1-t1", "u1-t2", "u1-t3", "u1-t4"],
    topicTitles: ["Normalisation", "SQL", "Joins", "Transactions"],
  },
];

function schedule(overrides: Partial<Parameters<typeof scheduleFor>[0]> = {}) {
  return scheduleFor({
    units: UNITS,
    studied: {},
    exam: "2026-11-20",
    minutesPerDay: 60,
    now: NOW,
    course: COURSE,
    ...overrides,
  });
}

/* ── the pace ─────────────────────────────────────────────────────────── */

describe("pace", () => {
  test("a quarter hour of slack is never planned away", () => {
    // 25-minute topics: 45 min still carries one, 120 carries four, never five.
    expect(targetFor(30)).toBe(1);
    expect(targetFor(45)).toBe(1);
    expect(targetFor(60)).toBe(2);
    expect(targetFor(90)).toBe(3);
    expect(targetFor(120)).toBe(4);
    expect(targetFor(600)).toBe(4);
    expect(targetFor(0)).toBe(1);
  });

  test("the revision buffer starts at five days and is about a sixth", () => {
    expect(revisionDaysFor(0)).toBe(0);
    expect(revisionDaysFor(4)).toBe(0);
    expect(revisionDaysFor(5)).toBe(1);
    expect(revisionDaysFor(7)).toBe(1);
    expect(revisionDaysFor(20)).toBe(3);
    expect(revisionDaysFor(60)).toBe(9);
  });
});

/* ── the normal plan ──────────────────────────────────────────────────── */

describe("a normal plan", () => {
  test("fills every day from today to the exam, then keeps the tail for revision", () => {
    const plan = schedule();
    expect(plan.feasibility?.state).toBe("fits");
    expect(plan.days.length).toBe(10);
    expect(plan.days[0].date).toBe("2026-11-10");
    expect(plan.days[9].date).toBe("2026-11-19");
    expect(plan.revisionDays).toBe(2);
    expect(plan.studyDays).toBe(8);
    expect(plan.days.slice(-2).every((day) => day.kind === "revision")).toBe(true);
    expect(plan.days.some((day) => day.kind === "revision" && day.topics.length > 0)).toBe(false);
    expect(plan.days.some((day) => day.kind === "study")).toBe(true);
    expect(plan.overflow).toEqual([]);
    expect(plan.units.every((unit) => unit.left === unit.planned)).toBe(true);
  });

  test("a day mixes papers and never starts two long units", () => {
    const plan = schedule();
    for (const day of plan.days) {
      expect(day.topics.length).toBeLessThanOrEqual(plan.target);
      const long = day.topics.filter((topic) => {
        const row = plan.units.find((unit) => unit.code === topic.code && unit.title === topic.unit);
        return row ? row.left > plan.target : false;
      });
      // A 16-topic unit must not swallow a day beside another long unit.
      expect(new Set(long.map((topic) => topic.unit)).size).toBeLessThanOrEqual(1);
    }
    // The first day starts two papers, not two units of the same paper.
    expect(new Set(plan.days[0].topics.map((topic) => topic.code)).size).toBe(2);
  });

  test("the same inputs produce the same plan", () => {
    expect(JSON.stringify(schedule())).toBe(JSON.stringify(schedule()));
  });
});

/* ── ticks ────────────────────────────────────────────────────────────── */

describe("studied ticks", () => {
  test("a full course key counts, and a ticked topic leaves the days", () => {
    const plan = schedule({ studied: { "cse|3|105302|u1-t1": true } });
    expect(plan.done).toBe(1);
    const placed = plan.days.flatMap((day) => day.topics);
    expect(placed.some((topic) => topic.topicId === "u1-t1" && topic.code === "105302")).toBe(false);
    expect(placed[0].key.startsWith("cse|3|")).toBe(true);
  });

  test("a saved subject key is not a topic tick", () => {
    const plan = schedule({ studied: { "cse|3|105302": true } });
    expect(plan.done).toBe(0);
    expect(plan.topicsLeft).toBe(9);
  });

  test("every topic ticked leaves nothing to schedule", () => {
    const studied: Record<string, boolean> = {};
    for (const unit of UNITS) {
      for (const id of unit.topicIds) studied[`cse|3|${unit.code}|${id}`] = true;
    }
    const plan = schedule({ studied });
    expect(plan.feasibility?.state).toBe("done");
    expect(plan.topicsLeft).toBe(0);
    expect(plan.days).toEqual([]);
    expect(plan.overflow).toEqual([]);
  });
});

/* ── the hard edges ───────────────────────────────────────────────────── */

describe("the hard edges", () => {
  test("no exam date means no verdict and no day cards", () => {
    const plan = schedule({ exam: null });
    expect(plan.feasibility).toBeNull();
    expect(plan.days).toEqual([]);
  });

  test("a course with no parsed topics says so", () => {
    const plan = schedule({ units: [] });
    expect(plan.feasibility?.state).toBe("no-topics");
    expect(plan.feasibility?.fits).toBe(true);
    expect(plan.days).toEqual([]);
  });

  test("an exam that already passed keeps the remaining topics on the record", () => {
    const plan = schedule({ exam: "2026-11-01" });
    const edge = plan.feasibility;
    expect(edge?.state).toBe("past");
    expect(edge?.fits).toBe(false);
    expect(edge?.message).toContain("9 days ago");
    expect(edge?.message).toContain("9 topics left");
    expect(plan.days).toEqual([]);
    expect(edge?.unplaced).toBe(9);
  });

  test("an exam today is not silently replanned for tomorrow", () => {
    const plan = schedule({ exam: NOW });
    const edge = plan.feasibility;
    expect(edge?.state).toBe("today");
    expect(edge?.studyDays).toBe(0);
    expect(edge?.message).toContain("The exam is today");
    expect(plan.days).toEqual([]);
    expect(edge?.fix).not.toBeNull();
  });

  test("an impossible pace names the shortfall, the overflow and one fix", () => {
    const plan = schedule({ exam: "2026-11-11" });
    const edge = plan.feasibility;
    expect(edge?.state).toBe("short");
    expect(edge?.fits).toBe(false);
    expect(edge?.requiredDays).toBe(5);
    expect(edge?.studyDays).toBe(1);
    expect(edge?.shortByDays).toBe(4);
    expect(edge?.unplaced).toBe(7);
    expect(plan.overflow).toHaveLength(7);
    expect(edge?.message).toContain("needs 4 more days");
    // Nine topics in one day is over the four-topic ceiling: move the date.
    expect(edge?.fix?.kind).toBe("date");
  });

  test("a tight pace that fits in four topics offers more minutes, not a new date", () => {
    const plan = schedule({ exam: "2026-11-13" });
    const edge = plan.feasibility;
    expect(edge?.state).toBe("short");
    expect(edge?.studyDays).toBe(3);
    expect(edge?.shortByDays).toBe(2);
    expect(edge?.fix?.kind).toBe("minutes");
    if (edge?.fix?.kind === "minutes") expect(edge.fix.minutes).toBe(90);
  });

  test("the suggested date actually fits without overflow", () => {
    const plan = schedule({ exam: "2026-11-11" });
    const fix = plan.feasibility?.fix;
    expect(fix?.kind).toBe("date");
    if (fix?.kind !== "date") return;
    const moved = schedule({ exam: fix.date });
    expect(moved.feasibility?.state).toBe("fits");
    expect(moved.overflow).toEqual([]);
    expect(moved.feasibility?.unplaced).toBe(0);
    expect(fix.date > "2026-11-11").toBe(true);
  });
});
