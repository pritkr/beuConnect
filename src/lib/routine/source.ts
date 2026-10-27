import { solveRoutineChallenge } from "./challenge";
import { parseRoutineDetailHtml } from "./detail-parser";
import { parseRoutineMasterIndex } from "./master-parser";
import type { ParsedRoutine, RoutineIndex, RoutineSourceEntry } from "./types";

const DEFAULT_HEADERS = {
	accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	"accept-language": "en-US,en;q=0.9",
	"user-agent":
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

const MASTER_TTL_MS = 60 * 60 * 1000;
const DETAIL_TTL_MS = 60 * 60 * 1000;
/**
 * One detail page takes ~0.5 s behind the antibot challenge and the challenge
 * itself costs two requests, so 4 s was tight. The cap keeps a dead source bounded.
 */
const FETCH_TIMEOUT_MS = 8000;
const MASTER_URL = "https://classroutine.free.nf/master_view_all.php";

/** The source publishes IST times; render "as of" lines on the same clock. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

type CacheEntry<T> = {
	ts: number;
	data: T;
};

declare global {
	// eslint-disable-next-line no-var
	var __routineMasterIndexCache: CacheEntry<RoutineIndex> | undefined;
	// eslint-disable-next-line no-var
	var __routineDetailCache: Map<string, CacheEntry<ParsedRoutine>> | undefined;
}

function getDetailCache(): Map<string, CacheEntry<ParsedRoutine>> {
	if (!globalThis.__routineDetailCache) {
		globalThis.__routineDetailCache = new Map();
	}
	return globalThis.__routineDetailCache;
}

/**
 * Human-readable "as of" label for a `fetchedAt` ISO timestamp, e.g.
 * `"27 Oct 2026, 8:12 pm IST"`. Returns `null` when the timestamp is unusable,
 * so the caller can simply skip the line.
 */
export function formatRoutineFetchedAt(fetchedAt: string): string | null {
	const timestamp = Date.parse(fetchedAt);
	if (!Number.isFinite(timestamp)) return null;

	const ist = new Date(timestamp + IST_OFFSET_MS);
	const day = ist.getUTCDate();
	const month = MONTH_LABELS[ist.getUTCMonth()] || "";
	const year = ist.getUTCFullYear();
	const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
	const hours24 = ist.getUTCHours();
	const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
	const meridiem = hours24 < 12 ? "am" : "pm";

	return `${day} ${month} ${year}, ${hours}:${minutes} ${meridiem} IST`;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

async function fetchChallengeAwareHtml(
	url: string,
): Promise<{ html: string; finalUrl: string }> {
	let currentUrl = url;
	let cookieHeader = "";

	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await fetchWithTimeout(currentUrl, {
			redirect: "follow",
			headers: cookieHeader
				? { ...DEFAULT_HEADERS, cookie: cookieHeader }
				: DEFAULT_HEADERS,
		});

		if (!response.ok) {
			throw new Error(`Routine source responded with status ${response.status}.`);
		}

		const html = await response.text();
		const challenge = await solveRoutineChallenge(html, response.url || currentUrl);
		if (!challenge) {
			return { html, finalUrl: response.url || currentUrl };
		}

		cookieHeader = `__test=${challenge.cookieValue}`;
		currentUrl = challenge.nextUrl;
	}

	throw new Error("Routine source challenge could not be solved.");
}

function markStale<T extends { isStale: boolean }>(data: T): T {
	return data.isStale ? data : { ...data, isStale: true };
}

/**
 * Master index of every published timetable.
 *
 * A failed fetch never invents data: a still-cached copy is returned flagged
 * `isStale`, otherwise the error propagates so the page can report an outage
 * instead of printing an old semester as if it were live.
 */
export async function fetchRoutineIndex(): Promise<RoutineIndex> {
	const cached = globalThis.__routineMasterIndexCache;
	const now = Date.now();
	if (cached && now - cached.ts < MASTER_TTL_MS) {
		return cached.data;
	}

	try {
		const { html, finalUrl } = await fetchChallengeAwareHtml(MASTER_URL);
		const parsed = parseRoutineMasterIndex(
			html,
			finalUrl,
			new Date().toISOString(),
			false,
		);
		globalThis.__routineMasterIndexCache = { ts: now, data: parsed };
		return parsed;
	} catch (error) {
		if (cached) return markStale(cached.data);
		throw error;
	}
}

/**
 * One published timetable page, keyed by its source URL. Same policy as the
 * index: serve the cached copy flagged `isStale`, otherwise surface the failure.
 */
export async function fetchRoutineDetail(
	entry: RoutineSourceEntry,
): Promise<ParsedRoutine> {
	const cache = getDetailCache();
	const cached = cache.get(entry.sourceUrl);
	const now = Date.now();
	if (cached && now - cached.ts < DETAIL_TTL_MS) {
		return cached.data;
	}

	try {
		const { html, finalUrl } = await fetchChallengeAwareHtml(entry.sourceUrl);
		const parsed = parseRoutineDetailHtml(
			html,
			finalUrl,
			new Date().toISOString(),
			false,
		);
		cache.set(entry.sourceUrl, { ts: now, data: parsed });
		return parsed;
	} catch (error) {
		if (cached) return markStale(cached.data);
		throw error;
	}
}
