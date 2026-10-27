/**
 * Registry contract — everything about the route table that does not need an
 * engine to prove.
 *
 * Runs headless, no app opened, ~1 ms: `nsh test qa/registry.test.ts`
 *
 * This is the cheapest and most productive file in the suite. Every route bug
 * this app actually shipped is caught here, not by mounting screens:
 *
 *   1. a name pushed by a screen that no feature registered — the `nav.push`
 *      literals in `src/` are scanned into `qa/push-targets.ts`, and
 *      `qa/run-tests.sh` refuses to run a stale snapshot;
 *   2. two features registering the same name — `ROUTE_MAP` is built with
 *      `Object.fromEntries`, so the later feature silently wins;
 *   3. a `title()` that throws or returns "" — an empty native header.
 *
 * It is also the only file that imports every feature's `xRoutes`, because the
 * duplicate-name contract is about the merge, and the merge is the array.
 */

import { describe, expect, test } from "nsh/test";

import { ALL_ROUTES, ROUTE_MAP, routeExists } from "../src/app/registry";
import type { RouteDef, RouteParams } from "../src/app/router";
import { feedbackRoutes } from "../src/features/feedback";
import { homeRoutes } from "../src/features/home";
import { notesRoutes } from "../src/features/notes";
import { noticesRoutes } from "../src/features/notices";
import { onboardingRoutes } from "../src/features/onboarding";
import { plannerRoutes } from "../src/features/planner";
import { pyqsRoutes } from "../src/features/pyqs";
import { resultsRoutes } from "../src/features/results";
import { searchRoutes } from "../src/features/search";
import { settingsRoutes } from "../src/features/settings";
import { studentsRoutes } from "../src/features/students";
import { syllabusRoutes } from "../src/features/syllabus";
import { toolsRoutes } from "../src/features/tools";
import { PUSH_TARGETS } from "./push-targets";
import { MORE_ENTRIES, TAB_ROUTES } from "./routes.contract";

/** Every feature module the registry merges, named as the area that owns it. */
const FEATURES: { area: string; routes: RouteDef[] }[] = [
  { area: "home", routes: homeRoutes },
  { area: "notes", routes: notesRoutes },
  { area: "onboarding", routes: onboardingRoutes },
  { area: "planner", routes: plannerRoutes },
  { area: "search", routes: searchRoutes },
  { area: "syllabus", routes: syllabusRoutes },
  { area: "results", routes: resultsRoutes },
  { area: "students", routes: studentsRoutes },
  { area: "pyqs", routes: pyqsRoutes },
  { area: "tools", routes: toolsRoutes },
  { area: "notices", routes: noticesRoutes },
  { area: "settings", routes: settingsRoutes },
  { area: "feedback", routes: feedbackRoutes },
];

/** What `qa/scan-push-targets.mjs` can see, and what a name may look like. */
const ROUTE_NAME = /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)*$/;

const REG = "21105157098";
const OTHER = "21105157102";

/** Params a screen may be opened with: the keys the routes read, not guesses. */
const PARAMS: { label: string; params: RouteParams }[] = [
  { label: "no params", params: {} },
  { label: "semester", params: { sem: 3 } },
  { label: "branch", params: { branch: "cse" } },
  { label: "registration", params: { reg: REG } },
  { label: "subject code", params: { code: "100110" } },
  { label: "battle pair", params: { a: REG, b: OTHER, sem: 3 } },
  {
    label: "everything at once",
    params: {
      reg: REG, a: REG, b: OTHER, sem: 3, batch: "21", branch: "cse",
      college: "105", code: "100110", id: "abc", slug: "abc", q: "maths",
      title: "A paper", url: "https://beu.prit.eu.org/", year: "2024",
    },
  },
];

describe("route table", () => {
  test("no name is registered twice, and the merge loses nothing", () => {
    const owners = new Map<string, string[]>();
    for (const feature of FEATURES) {
      for (const definition of feature.routes) {
        const list = owners.get(definition.name) ?? [];
        if (!list.includes(feature.area)) list.push(feature.area);
        owners.set(definition.name, list);
      }
    }

    const collisions = [...owners.entries()]
      .filter(([, areas]) => areas.length > 1)
      .map(([name, areas]) => `"${name}" is registered by ${areas.join(" and ")}`);
    expect(collisions).toEqual([]);

    const merged = FEATURES.reduce((sum, feature) => sum + feature.routes.length, 0);
    expect(ALL_ROUTES.length).toBe(merged);
    expect(Object.keys(ROUTE_MAP).length).toBe(ALL_ROUTES.length);

    const lost = ALL_ROUTES.filter((definition) => ROUTE_MAP[definition.name] !== definition)
      .map((definition) => definition.name);
    expect(lost).toEqual([]);
  });

  test("every name is lowercase and dotted, so the push scan can see it", () => {
    const odd = ALL_ROUTES.filter((definition) => !ROUTE_NAME.test(definition.name))
      .map((definition) => definition.name);
    expect(odd).toEqual([]);

    // `more` is the shell's own screen; no feature may claim it.
    expect(ALL_ROUTES.map((definition) => definition.name)).not.toContain("more");
    expect(routeExists("more")).toBe(true);

    const unreachable = ALL_ROUTES.filter((definition) => !routeExists(definition.name))
      .map((definition) => definition.name);
    expect(unreachable).toEqual([]);
  });

  test("every route titles every param set the app passes", () => {
    const problems: string[] = [];
    for (const definition of ALL_ROUTES) {
      if (typeof definition.render !== "function") problems.push(`${definition.name}: render is not a function`);
      for (const sample of PARAMS) {
        let title: unknown;
        try {
          title = definition.title(sample.params);
        } catch (error) {
          problems.push(`${definition.name} ${sample.label}: threw ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        if (typeof title !== "string") {
          problems.push(`${definition.name} ${sample.label}: returned ${typeof title}`);
          continue;
        }
        const text = title.trim();
        if (!text) problems.push(`${definition.name} ${sample.label}: empty header title`);
        if (/undefined|\[object|NaN/.test(text)) problems.push(`${definition.name} ${sample.label}: "${text}"`);
        if (definition.title(sample.params) !== title) problems.push(`${definition.name} ${sample.label}: unstable`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("navigation targets", () => {
  test("every route name the source pushes resolves", () => {
    // The scan is generated (`bun qa/scan-push-targets.mjs`): the test sandbox
    // has no filesystem, so the grep happens at authoring time and
    // `qa/run-tests.sh` refuses to run when the snapshot is stale.
    expect(PUSH_TARGETS.length).toBeGreaterThan(20);
    const outside = PUSH_TARGETS.filter((hit) => !hit.file.startsWith("src/")).map((hit) => hit.file);
    expect(outside).toEqual([]);

    const missing = PUSH_TARGETS.filter((hit) => !routeExists(hit.target))
      .map((hit) => `"${hit.target}" (${hit.file}:${hit.line}, ${hit.kind})`);
    expect(missing).toEqual([]);
  });

  test("every tab and every More entry points at a registered route", () => {
    const missingTabs = TAB_ROUTES.filter((name) => !routeExists(name));
    expect(missingTabs).toEqual([]);

    const missingMore = MORE_ENTRIES.filter((entry) => !routeExists(entry.route))
      .map((entry) => `"${entry.label}" → ${entry.route}`);
    expect(missingMore).toEqual([]);

    const labels = MORE_ENTRIES.map((entry) => entry.label);
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toEqual([]);

    const routes = MORE_ENTRIES.map((entry) => entry.route);
    expect(routes.filter((route, index) => routes.indexOf(route) !== index)).toEqual([]);
  });
});
