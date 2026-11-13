/**
 * Motion that honours the platform's Reduce Motion setting.
 *
 * nsh handles this for `createMotion` presets — they land where they end
 * without moving when the user asks for less motion — but a hand-rolled
 * `scrollTo({ animated: true })` is ours to gate. Every animated scroll reads
 * `scrollAnimated()` so the preference is decided in one place, not five.
 *
 * A jump to a topic, a rank row or a paper's next page is navigation, not
 * decoration: with Reduce Motion on it should simply be there.
 */

import { reduceMotion } from "nsh";

/**
 * The app's motion curve — the progress fill's, and every entrance's.
 *
 * One signature for the whole product: content decelerates into place, nothing
 * bounces. Hand-rolled keyframes import this instead of writing a fourth copy
 * of the same four numbers.
 */
export const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** True when the platform allows motion (the user has not asked for less). */
export function motionOn(): boolean {
  return !reduceMotion();
}

/** The `animated:` flag for `scrollTo` / `scrollToIndex`. */
export function scrollAnimated(): boolean {
  return motionOn();
}
