import { Text, View, effect, keyboardFrame, signal } from "nsh";
import { NavPage, NavStack, createNavStack } from "nsh/base";
import { MoreScreen } from "./more";
import { TabBar, TABS } from "./tabbar";
import { ROUTE_MAP } from "./registry";
import { NotFound } from "./coming-soon";
import type { Nav, Route, RouteParams } from "./router";
import { OnboardingScreen, introDone } from "../features/onboarding";
import { hydrateDataFeed, startDataFeed } from "../features/data-feed/store";
import { startOfflineWarmup } from "../features/offline/packs";
import { FeedbackHost, rememberRoute } from "../features/feedback";
import { startUpdateCheck } from "../lib/release";
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

function PageHeader(props: { title: string; canBack: boolean; onBack: () => void }) {
  return (
    <View class="min-h-12 flex-row items-center gap-2 border-b border-border bg-background px-2">
      {props.canBack ? (
        <View
          class="-ml-1 h-11 w-11 items-center justify-center rounded-full active:bg-muted focus:ring-2 focus:ring-ring"
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
        numberOfLines={1}
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

  effect(() => {
    // Hydrate the live data snapshot from this phone before the first paint: a
    // previous launch may have downloaded a newer syllabus or PYQ index. Then
    // refresh the manifest in the background, at most once an hour.
    void Promise.all([introDone(), hydrateDataFeed()]).then(([done]) => {
      intro.set(!done);
      startDataFeed();
    });
    // Small feeds (notices, notes list, table index) refresh themselves once a
    // day, in the background, so the app opens offline with real content.
    startOfflineWarmup();
    // One release check per launch, six hours cached: the answer only paints a
    // badge on Settings, so nothing waits for it and no screen can fail on it.
    startUpdateCheck();
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

  const body = (): import("nsh").JSX.Element => (
    <View class="flex-1">
      <View class="flex-1">
        <NavStack state={stack} class="flex-1" testID="root-stack">
          {(route) => {
            rememberRoute(route);
            const nav = navFor(route);
            const definition = ROUTE_MAP[route.name];
            const title =
              route.name === "more" ? "More" : definition ? definition.title(route.params) : "Not found";

            return (
              <NavPage
                title={title}
                class="bg-background"
                headerClass="bg-background text-foreground tint-primary"
                header={
                  <PageHeader
                    title={title}
                    canBack={stack.routes().length > 1}
                    onBack={() => stack.pop()}
                  />
                }
              >
                {route.name === "more" ? (
                  <MoreScreen nav={nav} />
                ) : definition ? (
                  definition.render(nav)
                ) : (
                  <NotFound route={route.name} onBack={() => stack.pop()} />
                )}
              </NavPage>
            );
          }}
        </NavStack>
      </View>

      {() =>
        stack.routes().length <= 1 && keyboardFrame().height === 0 ? (
          <TabBar active={activeTab()} onSelect={(name: string) => stack.setRoutes([{ name, params: {} }])} />
        ) : null
      }
    </View>
  );

  return (
    <View class="flex-1 bg-background">
      <AskAiBridge />
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
