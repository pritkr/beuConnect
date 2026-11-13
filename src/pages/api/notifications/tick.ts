import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { type NotifyEnv, runTick } from "../../../notifications/run";

export const prerender = false;

const HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

/**
 * Runs one tick by hand.
 *
 * The Cron Trigger is the real clock; this exists so a fresh deployment can be
 * proven without waiting five minutes, and so a stuck fan-out can be nudged.
 * It is secret-guarded because the response includes counts, and because a
 * public tick endpoint would let anyone spend the account's request budget.
 */
export const POST: APIRoute = async ({ request }) => {
	const runtime = env as unknown as NotifyEnv & { NOTIFY_TICK_KEY?: string };
	const expected = runtime.NOTIFY_TICK_KEY;
	if (!expected) {
		return new Response(JSON.stringify({ error: "tick is not configured" }), {
			status: 503,
			headers: HEADERS,
		});
	}

	const header = request.headers.get("authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : "";
	if (token !== expected) {
		return new Response(JSON.stringify({ error: "forbidden" }), {
			status: 403,
			headers: HEADERS,
		});
	}

	const summary = await runTick(runtime);
	return new Response(JSON.stringify(summary), { headers: HEADERS });
};
