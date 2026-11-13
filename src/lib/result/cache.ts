import type { ResultPayload } from "./types";

const CACHE_ORIGIN = "https://beuconnect.local";
const CACHE_PATH = "/result-cache";

/** Successful results only, for ten minutes. */
export const RESULT_CACHE_TTL_SECONDS = 600;

export type ResultSource = "cache" | "json" | "legacy";

export type CachedResult = {
	data: ResultPayload;
	source: "json" | "legacy";
};

export type ResultCacheKeyParts = {
	registrationNo: string;
	semester: number;
	isCarry: boolean;
};

type DefaultCache = {
	match(request: string): Promise<Response | undefined>;
	put(request: string, response: Response): Promise<void>;
};

export function buildResultCacheKey({
	registrationNo,
	semester,
	isCarry,
}: ResultCacheKeyParts): string {
	return `${CACHE_ORIGIN}${CACHE_PATH}/${encodeURIComponent(registrationNo)}/${semester}/${isCarry ? "true" : "false"}`;
}

/**
 * The Cache API exists on Workers but not in the Node dev server, so every
 * call degrades to a miss instead of failing the request.
 */
function getDefaultCache(): DefaultCache | null {
	const cachesApi = (globalThis as { caches?: { default?: DefaultCache } }).caches;
	return cachesApi?.default ?? null;
}

export async function readCachedResult(
	parts: ResultCacheKeyParts,
): Promise<CachedResult | null> {
	const cache = getDefaultCache();
	if (!cache) return null;
	try {
		const cached = await cache.match(buildResultCacheKey(parts));
		if (!cached) return null;
		const parsed = (await cached.json()) as Partial<CachedResult> | null;
		if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
		return {
			data: parsed.data,
			source: parsed.source === "legacy" ? "legacy" : "json",
		};
	} catch {
		return null;
	}
}

export async function writeCachedResult(
	parts: ResultCacheKeyParts,
	value: CachedResult,
): Promise<void> {
	const cache = getDefaultCache();
	if (!cache) return;
	try {
		await cache.put(
			buildResultCacheKey(parts),
			new Response(JSON.stringify(value), {
				headers: {
					"content-type": "application/json",
					"cache-control": `public, max-age=${RESULT_CACHE_TTL_SECONDS}`,
				},
			}),
		);
	} catch {
		// A cache write is an optimisation; the response is already built.
	}
}
