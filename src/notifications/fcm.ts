/**
 * Firebase Cloud Messaging HTTP v1, with no SDK and no dependency.
 *
 * The worker is a service account, not a Firebase app: it signs a JWT with the
 * account's RSA key, trades it for an OAuth token, and posts one message to a
 * topic. `google-auth-library` would do the same thing with `nodejs_compat`;
 * `crypto.subtle` does it with nothing.
 *
 * The app never sends a token to this worker, so there is no device table and
 * no student identity here — publishing to a topic is the whole addressing
 * model. See `native/android/java/.../NotificationSetup.java`.
 */

const encoder = new TextEncoder();
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_KEY = "fcm_token";

export type FcmConfig = {
	projectId: string;
	clientEmail: string;
	privateKey: string;
};

type ServiceAccount = {
	project_id?: string;
	client_email?: string;
	private_key?: string;
};

export function fcmConfig(env: Record<string, unknown>): FcmConfig | null {
	const raw = env.FCM_SERVICE_ACCOUNT;
	const parsed = typeof raw === "string" ? safeJson<ServiceAccount>(raw) : null;
	if (!parsed?.project_id || !parsed.client_email || !parsed.private_key)
		return null;
	return {
		projectId: parsed.project_id,
		clientEmail: parsed.client_email,
		privateKey: parsed.private_key,
	};
}

function safeJson<T>(value: string): T | null {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function base64Url(bytes: Uint8Array | ArrayBuffer): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let binary = "";
	for (const byte of view) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * The private key arrives as a PEM. Its body is standard base64, so it decodes
 * with `atob` unchanged — turning `+` into `-` and `/` into `_` first (as the
 * base64url helpers do) makes `atob` throw on almost every real key, which is
 * how Android notifications silently stopped minting a token.
 */
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
	const body = pem
		.replace(/-----BEGIN [^-]+-----/g, "")
		.replace(/-----END [^-]+-----/g, "")
		.replace(/\s+/g, "");
	const binary = atob(body);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1)
		bytes[index] = binary.charCodeAt(index);
	return bytes;
}

/** Exported for the test that verifies the signature against the public key. */
export async function fcmAssertion(
	config: FcmConfig,
	now: number,
): Promise<string> {
	return signedAssertion(config, now);
}

async function signedAssertion(
	config: FcmConfig,
	now: number,
): Promise<string> {
	const header = base64Url(
		encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
	);
	const claims = base64Url(
		encoder.encode(
			JSON.stringify({
				iss: config.clientEmail,
				scope: SCOPE,
				aud: TOKEN_URL,
				iat: now,
				exp: now + 3600,
			}),
		),
	);
	const input = `${header}.${claims}`;
	const key = await crypto.subtle.importKey(
		"pkcs8",
		pemToDer(config.privateKey),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		encoder.encode(input),
	);
	return `${input}.${base64Url(signature)}`;
}

/**
 * An OAuth token, cached in D1 until the minute before it expires.
 *
 * The cache matters: a fresh token per tick would be two extra requests every
 * five minutes for no reason, and Google rate-limits token minting per account.
 */
export async function fcmAccessToken(
	db: D1Database,
	config: FcmConfig,
	now = Date.now(),
): Promise<string | null> {
	const cached = await db
		.prepare("SELECT v FROM meta WHERE k = ?")
		.bind(TOKEN_KEY)
		.first<{ v: string }>();
	if (cached?.v) {
		const parsed = safeJson<{ token: string; exp: number }>(cached.v);
		if (parsed?.token && parsed.exp > now + 60_000) return parsed.token;
	}

	try {
		const assertion = await signedAssertion(config, Math.floor(now / 1000));
		const response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion,
			}),
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as {
			access_token?: string;
			expires_in?: number;
		};
		if (!payload.access_token) return null;
		const exp = now + Math.max(60, payload.expires_in ?? 3600) * 1000;
		await db
			.prepare(
				"INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
			)
			.bind(TOKEN_KEY, JSON.stringify({ token: payload.access_token, exp }))
			.run();
		return payload.access_token;
	} catch (error) {
		// A null here means every Android notification is skipped, so say why
		// rather than letting the tick report a quiet `fcm: 0`.
		console.error("notifications: fcm token failed", error);
		return null;
	}
}

export type FcmEvent = {
	id: string;
	topic: string;
	title: string;
	body: string;
	route: string;
	params: string;
	url: string;
};

export type FcmResult = { ok: boolean; status: number; error?: string };

/**
 * One message to one topic.
 *
 * Data-only, with high priority: a `notification` payload would be rendered by
 * Play services and the tap would open the launcher activity with no route, so
 * the app could not take the student to the notice. `ttl` is a day — a circular
 * that arrives two days late is worse than one that never arrives.
 */
export async function sendFcm(
	config: FcmConfig,
	token: string,
	event: FcmEvent,
): Promise<FcmResult> {
	const message = {
		message: {
			topic: event.topic,
			data: {
				id: event.id,
				title: event.title,
				body: event.body,
				route: event.route,
				params: event.params,
				url: event.url,
			},
			android: { priority: "HIGH", ttl: "86400s" },
		},
	};
	try {
		const response = await fetch(
			`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(message),
			},
		);
		if (response.ok) return { ok: true, status: response.status };
		// 404 is "no device is subscribed to this topic", which is a success for
		// the event and a reason to stop retrying it, not an error.
		if (response.status === 404) return { ok: true, status: 404 };
		return {
			ok: false,
			status: response.status,
			error: (await response.text().catch(() => "")).slice(0, 250),
		};
	} catch (error) {
		return { ok: false, status: 0, error: String(error).slice(0, 250) };
	}
}
