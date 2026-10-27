const CHALLENGE_REGEX =
	/toNumbers\("([0-9a-f]+)"\).*?toNumbers\("([0-9a-f]+)"\).*?toNumbers\("([0-9a-f]+)"\).*?location\.href="([^"]+)"/is;

export interface RoutineChallengeSolution {
	cookieValue: string;
	nextUrl: string;
}

function hexToBytes(hex: string): Uint8Array {
	const normalized = hex.trim();
	if (normalized.length % 2 !== 0) {
		throw new Error("Invalid hex input length.");
	}

	const bytes = new Uint8Array(normalized.length / 2);
	for (let index = 0; index < normalized.length; index += 2) {
		bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
	}
	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function decryptCookieHex(
	keyHex: string,
	ivHex: string,
	cipherHex: string,
): Promise<string> {
	const keyBytes = hexToBytes(keyHex);
	const ivBytes = hexToBytes(ivHex);
	const cipherBytes = hexToBytes(cipherHex);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(keyBytes),
		{ name: "AES-CBC" },
		false,
		["decrypt"],
	);

	// The antibot ciphertext is a raw 16-byte block without standard PKCS#7 padding.
	// Standard Web Crypto decrypt() requires the decrypted output to have valid PKCS#7 padding,
	// throwing OperationError (BAD_DECRYPT) if the padding bytes do not match.
	//
	// To bypass this, we append a mock 16-byte block (C2) to make a 32-byte ciphertext (C1 || C2).
	// Since AES-CBC decrypts block-by-block and checks padding only at the very end of the final block,
	// we try different values for C2[0] until the decrypted final block P2 ends with a valid padding byte
	// (probability of ~1/256 per trial, taking only ~1.7ms on average to succeed).
	// Once decrypted, we slice off our mock block and retrieve the correctly decrypted 16-byte C1 block!
	const C2 = new Uint8Array(16);
	const combined = new Uint8Array(32);
	combined.set(cipherBytes, 0);

	for (let i = 0; i < 256; i++) {
		C2[0] = i;
		combined.set(C2, 16);
		try {
			const decrypted = await crypto.subtle.decrypt(
				{ name: "AES-CBC", iv: toArrayBuffer(ivBytes) },
				cryptoKey,
				toArrayBuffer(combined),
			);
			const decryptedBytes = new Uint8Array(decrypted);
			const P1 = decryptedBytes.slice(0, 16);
			return bytesToHex(P1);
		} catch (error) {
			// Padding validation failed for this mock block, try the next one
		}
	}

	// Fallback if C2[0] didn't yield a valid padding byte (extremely rare)
	for (let i = 0; i < 256; i++) {
		C2[1] = i;
		combined.set(C2, 16);
		try {
			const decrypted = await crypto.subtle.decrypt(
				{ name: "AES-CBC", iv: toArrayBuffer(ivBytes) },
				cryptoKey,
				toArrayBuffer(combined),
			);
			const decryptedBytes = new Uint8Array(decrypted);
			const P1 = decryptedBytes.slice(0, 16);
			return bytesToHex(P1);
		} catch (error) {
			// Padding validation failed, try the next one
		}
	}

	throw new Error("Antibot challenge decryption failed after exhaustive search.");
}

export async function solveRoutineChallenge(
	html: string,
	currentUrl: string,
): Promise<RoutineChallengeSolution | null> {
	const match = html.match(CHALLENGE_REGEX);
	if (!match) return null;

	const [, keyHex, ivHex, cipherHex, nextHref] = match;
	return {
		cookieValue: await decryptCookieHex(keyHex, ivHex, cipherHex),
		nextUrl: new URL(nextHref, currentUrl).toString(),
	};
}
