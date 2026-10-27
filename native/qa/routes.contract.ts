/**
 * The route contract: every top-level route the app must ship.
 *
 * Source of truth, in this order:
 *   1. `native/docs/BUILD_SPEC.md` — each area's top-level route.
 *   2. `native/src/app/tabbar.tsx` — the five tabs.
 *   3. `native/src/app/more.tsx` — the fifteen "More" entries (namespaced names:
 *      `results.rank`, `tools.calculator`, `settings.about`, …).
 *
 * QA reads this; feature modules own registration. A name here that is not in
 * `ALL_ROUTES` is reported as `test.todo`, so the gap is visible in `nsh test`
 * without breaking the always-green suite (`qa/registry.test.ts`).
 *
 * `params` are a plausible sample, used to prove a route survives real params.
 */

export interface RouteContract {
  /** The registered route name (exactly what `ROUTE_MAP` must contain). */
  name: string;
  /** The area that owns registration. */
  area:
    | "home"
    | "syllabus"
    | "results"
    | "pyqs"
    | "tools"
    | "feedback"
    | "notices"
    | "settings"
    | "notes"
    | "planner"
    | "search"
    | "shell";
  /** Where the user reaches it from. */
  entry: string;
  /** A realistic param sample for the mount test. */
  params: Record<string, string | number>;
  /** False for names the spec leaves open (described in `note`). */
  owned: boolean;
  note?: string;
}

export const ROUTE_CONTRACT: RouteContract[] = [
  { name: "home", area: "home", entry: "tab", params: {}, owned: true },
  { name: "syllabus", area: "syllabus", entry: "tab", params: { branch: "cse", sem: 3 }, owned: true },
  { name: "results", area: "results", entry: "tab", params: {}, owned: true },
  { name: "tools", area: "tools", entry: "tab", params: {}, owned: true },
  { name: "pyqs", area: "pyqs", entry: "more", params: {}, owned: true },
  { name: "notes", area: "notes", entry: "more", params: {}, owned: true },
  {
    name: "notes.subject",
    area: "notes",
    entry: "notes",
    params: { branch: "cse", sem: 3, code: "105302", name: "Data Structure & Algorithms" },
    owned: true,
  },
  {
    name: "notes.file",
    area: "notes",
    entry: "notes.subject",
    params: { url: "https://beu.prit.eu.org/notes/cse/3/dsa-unit-1.pdf", title: "DSA — Unit 1" },
    owned: true,
  },
  { name: "planner", area: "planner", entry: "more", params: { branch: "cse", sem: 3 }, owned: true },
  {
    name: "pyqs.paper",
    area: "pyqs",
    entry: "pyqs",
    params: {
      slug: "operating-systems",
      code: "105403",
      year: 2024,
      variant: "",
      id: "2024",
      title: "",
      name: "Operating Systems",
      branch: "cse",
      sem: 3,
    },
    owned: true,
  },
  {
    name: "pyqs.site",
    area: "pyqs",
    entry: "pyqs.paper",
    params: { slug: "operating-systems", name: "Operating Systems", anchor: "paper-2024" },
    owned: true,
  },
  { name: "search", area: "search", entry: "more", params: {}, owned: true },
  { name: "notices", area: "notices", entry: "more", params: {}, owned: true },
  { name: "results.rank", area: "results", entry: "more", params: { batch: "21", branch: "cse", sem: 3 }, owned: true },
  { name: "results.merit", area: "results", entry: "more", params: { branch: "cse", sem: 3 }, owned: true },
  { name: "results.battle", area: "results", entry: "more", params: {}, owned: true },
  { name: "data", area: "pyqs", entry: "more", params: {}, owned: true },
  { name: "tools.attendance", area: "tools", entry: "more", params: {}, owned: true },
  { name: "tools.routine", area: "tools", entry: "more", params: {}, owned: true },
  { name: "tools.holidays", area: "tools", entry: "more", params: {}, owned: true },
  { name: "tools.wifi", area: "tools", entry: "more", params: {}, owned: true },
  { name: "feedback", area: "feedback", entry: "more", params: { from: "more" }, owned: true },
  { name: "settings.offline", area: "settings", entry: "settings", params: {}, owned: true },
  { name: "settings.about", area: "settings", entry: "more", params: {}, owned: true },
];

/** The five tab roots; the shell asserts these resolve. */
export const TAB_ROUTES = ["home", "syllabus", "results", "tools"];

/** `more` is rendered by the shell itself, not by a feature module. */
export const SHELL_ROUTES = ["more"];

/** Every "More" entry, in screen order (`native/src/app/more.tsx`). */
export const MORE_ENTRIES: { label: string; route: string }[] = [
  { label: "Notes & VVI", route: "notes" },
  { label: "Previous year papers", route: "pyqs" },
  { label: "Study planner", route: "planner" },
  { label: "Search everything", route: "search" },
  { label: "Notices", route: "notices" },
  { label: "SGPA / CGPA calculator", route: "tools.calculator" },
  { label: "University rank", route: "results.rank" },
  { label: "Merit list", route: "results.merit" },
  { label: "Result battle", route: "results.battle" },
  { label: "Attendance", route: "tools.attendance" },
  { label: "Routine", route: "tools.routine" },
  { label: "Holidays", route: "tools.holidays" },
  { label: "Data browser", route: "data" },
  { label: "Wi-Fi help", route: "tools.wifi" },
  { label: "Profile", route: "settings.profile" },
  { label: "Settings", route: "settings" },
  { label: "Send feedback", route: "feedback" },
  { label: "About BEUConnect", route: "settings.about" },
];
