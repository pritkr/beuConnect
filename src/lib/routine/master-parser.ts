import type { RoutineIndex, RoutineSourceEntry } from "./types";

const MASTER_ENTRY_REGEX = /href="(view_timetable\.php\?[^\"]+)"/gi;

export function parseRoutineMasterIndex(
	html: string,
	pageUrl: string,
	fetchedAt: string,
	isStale: boolean,
): RoutineIndex {
	const entries: RoutineSourceEntry[] = [];
	const seen = new Set<string>();

	for (const match of html.matchAll(MASTER_ENTRY_REGEX)) {
		const relativeHref = match[1];
		const sourceUrl = new URL(relativeHref, pageUrl).toString();
		if (seen.has(sourceUrl)) continue;
		seen.add(sourceUrl);

		const parsedUrl = new URL(sourceUrl);
		const branchLabel = decodeURIComponent(
			parsedUrl.searchParams.get("branch") || "",
		).trim();
		const semester = Number.parseInt(
			parsedUrl.searchParams.get("semester") || "",
			10,
		);
		const batchLabel = (parsedUrl.searchParams.get("batch") || "").trim();
		const queryEffectiveDate =
			(parsedUrl.searchParams.get("effective_date") || "").trim();
		const queryRoomNo = (parsedUrl.searchParams.get("room_no") || "").trim();

		if (!branchLabel || !batchLabel || !Number.isFinite(semester)) continue;

		entries.push({
			sourceUrl,
			branchLabel,
			semester,
			batchLabel,
			queryEffectiveDate,
			queryRoomNo,
		});
	}

	return {
		entries,
		fetchedAt,
		isStale,
	};
}
