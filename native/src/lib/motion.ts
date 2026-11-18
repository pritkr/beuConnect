/**
 * The springs a layout change moves on.
 *
 * A screen that opens a panel asks the view that owns the moving frames to
 * animate them (`ViewRef.animateLayout`), so the motion is scoped to that
 * region: the card that grows and the rows it pushes. `LayoutAnimation` would
 * animate every frame the commit changes, anywhere on the screen, which is how
 * a tap on one row used to move a header, a badge and a list it had nothing to
 * do with.
 *
 * Two springs, one difference: how far the frame travels. `LAYOUT_SPRING` is
 * the project's spring for a short reveal; `LAYOUT_SPRING_PANEL` is the same
 * motion, softened for a panel that moves a long way, where a stiff spring
 * lands like a snap. Both stay at or under critical damping so the text inside
 * the moving frames does not overshoot its place.
 *
 * Reduce Motion is not read here: this module sits below the design system, so
 * every call site gates on `motionOn()` from `src/ui/motion.ts` before it asks
 * a view to animate.
 */

import type { LayoutAnimationAnimation } from "nsh";

/**
 * A short reveal: a topic's text under its row, one student's details.
 *
 * Stiffness 620 with damping 36: a damping ratio of 0.72, so the frame settles
 * in about 380 ms after a few points of overshoot at the end of the travel —
 * small enough that a line of text carried by the frame never reads as a jolt.
 */
export const LAYOUT_SPRING: LayoutAnimationAnimation = { type: "spring", stiffness: 620, damping: 36, mass: 1 };

/**
 * A tall panel that moves a long way: a unit of topics, a batch's branches,
 * the rest of a study plan.
 *
 * Softer than `LAYOUT_SPRING` because a 200 pt move on a stiff spring reads as
 * a snap; critically damped (39 = 2√380, ratio 1.0) so nothing overshoots, and
 * settled in about 300 ms.
 */
export const LAYOUT_SPRING_PANEL: LayoutAnimationAnimation = { type: "spring", stiffness: 380, damping: 39, mass: 1 };
