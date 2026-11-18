import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
	guard,
	hashIp,
	parseReg,
	parseSem,
	read,
	upsert,
	validate,
} from "../../lib/corpus/store";

export const prerender = false;

const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

/** A corpus row is public by design: any student in the batch may read it. */
const PUBLIC_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "public, max-age=300",
	"access-control-allow-origin": "*",
};

function json(
	status: number,
	body: Record<string, unknown>,
	headers: Record<string, string> = JSON_HEADERS,
) {
	return new Response(JSON.stringify(body), { status, headers });
}

function database(): D1Database | null {
	return (env as unknown as { DB?: D1Database }).DB ?? null;
}

function header(request: Request, name: string): string {
	return (request.headers.get(name) || "").trim().slice(0, 80);
}

export const POST: APIRoute = async ({ request }) => {
	const db = database();
	if (!db) return json(503, { status: "unavailable" });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(400, { status: "invalid", reason: "payload" });
	}

	const outcome = await validate(body);
	if (!outcome.ok) return json(400, { status: "invalid", reason: outcome.reason });

	const now = Date.now();
	const ip = header(request, "CF-Connecting-IP") || header(request, "x-forwarded-for");
	const salt = (env as unknown as { CORPUS_SALT?: string }).CORPUS_SALT;

	try {
		const allowed = await guard(db, await hashIp(ip, salt, now), now);
		if (!allowed) return json(429, { status: "rate" });

		const status = await upsert(db, outcome.row, now);
		return json(200, { status });
	} catch (error) {
		console.error("corpus write failed", error);
		return json(503, { status: "unavailable" });
	}
};

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);

	const reg = parseReg(url.searchParams.get("reg") ?? "");
	if (!reg) return json(400, { status: "invalid", reason: "reg" });

	const sem = parseSem(Number(url.searchParams.get("sem")));
	if (!sem) return json(400, { status: "invalid", reason: "sem" });

	const db = database();
	if (!db) return json(503, { status: "unavailable" });

	try {
		const row = await read(db, reg, sem);
		if (!row) return json(404, { status: "miss" }, PUBLIC_HEADERS);

		return json(
			200,
			{ status: "ok", payload: row.payload, capturedAt: row.capturedAt, via: row.via },
			PUBLIC_HEADERS,
		);
	} catch (error) {
		console.error("corpus read failed", error);
		return json(503, { status: "unavailable" });
	}
};
