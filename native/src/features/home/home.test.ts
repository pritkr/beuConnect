/**
 * Home's own rules, tested without mounting the dashboard.
 *
 * Home is a read-only mirror of what other areas saved, so the parts worth
 * pinning are the pure reads it does every launch: the route it registers, the
 * clock parsing that decides whether a class is still to come, and the branch
 * lookup that turns a saved `cse` into the greeting's "CSE · Sem 4".
 */

import { describe, expect, test } from "nsh/test";

import { homeRoutes } from "./index";
import { branchMeta, branchTitle, minutesOf, shortBranch } from "./state";

describe("home route", () => {
  test("is the single top-level door, and titles itself without params", () => {
    expect(homeRoutes.map((route) => route.name)).toEqual(["home"]);
    for (const route of homeRoutes) {
      expect(route.title({}).length).toBeGreaterThan(0);
    }
    expect(homeRoutes[0].title({})).toBe("BEUConnect");
  });
});

describe("class times", () => {
  test("a clock time becomes minutes past midnight", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("09:05")).toBe(545);
    expect(minutesOf("10:00")).toBe(600);
    expect(minutesOf(" 23:59 ")).toBe(1439);
  });

  test("anything that is not a clock time is -1, never a made-up slot", () => {
    for (const value of ["", "10", "10:5", "25:00", "10:60", "ten", "10:00–11:00"]) {
      expect(minutesOf(value)).toBe(-1);
    }
  });
});

describe("branch names", () => {
  test("a code, a short name and a full name all find the same branch", () => {
    for (const value of ["cse", "CSE", "Computer Science & Engineering"]) {
      expect(branchMeta(value)?.code).toBe("cse");
    }
    expect(branchMeta("cse")?.short).toBe("CSE");
  });

  test("an unknown branch is null, not a guess", () => {
    expect(branchMeta("")).toBeNull();
    expect(branchMeta("mining")).toBeNull();
  });

  test("the greeting shows the short code, the screens the full name", () => {
    expect(shortBranch("cse")).toBe("CSE");
    expect(shortBranch("Computer Science & Engineering")).toBe("CSE");
    expect(branchTitle("cse")).toBe("Computer Science & Engineering");
    // A code the packed data does not know is still readable, never blank.
    expect(shortBranch("mining")).toBe("MINING");
    expect(branchTitle("mining")).toBe("MINING");
  });
});
