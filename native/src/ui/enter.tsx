/**
 * The app's one entrance: content that arrives instead of teleporting.
 *
 * It is for the moment a skeleton is replaced by real content — a lookup result,
 * the name the first run resolves. Not for a tab root: Home is opened many times
 * a day, so its focus card simply sits there. A fade on every open is the app
 * making the student wait for nothing.
 *
 * Rules, and why each one is here:
 *
 *  - **One motion per mount.** `createMotion` is created at component scope,
 *    so the entrance plays when the content it wraps first appears. A signal
 *    changing inside the subtree never replays it — a refresh must not make a
 *    result the student is reading blink.
 *  - **`opacity` and `translateY` only.** Both stay on the compositor; nothing
 *    here re-lays-out a row on a small Android phone.
 *  - **The same curve as the progress fill** (`EASE` in `ui/motion.ts`). The app
 *    gets one motion vocabulary, not a second one beside it.
 *  - **Reduce Motion lands at rest.** nsh drops the movement and puts every
 *    channel where the motion ends (`ui/motion.ts`), so the content is simply
 *    there — never invisible, never late.
 *  - **`enter`, not `initial` + `play`.** nsh starts the channels at the
 *    motion's first frame and plays it in the same call, so there is no frame
 *    where the content sits at rest and then jumps back to zero.
 */

import { View, createMotion, type JSX } from "nsh";

import { EASE } from "./motion";

/** Wraps content that appears once, in place: 8 pt up into the slot, 240 ms. */
export function Enter(props: { children?: JSX.Element; class?: string }) {
  const motion = createMotion({
    enter: {
      keyframes: { opacity: [0, 1], translateY: [8, 0] },
      duration: 240,
      easing: EASE,
    },
  });
  return (
    <View class={props.class} style={motion.style}>
      {props.children}
    </View>
  );
}
