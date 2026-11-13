/**
 * Daily tools — the hub and the numbers a student acts on.
 *
 * The grade and attendance maths itself is pinned in `qa/unit/logic.test.ts`;
 * this file is the screen half: every door resolves, the predictor names the
 * paper type it asks about, and a paper with no classes shows no percentage
 * instead of a division by zero.
 */

import { describe, expect, test } from "nsh/test";
import { navTargets, openRoute, visible } from "./support";

const MONDAY = new Date(2026, 9, 26, 10, 30);

describe("tools hub", () => {
  test("one door per tool, and every door resolves", async () => {
    const app = await openRoute("tools", {}, { clock: { time: MONDAY } });
    const text = visible(app);

    for (const title of ["Calculator", "Attendance", "Routine", "Holidays", "Wi-Fi help"]) {
      expect(text).toContain(title);
    }

    const doors = [
      ["Calculator", "tools.calculator"],
      ["Attendance", "tools.attendance"],
      ["Routine", "tools.routine"],
      ["Holidays", "tools.holidays"],
      ["Wi-Fi help", "tools.wifi"],
    ] as const;

    for (const [title, target] of doors) {
      await app.press(`text:${title}`);
      await app.wait(60);
      expect(navTargets(app)).toContain(target);
    }
  }, 20000);
});

describe("attendance", () => {
  test("a paper with no classes shows no percentage", async () => {
    const app = await openRoute("tools.attendance", {}, {
      clock: { time: MONDAY },
      storage: {
        "beu.tools.attendance:v2": JSON.stringify({
          subjects: [{ id: "sub-1", name: "DBMS", attended: 0, total: 0 }],
          log: [],
          target: 75,
        }),
      },
    });

    const text = visible(app);
    expect(text).toContain("DBMS");
    expect(text).toContain("No classes yet");
    // 0/0 is not 0%, and it is never negative.
    expect(text).not.toContain("0 present of 0 held");
    expect(text).not.toContain("NaN");
  }, 20000);
});

describe("wi-fi", () => {
  test("opens with the campus account already filled in", async () => {
    const app = await openRoute("tools.wifi", {}, { clock: { time: MONDAY } });
    const text = visible(app);

    expect(text).toContain("CAMPUS SIGN-IN");
    expect(text).toContain("24105157049");
    expect(text).toContain("Try nearby numbers");
    // The background runner has to keep the password, so the old "never
    // written to storage" promise would now be false.
    expect(text).not.toContain("Never written to storage");
  }, 20000);
});

describe("predictor", () => {
  test("theory and practical papers carry their own IA split", async () => {
    const app = await openRoute("tools.calculator", {}, {
      clock: { time: MONDAY },
      storage: {
        "beu.tools.calculator:v2": JSON.stringify({ mode: "predict", subjects: [], semesters: [] }),
      },
    });

    expect(visible(app)).toContain("Theory 100");
    expect(visible(app)).toContain("Practical 50");
    expect(visible(app)).toContain("IA / 30");

    await app.press("text:Practical 50 >> nth=0");
    await app.wait(120);
    expect(visible(app)).toContain("IA / 20");
    // A fail is not a target: no chip to plan for an F.
    expect(app.shows("text:F")).toBe(false);
  }, 20000);
});
