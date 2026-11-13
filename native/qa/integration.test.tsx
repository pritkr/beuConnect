/**
 * Integration: the app as a whole, offline, at 320 × 640.
 *
 * Runs headless: `nsh test qa/integration.test.tsx`
 *
 * Three questions, in the order a broken build usually answers them:
 *
 *   1. **Is the table complete?** Every route the shell merges is mountable by
 *      the harness — the harness list and `ALL_ROUTES` are compared name by
 *      name, so an area added to one and not the other fails here, not on the
 *      device.
 *   2. **Does every route survive a cold, offline, param-less open?** This is
 *      the crash matrix: no network, no cache, no params, 320 pt wide. A route
 *      that throws, renders the 404 fallback, or paints a header over an empty
 *      body fails with its own name in the message.
 *   3. **Can a student actually get there?** The real `App.tsx` is opened and
 *      every "More" entry is pressed and popped. Back must return to More, and
 *      the tab bar must come back — a push that never pops traps the student.
 *
 * Params are proved on the two screens that own a bundled entity (a syllabus
 * paper and a roster student): two different params must render two different
 * entities, which is what "ignores nav params" looks like when it breaks.
 *
 * Not here: interactions inside a screen, copy, and visuals. Those live in
 * `qa/screens.test.tsx`, the feature suites, `scripts/shots.sh` and
 * `docs/ANDROID_TEST_PLAN.md`.
 */

import { describe, expect, open, test, type App } from "nsh/test";

import { ALL_ROUTES } from "../src/app/registry";
import { HARNESS_ROUTES } from "./harness-routes";
import { MORE_ENTRIES, TAB_ROUTES } from "./routes.contract";
import { DOWN, ONBOARDED, expectPage, openRoute, snippet, visible } from "./support";

/** A body shorter than this is a header over nothing, not a screen. */
const MIN_BODY = 12;

/** The two fixture entities the param test reads (both from bundled data). */
const PAPER_A = { code: "105301", name: "Digital Electronics", sem: 3, branch: "cse" };
const PAPER_B = { code: "105302", name: "Data Structure & Algorithms", sem: 3, branch: "cse" };
const STUDENT_A = { reg: "26CSE01", first: "saziya" };
const STUDENT_B = { reg: "26CSE02", first: "seema" };

function body(app: App): string {
  return visible(app).replace(/\s+/g, " ").trim();
}

/** Fails with the route's name and what actually painted. */
function expectScreen(app: App, name: string): void {
  expectPage(app, name);
  const text = body(app);
  if (text.includes("No screen for")) {
    throw new Error(`route "${name}" rendered the shell's 404 fallback.\n  rendered: ${snippet(app, 240)}`);
  }
  if (text.length <= MIN_BODY) {
    throw new Error(`route "${name}" painted ${text.length} chars — a header over nothing.\n  rendered: ${snippet(app, 240)}`);
  }
}

/** The real app, past first run, on a 320 pt phone with no network. */
async function bootApp(): Promise<App> {
  return open("./../App.tsx", {
    width: 320,
    height: 640,
    clock: {},
    network: DOWN,
    storage: ONBOARDED,
    platform: "android",
  });
}

/* ── 1. the table ─────────────────────────────────────────────────────── */

describe("route table and harness cannot drift apart", () => {
  test("the harness mounts exactly the routes the shell merges", () => {
    const registered = ALL_ROUTES.map((definition) => definition.name).sort();
    const harnessed = HARNESS_ROUTES.map((definition) => definition.name).sort();
    expect(harnessed).toEqual(registered);
  });

  test("the app still ships a full route table", () => {
    // A floor, not an exact count: the count in docs drifts, the registry does
    // not. The registry is the count; this floor only catches an area dropped
    // from the merge.
    expect(ALL_ROUTES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ALL_ROUTES.map((definition) => definition.name)).size).toBe(ALL_ROUTES.length);
  });

  test("every tab has a registered root and every More entry a destination", () => {
    const names = new Set(ALL_ROUTES.map((definition) => definition.name));
    expect(TAB_ROUTES.filter((name) => !names.has(name))).toEqual([]);
    expect(MORE_ENTRIES.filter((entry) => !names.has(entry.route)).map((entry) => entry.route)).toEqual([]);
  });
});

/* ── 2. the crash matrix ──────────────────────────────────────────────── */

describe("every route mounts cold and offline with no params", () => {
  for (const definition of ALL_ROUTES) {
    test(`${definition.name}`, async () => {
      const app = await openRoute(definition.name, {}, { network: DOWN, platform: "android" });
      expectScreen(app, definition.name);
    }, 20000);
  }
});

