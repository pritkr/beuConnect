/**
 * The routes the QA harness can mount — every area the shell merges.
 *
 * Kept in its own module (not `harness.tsx`) because importing the harness
 * calls `mount()`; a test that only needs the *names* must not boot a second
 * app. `qa/registry.test.ts` compares this list with `ALL_ROUTES`, so the
 * harness can never quietly test a route the app does not register, or miss one
 * that it does.
 *
 * Adding an area: add its `<area>Routes` here **and** to
 * `src/app/registry.tsx`. A module that exists but is not merged (the shipped
 * bug in `features/offline`) must not be added here — it would give the mount
 * test a green screen the shell cannot show.
 */

import type { RouteDef } from "../src/app/router";
import { feedbackRoutes } from "../src/features/feedback";
import { homeRoutes } from "../src/features/home";
import { notesRoutes } from "../src/features/notes";
import { noticesRoutes } from "../src/features/notices";
import { onboardingRoutes } from "../src/features/onboarding";
import { plannerRoutes } from "../src/features/planner";
import { pyqsRoutes } from "../src/features/pyqs";
import { resultsRoutes } from "../src/features/results";
import { searchRoutes } from "../src/features/search";
import { settingsRoutes } from "../src/features/settings";
import { studentsRoutes } from "../src/features/students";
import { syllabusRoutes } from "../src/features/syllabus";
import { toolsRoutes } from "../src/features/tools";

export const HARNESS_ROUTES: RouteDef[] = [
  ...feedbackRoutes,
  ...homeRoutes,
  ...notesRoutes,
  ...noticesRoutes,
  ...onboardingRoutes,
  ...plannerRoutes,
  ...pyqsRoutes,
  ...resultsRoutes,
  ...searchRoutes,
  ...settingsRoutes,
  ...studentsRoutes,
  ...syllabusRoutes,
  ...toolsRoutes,
];
