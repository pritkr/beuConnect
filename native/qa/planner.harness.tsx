/**
 * Planner-only route host.
 *
 * `./harness.tsx` imports every area the screen suite mounts; while one of
 * those areas is mid-refactor the whole host can fail to build, which would
 * take the planner's own tests down with it. This host imports the planner and
 * nothing else, so the planner suite's result is about the planner.
 *
 * It boots from the same `qa.route` / `qa.params` storage keys as the shared
 * host, and records navigation the same way, so `qa/support.ts` helpers still
 * read the log.
 */

import { Text, View, mount, resource, Storage } from "nsh";

import type { Nav, RouteDef, RouteParams } from "../src/app/router";
import { plannerRoutes } from "../src/features/planner";

const ROUTES: RouteDef[] = [...plannerRoutes];
const ROUTE_MAP: Record<string, RouteDef> = Object.fromEntries(ROUTES.map((route) => [route.name, route]));

const NAV_KEY = "qa.navlog";
const ROUTE_KEY = "qa.route";
const PARAMS_KEY = "qa.params";

interface Boot {
  name: string;
  params: RouteParams;
}

interface NavEntry {
  kind: "push" | "replace";
  name: string;
  params: RouteParams;
}

function record(log: NavEntry[], kind: "push" | "replace", name: string, params?: RouteParams): void {
  log.push({ kind, name, params: params ?? {} });
  void Storage.setItem(NAV_KEY, JSON.stringify(log)).catch(() => {});
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

const navLog: NavEntry[] = [];

function parseParams(raw: string | null): RouteParams {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RouteParams) : {};
  } catch {
    return {};
  }
}

function PlannerHost() {
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
    { initialValue: { name: "", params: {} } },
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

mount(PlannerHost);
