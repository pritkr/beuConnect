import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import type { NotifyEnv } from "../../../notifications/run";
import { vapidKeys } from "../../../notifications/run";

export const prerender = false;

const HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

/**
 * The public half of the VAPID pair, which the browser needs before it will
 * subscribe. It is public by design: it is the key push services use to verify
 * our signature, not a secret.
 */
export const GET: APIRoute = async () => {
	const keys = vapidKeys(env as unknown as NotifyEnv);
	if (!keys) {
		return new Response(JSON.stringify({ error: "push is not configured" }), {
			status: 503,
			headers: HEADERS,
		});
	}
	return new Response(JSON.stringify({ key: keys.publicKey }), {
		headers: HEADERS,
	});
};
