import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import type { NotifyEnv } from "../../../notifications/run";

export const prerender = false;

const HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

/**
 * Forgets one browser subscription.
 *
 * Idempotent: unsubscribing an endpoint that is already gone returns ok, so the
 * button works after a browser cleared its own storage.
 */
export const POST: APIRoute = async ({ request }) => {
	const db = (env as unknown as NotifyEnv).DB;
	if (!db)
		return new Response(
			JSON.stringify({ error: "notifications are not configured" }),
			{ status: 503, headers: HEADERS },
		);

	let endpoint = "";
	try {
		const body = (await request.json()) as { endpoint?: unknown };
		if (typeof body.endpoint === "string")
			endpoint = body.endpoint.slice(0, 900);
	} catch {
		return new Response(JSON.stringify({ error: "invalid json" }), {
			status: 400,
			headers: HEADERS,
		});
	}
	if (!endpoint)
		return new Response(JSON.stringify({ error: "missing endpoint" }), {
			status: 400,
			headers: HEADERS,
		});

	await db
		.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
		.bind(endpoint)
		.run();
	return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
};
