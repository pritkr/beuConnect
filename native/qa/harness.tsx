/**
 * QA route host — mounts one registered route in isolation.
 *
 * The shell cannot deep-link, so tests hand the route to this harness through
 * storage: `openRoute("results", { reg, sem })`.
 *
 * **Every merged area, imported through `qa/harness-routes.ts`** — not
 * `src/app/registry.tsx`, so this module stays a plain route host rather than a
 * second shell. Keeping the list in its own file lets `qa/registry.test.ts`
 * compare it with `ALL_ROUTES` without booting a second app, and stops the
 * harness drifting into testing a route the shell cannot show (or missing one
 * that it can). A module that exists but is not merged must not be added there:
 * it would give a mount test a green screen the app cannot reach.
 *
 * The recording `Nav` mirrors every push/replace into storage (`qa.navlog`)
 * because a test can read `app.storage()` but not the app module's variables.
 * `qa/support.ts` reads it back with `navEntries(app)`.
 */

import { Text, View, mount, resource, Storage } from "nsh";

import type { Nav, RouteDef, RouteParams } from "../src/app/router";
import { HARNESS_ROUTES } from "./harness-routes";

/** Every route this harness can mount. Add an area to `harness-routes.ts`. */
const ROUTES: RouteDef[] = HARNESS_ROUTES;

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
