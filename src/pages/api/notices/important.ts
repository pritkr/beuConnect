import type { APIRoute } from "astro";
import { getNoticeBoard } from "../../../lib/beuNotices";

export const prerender = false;

type CachedPayload = {
	ts: number;
	items: Awaited<ReturnType<typeof getNoticeBoard>>;
};

const CACHE_MS = 60 * 1000;

declare global {
	// eslint-disable-next-line no-var
	var __beuImportantNoticesCache: CachedPayload | undefined;
}

export const GET: APIRoute = async ({ request }) => {
	const now = Date.now();
	const url = new URL(request.url);
	const limitParam = Number(url.searchParams.get("limit") ?? "10");
	const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(20, limitParam)) : 10;

	const cache = globalThis.__beuImportantNoticesCache;
	if (cache && Array.isArray(cache.items) && now - cache.ts < CACHE_MS) {
		return new Response(
			JSON.stringify({ items: cache.items.slice(0, limit), fetchedAt: new Date(cache.ts).toISOString() }),
			{
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=180",
				vary: "accept",
			},
		});
	}

	try {
		const items = await getNoticeBoard({ important: true, limit: 20 });
		globalThis.__beuImportantNoticesCache = { ts: now, items };
		const body = JSON.stringify({ items: items.slice(0, limit), fetchedAt: new Date().toISOString() });

		return new Response(body, {
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=180",
				vary: "accept",
			},
		});
	} catch {
		return new Response(JSON.stringify({ items: [], fetchedAt: new Date().toISOString() }), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
				vary: "accept",
			},
		});
	}
};
