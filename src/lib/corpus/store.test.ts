import { describe, expect, test } from "vitest";

import {
	type CorpusInput,
	guard,
	hashIp,
	MAX_PAYLOAD_BYTES,
	read,
	SQL,
	upsert,
	validate,
	WRITES_PER_HOUR,
} from "./store";

type StoredRow = CorpusInput & {
	captured_at: number;
	created_at: number;
	updated_at: number;
};

type WriteRow = { n: number; at: number };

const REG = "24105157010";
const SEM = 2;
const NOW = 1_763_000_000_000;
const HOUR = 60 * 60 * 1000;

/** 489720 * HOUR, and 489720 is divisible by 24: the prune hour. */
const PRUNE_NOW = 489_720 * HOUR;

const PAYLOAD = {
	status: 200,
	data: { redg_no: REG, name: "A STUDENT", cgpa: "8.1" },
};

/**
 * An in-memory D1 that understands exactly the four statements in `SQL`.
 * `store.ts` exports those strings so the fake answers the SQL that is sent,
 * rather than a parallel implementation drifting from it.
 */
class FakeD1 {
	readonly rows = new Map<string, StoredRow>();
	readonly writes = new Map<string, WriteRow>();

	prepare(sql: string) {
		return new FakeStatement(this, sql);
	}

	run(sql: string, params: unknown[]): { changes: number; row?: Record<string, unknown> } {
		if (sql === SQL.upsert) return this.upsertRow(params);
		if (sql === SQL.read) return this.selectRow(params);
		if (sql === SQL.guard) return this.countWrite(params);
		if (sql === SQL.prune) return this.pruneWrites(params);
		throw new Error(`fake D1 has no handler for: ${sql}`);
	}

	private upsertRow(params: unknown[]) {
		const [reg, sem, batch, branch, college, payload, sha, bytes, via, capturedAt, createdAt, updatedAt] =
			params as [
				string,
				number,
				string,
				string,
				string,
				string,
				string,
				number,
				string,
				number,
				number,
				number,
			];

		const key = `${reg}:${sem}`;
		const current = this.rows.get(key);
		if (!current) {
			this.rows.set(key, {
				reg,
				sem,
				batch,
				branch,
				college,
				payload,
				sha,
				bytes,
				via: via as CorpusInput["via"],
				captured_at: capturedAt,
				created_at: createdAt,
				updated_at: updatedAt,
			});
			return { changes: 1 };
		}

		if (current.sha === sha || capturedAt < current.captured_at) return { changes: 0 };

		current.payload = payload;
		current.sha = sha;
		current.bytes = bytes;
		current.via = via as CorpusInput["via"];
		current.captured_at = capturedAt;
		current.updated_at = updatedAt;
		return { changes: 1 };
	}

	private selectRow(params: unknown[]) {
		const [reg, sem] = params as [string, number];
		const row = this.rows.get(`${reg}:${sem}`);
		return {
			changes: 0,
			row: row
				? { payload: row.payload, captured_at: row.captured_at, via: row.via }
				: undefined,
		};
	}

	private countWrite(params: unknown[]) {
		const [ipHash, bucket, at] = params as [string, number, number];
		const key = `${ipHash}:${bucket}`;
		const current = this.writes.get(key);
		if (!current) {
			this.writes.set(key, { n: 1, at });
			return { changes: 1, row: { n: 1 } };
		}
		current.n += 1;
		current.at = at;
		return { changes: 1, row: { n: current.n } };
	}

	private pruneWrites(params: unknown[]) {
		const before = params[0] as number;
		let changes = 0;
		for (const [key, entry] of this.writes) {
			if (entry.at < before) {
				this.writes.delete(key);
				changes += 1;
			}
		}
		return { changes };
	}
}

class FakeStatement {
	private params: unknown[] = [];

	constructor(
		private readonly db: FakeD1,
		private readonly sql: string,
	) {}

	bind(...params: unknown[]) {
		this.params = params;
		return this;
	}

	async run() {
		const { changes } = this.db.run(this.sql, this.params);
		return { success: true, meta: { changes }, results: [] };
	}

	async first() {
		return this.db.run(this.sql, this.params).row ?? null;
	}
}

function fake(): { db: D1Database; store: FakeD1 } {
	const store = new FakeD1();
	return { db: store as unknown as D1Database, store };
}

async function validRow(overrides: Record<string, unknown> = {}): Promise<CorpusInput> {
	const outcome = await validate({ reg: REG, sem: SEM, payload: PAYLOAD, ...overrides });
	if (!outcome.ok) throw new Error(`expected a valid row, got ${outcome.reason}`);
	return outcome.row;
}

