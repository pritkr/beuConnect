import { ingest, type NotifyEvent } from "./events";
import { fcmAccessToken, fcmConfig, sendFcm } from "./fcm";
import { sendPush, type VapidKeys } from "./webpush";

/**
 * One tick of the notification pipeline.
 *
 * Runs from the Cron Trigger in `cloudflare.config.ts`, every five minutes:
 *
 *   ingest   read the university board, insert new events (silently on first run)
 *   fcm      one message per new event to one topic — no per-device work at all
 *   push     deliver one event to a chunk of web subscriptions, resuming next tick
 *   prune    drop rows past their retention window
 *
 * `push` is chunked because a Workers free-plan invocation has a 50-subrequest
 * budget: ingest and FCM spend a handful, so 25 push deliveries leave room. A
 * backlog drains at that rate instead of failing wholesale; on the paid plan
 * raise `PUSH_BATCH` and the whole fan-out fits in one tick.
 *
 * The lease is what makes overlapping ticks safe. Cron does not overlap in
 * practice, but a manual `waitUntil` kick from an endpoint can, and two ticks
 * inserting the same notice would double-notify.
 */

export type NotifyEnv = {
	DB?: D1Database;
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
	VAPID_SUBJECT?: string;
	FCM_SERVICE_ACCOUNT?: string;
};

const PUSH_BATCH = 25;
const FCM_BATCH = 5;
const LEASE_MS = 55_000;
const RETENTION_EVENTS_MS = 60 * 24 * 60 * 60 * 1000;
const RETENTION_DELIVERIES_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 8;

export type TickSummary = {
	ingested: number;
	bootstrap: boolean;
	fcm: number;
	pushed: number;
	failed: number;
	done: boolean;
};

export function vapidKeys(env: NotifyEnv): VapidKeys | null {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
	return {
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
		subject: env.VAPID_SUBJECT || "mailto:pritform@gmail.com",
	};
}

export async function runTick(
	env: NotifyEnv,
	now = Date.now(),
): Promise<TickSummary> {
	const summary: TickSummary = {
		ingested: 0,
		bootstrap: false,
		fcm: 0,
		pushed: 0,
		failed: 0,
		done: true,
	};
	const db = env.DB;
	if (!db) return summary;

	const lease = await claimLease(db, now);
	if (!lease) {
		// Another invocation is mid-tick. The next cron window is five minutes
		// away and nothing here is late at that scale.
		return summary;
	}

	try {
		try {
			const result = await ingest(db, now);
			summary.ingested = result.added;
			summary.bootstrap = result.bootstrap;
		} catch (error) {
			console.error("notifications: ingest failed", error);
		}

		try {
			summary.fcm = await sendFcmBatch(db, env, now);
		} catch (error) {
			console.error("notifications: fcm failed", error);
		}

		try {
			const push = await fanOut(db, env, now);
			summary.pushed = push.pushed;
			summary.failed = push.failed;
			summary.done = push.done;
		} catch (error) {
			console.error("notifications: push failed", error);
		}

		try {
			await prune(db, now);
		} catch (error) {
			console.error("notifications: prune failed", error);
		}
	} finally {
		// Hand the lease back so a manual tick right after a cron tick runs
		// instead of reporting a quiet no-op. The `v = ?` guard keeps a newer
		// claim (one that took over after this lease expired) intact.
		await releaseLease(db, lease).catch(() => {});
	}

	return summary;
}

/**
 * Takes the tick or returns null.
 *
 * `meta.v` holds the lease's expiry as an integer string; an expired lease is
 * claimable, which also recovers from a tick that died mid-run. The claimed
 * expiry is returned so the caller can hand back exactly its own lease.
 */
async function claimLease(db: D1Database, now: number): Promise<string | null> {
	const until = String(now + LEASE_MS);
	const result = await db
		.prepare(
			`INSERT INTO meta (k, v) VALUES ('lease', ?)
			 ON CONFLICT(k) DO UPDATE SET v = excluded.v
			 WHERE CAST(meta.v AS INTEGER) < ?`,
		)
		.bind(until, String(now))
		.run();
	return (result.meta.changes ?? 0) > 0 ? until : null;
}

/** Frees the lease this tick holds, never one a later tick has taken over. */
async function releaseLease(db: D1Database, until: string): Promise<void> {
	await db
		.prepare("DELETE FROM meta WHERE k = 'lease' AND v = ?")
		.bind(until)
		.run();
}

