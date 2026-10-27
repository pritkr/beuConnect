import type { RouteDef } from "./router";
import { homeRoutes } from "../features/home";
import { feedbackRoutes } from "../features/feedback";
import { notesRoutes } from "../features/notes";
import { onboardingRoutes } from "../features/onboarding";
import { plannerRoutes } from "../features/planner";
import { searchRoutes } from "../features/search";
import { noticesRoutes } from "../features/notices";
import { pyqsRoutes } from "../features/pyqs";
import { resultsRoutes } from "../features/results";
import { settingsRoutes } from "../features/settings";
import { studentsRoutes } from "../features/students";
import { syllabusRoutes } from "../features/syllabus";
import { toolsRoutes } from "../features/tools";

/**
 * The one place feature modules are merged. A module owns its folder and
 * exports `xRoutes`; nothing else needs to change to add a screen.
 */
export const ALL_ROUTES: RouteDef[] = [
  ...homeRoutes,
  ...feedbackRoutes,
  ...notesRoutes,
  ...onboardingRoutes,
  ...plannerRoutes,
  ...searchRoutes,
  ...syllabusRoutes,
  ...resultsRoutes,
  ...studentsRoutes,
  ...pyqsRoutes,
  ...toolsRoutes,
  ...noticesRoutes,
  ...settingsRoutes,
];

export const ROUTE_MAP: Record<string, RouteDef> = Object.fromEntries(
  ALL_ROUTES.map((definition) => [definition.name, definition]),
);

export function routeExists(name: string): boolean {
  return name === "more" || typeof ROUTE_MAP[name] !== "undefined";
}
