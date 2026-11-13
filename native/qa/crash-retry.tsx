/**
 * QA fixture: a screen that fails once, then renders.
 *
 * This is the case "Try again" exists for — a throw caused by state that has
 * since changed (a fetch that resolved, a saved value that arrived). `reset()`
 * must re-render the children rather than leave the fallback up forever.
 */

import { Text, mount } from "nsh";
import { NavPage, NavStack, createNavStack } from "nsh/base";

import { ScreenBoundary } from "../src/app/crash";

let renders = 0;

function BoomOnce() {
  renders += 1;
  if (renders === 1) throw new Error("first render failed");
  return <Text>screen content</Text>;
}

const stack = createNavStack([{ name: "pyqs.paper" }]);

export function CrashRetry() {
  return (
    <NavStack state={stack} class="flex-1">
      {(route) => (
        <NavPage title={route.name}>
          <ScreenBoundary route={route.name} onBack={() => {}}>
            <BoomOnce />
          </ScreenBoundary>
        </NavPage>
      )}
    </NavStack>
  );
}

mount(CrashRetry);
