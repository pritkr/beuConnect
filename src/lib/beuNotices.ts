export type UiNotice = {
	id: string;
	title: string;
	category: string;
	date: string | null;
	link: string;
	source: string;
	isImportant: boolean;
	isRecent: boolean;
	ageHours: number | null;
};

export type NoticeBoardItem = {
	id: string;
	title: string;
	date: string | null;
	link: string;
	isImportant: boolean;
};

const NOTICE_API = "https://beu-bih.ac.in/backend/v1/notice/get-notice";
const IMPORTANT_NOTICE_API =
	"https://beu-bih.ac.in/backend/v1/notice/get-notice-board?isimportant=1";
export const NOTICE_BOARD_API = "https://beu-bih.ac.in/backend/v1/notice/get-notice-board";
export const IMPORTANT_NOTICE_BOARD_API =
	"https://beu-bih.ac.in/backend/v1/notice/get-notice-board?isimportant=1";
const NEW_NOTICE_WINDOW_HOURS = 3;
const MAX_NOTICES = 120;

const FETCH_INIT: RequestInit & {
	cf?: { cacheTtl?: number; cacheEverything?: boolean };
} = {
	headers: {
		accept: "application/json",
	},
	cf: {
		cacheTtl: 300,
		cacheEverything: true,
	},
};

type LooseRecord = Record<string, unknown>;

type HtmlNotice = {
	title: string;
	link: string | null;
};

function toArray(value: unknown): LooseRecord[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is LooseRecord => item !== null && typeof item === "object");
}

function extractItems(payload: unknown): LooseRecord[] {
	if (Array.isArray(payload)) return toArray(payload);
	if (!payload || typeof payload !== "object") return [];

	const record = payload as LooseRecord;
	const preferredKeys = ["data", "items", "notices", "notice", "result", "payload", "records"];
	for (const key of preferredKeys) {
		const list = toArray(record[key]);
		if (list.length) return list;
	}

	for (const value of Object.values(record)) {
		const list = toArray(value);
		if (list.length) return list;
	}

	return [];
}

function textFrom(record: LooseRecord, keys: string[]): string | null {
	for (const key of keys) {
		const raw = record[key];
		if (typeof raw === "string" && raw.trim()) return raw.trim();
		if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
	}
	return null;
}

function decodeHtml(input: string): string {
	const named = input
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/g, "'");

	return named.replace(/&#(\d+);/g, (_, code) => {
		const value = Number(code);
		return Number.isFinite(value) ? String.fromCharCode(value) : "";
	});
}