/* ── 3. params are read, not ignored ──────────────────────────────────── */

describe("a route renders the entity its params name", () => {
  test("syllabus.subject: two papers, two screens", async () => {
    const a = await openRoute("syllabus.subject", PAPER_A, { network: DOWN });
    expectScreen(a, "syllabus.subject (A)");
    expect(body(a).toLowerCase()).toContain(PAPER_A.name.toLowerCase());
    expect(body(a)).toContain(PAPER_A.code);

    const b = await openRoute("syllabus.subject", PAPER_B, { network: DOWN });
    expectScreen(b, "syllabus.subject (B)");
    expect(body(b).toLowerCase()).toContain(PAPER_B.name.toLowerCase());
    expect(body(b)).toContain(PAPER_B.code);
  }, 20000);

  test("students.student: two registrations, two students", async () => {
    const a = await openRoute("students.student", STUDENT_A, { network: DOWN });
    expectScreen(a, "students.student (A)");
    expect(body(a).toLowerCase()).toContain(STUDENT_A.first);

    const b = await openRoute("students.student", STUDENT_B, { network: DOWN });
    expectScreen(b, "students.student (B)");
    expect(body(b).toLowerCase()).toContain(STUDENT_B.first);
  }, 20000);

  test("a missing entity is an empty state, not a crash", async () => {
    const paper = await openRoute("syllabus.subject", { code: "000000" }, { network: DOWN });
    expectScreen(paper, "syllabus.subject (unknown code)");
    const student = await openRoute("students.student", { reg: "00000000000" }, { network: DOWN });
    expectScreen(student, "students.student (unknown reg)");
  }, 20000);
});

/* ── 4. dark mode is not a separate app ───────────────────────────────── */

describe("dark mode renders the same screens", () => {
  for (const name of ["home", "syllabus", "results", "tools", "settings"]) {
    test(`${name} in dark`, async () => {
      const app = await openRoute(name, {}, { network: DOWN, colorScheme: "dark" });
      expectScreen(app, `${name} (dark)`);
    }, 20000);
  }
});

/* ── 5. the student's own path: More → screen → back ──────────────────── */

describe("every More entry is a real push with a working back", () => {
  test("press, prove the screen, pop, prove More", async () => {
    const app = await bootApp();
    /** More's own footer — unique to this screen, so it proves we actually left it. */
    const MORE_FOOTER = "text:Made for Bihar Engineering University";
    expect(app.shows("label:More")).toBe(true);
    await app.press("label:More");
    expect(app.shows(MORE_FOOTER)).toBe(true);

    const failures: string[] = [];
    for (const entry of MORE_ENTRIES) {
      const label = `"${entry.label}" → ${entry.route}`;

      try {
        await app.press(`label:${entry.label}`);
      } catch (error) {
        failures.push(`${label}: not pressable (${error instanceof Error ? error.message.split("\n")[0] : error})`);
        continue;
      }

      // A push hides the tab bar and replaces the page. Both are shell-level,
      // so they are the honest proof the route opened — not this screen's copy.
      try {
        await app.waitFor("label:Home", { state: "gone", timeout: 8000 });
      } catch {
        failures.push(`${label}: no navigation — the tab bar never hid (${snippet(app, 160)})`);
        continue;
      }

      const text = body(app);
      if (text.includes("No screen for")) {
        failures.push(`${label}: dead end — the shell's 404`);
      } else if (text.includes("MISSING ROUTE")) {
        failures.push(`${label}: harness-only route`);
      } else if (app.shows(MORE_FOOTER)) {
        failures.push(`${label}: the More screen is still the page`);
      } else if (text.length < MIN_BODY) {
        failures.push(`${label}: empty body (${snippet(app, 120)})`);
      }

      try {
        await app.back();
      } catch (error) {
        failures.push(`${label}: back rejected (${error instanceof Error ? error.message.split("\n")[0] : error})`);
        continue;
      }
      try {
        await app.waitFor(MORE_FOOTER, { timeout: 8000 });
      } catch {
        failures.push(`${label}: back did not return to More (${snippet(app, 120)})`);
      }
      if (!app.shows("label:More")) {
        failures.push(`${label}: the tab bar did not come back`);
      }
      if (!app.shows(`label:${entry.label}`)) {
        failures.push(`${label}: the More list forgot this row after back`);
      }
    }

    expect(failures).toEqual([]);
  }, 120000);
});
