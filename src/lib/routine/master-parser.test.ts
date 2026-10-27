import { describe, expect, it } from "vitest";
import { parseRoutineMasterIndex } from "./master-parser";

const PAGE_URL = "http://classroutine.free.nf/index.php";
const FETCHED_AT = "2026-10-27T09:00:00.000Z";

function masterPage(links: string): string {
	return `<!DOCTYPE html>
<html>
<head><title>Class Routine</title></head>
<body>
	<div class="class-card">
		<div class="card-actions">${links}</div>
	</div>
</body>
</html>`;
}

describe("parseRoutineMasterIndex", () => {
	it("reads raw, escaped and percent-encoded links", () => {
		// One double-quoted link with raw `&`, one single-quoted link with
		// `&amp;` and a URL-encoded branch, both copied from the live index.
		const html = masterPage(`
			<a href="view_timetable.php?branch=CE&semester=1&batch=2K26&effective_date=2026-10-27&room_no=125"
				target="_self" class="btn btn-view">View</a>
			<a href='view_timetable.php?branch=ME%2FMET&amp;semester=6&amp;batch=2K23&amp;effective_date=2026-10-27&amp;room_no=101'
				target="_self" class="btn btn-view">View</a>
		`);

		const index = parseRoutineMasterIndex(html, PAGE_URL, FETCHED_AT, false);

		expect(index.fetchedAt).toBe(FETCHED_AT);
		expect(index.isStale).toBe(false);
		expect(index.entries).toHaveLength(2);

		expect(index.entries[0]).toEqual({
			sourceUrl:
				"http://classroutine.free.nf/view_timetable.php?branch=CE&semester=1&batch=2K26&effective_date=2026-10-27&room_no=125",
			branchLabel: "CE",
			semester: 1,
			batchLabel: "2K26",
			queryEffectiveDate: "2026-10-27",
			queryRoomNo: "125",
		});

		expect(index.entries[1]).toEqual({
			sourceUrl:
				"http://classroutine.free.nf/view_timetable.php?branch=ME%2FMET&semester=6&batch=2K23&effective_date=2026-10-27&room_no=101",
			branchLabel: "ME/MET",
			semester: 6,
			batchLabel: "2K23",
			queryEffectiveDate: "2026-10-27",
			queryRoomNo: "101",
		});
	});

	it("keeps document order and de-duplicates repeated links", () => {
		const link = (branch: string, semester: number) =>
			`<a href="view_timetable.php?branch=${branch}&amp;semester=${semester}&amp;batch=2K24&amp;room_no=100">View</a>`;

		const index = parseRoutineMasterIndex(
			masterPage(
				link("EE", 6) +
					link("CSE", 3) +
					link("EE", 6) +
					`<a href="index.php">Home</a>`,
			),
			PAGE_URL,
			FETCHED_AT,
			true,
		);

		expect(index.entries.map((entry) => entry.branchLabel)).toEqual([
			"EE",
			"CSE",
		]);
		expect(index.entries.map((entry) => entry.semester)).toEqual([6, 3]);
		expect(index.isStale).toBe(true);
	});

	it("skips links that cannot resolve a branch, batch or semester", () => {
		const index = parseRoutineMasterIndex(
			masterPage(`
				<a href="view_timetable.php?branch=&semester=1&batch=2K26">View</a>
				<a href="view_timetable.php?branch=CSE&semester=three&batch=2K26">View</a>
				<a href="view_timetable.php?branch=CSE&semester=1">View</a>
			`),
			PAGE_URL,
			FETCHED_AT,
			false,
		);

		expect(index.entries).toEqual([]);
	});
});
