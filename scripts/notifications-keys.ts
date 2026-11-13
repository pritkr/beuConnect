/**
 * Prints a VAPID key pair for Web Push.
 *
 *   bun scripts/notifications-keys.ts
 *
 * Public key  → `VAPID_PUBLIC_KEY`, and `/api/push/key` hands it to browsers.
 * Private key → `VAPID_PRIVATE_KEY`, a worker secret. PKCS#8 DER, base64url,
 *               because that is exactly what `crypto.subtle.importKey` takes.
 *
 * Generate a pair once per deployment and keep it: rotating the keys invalidates
 * every subscription a browser already made, and every student has to press the
 * button again.
 */

export {};

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const pair = await crypto.subtle.generateKey(
	{ name: "ECDSA", namedCurve: "P-256" },
	true,
	["sign", "verify"],
);

const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));

if (publicKey.length !== 65) {
	throw new Error(`expected a 65-byte public key, got ${publicKey.length}`);
}

console.log("Add these to the worker (cf workers secrets update, or .dev.vars locally):\n");
console.log(`VAPID_PUBLIC_KEY=${base64Url(publicKey)}`);
console.log(`VAPID_PRIVATE_KEY=${base64Url(privateKey)}`);
console.log("VAPID_SUBJECT=mailto:pritform@gmail.com");
