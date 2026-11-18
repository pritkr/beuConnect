import { solveRoutineChallenge } from "./challenge";
import { parseRoutineDetailHtml } from "./detail-parser";
import { ROUTINE_FIXTURE_DETAILS, ROUTINE_FIXTURE_INDEX } from "./fixtures";
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
const FETCH_TIMEOUT_MS = 4000;
const MASTER_URL = "https://classroutine.free.nf/master_view_all.php";

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

async function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
	return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function fetchChallengeAwareHtml(url: string): Promise<{ html: string; finalUrl: string }> {
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
		if (cached) {
			return { ...cached.data, isStale: true };
		}
		globalThis.__routineMasterIndexCache = {
			ts: now,
			data: ROUTINE_FIXTURE_INDEX,
		};
		return ROUTINE_FIXTURE_INDEX;
	}
}

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
		if (cached) {
			return { ...cached.data, isStale: true };
		}
		const fixture = ROUTINE_FIXTURE_DETAILS[entry.sourceUrl];
		if (fixture) {
			cache.set(entry.sourceUrl, { ts: now, data: fixture });
			return fixture;
		}
		throw error;
	}
}
