/**
 * QA fixture: a timer throws, and the app must still be there.
 *
 * This mounts the real `guardTimers()` from `src/lib/timers.ts` — the function
 * `boot()` calls before anything else — because a throw inside a timer is the
 * one failure no `ErrorBoundary` can reach: nsh ends the JS context instead.
 * "Boom" schedules a throw and a later signal write; "Ping" proves the app
 * still takes input after it.
 */

import { Text, View, mount, signal } from "nsh";

import { guardTimers } from "../src/lib/timers";

guardTimers();

export function TimerProbe() {
  const said = signal("waiting");
  return (
    <View class="flex-1">
      <Text>{said()}</Text>
      <View
        onPress={() => {
          setTimeout(() => {
            throw new Error("timer boom");
          }, 0);
          setTimeout(() => said.set("timer survived"), 30);
        }}
        role="button"
        accessibilityLabel="Boom"
      >
        <Text>Boom</Text>
      </View>
      <View onPress={() => said.set("still alive")} role="button" accessibilityLabel="Ping">
        <Text>Ping</Text>
      </View>
    </View>
  );
}

mount(TimerProbe);
