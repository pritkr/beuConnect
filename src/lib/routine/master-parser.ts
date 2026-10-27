import type { RoutineIndex, RoutineSourceEntry } from "./types";

/**
 * The index publishes `href="view_timetable.php?branch=…&semester=…"` with raw
 * `&`. Accept single quotes and HTML-escaped `&amp;` as well; renderers do emit
 * both once the page is served through different pipelines.
 */
const MASTER_ENTRY_REGEX =
	/href\s*=\s*(["'])([^"']*view_timetable\.php[^"']*)\1/gi;

function decodeHref(value: string): string {
	return value
		.replace(/&amp;/gi, "&")
		.replace(/&#0*38;/g, "&")
		.replace(/&#x0*26;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/[\r\n\t]+/g, "")
		.trim();
}

function safeDecodeUri(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function parseRoutineMasterIndex(
	html: string,
	pageUrl: string,
	fetchedAt: string,
	isStale: boolean,
): RoutineIndex {
	const entries: RoutineSourceEntry[] = [];
	const seen = new Set<string>();

	for (const match of html.matchAll(MASTER_ENTRY_REGEX)) {
		const relativeHref = decodeHref(match[2]);
		if (!relativeHref) continue;

		let sourceUrl: string;
		try {
			sourceUrl = new URL(relativeHref, pageUrl).toString();
		} catch {
			continue;
		}
		if (seen.has(sourceUrl)) continue;
		seen.add(sourceUrl);

		const parsedUrl = new URL(sourceUrl);
		const branchLabel = safeDecodeUri(
			parsedUrl.searchParams.get("branch") || "",
		).trim();
		const semester = Number.parseInt(
			parsedUrl.searchParams.get("semester") || "",
			10,
		);
		const batchLabel = (parsedUrl.searchParams.get("batch") || "").trim();
		const queryEffectiveDate = (
			parsedUrl.searchParams.get("effective_date") || ""
		).trim();
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
