/**
 * The result corpus, as data.
 *
 * One row per `(reg, sem)` holds the BEU result body a student has already
 * looked up, so the next student in the same batch can read it instead of
 * waiting on a portal that asks for a captcha. The policy lives in one place —
 * `/terms/#results` — and this module only enforces its shape.
 *
 * Everything here is pure except the four functions that take a `D1Database`.
 * That keeps the route thin and lets the tests run against an in-memory fake.
 */

/** Serialized payload ceiling. A real BEU `get-result` body is a few kilobytes. */
export const MAX_PAYLOAD_BYTES = 32_768;

/** One IP hash gets 60 writes an hour; the 61st is refused. */
export const WRITES_PER_HOUR = 60;

const HOUR_MS = 60 * 60 * 1000;
const PRUNE_AFTER_MS = 48 * HOUR_MS;

/** The branch codes BEU issues result rows for. */
const BRANCHES = new Set(["101", "102", "103", "104", "105", "110", "161"]);

/** Collections that carry a result even without a `{status, data}` envelope. */
const RESULT_COLLECTIONS = [
	"theorySubjects",
	"practicalSubjects",
	"subjects",
	"papers",
	"failed_subjects",
	"backlog_subjects",
] as const;

/** Any tag-shaped string means markup was scraped, not a JSON result. */
const HTML = /<[a-z!/?]/i;

export type CorpusVia = "portal" | "api";

export type InvalidReason = "reg" | "sem" | "payload" | "size";

export type CorpusInput = {
	reg: string;
	sem: number;
	batch: string;
	branch: string;
	college: string;
	/** Serialized JSON, exactly the string whose digest is `sha`. */
	payload: string;
	sha: string;
	bytes: number;
	via: CorpusVia;
};

export type Validation = { ok: true; row: CorpusInput } | { ok: false; reason: InvalidReason };

export type CorpusRead = {
	payload: unknown;
	capturedAt: number;
	via: string;
};

export type UpsertOutcome = "stored" | "duplicate";

/**
 * The statements the route runs, exported so the test's fake D1 can answer the
 * exact SQL this module sends instead of re-implementing a SQL parser.
 */
export const SQL = {
	upsert: `INSERT INTO corpus_rows
		 (reg, sem, batch, branch, college, payload, sha, bytes, via, captured_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(reg, sem) DO UPDATE SET
		   payload = excluded.payload,
		   sha = excluded.sha,
		   bytes = excluded.bytes,
		   via = excluded.via,
		   captured_at = excluded.captured_at,
		   updated_at = excluded.updated_at
		 WHERE excluded.sha <> corpus_rows.sha
		   AND excluded.captured_at >= corpus_rows.captured_at`,
	read: `SELECT payload, captured_at, via FROM corpus_rows WHERE reg = ? AND sem = ?`,
	guard: `INSERT INTO corpus_writes (ip_hash, bucket, n, at) VALUES (?, ?, 1, ?)
		 ON CONFLICT(ip_hash, bucket) DO UPDATE SET n = n + 1, at = excluded.at
		 RETURNING n`,
	prune: `DELETE FROM corpus_writes WHERE at < ?`,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The registration number, reduced to digits exactly the way the app does it:
 * spaces and letters are noise a student may have typed. The first eight digits
 * are batch `[0,2)`, branch `[2,5)`, college `[5,8)`.
 */
export function parseReg(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const digits = value.replace(/\s|[A-Za-z]/g, "");
	if (!/^\d{8,12}$/.test(digits)) return null;

	const batch = Number.parseInt(digits.slice(0, 2), 10);
	if (batch < 21 || batch > 32) return null;
	if (!BRANCHES.has(digits.slice(2, 5))) return null;
	if (!/^\d{3}$/.test(digits.slice(5, 8))) return null;

	return digits;
}

export function parseSem(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value)) return null;
	return value >= 1 && value <= 8 ? value : null;
}

function hasCollection(payload: Record<string, unknown>): boolean {
	return RESULT_COLLECTIONS.some((key) => {
		const value = payload[key];
		return Array.isArray(value) && value.length > 0;
	});
}

/**
 * A result is either the `{status, data}` envelope or a bare subject/paper
 * collection. `{status: 500, message: "…"}` and `{}` are errors, not results.
 */