async function sendFcmBatch(
	db: D1Database,
	env: NotifyEnv,
	now: number,
): Promise<number> {
	const config = fcmConfig(env as Record<string, unknown>);
	if (!config) {
		// Not configured yet: retire the backlog instead of firing it all the day
		// the service account is added.
		await db
			.prepare(
				"UPDATE events SET fcm_done = 1 WHERE fcm_done = 0 AND silent = 0",
			)
			.run();
		return 0;
	}

	const pending = await db
		.prepare(
			`SELECT seq, id, topic, title, body, route, params, url FROM events
			 WHERE fcm_done = 0 AND silent = 0 ORDER BY seq LIMIT ?`,
		)
		.bind(FCM_BATCH)
		.all<NotifyEvent>();
	const rows = pending.results ?? [];
	if (rows.length === 0) return 0;

	const token = await fcmAccessToken(db, config, now);
	if (!token) return 0;

	let sent = 0;
	for (const event of rows) {
		const result = await sendFcm(config, token, event);
		if (!result.ok) {
			console.error("notifications: fcm rejected", result.status, result.error);
			if (result.status === 401 || result.status === 403) {
				// The token cache is stale or the key was rotated. Drop it so the
				// next tick mints a new one; do not mark the event done.
				await db.prepare("DELETE FROM meta WHERE k = 'fcm_token'").run();
				break;
			}
			continue;
		}
		await db
			.prepare("UPDATE events SET fcm_done = 1 WHERE seq = ?")
			.bind(event.seq)
			.run();
		sent += 1;
	}
	return sent;
}

async function fanOut(
	db: D1Database,
	env: NotifyEnv,
	now: number,
): Promise<{ pushed: number; failed: number; done: boolean }> {
	const keys = vapidKeys(env);
	if (!keys) {
		await db
			.prepare(
				"UPDATE events SET push_done = 1 WHERE push_done = 0 AND silent = 0",
			)
			.run();
		return { pushed: 0, failed: 0, done: true };
	}

	const event = await db
		.prepare(
			`SELECT seq, id, topic, title, body, route, params, url, push_cursor
			 FROM events WHERE push_done = 0 AND silent = 0 ORDER BY seq LIMIT 1`,
		)
		.first<NotifyEvent>();
	if (!event) return { pushed: 0, failed: 0, done: true };

	const cursor = event.push_cursor ?? "";
	const batch = await db
		.prepare(
			`SELECT id, endpoint, p256dh, auth, topics FROM push_subscriptions
			 WHERE id > ? AND topics LIKE ? ORDER BY id LIMIT ?`,
		)
		.bind(cursor, `%"${event.topic}"%`, PUSH_BATCH)
		.all<{
			id: string;
			endpoint: string;
			p256dh: string;
			auth: string;
			topics: string;
		}>();
	const rows = batch.results ?? [];

	if (rows.length === 0) {
		await db
			.prepare("UPDATE events SET push_done = 1 WHERE seq = ?")
			.bind(event.seq)
			.run();
		return { pushed: 0, failed: 0, done: true };
	}

	const payload = {
		id: event.id,
		title: event.title,
		body: event.body,
		url: event.url,
		route: event.route,
		params: JSON.parse(event.params || "{}") as Record<string, string>,
	};

	const outcomes = await Promise.all(
		rows.map(async (subscription) => ({
			subscription,
			result: await sendPush(subscription, payload, keys),
		})),
	);

	let pushed = 0;
	let failed = 0;
	const statements = outcomes.map(({ subscription, result }) => {
		if (result.gone) {
			return db
				.prepare("DELETE FROM push_subscriptions WHERE id = ?")
				.bind(subscription.id);
		}
		if (result.status > 0 && result.status < 300) {
			pushed += 1;
			return db
				.prepare(
					`INSERT INTO deliveries (seq, subscription_id, status, at) VALUES (?, ?, ?, ?)
					 ON CONFLICT(seq, subscription_id) DO UPDATE SET status = excluded.status, at = excluded.at`,
				)
				.bind(event.seq, subscription.id, result.status, now);
		}
		failed += 1;
		return db
			.prepare(
				`UPDATE push_subscriptions
				 SET failures = failures + 1, last_error = ?
				 WHERE id = ?`,
			)
			.bind(result.error ?? `status ${result.status}`, subscription.id);
	});
	statements.push(
		db
			.prepare("UPDATE events SET push_cursor = ? WHERE seq = ?")
			.bind(rows[rows.length - 1].id, event.seq),
	);
	await db.batch(statements);

	const done = rows.length < PUSH_BATCH;
	if (done) {
		await db
			.prepare("UPDATE events SET push_done = 1 WHERE seq = ?")
			.bind(event.seq)
			.run();
	}
	return { pushed, failed, done };
}

async function prune(db: D1Database, now: number): Promise<void> {
	await db.batch([
		// `silent` rows were never announced, so they will never be marked done;
		// they still age out with the rest of the log.
		db
			.prepare(
				"DELETE FROM events WHERE (push_done = 1 OR silent = 1) AND created_at < ?",
			)
			.bind(now - RETENTION_EVENTS_MS),
		db
			.prepare("DELETE FROM deliveries WHERE at < ?")
			.bind(now - RETENTION_DELIVERIES_MS),
		db
			.prepare("DELETE FROM push_subscriptions WHERE failures >= ?")
			.bind(MAX_FAILURES),
	]);
}
