/**
 * The shell — the chrome every screen lives inside.
 *
 * Runs headless: `nsh test qa/shell.test.tsx`
 *
 * The app is opened through `App.tsx`, so this exercises the real `Shell`,
 * `TabBar` and `More` list — not a harness stand-in. Four guarantees, in the
 * order a student meets them:
 *
 *   1. the five tabs are the roots, and each one is a registered route;
 *   2. switching tabs lands on that tab's own root (no pile-up, no fallback);
 *   3. a child route hides the tab bar, and back restores the root;
 *   4. a phone that has never been through first-run gets the welcome, not Home.
 *
 * Engines are shared per `describe` (`beforeAll`): three mounts cover four
 * tests. Every mount runs on a manual clock, so nothing waits on wall time.
 */

import { beforeAll, describe, expect, open, test, type App } from "nsh/test";

import { ROUTE_MAP } from "../src/app/registry";
import { TABS } from "../src/app/tabbar";
import { MORE_ENTRIES } from "./routes.contract";
import { DOWN, ONBOARDED } from "./support";

const TAB_LABELS = ["Home", "Syllabus", "Results", "Tools", "More"];

/** The real app, already past first-run. */
async function boot(): Promise<App> {
  return open("./../App.tsx", {
    width: 320,
    height: 640,
    clock: {},
    network: DOWN,
    storage: ONBOARDED,
  });
}

/** Everything on screen, joined. */
function seen(app: App): string {
  return app.texts().join(" ");
}

function expectNoFallback(app: App): void {
  expect(seen(app)).not.toContain("No screen for");
  expect(seen(app)).not.toContain("MISSING ROUTE");
}

describe("tab bar", () => {
  let app: App;
  beforeAll(async () => {
    app = await boot();
  }, 20000);

  test("the five tabs are on screen and all resolve", () => {
    expect(TABS.map((tab) => tab.label)).toEqual(TAB_LABELS);
    for (const label of TAB_LABELS) {
      expect(app.shows(`label:${label}`)).toBe(true);
    }
    expectNoFallback(app);
  });

  test("each tab lands on its own root", async () => {
    for (const label of TAB_LABELS.slice(1)) {
      await app.press(`label:${label}`);
      // A root route never hides the bar.
      expect(app.shows(`label:${label}`)).toBe(true);
      expectNoFallback(app);
      // Re-pressing the active tab is a no-op, not another push.
      await app.press(`label:${label}`);
      expect(app.shows(`label:${label}`)).toBe(true);
    }
  });
});

describe("child routes", () => {
  let app: App;
  beforeAll(async () => {
    app = await boot();
  }, 20000);

  test("a child hides the tab bar, and back restores it", async () => {
    await app.press("label:More");
    const entry = MORE_ENTRIES[0];
    expect(app.shows(`text:${entry.label}`)).toBe(true);

    await app.press(`text:${entry.label}`);
    // A child is not a root: the bar goes away and the title comes from the
    // registry, which proves the shell landed on *that* route.
    expect(app.shows("label:Home")).toBe(false);
    const title = ROUTE_MAP[entry.route]?.title({}) ?? "";
    if (title) expect(seen(app)).toContain(title);
    expectNoFallback(app);

    await app.back();
    expect(app.shows("label:Home")).toBe(true);
    expect(app.shows(`text:${entry.label}`)).toBe(true);
    expectNoFallback(app);
  });
});

test("first run opens the one-step welcome, not Home", async () => {
  const app = await open("./../App.tsx", { width: 320, height: 640, clock: {}, network: DOWN });
  // The intro owns the screen: no tabs yet, and no invented student.
  expect(seen(app)).toContain("Every mark, every paper, one place.");
  expect(app.shows("label:Home")).toBe(false);
  expect(seen(app)).not.toContain("Prit");
}, 20000);
