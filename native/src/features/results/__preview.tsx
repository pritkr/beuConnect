/**
 * Results — preview host for `nsh test`.
 *
 * Mounts one results route by name, with optional params, from storage so the
 * five screens can be opened at 320pt without booting the whole shell. The
 * real app registers the same routes through `index.tsx`; this file is QA
 * scaffolding only.
 */

import { Text, View, mount, resource, Storage } from "nsh";

import type { Nav, RouteParams } from "../../app/router";
import { resultsRoutes } from "./index";

const ROUTE_KEY = "results.preview.route";
const PARAMS_KEY = "results.preview.params";

interface Preview {
  route: string;
  params: RouteParams;
}

function parseParams(raw: string | null): RouteParams {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as RouteParams;
    return {};
  } catch {
    return {};
  }
}

const boot = resource<Preview>(
  async () => ({
    route: (await Storage.getItem(ROUTE_KEY)) ?? "results",
    params: parseParams(await Storage.getItem(PARAMS_KEY)),
  }),
  { initialValue: { route: "results", params: {} } },
);

function previewNav(current: Preview): Nav {
  return {
    route: { name: current.route, params: current.params },
    push: () => {},
    pop: () => {},
    popToRoot: () => {},
    replace: () => {},
  };
}

function PreviewHost() {
  return (
    <View class="flex-1 bg-background">
      {() => {
        const current = boot() ?? { route: "results", params: {} };
        const definition = resultsRoutes.find((candidate) => candidate.name === current.route);
        if (!definition) {
          return (
            <Text testID="results-missing" class="p-4 text-[13px] text-destructive">
              {`MISSING ROUTE ${current.route}`}
            </Text>
          );
        }
        return (
          <View class="flex-1" testID="results-page">
            {definition.render(previewNav(current))}
          </View>
        );
      }}
    </View>
  );
}

mount(PreviewHost);
