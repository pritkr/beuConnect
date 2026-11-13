import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import type { NotifyEnv } from "../../../notifications/run";
import { base64UrlDecode } from "../../../notifications/webpush";

export const prerender = false;

const HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

const TOPICS = new Set(["important", "results", "notices"]);
const MAX_ENDPOINT = 900;

type SubscribeBody = {
	subscription?: {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
	};
	topics?: unknown;
};

function fail(status: number, error: string): Response {
	return new Response(JSON.stringify({ error }), { status, headers: HEADERS });
}

function text(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

/** The browser's key material arrives base64url; a wrong length is a bad client. */
function keyBytes(value: unknown, expected: number): string | null {
	const raw = text(value, 400);
	if (!raw) return null;
	try {
		return base64UrlDecode(raw).length === expected ? raw : null;
	} catch {
		return null;
	}
}

async function subscriptionId(endpoint: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(endpoint),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Stores one browser subscription.
 *
 * The endpoint is the identity: subscribing twice from the same browser updates
 * the row instead of adding a second one, which is what makes the button safe
 * to press after clearing storage.
 *
 * Nothing here identifies a person. The topics are the whole preference, and
 * the endpoint is a push service URL that only that browser's push service can
 * use.
 */
export const POST: APIRoute = async ({ request }) => {
	const db = (env as unknown as NotifyEnv).DB;
	if (!db) return fail(503, "notifications are not configured");

	let body: SubscribeBody;
	try {
		body = (await request.json()) as SubscribeBody;
	} catch {
		return fail(400, "invalid json");
	}

	const endpoint = text(body.subscription?.endpoint, MAX_ENDPOINT);
	if (!endpoint) return fail(400, "missing endpoint");
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return fail(400, "invalid endpoint");
	}
	if (url.protocol !== "https:") return fail(400, "endpoint must be https");

	const p256dh = keyBytes(body.subscription?.keys?.p256dh, 65);
	const auth = keyBytes(body.subscription?.keys?.auth, 16);
	if (!p256dh || !auth) return fail(400, "invalid subscription keys");

	const topics = Array.isArray(body.topics)
		? body.topics.filter(
				(topic): topic is string =>
					typeof topic === "string" && TOPICS.has(topic),
			)
		: [];
	if (topics.length === 0) topics.push("important");

	const id = await subscriptionId(endpoint);
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, topics, created_at, last_ok_at, failures)
			 VALUES (?, ?, ?, ?, ?, ?, NULL, 0)
			 ON CONFLICT(endpoint) DO UPDATE SET
			   p256dh = excluded.p256dh,
			   auth = excluded.auth,
			   topics = excluded.topics,
			   failures = 0,
			   last_error = NULL`,
		)
		.bind(id, endpoint, p256dh, auth, JSON.stringify(topics), now)
		.run();

	return new Response(JSON.stringify({ ok: true, id }), { headers: HEADERS });
};
