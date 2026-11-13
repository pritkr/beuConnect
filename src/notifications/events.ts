import type { NoticeBoardItem } from "../lib/beuNotices";
import { getNoticeBoard } from "../lib/beuNotices";
import { cleanNoticeText, noticeKey } from "./notice";

/** The four kinds of thing this system can tell someone about. */
export type Topic = "important" | "results" | "notices";

export const TOPICS: Topic[] = ["important", "results", "notices"];

export type NotifyEvent = {
	seq: number;
	id: string;
	kind: "notice";
	topic: Topic;
	title: string;
	body: string;
	route: string;
	/** JSON object string — FCM data values must be strings. */
	params: string;
	url: string;
	source_at: number | null;
	created_at: number;
	/** 1 for the first-ever ingest: stored, never announced. */
	silent: number;
	fcm_done: number;
	push_cursor: string;
	push_done: number;
};

/**
 * A circular about an examination form is not a result, and treating it as one
 * is how a "results" switch becomes noise. Only language the board uses for a
 * published outcome matches.
 */
const RESULT_WORDS =
	/\b(results?|revaluation|re-?evaluation|scrutin\w*|backlog|back\s*paper)\b|\b(gpa|sgpa|cgpa)\b|marks\s+(sheet|statement)|semester\s+(result|marks)/i;

export function topicFor(
	row: Pick<NoticeBoardItem, "title" | "isImportant">,
): Topic {
	if (row.isImportant) return "important";
	return RESULT_WORDS.test(row.title) ? "results" : "notices";
}

export function eventFrom(
	row: NoticeBoardItem,
	now: number,
	silent: boolean,
): NotifyEvent | null {
	const title = cleanNoticeText(row.title);
	if (title.length < 3) return null;
	const id = `notice:${noticeKey(title, row.date)}`;
	const topic = topicFor({ title, isImportant: row.isImportant });
	const published = row.date ? dateLabel(row.date) : "";

	return {
		seq: 0,
		id,
		kind: "notice",
		topic,
		title: title.slice(0, 180),
		// The board has no summary. A date is the only true one-liner.
		body: published,
		route: "notices",
		params: JSON.stringify({ id: id.slice("notice:".length) }),
		url: `/notices/#notice-${id.slice("notice:".length)}`,
		source_at: row.date ? Date.parse(row.date) || null : null,
		created_at: now,
		silent: silent ? 1 : 0,
		fcm_done: 0,
		push_cursor: "",
		push_done: 0,
	};
}

function dateLabel(iso: string): string {
	const parsed = new Date(iso);
	if (!Number.isFinite(parsed.getTime())) return "";
	return parsed.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

/**
 * Reads the board and records anything not seen before.
 *
 * The first run on an empty table stores the whole board as `silent`: a fresh
 * deployment must not push 120 circulars to a phone that just installed the
 * app. Later runs insert only new ids, so `INSERT OR IGNORE` is a safety net
 * rather than the dedupe.
 */
export async function ingest(
	db: D1Database,
	now = Date.now(),
): Promise<{ added: number; bootstrap: boolean; seen: number }> {
	let board: NoticeBoardItem[];
	try {
		board = await getNoticeBoard({ limit: 120 });
	} catch {
		// The university is down; the next tick tries again.
		return { added: 0, bootstrap: false, seen: 0 };
	}

	const existing = await db
		.prepare("SELECT id FROM events")
		.all<{ id: string }>();
	const known = new Set((existing.results ?? []).map((row) => row.id));
	const bootstrap = known.size === 0;

	const fresh: NotifyEvent[] = [];
	for (const row of board) {
		const event = eventFrom(row, now, bootstrap);
		if (!event || known.has(event.id)) continue;
		known.add(event.id);
		fresh.push(event);
	}

	if (fresh.length > 0) {
		const statements = fresh.map((event) =>
			db
				.prepare(
					`INSERT OR IGNORE INTO events
					 (id, kind, topic, title, body, route, params, url, source_at, created_at, silent)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					event.id,
					event.kind,
					event.topic,
					event.title,
					event.body,
					event.route,
					event.params,
					event.url,
					event.source_at,
					event.created_at,
					event.silent,
				),
		);
		await db.batch(statements);
	}

	return { added: fresh.length, bootstrap, seen: board.length };
}
