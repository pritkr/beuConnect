/**
 * The app's footer: the last line of every scrolling page, so feedback is
 * reachable from wherever a student is — without a header button and without a
 * sixth tab. It is in the scroll, not over it: it never sits on the tab bar,
 * and it only shows once the page is read to the end.
 *
 * No imports from `../../ui`: `Body` renders this, and `ui` importing a feature
 * that imports `ui` would be a cycle.
 */

import { Text, View } from "nsh";

import { currentRoute, openFeedback } from "./store";

export function FeedbackFooter() {
  return (
    <View class="mt-1 w-full items-center border-t border-border pt-3">
      <View
        class="min-h-11 justify-center rounded-full px-4 active:bg-muted focus:ring-2 focus:ring-ring"
        testID="feedback-footer"
        onPress={() => openFeedback({ route: currentRoute() })}
        role="button"
        accessibilityLabel="Feedback about this screen"
        accessibilityHint="Report a bug, wrong data or an idea"
      >
        <Text class="text-[12px] font-semibold text-primary-ink">Send feedback</Text>
      </View>
    </View>
  );
}