async function reasonFor(body: unknown): Promise<string | null> {
	const outcome = await validate(body);
	return outcome.ok ? null : outcome.reason;
}

/** A payload whose serialized form is exactly `bytes` bytes (ASCII only). */
function padded(bytes: number) {
	const base = JSON.stringify({ status: 200, data: { name: "" } });
	return { status: 200, data: { name: "a".repeat(bytes - base.length) } };
}

describe("validate", () => {
	test("accepts the portal envelope and slices the registration number", async () => {
		const row = await validRow();
		expect(row.reg).toBe(REG);
		expect(row.sem).toBe(SEM);
		expect(row.batch).toBe("24");
		expect(row.branch).toBe("105");
		expect(row.college).toBe("157");
		expect(row.via).toBe("portal");
		expect(row.sha).toMatch(/^[0-9a-f]{64}$/);
		expect(row.bytes).toBe(new TextEncoder().encode(row.payload).byteLength);
	});

	test("strips spaces and letters, and defaults unknown vias to portal", async () => {
		expect((await validRow({ reg: " BEU 24105157010 " })).reg).toBe(REG);
		expect((await validRow({ via: "api" })).via).toBe("api");
		expect((await validRow({ via: "anything" })).via).toBe("portal");
	});

	test("rejects a registration number outside the known shape", async () => {
		expect(await reasonFor({ reg: "2410515", sem: SEM, payload: PAYLOAD })).toBe("reg");
		expect(await reasonFor({ reg: "2410515701011", sem: SEM, payload: PAYLOAD })).toBe("reg");
		expect(await reasonFor({ reg: "20105157010", sem: SEM, payload: PAYLOAD })).toBe("reg");
		expect(await reasonFor({ reg: "24106157010", sem: SEM, payload: PAYLOAD })).toBe("reg");
		expect(await reasonFor({ reg: "241-05157010", sem: SEM, payload: PAYLOAD })).toBe("reg");
		expect(await reasonFor({ reg: 24105157010, sem: SEM, payload: PAYLOAD })).toBe("reg");
	});

	test("accepts every batch prefix and branch in the contract's set", async () => {
		for (const reg of ["21105157010", "32105157010", "2411057010", "24161157010"]) {
			expect(await reasonFor({ reg, sem: SEM, payload: PAYLOAD })).toBeNull();
		}
	});

	test("rejects a semester that is not an integer 1-8", async () => {
		for (const sem of [0, 9, 2.5, "2", null]) {
			expect(await reasonFor({ reg: REG, sem, payload: PAYLOAD })).toBe("sem");
		}
	});

	test("rejects an empty, error or non-object payload", async () => {
		for (const payload of [{}, [], "result", null, { status: 500, message: "down" }, { data: {} }]) {
			expect(await reasonFor({ reg: REG, sem: SEM, payload })).toBe("payload");
		}
	});

	test("accepts a bare subject collection with no envelope", async () => {
		expect(
			await reasonFor({
				reg: REG,
				sem: SEM,
				payload: { theorySubjects: [{ code: "101", grade: "A" }] },
			}),
		).toBeNull();
	});

	test("rejects a payload containing HTML", async () => {
		expect(
			await reasonFor({
				reg: REG,
				sem: SEM,
				payload: { status: 200, data: { name: "<html><body>x</body></html>" } },
			}),
		).toBe("payload");
	});

	test("caps the serialized payload at exactly 32768 bytes", async () => {
		const atCap = padded(MAX_PAYLOAD_BYTES);
		expect(new TextEncoder().encode(JSON.stringify(atCap)).byteLength).toBe(MAX_PAYLOAD_BYTES);
		expect(await reasonFor({ reg: REG, sem: SEM, payload: atCap })).toBeNull();

		const pastCap = padded(MAX_PAYLOAD_BYTES + 1);
		expect(new TextEncoder().encode(JSON.stringify(pastCap)).byteLength).toBe(
			MAX_PAYLOAD_BYTES + 1,
		);
		expect(await reasonFor({ reg: REG, sem: SEM, payload: pastCap })).toBe("size");
	});
});

