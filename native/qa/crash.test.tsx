/**
 * A screen that throws must not take the app with it.
 *
 * The shell mounts every route inside `ScreenBoundary` (`src/app/crash.tsx`);
 * these fixtures mount that same boundary in the same place — under a
 * `NavPage` in a `NavStack` — so the contract is proved without a route that
 * is allowed to crash in production.
 *
 * The three things a fallback owes a student, in order:
 *
 *   1. the app is still there — the stack, the screens under it, the bridges;
 *   2. a way out — "Go back" always works, even at the root of the stack;
 *   3. a way to retry — `reset()` re-renders the screen, and if the cause is
 *      gone the screen comes back.
 *
 * Plus the guards around it: `crashDetail` never leaks a registration number
 * and never throws, and `safeTitle` keeps the header honest when a feature's
 * `title()` is what broke.
 */

import { describe, expect, test, open } from "nsh/test";

import { crashDetail, safeTitle } from "../src/app/crash";
import { visible } from "./support";

const PHONE = { width: 320, height: 640, clock: {} };

describe("a crashing screen is contained", () => {
  test("the rest of the app still renders", async () => {
    const app = await open("./crash-probe.tsx", PHONE);
    const text = visible(app);
    expect(text).toContain("This screen could not open");
    expect(text).toContain("Go back");
  });

  test("the fallback names the route, not a stack trace", async () => {
    const app = await open("./crash-probe.tsx", PHONE);
    const text = visible(app);
    expect(text).toContain("syllabus.subject");
    expect(text).toContain("probe failed");
    // A registration number quoted in an error message must not reach a screen
    // a student can screenshot.
    expect(text).toContain("[redacted]");
    expect(text).not.toContain("21105157098");
    expect(text).not.toContain(" at ");
  });

  test("Go back leaves the broken screen", async () => {
    const app = await open("./crash-probe.tsx", PHONE);
    await app.press("label:Go back");
    expect(visible(app)).toContain("shell alive");
    // The fallback is gone, so the student is not looking at an error page.
    expect(visible(app)).not.toContain("This screen could not open");
  });

  test("Try again on a screen that keeps failing stays on the fallback", async () => {
    const app = await open("./crash-probe.tsx", PHONE);
    await app.press("label:Try this screen again");
    // `reset()` re-renders once; a throw that did not go away must come back to
    // the same page, not spin.
    expect(visible(app)).toContain("This screen could not open");
    await app.press("label:Go back");
    expect(visible(app)).toContain("shell alive");
  });

  test("Try again re-renders a screen whose cause has gone", async () => {
    const app = await open("./crash-retry.tsx", PHONE);
    expect(visible(app)).toContain("This screen could not open");
    await app.press("label:Try this screen again");
    expect(visible(app)).toContain("screen content");
    expect(visible(app)).not.toContain("This screen could not open");
  });
});

describe("a crashing shell is contained", () => {
  test("the last-resort page appears instead of a blank window", async () => {
    const app = await open("./crash-root.tsx", PHONE);
    const text = visible(app);
    expect(text).toContain("BEUConnect hit a problem");
    expect(text).toContain("Reopen");
    expect(text).toContain("shell failed");
  });

  test("Reopen mounts the shell again", async () => {
    const app = await open("./crash-root.tsx", PHONE);
    await app.press("label:Reopen BEUConnect");
    expect(visible(app)).toContain("shell mounted");
    expect(visible(app)).not.toContain("BEUConnect hit a problem");
  });
});

describe("a crashing timer is contained", () => {
  test("a throw inside setTimeout does not end the app", async () => {
    const app = await open("./crash-timers.tsx", PHONE);
    await app.press("label:Boom");
    await app.wait(50);
    expect(visible(app)).toContain("timer survived");
    // The app still takes input: this is the difference between a dead context
    // (nothing responds) and a logged error.
    await app.press("label:Ping");
    expect(visible(app)).toContain("still alive");
  });
});

describe("the crash text is safe", () => {
  test("scrubs long digit runs", () => {
    expect(crashDetail(new Error("no row for 21105157098 in sem 4"))).toBe("Error: no row for [redacted] in sem 4");
  });

  test("never returns an empty string", () => {
    for (const value of [undefined, null, "", {}, [], 0, false, Symbol("x")]) {
      const text = crashDetail(value);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test("a throwing getter is not allowed to throw again", () => {
    const hostile = {
      get message(): string {
        throw new Error("nope");
      },
    };
    expect(crashDetail(hostile)).toBe("Unknown error");
  });

  test("a title that throws becomes a usable header", () => {
    expect(
      safeTitle(() => {
        throw new Error("bad params");
      }, {}),
    ).toBe("BEUConnect");
    expect(safeTitle(() => "", {})).toBe("BEUConnect");
    expect(safeTitle(() => "Semester 4", {})).toBe("Semester 4");
  });
});
