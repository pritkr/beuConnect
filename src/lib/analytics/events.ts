/**
 * The one list of things we ask GA4 about.
 *
 * `events.json` is the single source: this module reads it for the site, and
 * `scripts/sync-analytics-events.ts` writes `native/src/lib/analytics-events.ts`
 * from the same file, so the app can never report a name the dashboards do not
 * know. Change the JSON, run the script, and both halves move together.
 *
 * Rules, because a GA4 property is forever:
 *
 *  - `snake_case`, 3–40 characters, lowercase only.
 *  - A verb or a noun-phrase about *what the student did*, never about a widget:
 *    `pyq_pdf_download`, not `button_click_2`.
 *  - Params are dimensions, not free text. Never a registration number, a
 *    student name, or what someone typed into a search box.
 */

import taxonomy from "./events.json";

export const EVENTS = taxonomy;

export type EventName = string;

/** Every known event name, for the server's allowlist and tests. */
export const EVENT_NAMES: readonly string[] = Array.from(
	new Set(Object.values(EVENTS)),
);
