import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { EVENT_NAMES } from "../../lib/analytics/events";

/**
 * The app's door into GA4.
 *
 * `gtag.js` does not exist inside a QuickJS runtime, and a mobile app cannot
 * keep a Measurement Protocol API secret — anyone can unzip an APK. So the app
 * batches events to this endpoint and the worker, which holds the secret, does
 * the forwarding. Two consequences, both wanted:
 *
 *  - A secret never ships. Rotate it in Cloudflare and the installed app keeps
 *    working because it never knew it.
 *  - Events are validated and scrubbed here, so a bug in one client cannot
 *    write a registration number into a property we cannot delete from.
 *
 * `prerender = false` because this is the only dynamic route (`output: static`
 * builds everything else ahead of time).
 */

export const prerender = false;

const MAX_BYTES = 16_384;
const MAX_EVENTS = 25;
const MAX_PARAMS = 25;
const MAX_STRING = 100;
const NAME = /^[a-z][a-z0-9_]{2,39}$/;

/** Keys that could carry a person, never a dimension. */
const PERSON_KEY = /(^|_)(reg|regno|registration|roll|name|email|phone|mobile|contact|message|query|q|text|token|password|otp)$/i;

/**
 * Keys that end in a "person" word but are ours: `screen_name` is a route, not
 * a student. Everything else that looks personal is dropped.
 */
const OWN_KEY = new Set([
	"screen_name",
	"page_name",
	"file_name",
	"paper_name",
	"subject_name",
	"college_name",
	"branch_name",
]);

const KNOWN = new Set(EVENT_NAMES);

type IncomingEvent = { name?: unknown; params?: unknown };

function noContent(status = 204): Response {
	return new Response(null, {
		status,
		headers: { "cache-control": "no-store" },
	});
}

function workerEnv(): Record<string, string | undefined> {
	return env as unknown as Record<string, string | undefined>;
}

function blocked(key: string): boolean {
	return !OWN_KEY.has(key) && PERSON_KEY.test(key);
}

/** Hidden registration follows the site's rule: a long digit run is a person. */
function scrub(value: string): string {
	return value
		.replace(/\d{6,}/g, "[redacted]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_STRING);
}

function cleanParams(input: unknown): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	if (!input || typeof input !== "object") return out;
	const entries = Object.entries(input as Record<string, unknown>);
	for (const [key, value] of entries.slice(0, MAX_PARAMS)) {
		if (!NAME.test(key)) continue;
		if (blocked(key)) continue;
		if (typeof value === "number") {
			if (Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000;
		} else if (typeof value === "boolean") {
			out[key] = value;
		} else if (typeof value === "string") {
			// `student` is already a hash of the saved number; scrubbing it would
			// mangle the rare hex string that happens to contain six digits.
			const clean = key === "student" ? value.slice(0, MAX_STRING) : scrub(value);
			if (clean) out[key] = clean;
		}
	}
	return out;
}

export const POST: APIRoute = async ({ request }) => {
	const measurementId =
		workerEnv().GA_MEASUREMENT_ID ?? workerEnv().PUBLIC_GA_MEASUREMENT_ID;
	const apiSecret = workerEnv().GA_API_SECRET;

	// Not configured: accept and drop. A client must never show an analytics
	// failure to a student, and an unconfigured deployment is not an incident.
	if (!measurementId || !apiSecret) return noContent();

	const declared = Number(request.headers.get("content-length") ?? 0);
	if (declared > MAX_BYTES) return noContent(413);

	const raw = await request.text();
	if (raw.length > MAX_BYTES) return noContent(413);

	let body: { client_id?: unknown; events?: unknown; app?: unknown };
	try {
		body = JSON.parse(raw) as typeof body;
	} catch {
		return noContent(400);
	}

	const clientId =
		typeof body.client_id === "string" && body.client_id.length >= 8
			? body.client_id.slice(0, 64)
			: "";
	if (!clientId) return noContent(400);

	const events = Array.isArray(body.events) ? (body.events as IncomingEvent[]) : [];
	const clean: Array<{ name: string; params: Record<string, string | number | boolean> }> = [];
	for (const event of events.slice(0, MAX_EVENTS)) {
		const name = typeof event?.name === "string" ? event.name : "";
		if (!NAME.test(name) || !KNOWN.has(name)) continue;
		// `surface` is stamped here, not trusted from the client: everything on
		// this endpoint came from the app, so the dashboard split cannot be
		// poisoned by a bad build.
		clean.push({ name, params: { ...cleanParams(event.params), surface: "android" } });
	}

	if (clean.length === 0) return noContent();

	const app = (body.app ?? {}) as Record<string, unknown>;
	const userProperties = {
		platform: { value: str(app.platform) || "unknown" },
		app_version: { value: str(app.version) || "unknown" },
	};

	const payload = {
		client_id: clientId,
		user_properties: userProperties,
		events: clean.map((event) => ({
			name: event.name,
			params: { engagement_time_msec: 1, ...event.params },
		})),
	};

	const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
		measurementId,
	)}&api_secret=${encodeURIComponent(apiSecret)}`;

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		// GA4 answers 2xx with an empty body; anything else is worth a log line
		// but not a retry loop from the phone.
		if (!response.ok) {
			console.error("analytics forwarding failed", response.status);
		}
	} catch (error) {
		console.error("analytics forwarding failed", error);
	}

	return noContent();
};

export const GET: APIRoute = () => noContent(405);

function str(value: unknown): string {
	return typeof value === "string" ? scrub(value) : "";
}
