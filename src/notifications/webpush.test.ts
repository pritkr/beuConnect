import { describe, expect, it } from "vitest";

import {
	base64UrlDecode,
	base64UrlEncode,
	encryptPush,
	vapidAuthorization,
} from "./webpush";

/**
 * The receiver half of RFC 8291 and RFC 8292, written the way a browser writes
 * it: decrypt with the subscription's own private key, verify the VAPID token
 * with the public key the browser was given. A bug in the sender — a wrong
 * `info` label, a missing null byte, the record separator, the salt reuse —
 * shows up here as a decryption failure, which is exactly what a real push
 * service would report as a 400.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

async function hkdf(
	ikm: Uint8Array<ArrayBuffer>,
	salt: Uint8Array<ArrayBuffer>,
	info: Uint8Array<ArrayBuffer>,
	bits: number,
): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
		"deriveBits",
	]);
	return crypto.subtle.deriveBits(
		{ name: "HKDF", hash: "SHA-256", salt, info },
		key,
		bits,
	);
}

/** A subscription as the browser would leave it in PushManager.subscribe(). */
async function newSubscription() {
	const pair = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	);
	const publicRaw = new Uint8Array(
		await crypto.subtle.exportKey("raw", pair.publicKey),
	);
	const auth = crypto.getRandomValues(new Uint8Array(16));
	return {
		privateKey: pair.privateKey,
		p256dh: base64UrlEncode(publicRaw),
		uaPublic: publicRaw,
		auth: base64UrlEncode(auth),
		authSecret: auth,
	};
}

describe("encryptPush", () => {
	it("produces a body the subscription can decrypt", async () => {
		const sub = await newSubscription();
		const payload = JSON.stringify({
			id: "notice:n17lvmx6",
			title: "Examination form",
		});

		const body = await encryptPush(payload, sub.p256dh, sub.auth);

		// Header: 16-byte salt, 4-byte record size, 1-byte id length, 65-byte key.
		expect(body.length).toBe(16 + 4 + 1 + 65 + payload.length + 1 + 16);
		const salt = body.slice(0, 16);
		const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16);
		expect(recordSize).toBe(4096);
		expect(body[20]).toBe(65);

		const asPublic = body.slice(21, 86);
		const ciphertext = body.slice(86);

		const shared = await crypto.subtle.importKey(
			"raw",
			asPublic,
			{ name: "ECDH", namedCurve: "P-256" },
			false,
			[],
		);
		const ecdh = new Uint8Array(
			await crypto.subtle.deriveBits(
				{ name: "ECDH", public: shared },
				sub.privateKey,
				256,
			),
		);

		const prk = new Uint8Array(
			await hkdf(
				ecdh,
				sub.authSecret,
				concat(encoder.encode("WebPush: info\0"), sub.uaPublic, asPublic),
				256,
			),
		);
		const cek = await hkdf(
			prk,
			salt,
			encoder.encode("Content-Encoding: aes128gcm\0"),
			128,
		);
		const nonce = await hkdf(
			prk,
			salt,
			encoder.encode("Content-Encoding: nonce\0"),
			96,
		);

		const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
			"decrypt",
		]);
		const record = new Uint8Array(
			await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: nonce },
				aes,
				ciphertext,
			),
		);

		// 0x02 marks the final record.
		expect(record.at(-1)).toBe(2);
		expect(decoder.decode(record.slice(0, -1))).toBe(payload);
	});

	it("uses a fresh salt and ephemeral key each time", async () => {
		const sub = await newSubscription();
		const first = await encryptPush("a", sub.p256dh, sub.auth);
		const second = await encryptPush("a", sub.p256dh, sub.auth);
		expect(base64UrlEncode(first.slice(0, 16))).not.toBe(
			base64UrlEncode(second.slice(0, 16)),
		);
		expect(base64UrlEncode(first.slice(21, 86))).not.toBe(
			base64UrlEncode(second.slice(21, 86)),
		);
	});

	it("refuses a p256dh that is not an uncompressed point", async () => {
		const sub = await newSubscription();
		// A valid base64url string, but 64 bytes: a compressed point.
		const compressed = base64UrlEncode(base64UrlDecode(sub.p256dh).slice(1));
		await expect(encryptPush("a", compressed, sub.auth)).rejects.toThrow(
			/uncompressed/,
		);
		await expect(
			encryptPush("a", sub.p256dh, base64UrlEncode(new Uint8Array(8))),
		).rejects.toThrow(/too short/);
	});
});

describe("vapidAuthorization", () => {
	async function newVapid() {
		const pair = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);
		return {
			keys: {
				publicKey: base64UrlEncode(
					new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
				),
				privateKey: base64UrlEncode(
					new Uint8Array(
						await crypto.subtle.exportKey("pkcs8", pair.privateKey),
					),
				),
				subject: "mailto:test@example.com",
			},
			publicKey: pair.publicKey,
		};
	}

	it("signs a token the push service can verify", async () => {
		const { keys, publicKey } = await newVapid();
		const now = 1_800_000_000;
		const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

		const header = await vapidAuthorization(endpoint, keys, now);
		const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
		expect(match).not.toBeNull();
		if (!match) throw new Error("vapid header did not parse");

		const [token, key] = [match[1], match[2]] as [string, string];
		expect(key).toBe(keys.publicKey);

		const [encodedHeader, encodedClaims, signature] = token.split(".");
		expect(JSON.parse(decoder.decode(base64UrlDecode(encodedHeader)))).toEqual({
			typ: "JWT",
			alg: "ES256",
		});
		expect(JSON.parse(decoder.decode(base64UrlDecode(encodedClaims)))).toEqual({
			aud: "https://fcm.googleapis.com",
			exp: now + 12 * 60 * 60,
			sub: keys.subject,
		});

		const verifyKey = await crypto.subtle.importKey(
			"raw",
			base64UrlDecode(keys.publicKey),
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["verify"],
		);
		const valid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			verifyKey,
			base64UrlDecode(signature),
			encoder.encode(`${encodedHeader}.${encodedClaims}`),
		);
		expect(valid).toBe(true);
		expect(publicKey.usages).toContain("verify");
	});
});