function looksLikeResult(payload: Record<string, unknown>): boolean {
	const status = Number(payload.status);
	if (Number.isFinite(status) && status >= 400) return false;
	if (hasCollection(payload)) return true;
	if (!("data" in payload)) return false;

	const data = payload.data;
	if (typeof data === "string") return data.trim().length > 0;
	if (Array.isArray(data)) return data.length > 0;
	if (isRecord(data)) return Object.keys(data).length > 0;
	return false;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks one POST body and returns the row it describes.
 *
 * The order is the endpoint's: a bad registration number is reported before a
 * bad semester, and the payload is scanned after both, so a reason names the
 * first field the caller can fix.
 */
export async function validate(body: unknown): Promise<Validation> {
	const input = isRecord(body) ? body : {};

	const reg = parseReg(input.reg);
	if (!reg) return { ok: false, reason: "reg" };

	const sem = parseSem(input.sem);
	if (!sem) return { ok: false, reason: "sem" };

	const payload = input.payload;
	if (!isRecord(payload) || Object.keys(payload).length === 0 || !looksLikeResult(payload)) {
		return { ok: false, reason: "payload" };
	}

	const serialized = JSON.stringify(payload);
	const bytes = new TextEncoder().encode(serialized).byteLength;
	if (bytes > MAX_PAYLOAD_BYTES) return { ok: false, reason: "size" };
	if (HTML.test(serialized)) return { ok: false, reason: "payload" };

	return {
		ok: true,
		row: {
			reg,
			sem,
			batch: reg.slice(0, 2),
			branch: reg.slice(2, 5),
			college: reg.slice(5, 8),
			payload: serialized,
			sha: await sha256Hex(serialized),
			bytes,
			via: input.via === "api" ? "api" : "portal",
		},
	};
}

/**
 * Writes one row. `stored` means a row was inserted or its payload changed;
 * `duplicate` means the stored copy is already the same digest (or newer).
 */
export async function upsert(
	db: D1Database,
	row: CorpusInput,
	now: number,
): Promise<UpsertOutcome> {
	const result = await db
		.prepare(SQL.upsert)
		.bind(
			row.reg,
			row.sem,
			row.batch,
			row.branch,
			row.college,
			row.payload,
			row.sha,
			row.bytes,
			row.via,
			now,
			now,
			now,
		)
		.run();
	return (result.meta.changes ?? 0) > 0 ? "stored" : "duplicate";
}

export async function read(
	db: D1Database,
	reg: string,
	sem: number,
): Promise<CorpusRead | null> {
	const row = await db
		.prepare(SQL.read)
		.bind(reg, sem)
		.first<{ payload: string; captured_at: number; via: string }>();
	if (!row) return null;

	try {
		return { payload: JSON.parse(row.payload), capturedAt: row.captured_at, via: row.via };
	} catch {
		// A row that no longer parses is a miss, not a 500: the reader can retry
		// the portal and contribute a clean copy.
		return null;
	}
}

/**
 * Counts one write against this IP hash for the current hour.
 *
 * `bucket % 24 === 0` is true for one hour a day, so the 48-hour prune rides
 * along with that hour's writes instead of being a delete on every request.
 */
export async function guard(db: D1Database, ipHash: string, now: number): Promise<boolean> {
	const bucket = Math.floor(now / HOUR_MS);
	const row = await db
		.prepare(SQL.guard)
		.bind(ipHash, bucket, now)
		.first<{ n: number }>();

	if (bucket % 24 === 0) {
		await db.prepare(SQL.prune).bind(now - PRUNE_AFTER_MS).run();
	}

	return (row?.n ?? 0) <= WRITES_PER_HOUR;
}

/**
 * The rate-limit key: `sha256(ip + daySalt)`, first 16 hex characters.
 *
 * `CORPUS_SALT` is a secret, so the digest cannot be reversed by hashing
 * candidate addresses. When the binding is absent the UTC date stands in: that
 * still rotates daily and scopes the counter, but a date is public, so anyone
 * holding the table could confirm a guessed IP. The fallback is deliberately
 * weaker — a deployment without the secret should still rate-limit.
 */
export async function hashIp(
	ip: string,
	salt: string | undefined,
	now: number,
): Promise<string> {
	const day = new Date(now).toISOString().slice(0, 10);
	const digest = await sha256Hex(`${ip}${salt || day}`);
	return digest.slice(0, 16);
}

/**
 * `/api/result` calls this after a portal fetch succeeds: the same row a client
 * POST would write, tagged `api`. Best effort by contract — it never throws, so
 * a corpus failure cannot change a result response. No write guard: this is the
 * worker's own fetch, not a client's.
 */
export async function contributeInline(
	db: D1Database | undefined,
	reg: string,
	sem: number,
	payload: unknown,
	now = Date.now(),
): Promise<void> {
	if (!db) return;

	try {
		const outcome = await validate({ reg, sem, payload, via: "api" });
		if (!outcome.ok) return;
		await upsert(db, outcome.row, now);
	} catch (error) {
		console.error("corpus inline contribution failed", error);
	}
}
