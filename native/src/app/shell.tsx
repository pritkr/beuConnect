import { Text, View, effect, host, keyboardFrame, signal } from "nsh";
import { NavPage, NavStack, createNavStack } from "nsh/base";
import { MoreScreen } from "./more";
import { TabBar, TABS } from "./tabbar";
import { ROUTE_MAP, routeExists } from "./registry";
import { NotFound } from "./coming-soon";
import { ScreenBoundary, safeTitle } from "./crash";
import type { Nav, Route, RouteDef, RouteParams } from "./router";
import { OnboardingScreen, introDone } from "../features/onboarding";
import { hydrateDataFeed, startDataFeed } from "../features/data-feed/store";
import { startOfflineWarmup } from "../features/offline/packs";
import { FeedbackHost, rememberRoute } from "../features/feedback";
import { WifiAutoBridge } from "../features/tools/wifi-bridge";
import { NotificationBridge } from "../features/settings/notifications";
import { startUpdateCheck } from "../lib/release";
import { initAnalytics, trackScreen } from "../lib/analytics";
import { AskAiBridge } from "../ui/ask-ai";
import { Icon } from "../ui/icons";

/**
 * The app shell: one native nav stack, a floating tab bar that only shows at
 * the root of the stack, and the route merge point. Android back, iOS swipe
 * back and predictive back all come from `NavStack` for free.
 *
 * The header is two-fold on purpose: Android and iOS get the real system
 * header (`title`), while macOS, Windows, Linux and the web get this app-drawn
 * bar, which is the only header those platforms have.
 *
 * First run: until `beu.onboarding` says otherwise the stack is replaced by the
 * one-step welcome. The flag is read before anything paints, so a returning
 * student never sees the intro flash and a new one never sees Home first.
 */

const ROOT: Route = { name: "home", params: {} };

/**
 * The route's own body, as a component rather than an inline call.
 *
 * `definition.render(nav)` can throw while it is being evaluated (a `data.table`
 * that reads a param eagerly, a paper that looks a slug up). Called inline, that
 * throw happens while the shell is building the element — outside every
 * boundary. Mounted as a component, it happens under `ScreenBoundary`, which is
 * the difference between one broken screen and a dead app.
 */
function RouteScreen(props: { definition: RouteDef; nav: Nav }) {
  return props.definition.render(props.nav);
}

/**
 * Runs work that must never cost a screen: analytics, warmups, the update
 * check. A throw in one of them is logged and forgotten — none of them is a
 * reason for a student to see an error page instead of Home.
 */
function quietly(work: () => void): void {
  try {
    work();
  } catch (error) {
    console.error("shell:", error);
  }
}

/**
 * A notification tap, as a route.
 *
 * The Android host puts `{ open: { route, params, url } }` in `host.params` on a
 * cold start and sends `beu.open` with the same object when the app is already
 * running (`MainActivity.openPayload`). Everything here is untrusted: a route
 * name that is not registered, or a param that is not a scalar, is dropped
 * rather than pushed.
 */
function readOpen(raw: unknown): Route | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as { route?: unknown; params?: unknown };
  const name = typeof payload.route === "string" ? payload.route : "";
  if (!name || !routeExists(name)) return null;

  const params: RouteParams = {};
  if (payload.params && typeof payload.params === "object") {
    for (const [key, value] of Object.entries(payload.params as Record<string, unknown>)) {
      if (typeof value === "string") params[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) params[key] = String(value);
    }
  }
  return { name, params };
}

function PageHeader(props: { title: string; canBack: boolean; onBack: () => void }) {
  return (
    <View class="min-h-12 flex-row items-center gap-2 border-b border-border bg-background px-2">
      {props.canBack ? (
        <View
          class="-ml-1 h-11 w-11 items-center justify-center rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none active:bg-muted focus:ring-2 focus:ring-ring"
          onPress={props.onBack}
          role="button"
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous screen"
        >
          <Icon name="chevron-left" size={22} class="text-primary-ink" />
        </View>
      ) : (
        <View class="h-11 w-11 items-center justify-center" accessibilityElementsHidden>
          <View class="h-2.5 w-2.5 rounded-full bg-primary" />
        </View>
      )}
      <Text
        class="flex-1 text-[15px] font-semibold tracking-tight text-foreground"
        style={{ numberOfLines: 1 }}
        role="header"
      >
        {props.title}
      </Text>
    </View>
  );
}

