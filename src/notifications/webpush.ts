/**
 * Web Push with nothing but WebCrypto.
 *
 * RFC 8291 encrypts a payload for one subscription, RFC 8292 signs the request
 * (VAPID). The two well-known libraries that do this (`web-push`, `http_ece`)
 * are Node modules; on Workers they need `nodejs_compat`, and this site ships
 * as a static Astro build where that flag is a change to every page's runtime.
 * The whole protocol is ~150 lines of `crypto.subtle`, so it is done here
 * instead. `webpush.test.ts` round-trips an encryption with the same steps a
 * browser takes.
 *
 * Keys: `VAPID_PUBLIC_KEY` is the uncompressed P-256 point (65 bytes,
 * base64url) — exactly what `PushManager.subscribe` takes. `VAPID_PRIVATE_KEY`
 * is the same key as PKCS#8 DER, which is what `crypto.subtle.importKey`
 * takes. `scripts/notifications-keys.ts` prints both.
 */

const encoder = new TextEncoder();

export type PushSubscriptionRow = {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	topics: string;
};

export type VapidKeys = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

export function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1)
		bytes[index] = binary.charCodeAt(index);
	return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** RFC 8291: one aes128gcm record for one subscription. */
export async function encryptPush(
	payload: string,
	p256dh: string,
	auth: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const uaPublic = base64UrlDecode(p256dh);
	const authSecret = base64UrlDecode(auth);
	if (uaPublic.length !== 65)
		throw new Error("p256dh is not an uncompressed P-256 point");
	if (authSecret.length < 16) throw new Error("auth secret is too short");

	const uaKey = await crypto.subtle.importKey(
		"raw",
		uaPublic,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	const ephemeral = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	);
	const ecdh = new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: "ECDH", public: uaKey },
			ephemeral.privateKey,
			256,
		),
	);
	const asPublic = new Uint8Array(
		await crypto.subtle.exportKey("raw", ephemeral.publicKey),
	);
	const salt = crypto.getRandomValues(new Uint8Array(16));

	const ikm = await crypto.subtle.importKey("raw", ecdh, "HKDF", false, [
		"deriveBits",
	]);
	const prk = new Uint8Array(
		await crypto.subtle.deriveBits(
			{
				name: "HKDF",
				hash: "SHA-256",
				salt: authSecret,
				info: concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic),
			},
			ikm,
			256,
		),
	);

	const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, [
		"deriveBits",
	]);
	const cek = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt,
			info: encoder.encode("Content-Encoding: aes128gcm\0"),
		},
		prkKey,
		128,
	);
	const nonce = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt,
			info: encoder.encode("Content-Encoding: nonce\0"),
		},
		prkKey,
		96,
	);

	// 0x02 ends the last record: a browser that reads a partial body can tell a
	// truncated message from a finished one.
	const record = concat(encoder.encode(payload), new Uint8Array([2]));
	const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
		"encrypt",
	]);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, record),
	);

	const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = asPublic.length;
	header.set(asPublic, 21);
	return concat(header, ciphertext);
}

/** RFC 8292: the `Authorization` value for one push service origin. */
export async function vapidAuthorization(
	endpoint: string,
	keys: VapidKeys,
	now = Math.floor(Date.now() / 1000),
): Promise<string> {
	const header = base64UrlEncode(
		encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
	);
	const claims = base64UrlEncode(
		encoder.encode(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: now + 12 * 60 * 60,
				sub: keys.subject,
			}),
		),
	);
	const signingInput = `${header}.${claims}`;
	const key = await crypto.subtle.importKey(
		"pkcs8",
		base64UrlDecode(keys.privateKey),
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			{ name: "ECDSA", hash: "SHA-256" },
			key,
			encoder.encode(signingInput),
		),
	);
	return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

export type PushPayload = {
	id: string;
	title: string;
	body: string;
	url: string;
	route: string;
	params: Record<string, string>;
};

export type PushResult = { status: number; gone: boolean; error?: string };

/**
 * One delivery. Returns the push service's status so the caller can decide:
 * 404/410 means the subscription is dead and should be deleted, anything else
 * is a failure that a later event may survive.
 */
export async function sendPush(
	subscription: PushSubscriptionRow,
	payload: PushPayload,
	keys: VapidKeys,
): Promise<PushResult> {
	try {
		const body = await encryptPush(
			JSON.stringify(payload),
			subscription.p256dh,
			subscription.auth,
		);
		const authorization = await vapidAuthorization(subscription.endpoint, keys);
		const response = await fetch(subscription.endpoint, {
			method: "POST",
			headers: {
				Authorization: authorization,
				"Content-Encoding": "aes128gcm",
				"Content-Type": "application/octet-stream",
				TTL: "86400",
				Urgency: "normal",
			},
			body,
		});
		if (response.ok) return { status: response.status, gone: false };
		return {
			status: response.status,
			gone: response.status === 404 || response.status === 410,
			error: (await response.text().catch(() => "")).slice(0, 180),
		};
	} catch (error) {
		return { status: 0, gone: false, error: String(error).slice(0, 180) };
	}
}
