/**
 * The identity a notice has on both sides of the wire.
 *
 * The app's notices screen already names a notice `n<hash>` from its title and
 * date (`native/src/features/notices/api.ts`, `noticeId`). A push notification
 * that wants to open that exact notice has to use the same name, so the hash
 * and the text normalisation are duplicated here on purpose, byte for byte.
 *
 * If they ever disagree the tap still lands on the board — `notices` with an
 * unknown id renders "Notice not found" — but a notice that does not open is a
 * bug, so `src/notifications/notice.test.ts` pins both sides.
 */

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	bull: "•",
	ndash: "–",
	mdash: "—",
	hellip: "…",
};

/** Decodes the handful of entities the board uses, and drops tags. */
export function cleanNoticeText(value: string): string {
	return value
		.replace(/<[^>]*>/g, " ")
		.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
			if (body.charAt(0) === "#") {
				const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
				const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
				return Number.isFinite(code) && code > 0 && code < 0x110000
					? String.fromCodePoint(code)
					: "";
			}
			const named = NAMED_ENTITIES[body.toLowerCase()];
			return named === undefined ? match : named;
		})
		.replace(/\s+/g, " ")
		.trim();
}

/** `n1a2b3` — the same id the app's board, detail and read state use. */
export function noticeKey(title: string, date: string | null): string {
	const key = `${title.trim().toLowerCase()}|${date ?? ""}`;
	let hash = 0x811c9dc5;
	for (let index = 0; index < key.length; index += 1) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `n${hash.toString(36)}`;
}