export function Shell() {
  const stack = createNavStack<Route>([ROOT]);
  /** `null` while the flag is being read, then "show the intro" or "show the app". */
  const intro = signal<boolean | null>(null);
  const launch = readOpen(host.params.open);
  let launchHandled = false;
  let listening = false;

  effect(() => {
    // A tap that launched the app: wait for the intro decision, and for a first
    // run to finish onboarding, so the notice is not replaced by the welcome.
    if (launchHandled || !launch) return;
    const opening = intro();
    if (opening === null || opening) return;
    launchHandled = true;
    quietly(() => stack.setRoutes([launch]));
  });

  effect(() => {
    // A tap while the app is already running. `host.on` keeps events that
    // arrive before this listener exists, so a message during bundle load is
    // not lost.
    if (listening) return;
    listening = true;
    host.on("beu.open", (payload) => {
      const target = readOpen(payload);
      if (target) quietly(() => stack.push(target));
    });
  });

  effect(() => {
    // Hydrate the live data snapshot from this phone before the first paint: a
    // previous launch may have downloaded a newer syllabus or PYQ index. Then
    // refresh the manifest in the background, at most once an hour.
    void Promise.all([introDone(), hydrateDataFeed()])
      .then(([done]) => {
        intro.set(!done);
        quietly(startDataFeed);
      })
      .catch((error) => {
        // The intro flag or the snapshot could not be read. Show the app: a
        // blank first frame is the one failure a student cannot act on.
        console.error("startup:", error);
        intro.set(false);
      });
    // Analytics starts after the first frame's work is queued: it reads Storage,
    // fires `app_open`, and flushes anything an offline session left behind.
    quietly(initAnalytics);
    // Small feeds (notices, notes list, table index) refresh themselves once a
    // day, in the background, so the app opens offline with real content.
    quietly(startOfflineWarmup);
    // One release check per launch, six hours cached: the answer only paints a
    // badge on Settings, so nothing waits for it and no screen can fail on it.
    quietly(startUpdateCheck);
  });

  const navFor = (current: Route): Nav => ({
    route: current,
    push: (name: string, params: RouteParams = {}) => stack.push({ name, params }),
    pop: (count?: number) => stack.pop(count),
    popToRoot: () => stack.popToRoot(),
    replace: (name: string, params: RouteParams = {}) => stack.replace({ name, params }),
  });

  const activeTab = (): string => {
    const routes = stack.routes();
    const bottom = routes[0];
    return bottom ? bottom.name : "home";
  };

  /** Leaves a screen that cannot render, even when it is the only one. */
  const back = (): void => {
    if (stack.routes().length > 1) stack.pop();
    else stack.setRoutes([{ name: "home", params: {} }]);
  };

  const body = (): import("nsh").JSX.Element => (
    <View class="flex-1">
      <View class="flex-1">
        <NavStack state={stack} class="flex-1" testID="root-stack">
          {(route) => {
            // The feedback footer's memory, then the single screen-tracking
            // hook: every route render, from the one place that knows every
            // route (params are allowlisted inside). Neither is worth a screen.
            quietly(() => rememberRoute(route));
            quietly(() => trackScreen(route.name, route.params));
            const nav = navFor(route);
            const definition = ROUTE_MAP[route.name];
            // `title()` is contractual, but a real param can still surprise a
            // feature. A wrong word in the header is not worth a dead screen.
            const title =
              route.name === "more"
                ? "More"
                : definition
                  ? safeTitle(definition.title, route.params)
                  : "Not found";

            return (
              <NavPage
                title={title}
                class="bg-background"
                headerClass="bg-background text-foreground tint-primary"
                header={
                  <PageHeader
                    title={title}
                    canBack={stack.routes().length > 1}
                    onBack={back}
                  />
                }
              >
                {route.name === "more" ? (
                  <ScreenBoundary route={route.name} onBack={back}>
                    <MoreScreen nav={nav} />
                  </ScreenBoundary>
                ) : definition ? (
                  <ScreenBoundary route={route.name} onBack={back}>
                    <RouteScreen definition={definition} nav={nav} />
                  </ScreenBoundary>
                ) : (
                  <NotFound route={route.name} onBack={back} />
                )}
              </NavPage>
            );
          }}
        </NavStack>
      </View>

      {() =>
        stack.routes().length <= 1 && keyboardFrame().height === 0 ? (
          <TabBar
            active={activeTab()}
            onSelect={(name: string) => {
              /* The bar only shows at the root, so re-pressing the tab that is
                 already on screen is a no-op: rebuilding the route remounts the
                 page and throws away its scroll for nothing. */
              if (activeTab() === name) return;
              stack.setRoutes([{ name, params: {} }]);
            }}
          />
        ) : null
      }
    </View>
  );

  return (
    <View class="flex-1 bg-background">
      <AskAiBridge />
      <WifiAutoBridge />
      <NotificationBridge />
      <FeedbackHost />
      {() => {
        const opening = intro();
        if (opening === null) return <View class="flex-1 bg-background" />;
        if (opening) return <OnboardingScreen onDone={() => intro.set(false)} />;
        return body();
      }}
    </View>
  );
}

export { TABS };
