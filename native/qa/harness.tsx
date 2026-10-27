/**
 * QA route host — mounts one registered route in isolation.
 *
 * The shell cannot deep-link, so tests hand the route to this harness through
 * storage: `openRoute("results", { reg, sem })`.
 *
 * **Curated on purpose.** This file imports the route arrays of the areas the
 * suite actually mounts — not `src/app/registry.tsx`. A feature that is
 * mid-refactor and does not compile (a missing export, a renamed helper) can
 * then no longer take the whole suite down with it: the damage stops at the
 * tests that mount that area, and the failure names the route. The app's real
 * merge — every feature, duplicates included — is `qa/registry.test.ts`'s job.
 *
 * The recording `Nav` mirrors every push/replace into storage (`qa.navlog`)
 * because a test can read `app.storage()` but not the app module's variables.
 * `qa/support.ts` reads it back with `navEntries(app)`.
 */

import { Text, View, mount, resource, Storage } from "nsh";

import type { Nav, RouteDef, RouteParams } from "../src/app/router";
import { feedbackRoutes } from "../src/features/feedback";
import { homeRoutes } from "../src/features/home";
import { notesRoutes } from "../src/features/notes";
import { noticesRoutes } from "../src/features/notices";
import { onboardingRoutes } from "../src/features/onboarding";
import { resultsRoutes } from "../src/features/results";
import { searchRoutes } from "../src/features/search";
import { syllabusRoutes } from "../src/features/syllabus";

/** Every route this harness can mount. Add an area here when a test needs it. */
const ROUTES: RouteDef[] = [
  ...feedbackRoutes,
  ...homeRoutes,
  ...notesRoutes,
  ...noticesRoutes,
  ...onboardingRoutes,
  ...resultsRoutes,
  ...searchRoutes,
  ...syllabusRoutes,
];

const ROUTE_MAP: Record<string, RouteDef> = Object.fromEntries(
  ROUTES.map((definition) => [definition.name, definition]),
);

interface Boot {
  name: string;
  params: RouteParams;
}

/** One navigation a screen asked for. */
export interface NavEntry {
  kind: "push" | "replace";
  name: string;
  params: RouteParams;
}

/** Where `navEntries()` in `qa/support.ts` reads the log back from. */
const NAV_KEY = "qa.navlog";
const ROUTE_KEY = "qa.route";
const PARAMS_KEY = "qa.params";
const EMPTY: Boot = { name: "", params: {} };

function record(log: NavEntry[], kind: "push" | "replace", name: string, params?: RouteParams): void {
  log.push({ kind, name, params: params ?? {} });
  void Storage.setItem(NAV_KEY, JSON.stringify(log)).catch(() => {
    /* storage is best effort: a test reads the log after a wait */
  });
}

function recordingNav(route: Boot, log: NavEntry[]): Nav {
  return {
    route,
    push: (name, params) => record(log, "push", name, params),
    pop: () => {},
    popToRoot: () => {},
    replace: (name, params) => record(log, "replace", name, params),
  };
}

export const navLog: NavEntry[] = [];

function parseParams(raw: string | null): RouteParams {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RouteParams) : {};
  } catch {
    return {};
  }
}

export function QaHost() {
  const boot = resource<Boot>(
    async () => {
      const raw = await Storage.getItem(ROUTE_KEY);
      let name = "";
      try {
        name = raw ? (JSON.parse(raw) as string) : "";
      } catch {
        name = raw ?? "";
      }
      return { name, params: parseParams(await Storage.getItem(PARAMS_KEY)) };
    },
    { initialValue: EMPTY },
  );

  return (
    <View class="flex-1 bg-background">
      {() => {
        const current = boot();
        if (!current || !current.name) {
          return (
            <Text testID="qa-booting" class="p-4 text-[13px] text-muted-foreground">
              Booting
            </Text>
          );
        }
        const definition = ROUTE_MAP[current.name];
        if (!definition) {
          return (
            <Text testID="qa-missing" class="p-4 text-[13px] text-destructive">
              MISSING ROUTE {current.name}
            </Text>
          );
        }
        return (
          <View class="flex-1" testID="qa-page">
            {definition.render(recordingNav(current, navLog))}
          </View>
        );
      }}
    </View>
  );
}

mount(QaHost);
