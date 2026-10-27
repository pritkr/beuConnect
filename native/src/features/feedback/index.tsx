/**
 * Feedback's public surface: the two routes and the one host the shell mounts.
 *
 * `feedback` is the real name; `tools.feedback` is kept because older links and
 * the QA contract were written against it, and a rename should never strand a
 * link a student already has.
 */

import type { RouteDef } from "../../app/router";
import { FeedbackScreen, FeedbackSheet } from "./ui";

export const feedbackRoutes: RouteDef[] = [
  {
    name: "feedback",
    title: () => "Feedback",
    render: (nav) => <FeedbackScreen nav={nav} />,
  },
  {
    name: "tools.feedback",
    title: () => "Feedback",
    render: (nav) => <FeedbackScreen nav={nav} />,
  },
];

/** Mounted once, in the shell: the sheet the footer opens from any screen. */
export function FeedbackHost() {
  return <FeedbackSheet />;
}

export { openFeedback, rememberRoute } from "./store";
