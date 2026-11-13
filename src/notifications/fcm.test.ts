/**
 * The FCM lane's one piece of crypto: a service-account key is a PEM, and the
 * worker signs a JWT with it. A PEM decoded as base64url throws on most real
 * keys, and the failure was invisible because the token function swallowed it —
 * the tick just reported `fcm: 0` and Android never got a notification.
 *
 * The key here is generated, not the real service account: what matters is that
 * a PEM in the shape Google issues round-trips into a valid RS256 signature.
 */
import { describe, expect, it } from "vitest";
import { fcmAssertion } from "./fcm";

const b64urlToBytes = (value: string) =>
	new Uint8Array(Buffer.from(value, "base64url"));

/** Same 64-column wrapping Google's console writes. */
function toPem(der: ArrayBuffer): string {
	const body = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
	return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

describe("fcm service-account assertions", () => {
	it("signs a JWT with a PEM key that base64url decoding would reject", async () => {
		const pair = (await crypto.subtle.generateKey(
			{
				name: "RSASSA-PKCS1-v1_5",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["sign", "verify"],
		)) as CryptoKeyPair;
		const der = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
		const pem = toPem(der);

		// The key must actually contain + or / for this to be the bug it was.
		const body = pem.replace(/-----[^-]+-----|\s/g, "");
		expect(/[+/]/.test(body)).toBe(true);

		const now = 1_800_000_000;
		const assertion = await fcmAssertion(
			{
				projectId: "test-project",
				clientEmail: "test@test-project.iam.gserviceaccount.com",
				privateKey: pem,
			},
			now,
		);

		const [header, claims, signature] = assertion.split(".");
		expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
			alg: "RS256",
			typ: "JWT",
		});
		const parsed = JSON.parse(Buffer.from(claims, "base64url").toString());
		expect(parsed.iss).toBe("test@test-project.iam.gserviceaccount.com");
		expect(parsed.scope).toBe(
			"https://www.googleapis.com/auth/firebase.messaging",
		);
		expect(parsed.exp).toBe(now + 3600);

		const valid = await crypto.subtle.verify(
			"RSASSA-PKCS1-v1_5",
			pair.publicKey,
			b64urlToBytes(signature),
			new TextEncoder().encode(`${header}.${claims}`),
		);
		expect(valid).toBe(true);
	});
});