function stripTags(input: string): string {
	return decodeHtml(input.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractFromHtmlNotice(html: string): HtmlNotice | null {
	const anchors = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
	const parsedAnchors = anchors
		.map(([, href, inner]) => ({ link: href.trim(), text: stripTags(inner) }))
		.filter((item) => item.text.length >= 4);

	if (parsedAnchors.length) {
		parsedAnchors.sort((a, b) => b.text.length - a.text.length);
		return {
			title: parsedAnchors[0].text,
			link: parsedAnchors[0].link || null,
		};
	}

	const plain = stripTags(html);
	return plain ? { title: plain, link: null } : null;
}

function parseDate(record: LooseRecord): Date | null {
	const raw = textFrom(record, [
		"publish_date",
		"publishDate",
		"published_at",
		"publishedAt",
		"createdAt",
		"created_at",
		"updatedAt",
		"updated_at",
		"noticedate",
		"notice_date",
		"noticeDate",
		"date",
		"added_on",
		"timestamp",
	]);
	if (!raw) return null;

	if (/^\d{10,13}$/.test(raw)) {
		const asNumber = Number(raw);
		const millis = raw.length === 13 ? asNumber : asNumber * 1000;
		const date = new Date(millis);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanLink(link: string | null): string {
	if (!link) return "https://beu-bih.ac.in";
	if (link.startsWith("http://") || link.startsWith("https://")) return link;

	const normalized = link.replace(/^\/+/, "");
	if (normalized.startsWith("backend/")) {
		return `https://beu-bih.ac.in/${normalized}`;
	}

	if (/^[\w-]+\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png)$/i.test(normalized) || normalized.includes(".pdf")) {
		return `https://beu-bih.ac.in/backend/${normalized}`;
	}

	return `https://beu-bih.ac.in/${normalized}`;
}

function signature(item: LooseRecord): string {
	const htmlNotice = textFrom(item, ["notice"]);
	const parsedHtml = htmlNotice ? extractFromHtmlNotice(htmlNotice) : null;
	const title =
		textFrom(item, ["board", "title", "notice_title", "subject", "name"]) ?? parsedHtml?.title ?? "";
	const date = parseDate(item)?.toISOString() ?? "";
	return `${title.toLowerCase()}|${date}`;
}

function normalizeNotice(item: LooseRecord, importantSignatures: Set<string>, now: Date): UiNotice | null {
	const htmlNotice = textFrom(item, ["notice"]);
	const parsedHtml = htmlNotice ? extractFromHtmlNotice(htmlNotice) : null;
	const title =
		textFrom(item, ["board", "title", "notice_title", "subject", "name", "description"]) ??
		parsedHtml?.title ??
		"Untitled Notice";
	if (!title.trim()) return null;

	const date = parseDate(item);
	const category =
		textFrom(item, ["category", "type", "notice_type", "noticeType", "tag"]) ??
		(importantSignatures.has(signature(item)) ? "Important" : "General");
	const link = cleanLink(
		textFrom(item, ["link", "url", "file", "pdf", "document", "notice_url", "noticeUrl"]) ??
			parsedHtml?.link ??
			null,
	);
	const source = textFrom(item, ["source", "department", "issued_by", "issuedBy"]) ?? "BEU Notice";
	const id = textFrom(item, ["id", "notice_id", "noticeId", "_id"]) ?? signature(item);
	const ageHours = date ? Math.max(0, (now.getTime() - date.getTime()) / 3_600_000) : null;

	return {
		id,
		title,
		category,
		date: date ? date.toISOString() : null,
		link,
		source,
		isImportant: importantSignatures.has(signature(item)),
		isRecent: ageHours !== null && ageHours <= NEW_NOTICE_WINDOW_HOURS,
		ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
	};
}

async function fetchEndpoint(url: string): Promise<LooseRecord[]> {
	try {
		const response = await fetch(url, FETCH_INIT);
		if (!response.ok) return [];
		const payload = (await response.json()) as unknown;
		return extractItems(payload);
	} catch {
		return [];
	}
}

function toBool(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value === 1;
	if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
	return false;
}

function normalizeNoticeBoardItem(item: LooseRecord): NoticeBoardItem | null {
	const title = textFrom(item, ["board", "title", "notice_title", "subject", "name"]);
	if (!title) return null;

	const date = parseDate(item);
	const link = cleanLink(textFrom(item, ["link", "url", "file", "pdf", "document"]));
	const id = textFrom(item, ["id", "notice_id", "_id"]) ?? `${title.toLowerCase()}|${date?.toISOString() ?? ""}`;

	return {
		id,
		title,
		date: date ? date.toISOString() : null,
		link,
		isImportant: toBool(item.isimportant),
	};
}

export async function getNoticeBoard(options?: {
	important?: boolean;
	limit?: number;
}): Promise<NoticeBoardItem[]> {
	const important = options?.important;
	const limit = options?.limit ?? MAX_NOTICES;
	const url =
		important === true
			? IMPORTANT_NOTICE_BOARD_API
			: important === false
				? NOTICE_BOARD_API
				: NOTICE_BOARD_API;
	const rows = await fetchEndpoint(url);
	const mapped = rows.map(normalizeNoticeBoardItem).filter((item): item is NoticeBoardItem => item !== null);
	const filtered =
		important === undefined ? mapped : mapped.filter((item) => item.isImportant === important);

	return filtered
		.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
		.slice(0, limit);
}

export async function getBeuNotices(limit = MAX_NOTICES): Promise<UiNotice[]> {
	const now = new Date();
	const [all, important] = await Promise.all([
		fetchEndpoint(NOTICE_API),
		fetchEndpoint(IMPORTANT_NOTICE_API),
	]);

	const importantSignatures = new Set(important.map(signature));
	const merged = [...all, ...important];
	const dedupe = new Map<string, UiNotice>();

	for (const raw of merged) {
		const normalized = normalizeNotice(raw, importantSignatures, now);
		if (!normalized) continue;
		const key = `${normalized.title.toLowerCase()}|${normalized.date ?? "nodate"}`;
		const existing = dedupe.get(key);
		if (!existing || (!existing.isImportant && normalized.isImportant)) {
			dedupe.set(key, normalized);
		}
	}

	return [...dedupe.values()]
		.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
		.slice(0, limit);
}
