/**
 * What the app shows when a screen throws — instead of taking the app with it.
 *
 * `nsh` has no global error hook: an exception that escapes a component body, a
 * binding, an effect or a listener ends the JavaScript context, and the phone
 * keeps the last frame (or the launcher, after Android kills the process). One
 * broken paper list must never cost a student their attendance record, so every
 * screen is mounted inside an `ErrorBoundary` and a failure is rendered as a
 * page with two ways out: try again, or go back to where they came from.
 *
 * Two rules for everything in this file:
 *
 *  1. **It cannot throw.** A fallback that throws goes to the boundary above it,
 *     and at the root there is nothing above it — so every read is guarded and
 *     `crashDetail` never trusts the thrown value's shape.
 *  2. **It never shows a stack trace.** A student gets a sentence and a route
 *     name; the trace is for `adb logcat`, not the screen.
 *
 * The root boundary (`src/app/root.tsx`, mounted by `boot.ts`) uses `RootCrash`:
 * same contract, one level up.
 */

import { ErrorBoundary, Text, View } from "nsh";
import type { JSX } from "nsh";

import { Btn, Card, Mono, Screen } from "../ui";
import { Icon } from "../ui/icons";

/** Digits long enough to be a registration number never leave the screen. */
const LONG_DIGITS = /\d{6,}/g;

/**
 * One line a student can quote: `TypeError: cannot read property …`.
 *
 * Never returns `""`, never throws, and scrubs digit runs so a crash message
 * that quotes a registration number is not something they paste in public.
 */
export function crashDetail(error: unknown): string {
  try {
    let text = "";
    if (error instanceof Error) text = `${error.name}: ${error.message}`;
    else if (typeof error === "string") text = error;
    else if (error && typeof error === "object" && "message" in error) text = String((error as { message: unknown }).message);
    else text = String(error);
    const clean = text.replace(LONG_DIGITS, "[redacted]").replace(/\s+/g, " ").trim();
    return clean === "" ? "Unknown error" : clean.slice(0, 180);
  } catch {
    return "Unknown error";
  }
}

/** The route's title, or a safe stand-in when `title()` itself is what broke. */
export function safeTitle(title: (params: Record<string, string | number | undefined>) => string, params: Record<string, string | number | undefined>): string {
  try {
    const value = title(params);
    return typeof value === "string" && value.trim() !== "" ? value : "BEUConnect";
  } catch {
    return "BEUConnect";
  }
}

/**
 * The in-page fallback: the header stays, the screen is replaced.
 *
 * `onBack` is always present — a screen that cannot render must not trap the
 * student in it. `onRetry` re-renders the same children, which is enough for a
 * failure caused by data that has since arrived.
 */
export function ScreenCrash(props: { route: string; error: unknown; onRetry?: () => void; onBack: () => void }) {
  return (
    <Screen>
      <View class="flex-1 items-center justify-center gap-4 p-6">
        <View class="h-16 w-16 items-center justify-center rounded-[22px] border border-border bg-card" accessibilityElementsHidden>
          <Icon name="error-circle" size={30} class="text-destructive" />
        </View>
        <Text class="text-center text-[19px] font-bold tracking-tight text-foreground" role="alert">
          This screen could not open
        </Text>
        <Text class="max-w-[300px] text-center text-[14px] leading-5 text-muted-foreground">
          The rest of the app still works. Go back, or try this screen again.
        </Text>
        <Card class="w-full max-w-[320px] gap-1 bg-muted/40 p-3">
          <Mono class="text-[11px] leading-4 text-muted-foreground" numberOfLines={2}>
            {props.route} · {crashDetail(props.error)}
          </Mono>
        </Card>
        <View class="w-full max-w-[320px] gap-2">
          <Btn onPress={props.onBack} label="Go back">Go back</Btn>
          {props.onRetry ? (
            <Btn variant="secondary" onPress={props.onRetry} label="Try this screen again">
              Try again
            </Btn>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

/**
 * The last-resort fallback: the shell itself could not render.
 *
 * There is no route to go back to, so the only action is `reset()`, which
 * re-renders the shell from its own state. If that fails again the student sees
 * this page instead of a blank window — which is the whole point.
 */
export function RootCrash(props: { error: unknown; onRetry: () => void }) {
  return (
    <View class="flex-1 items-center justify-center gap-4 bg-background p-6">
      <View class="h-16 w-16 items-center justify-center rounded-[22px] border border-border bg-card" accessibilityElementsHidden>
        <Icon name="error-circle" size={30} class="text-destructive" />
      </View>
      <Text class="text-center text-[19px] font-bold tracking-tight text-foreground" role="alert">
        BEUConnect hit a problem
      </Text>
      <Text class="max-w-[300px] text-center text-[14px] leading-5 text-muted-foreground">
        Nothing on this phone was changed. Reopen the app to keep using it.
      </Text>
      <Card class="w-full max-w-[320px] gap-1 bg-muted/40 p-3">
        <Mono class="text-[11px] leading-4 text-muted-foreground" numberOfLines={2}>
          {crashDetail(props.error)}
        </Mono>
      </Card>
      <View class="w-full max-w-[320px]">
        <Btn onPress={props.onRetry} label="Reopen BEUConnect">Reopen</Btn>
      </View>
    </View>
  );
}

/**
 * One screen's boundary.
 *
 * A wrapper rather than three copies of `ErrorBoundary` in the shell: the
 * fallback and the back behaviour stay in one place, and QA can mount it around
 * a component that throws without booting the whole app.
 *
 * Mount it the way the shell does — as a page child, around the route's body.
 * A boundary that is the direct return value of a reactive `{() => …}` slot is
 * a different mount and does not contain the throw.
 */
export function ScreenBoundary(props: { route: string; onBack: () => void; children?: JSX.Element }): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <ScreenCrash route={props.route} error={error} onRetry={reset} onBack={props.onBack} />
      )}
    >
      {props.children}
    </ErrorBoundary>
  );
}
