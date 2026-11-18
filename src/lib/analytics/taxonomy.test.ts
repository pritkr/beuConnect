import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { EVENTS, EVENT_NAMES } from "./events";

/**
 * The site and the Android app must report the same event names, or "Syllabus
 * opens" means two different things depending on the platform.
 *
 * The app lives in a sibling checkout (`native/` in the main repo) and ships a
 * generated copy of this vocabulary. When that checkout is present, this test
 * compares the two; on a machine that only has this repo it skips rather than
 * failing for the wrong reason.
 */
const NATIVE_EVENTS = join(
	process.cwd(),
	"..",
	"beuconnectaw",
	"native/src/lib/analytics-events.ts",
);

describe("analytics taxonomy", () => {
	test("names are valid GA4 event names and unique", () => {
		for (const name of EVENT_NAMES) {
			expect(name).toMatch(/^[a-z][a-z0-9_]{2,39}$/);
		}
		expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
	});

	test("every event carries a stable key", () => {
		expect(Object.keys(EVENTS).length).toBeGreaterThan(40);
		expect(EVENTS.pyqPdfDownload).toBe("pyq_pdf_download");
		expect(EVENTS.featureOpen).toBe("feature_open");
	});

	test.skipIf(!existsSync(NATIVE_EVENTS))("the app's copy is in sync", () => {
		const source = readFileSync(NATIVE_EVENTS, "utf8");
		for (const name of EVENT_NAMES) {
			expect(source).toContain(`"${name}"`);
		}
	});
});
