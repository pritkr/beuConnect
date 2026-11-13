/**
 * QA fixture: a screen that throws, inside the real `ScreenBoundary`.
 *
 * The shape is the shell's own — a `NavStack` whose render prop returns a
 * `NavPage` with a `ScreenBoundary` around the route's body — because a
 * boundary only behaves the same way in the same place. (A boundary dropped
 * straight into a reactive `{() => …}` slot is a different mount and is not
 * the app's shape.) `home` is mounted underneath, so "Go back" is a real pop
 * and `shell alive` stands for everything the student did not lose.
 */

import { Text, mount } from "nsh";
import { NavPage, NavStack, createNavStack } from "nsh/base";

import { ScreenBoundary } from "../src/app/crash";

/** A screen that cannot render, at all. */
function AlwaysBoom(): never {
  throw new Error("probe failed for 21105157098");
}

const stack = createNavStack([{ name: "home" }, { name: "syllabus.subject" }]);

/** The shell's back rule: pop, or fall back to Home when there is nowhere to go. */
function back(): void {
  if (stack.routes().length > 1) stack.pop();
  else stack.setRoutes([{ name: "home" }]);
}

export function CrashProbe() {
  return (
    <NavStack state={stack} class="flex-1">
      {(route) => (
        <NavPage title={route.name}>
          {route.name === "home" ? (
            <Text>shell alive</Text>
          ) : (
            <ScreenBoundary route={route.name} onBack={back}>
              <AlwaysBoom />
            </ScreenBoundary>
          )}
        </NavPage>
      )}
    </NavStack>
  );
}

mount(CrashProbe);