describe("upsert", () => {
	test("stores a new row and reports a duplicate for the same digest", async () => {
		const { db, store } = fake();
		const row = await validRow();

		expect(await upsert(db, row, NOW)).toBe("stored");
		expect(store.rows.size).toBe(1);
		expect(await upsert(db, row, NOW + 1000)).toBe("duplicate");
		expect(store.rows.size).toBe(1);
		expect(store.rows.get(`${REG}:${SEM}`)?.captured_at).toBe(NOW);
		expect(store.rows.get(`${REG}:${SEM}`)?.created_at).toBe(NOW);
	});

	test("replaces the payload when the digest changes", async () => {
		const { db, store } = fake();
		await upsert(db, await validRow(), NOW);

		const changed = await validRow({ payload: { status: 200, data: { name: "B" } } });
		expect(await upsert(db, changed, NOW + 60_000)).toBe("stored");

		const stored = store.rows.get(`${REG}:${SEM}`);
		expect(stored?.payload).toBe(changed.payload);
		expect(stored?.captured_at).toBe(NOW + 60_000);
		expect(stored?.created_at).toBe(NOW);
	});

	test("an older capture never overwrites a newer row", async () => {
		const { db, store } = fake();
		const first = await validRow();
		await upsert(db, first, NOW);

		const older = await validRow({ payload: { status: 200, data: { name: "OLD" } } });
		expect(await upsert(db, older, NOW - 60_000)).toBe("duplicate");
		expect(store.rows.get(`${REG}:${SEM}`)?.payload).toBe(first.payload);
		expect(store.rows.get(`${REG}:${SEM}`)?.captured_at).toBe(NOW);

		expect(await upsert(db, older, NOW + 60_000)).toBe("stored");
		expect(store.rows.get(`${REG}:${SEM}`)?.payload).toBe(older.payload);
	});
});

describe("guard", () => {
	test("allows 60 writes an hour and refuses the 61st", async () => {
		const { db } = fake();
		const ipHash = await hashIp("203.0.113.7", "test-salt", NOW);

		const answers: boolean[] = [];
		for (let i = 0; i < WRITES_PER_HOUR + 1; i += 1) {
			answers.push(await guard(db, ipHash, NOW));
		}

		expect(answers.slice(0, WRITES_PER_HOUR).every(Boolean)).toBe(true);
		expect(answers[WRITES_PER_HOUR]).toBe(false);
	});

	test("counts each IP hash and each hour separately", async () => {
		const { db } = fake();
		const one = await hashIp("203.0.113.7", "s", NOW);
		const two = await hashIp("203.0.113.8", "s", NOW);

		for (let i = 0; i < WRITES_PER_HOUR; i += 1) await guard(db, one, NOW);

		expect(await guard(db, one, NOW)).toBe(false);
		expect(await guard(db, two, NOW)).toBe(true);
		expect(await guard(db, one, NOW + HOUR)).toBe(true);
	});

	test("prunes counters older than 48 hours during the prune hour only", async () => {
		const { db, store } = fake();
		const oldKey = `seed:${Math.floor(PRUNE_NOW / HOUR) - 1}`;
		store.writes.set(oldKey, { n: 3, at: PRUNE_NOW - 49 * HOUR });

		await guard(db, "seed", PRUNE_NOW);
		expect(store.writes.has(oldKey)).toBe(false);

		const keptKey = `keep:${Math.floor(NOW / HOUR) - 1}`;
		store.writes.set(keptKey, { n: 3, at: NOW - 49 * HOUR });
		await guard(db, "keep", NOW);
		expect(store.writes.has(keptKey)).toBe(true);
	});
});

describe("hashIp", () => {
	test("is a stable 16-hex digest, per day and per salt", async () => {
		const digest = await hashIp("203.0.113.7", "salt", NOW);
		expect(digest).toMatch(/^[0-9a-f]{16}$/);
		expect(await hashIp("203.0.113.7", "salt", NOW + 11 * HOUR)).toBe(digest);
		expect(await hashIp("203.0.113.7", "other", NOW)).not.toBe(digest);
		expect(await hashIp("203.0.113.8", "salt", NOW)).not.toBe(digest);
	});

	test("falls back to the UTC date when no salt is configured", async () => {
		const noon = Date.UTC(2026, 10, 18, 12);
		const digest = await hashIp("203.0.113.7", undefined, noon);
		expect(await hashIp("203.0.113.7", undefined, noon + HOUR)).toBe(digest);
		expect(await hashIp("203.0.113.7", undefined, noon + 24 * HOUR)).not.toBe(digest);
	});
});

describe("read", () => {
	test("returns the payload, capture time and via, and misses cleanly", async () => {
		const { db } = fake();
		const row = await validRow({ via: "api" });
		await upsert(db, row, NOW);

		expect(await read(db, REG, SEM)).toEqual({
			payload: JSON.parse(row.payload),
			capturedAt: NOW,
			via: "api",
		});
		expect(await read(db, REG, SEM + 1)).toBeNull();
	});
});
