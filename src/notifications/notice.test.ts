import { describe, expect, it } from "vitest";

import { cleanNoticeText, noticeKey } from "./notice";

/**
 * The ids below were produced by the app's own `noticeId`
 * (`native/src/features/notices/api.ts`). They are written out by hand, not
 * recomputed here: a test that re-implements the hash would pass even after the
 * two copies drifted apart, which is the only failure this file exists to catch.
 *
 * If a value changes, both implementations changed together or one of them is
 * now wrong. A mismatch means a notification tap opens the board instead of the
 * notice it named.
 */
describe("noticeKey", () => {
	it("matches the ids the app stores for the same notice", () => {
		expect(
			noticeKey(
				"B.Tech 1st Semester Examination Form",
				"2026-10-30T00:00:00.000Z",
			),
		).toBe("n17lvmx6");
		expect(noticeKey("Notice regarding University Exam", null)).toBe("n273649");
		expect(
			noticeKey(
				"Result of 3rd Semester (2025 Batch)",
				"2026-09-01T00:00:00.000Z",
			),
		).toBe("n4pu6k0");
	});

	it("trims the title but does not change the date", () => {
		expect(noticeKey("  Holiday List 2026  ", "2026-01-01T00:00:00.000Z")).toBe(
			"n1f6fbkp",
		);
	});

	it("is stable for the same input", () => {
		const first = noticeKey(
			"Even Semester Registration",
			"2026-02-01T00:00:00.000Z",
		);
		const second = noticeKey(
			"Even Semester Registration",
			"2026-02-01T00:00:00.000Z",
		);
		expect(first).toBe(second);
		expect(first.startsWith("n")).toBe(true);
	});
});

describe("cleanNoticeText", () => {
	it("drops tags and collapses whitespace", () => {
		expect(cleanNoticeText("<p>Exam&nbsp;form</p>\n<p>open</p>")).toBe(
			"Exam form open",
		);
	});

	it("decodes the entities the board actually sends", () => {
		expect(cleanNoticeText("Result &amp; marks")).toBe("Result & marks");
		expect(cleanNoticeText("3rd &ndash; 5th semester")).toBe(
			"3rd – 5th semester",
		);
		expect(cleanNoticeText("&#8377;500 fee")).toBe("₹500 fee");
	});

	it("keeps an unknown entity instead of deleting text", () => {
		expect(cleanNoticeText("A &unknown; B")).toBe("A &unknown; B");
	});
});
