import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { fcmConfig } from "../../../notifications/fcm";
import { type NotifyEnv, vapidKeys } from "../../../notifications/run";

export const prerender = false;

const HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

/**
 * Which lanes are live. Used by the settings panel to explain why the button is
 * missing instead of offering one that cannot work, and by ops to confirm a
 * deployment without opening the database.
 */
export const GET: APIRoute = async () => {
	const runtime = env as unknown as NotifyEnv;
	const body = {
		push: vapidKeys(runtime) !== null,
		fcm: fcmConfig(runtime as Record<string, unknown>) !== null,
		db: Boolean(runtime.DB),
	};
	return new Response(JSON.stringify(body), { headers: HEADERS });
};
