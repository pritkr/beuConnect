/**
 * The notices + announcements data layer.
 *
 * Everything comes from the published site (the app's one allow-listed host):
 *
 *   GET /api/notices/important?limit=20   → `{ items: [{ id, title, date, link, isImportant }] }`
 *   GET /notices/                         → the server-rendered board (200 cards with
 *                                           data-title / data-category / data-course / data-semester,
 *                                           a <time> and the PDF link)
 *   GET /announcements/                   → the announcement cards
 *   GET /announcements/<slug>/            → one announcement post
 *
 * The JSON feed is authoritative for "important"; the HTML board carries the
 * course/semester facets the JSON does not. Both are merged by a stable id so
 * either one alone still gives a usable list. Reads are cached in Storage by
 * `fetchText`, so an offline launch shows the last board it saw.
 *
 * `fetchText` falls back to that cache without saying so, which is why the
 * loaders compare the cache stamp with the moment the load started: an older
 * stamp means the copy on screen is the device's, and `boardOffline` /
 * `announcementsOffline` say so instead of pretending it is fresh.
 */

import { signal, Storage } from "nsh";

import { SITE, fetchJson, fetchText, readStore, writeStore } from "../../lib/net";

/* -------------------------------------------------------------------- types */

export interface Notice {
  id: string;
  title: string;
  /** ISO timestamp, or null when the board shows no date. */
  date: string | null;
  /** Absolute link to the official circular (usually a PDF). */
  link: string;
  important: boolean;
  /** "Important" or "General" — the board's own category. */
  category: string;
  course: string;
  semester: string;
  source: string;
}

export interface Announcement {
  slug: string;
  title: string;
  publishedAt: string;
  author: string;
  excerpt: string;
  tags: string[];
}

export interface AnnouncementPost extends Announcement {
  body: string[];
}

/* ------------------------------------------------------------------ strings */

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

/** Decodes the handful of entities the site's markup uses, and drops tags. */
export function clean(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
      if (body.charAt(0) === "#") {
        const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
        const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      const named = NAMED_ENTITIES[body.toLowerCase()];
      return named === undefined ? match : named;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Decodes an attribute value without stripping anything else from it. */
function attribute(value: string): string {
  return clean(value.replace(/</g, " "));
}

function isDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed);
}

/** A stable 32-bit id from the title and date, so the JSON and HTML feeds merge. */
export function noticeId(title: string, date: string | null): string {
  const key = `${title.trim().toLowerCase()}|${date ?? ""}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `n${hash.toString(36)}`;
}

/* ------------------------------------------------------------------- facets */

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const SEMESTER_PATTERNS: RegExp[] = ORDINALS.flatMap((ordinal, index) => {
  const word = ordinal.toLowerCase();
  const number = index + 1;
  return [
    new RegExp(`\\b${word}\\s*sem(?:ester)?\\b`),
    new RegExp(`\\bsem(?:ester)?\\s*[-:]?\\s*${word}\\b`),
    new RegExp(`\\bsem(?:ester)?\\s*[-:]?\\s*${number}\\b`),
  ];
});

export function detectCourse(title: string): string {
  const text = title.toLowerCase();
  if (/\bb\.?\s*tech\b/.test(text)) return "B.Tech";
  if (/\bb\.?\s*arch\b/.test(text)) return "B.Arch";
  if (/\bm\.?\s*tech\b/.test(text)) return "M.Tech";
  if (/\bmba\b/.test(text)) return "MBA";
  if (/\bmca\b/.test(text)) return "MCA";
  if (/\bbca\b/.test(text)) return "BCA";
  return "Other";
}

export function detectSemester(title: string): string {
  const text = title.toLowerCase();
  for (let index = 0; index < ORDINALS.length; index += 1) {
    if (SEMESTER_PATTERNS[index * 3].test(text) || SEMESTER_PATTERNS[index * 3 + 1].test(text)) {
      return ORDINALS[index];
    }
    if (SEMESTER_PATTERNS[index * 3 + 2].test(text)) return ORDINALS[index];
  }
  return "Other";
}

/* -------------------------------------------------------------- HTML parse */

const ARTICLE_RE = /<article[^>]*class="[^"]*\bnotice-card\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
const ATTRIBUTE_RE = /data-(title|category|course|semester)="([^"]*)"/gi;

function attributeMap(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  ATTRIBUTE_RE.lastIndex = 0;
  let match = ATTRIBUTE_RE.exec(block);
  while (match !== null) {
    found[match[1].toLowerCase()] = attribute(match[2]);
    match = ATTRIBUTE_RE.exec(block);
  }
  return found;
}

function firstMatch(block: string, pattern: RegExp): string {
  const match = pattern.exec(block);
  return match ? clean(match[1]) : "";
}

function linkOf(block: string): string {
  const anchor = /<a[^>]*class="[^"]*\bnotice-link\b[^"]*"[^>]*>/i.exec(block) ?? /<a[^>]*>/i.exec(block);
  if (!anchor) return "";
  const href = /href="([^"]*)"/i.exec(anchor[0]);
  if (!href) return "";
  const value = attribute(href[1]).replace(/&amp;/g, "&");
  return value.startsWith("http") ? value : `${SITE}/${value.replace(/^\/+/, "")}`;
}

export function parseNoticesHtml(html: string): Notice[] {
  const notices: Notice[] = [];
  ARTICLE_RE.lastIndex = 0;
  let match = ARTICLE_RE.exec(html);
  while (match !== null) {
    const block = match[0];
    const facets = attributeMap(block);
    // The board lowercases `data-title` for search; the heading keeps the
    // university's own capitalisation ("B.Tech & B.Arch …"), so prefer it.
    const heading = firstMatch(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = heading.length >= 3 ? heading : facets.title;
    if (title.length < 3) {
      match = ARTICLE_RE.exec(html);
      continue;
    }
    const rawDate = /<time[^>]*datetime="([^"]*)"/i.exec(block);
    const date = rawDate && isDate(rawDate[1]) ? new Date(rawDate[1]).toISOString() : null;
    const category = facets.category || (/important-chip/i.test(block) ? "Important" : "General");
    notices.push({
      id: noticeId(title, date),
      title,
      date,
      link: linkOf(block),
      important: category.toLowerCase() === "important",
      category,
      course: facets.course || detectCourse(title),
      semester: facets.semester || detectSemester(title),
      source: "BEU Notice",
    });
    match = ARTICLE_RE.exec(html);
  }
  return notices;
}

interface ImportantPayload {
  items?: {
    id?: string | number;
    title?: string;
    date?: string | null;
    link?: string;
    isImportant?: boolean;
  }[];
}

function noticesFromImportant(payload: ImportantPayload): Notice[] {
  const rows = Array.isArray(payload.items) ? payload.items : [];
  const notices: Notice[] = [];
  for (const row of rows) {
    const title = typeof row.title === "string" ? clean(row.title) : "";
    if (title.length < 3) continue;
    const date = isDate(row.date) ? new Date(row.date as string).toISOString() : null;
    const link = typeof row.link === "string" && row.link.startsWith("http") ? row.link : "";
    notices.push({
      id: noticeId(title, date),
      title,
      date,
      link,
      important: row.isImportant !== false,
      category: "Important",
      course: detectCourse(title),
      semester: detectSemester(title),
      source: "BEU Notice",
    });
  }
  return notices;
}

/** Merges by id: the HTML facets win, the JSON feed decides "important". */
export function mergeNotices(primary: Notice[], overlay: Notice[]): Notice[] {
  const byId = new Map<string, Notice>();
  for (const notice of primary) byId.set(notice.id, notice);
  for (const notice of overlay) {
    const existing = byId.get(notice.id);
    if (!existing) {
      byId.set(notice.id, notice);
      continue;
    }
    byId.set(notice.id, {
      ...existing,
      important: existing.important || notice.important,
      link: existing.link || notice.link,
    });
  }
  return [...byId.values()].sort((left, right) => {
    const a = left.date ? new Date(left.date).getTime() : 0;
    const b = right.date ? new Date(right.date).getTime() : 0;
    if (a !== b) return b - a;
    return left.title.localeCompare(right.title);
  });
}

/* --------------------------------------------------------------- transport */

const NOTICE_LIST_URL = `${SITE}/notices/`;
const IMPORTANT_URL = `${SITE}/api/notices/important?limit=20`;
const ANNOUNCEMENTS_URL = `${SITE}/announcements/`;
const NOTICE_LIST_CACHE = "notices.board.v1";
const IMPORTANT_CACHE = "notices.important.v1";
const ANNOUNCEMENTS_CACHE = "announcements.feed.v1";
/** The cache store `src/lib/net.ts` writes under. */
const CACHE_PREFIX = "beu.cache.";

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * GETs text with a timeout, one retry, and the last good copy kept forever.
 * A circular does not expire: an offline launch must still show the last board,
 * with the "as of" line saying how old it is.
 */
async function getText(url: string, cacheKey: string, timeout: number): Promise<string> {
  let lastError: unknown = new Error("The request failed.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchText(url, { cacheKey, cacheMaxAge: 0, timeout });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(350);
    }
  }
  throw lastError;
}

async function getJson<T>(url: string, cacheKey: string, timeout: number): Promise<T> {
  let lastError: unknown = new Error("The request failed.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchJson<T>(url, { cacheKey, cacheMaxAge: 0, timeout });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(350);
    }
  }
  throw lastError;
}

/** When the cached copy of `key` was fetched, 0 when there is none. */
async function cacheStamp(key: string): Promise<number> {
  try {
    const raw = await Storage.getItem(CACHE_PREFIX + key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { at?: unknown };
    const at = parsed?.at;
    return typeof at === "number" && Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------- notice store */

/** The last board loaded in this session; screens read it for instant detail. */
export const notices = signal<Notice[]>([]);
/** When the board on screen was fetched (the cache's own stamp, not "now"). */
export const noticesFetchedAt = signal<number>(0);
/** True when the board on screen is the device's cached copy, not a fresh fetch. */
export const boardOffline = signal(false);

let noticeLoad: Promise<Notice[]> | null = null;

/** Reads the two cache stamps; the older of them is the honest "as of". */
export function readBoardStamp(): void {
  void Promise.all([cacheStamp(NOTICE_LIST_CACHE), cacheStamp(IMPORTANT_CACHE)]).then(([board, feed]) => {
    const stamps = [board, feed].filter((value) => value > 0);
    noticesFetchedAt.set(stamps.length > 0 ? Math.min(...stamps) : 0);
  });
}

readBoardStamp();

async function fetchNotices(): Promise<Notice[]> {
  const startedAt = Date.now();
  const [board, important] = await Promise.allSettled([
    getText(NOTICE_LIST_URL, NOTICE_LIST_CACHE, 30000),
    getJson<ImportantPayload>(IMPORTANT_URL, IMPORTANT_CACHE, 20000),
  ]);

  const html = board.status === "fulfilled" ? parseNoticesHtml(board.value) : [];
  const feed = important.status === "fulfilled" ? noticesFromImportant(important.value) : [];

  if (html.length === 0 && feed.length === 0) {
    throw board.status === "rejected" ? board.reason : new Error("The notice board is empty.");
  }
  // A stamp older than this load means `fetchText` could not reach the site
  // and served the copy it had kept: the screen must say "offline copy".
  const stamps = await Promise.all([cacheStamp(NOTICE_LIST_CACHE), cacheStamp(IMPORTANT_CACHE)]);
  boardOffline.set(stamps.some((stamp) => stamp > 0 && stamp < startedAt));
  return mergeNotices(html, feed).slice(0, 200);
}

/**
 * How old the board may be before the next screen open refreshes it.
 *
 * The board is published by the site, so a correction is visible on every
 * installed app within this window — no store update, no new build. Five
 * minutes keeps a desk-bound student current without re-downloading the board
 * every time they tap back to Home.
 */
export const BOARD_TTL = 5 * 60 * 1000;

let boardAt = 0;
let boardInFlight = false;

/** Milliseconds since the board was last fetched, `Infinity` before the first. */
export function boardAge(now = Date.now()): number {
  return boardAt === 0 ? Number.POSITIVE_INFINITY : now - boardAt;
}

async function runBoard(): Promise<Notice[]> {
  const items = await fetchNotices();
  notices.set(items);
  noticesFetchedAt.set(Date.now());
  readBoardStamp();
  return items;
}

/** Starts one board fetch; concurrent callers share it. */
function startBoard(): Promise<Notice[]> {
  if (boardInFlight && noticeLoad !== null) return noticeLoad;
  boardInFlight = true;
  // Throttle from the attempt, not the result: a slow fetch must not queue a
  // second one behind it, and a failed one must not retry on every tap.
  boardAt = Date.now();
  const run = runBoard().then(
    (items) => {
      boardInFlight = false;
      return items;
    },
    (error: unknown) => {
      boardInFlight = false;
      noticeLoad = null;
      if (notices().length > 0) boardOffline.set(true);
      throw error;
    },
  );
  noticeLoad = run;
  return run;
}

/**
 * The board, refreshing itself when it has gone stale.
 *
 * While the refresh runs, the rows already on screen stay there and the Home
 * strip keeps scrolling: a publication on the site lands on every device
 * without an app update, and never behind a spinner.
 */
export function loadNotices(): Promise<Notice[]> {
  hydrateReadState();
  if (noticeLoad === null) return startBoard();
  if (boardInFlight) return noticeLoad;
  if (boardAge() <= BOARD_TTL) return noticeLoad;
  return startBoard();
}

/** Pull-to-refresh: fetches the board now, whether or not it is stale. */
export function refreshNotices(): Promise<Notice[]> {
  return startBoard();
}

export function findNotice(id: string): Notice | undefined {
  return notices().find((notice) => notice.id === id);
}

/* -------------------------------------------------------- announcement store */

export const announcements = signal<Announcement[]>([]);
/** When the feed on screen was fetched, from the cache's own stamp. */
export const announcementsFetchedAt = signal<number>(0);
/** True when the feed on screen is the device's cached copy. */
export const announcementsOffline = signal(false);

let announcementLoad: Promise<Announcement[]> | null = null;

/** How stale the feed may get before a screen open refreshes it. */
export const ANNOUNCEMENT_TTL = 10 * 60 * 1000;

let announcementAt = 0;
let announcementInFlight = false;

/** Milliseconds since the feed was last fetched, `Infinity` before the first. */
export function announcementAge(now = Date.now()): number {
  return announcementAt === 0 ? Number.POSITIVE_INFINITY : now - announcementAt;
}

async function runAnnouncements(): Promise<Announcement[]> {
  const posts = await fetchAnnouncements();
  announcements.set(posts);
  readAnnouncementStamp();
  return posts;
}

function startAnnouncements(): Promise<Announcement[]> {
  if (announcementInFlight && announcementLoad !== null) return announcementLoad;
  announcementInFlight = true;
  announcementAt = Date.now();
  const run = runAnnouncements().then(
    (posts) => {
      announcementInFlight = false;
      return posts;
    },
    (error: unknown) => {
      announcementInFlight = false;
      announcementLoad = null;
      if (announcements().length > 0) announcementsOffline.set(true);
      throw error;
    },
  );
  announcementLoad = run;
  return run;
}

/** Reads the feed's cache stamp so the "as of" line is honest after a launch. */
export function readAnnouncementStamp(): void {
  void cacheStamp(ANNOUNCEMENTS_CACHE).then((stamp) => announcementsFetchedAt.set(stamp));
}

readAnnouncementStamp();

const CARD_RE = /<article[^>]*class="[^"]*\bpost-card\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi;

function slugFromHref(href: string): string {
  const match = /announcements\/([^/"?#]+)/i.exec(href);
  return match ? match[1] : "";
}

function metaParts(block: string): { date: string; author: string } {
  const raw = firstMatch(block, /<p[^>]*class="[^"]*\bpost-meta\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const parts = raw.split(/[•·]/).map((part) => part.trim()).filter(Boolean);
  return { date: parts[0] ?? "", author: parts.slice(1).join(" ") || "BEUConnect Team" };
}

export function parseAnnouncementsHtml(html: string): Announcement[] {
  const posts: Announcement[] = [];
  CARD_RE.lastIndex = 0;
  let match = CARD_RE.exec(html);
  while (match !== null) {
    const block = match[0];
    const anchor = /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const title = anchor ? clean(anchor[2]) : firstMatch(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const slug = anchor ? slugFromHref(attribute(anchor[1])) : "";
    if (title.length > 2 && slug) {
      const meta = metaParts(block);
      const excerpt = firstMatch(block, /<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
      const tags = [...block.matchAll(/#([a-z0-9][a-z0-9-]*)/gi)].map((tag) => tag[1].toLowerCase());
      posts.push({
        slug,
        title,
        publishedAt: meta.date,
        author: meta.author,
        excerpt,
        tags: [...new Set(tags)],
      });
    }
    match = CARD_RE.exec(html);
  }
  return posts;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const startedAt = Date.now();
  const html = await getText(ANNOUNCEMENTS_URL, ANNOUNCEMENTS_CACHE, 25000);
  const stamp = await cacheStamp(ANNOUNCEMENTS_CACHE);
  announcementsOffline.set(stamp > 0 && stamp < startedAt);
  return parseAnnouncementsHtml(html);
}

export function loadAnnouncements(): Promise<Announcement[]> {
  if (announcementLoad === null) return startAnnouncements();
  if (announcementInFlight) return announcementLoad;
  if (announcementAge() <= ANNOUNCEMENT_TTL) return announcementLoad;
  return startAnnouncements();
}

export function refreshAnnouncements(): Promise<Announcement[]> {
  return startAnnouncements();
}

/* -------------------------------------------------------- one announcement */

const PAGE_RE = /<article[^>]*class="[^"]*\bpost-page\b[^"]*"[^>]*>[\s\S]*?<\/article>/i;
const PARAGRAPH_RE = /<p[^>]*>([\s\S]*?)<\/p>/gi;

/**
 * Bodies by slug, so a search can match a post's full text and an offline
 * launch can still search what it has already read. Kept small: the feed is a
 * handful of posts and the newest 24 bodies are enough.
 */
const BODIES_KEY = "announcements.bodies.v1";
const BODIES_LIMIT = 24;
const BODIES_PREFETCH = 8;

export const announcementBodies = signal<Record<string, string[]>>({});

let bodiesHydrated = false;

/** Reads the stored bodies once; safe to call from any screen's mount. */
export function hydrateBodies(): void {
  if (bodiesHydrated) return;
  bodiesHydrated = true;
  void readStore<Record<string, string[]>>(BODIES_KEY, {}).then((saved) => {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
    const clean: Record<string, string[]> = {};
    for (const [slug, body] of Object.entries(saved)) {
      if (Array.isArray(body)) clean[slug] = body.filter((part): part is string => typeof part === "string");
    }
    announcementBodies.set(clean);
  });
}

/** The stored body of one post, empty when it has not been read yet. */
export function bodyOf(slug: string): string[] {
  return announcementBodies()[slug] ?? [];
}

function rememberBody(slug: string, body: string[]): void {
  if (body.length === 0) return;
  const current = announcementBodies();
  if (current[slug] !== undefined && current[slug].join("\n") === body.join("\n")) return;
  const next: Record<string, string[]> = { ...current, [slug]: body };
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - BODIES_LIMIT))) delete next[key];
  announcementBodies.set(next);
  void writeStore(BODIES_KEY, next);
}

const postMemo = new Map<string, AnnouncementPost>();
let bodiesRun: Promise<void> | null = null;

/**
 * Warms the body index for the feed, one page per post, best effort. Runs once
 * per feed: failures are skipped (the excerpt is still searchable) and the
 * result is stored, so the next launch searches offline.
 */
export function loadAnnouncementBodies(posts: Announcement[]): Promise<void> {
  hydrateBodies();
  if (bodiesRun) return bodiesRun;
  const targets = posts.filter((post) => bodyOf(post.slug).length === 0).slice(0, BODIES_PREFETCH);
  if (targets.length === 0) return Promise.resolve();
  bodiesRun = Promise.all(
    targets.map((post) =>
      fetchAnnouncement(post.slug)
        .then((full) => rememberBody(post.slug, full.body))
        .catch(() => undefined),
    ),
  ).then(() => {
    bodiesRun = null;
  });
  return bodiesRun;
}

export async function fetchAnnouncement(slug: string): Promise<AnnouncementPost> {
  const done = postMemo.get(slug);
  if (done) return done;
  const html = await getText(`${ANNOUNCEMENTS_URL}${encodeURIComponent(slug)}/`, `announcement.${slug}.v1`, 25000);
  const article = PAGE_RE.exec(html);
  const block = article ? article[0] : html;

  const title = firstMatch(block, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || slug.replace(/-/g, " ");
  const meta = metaParts(block);
  const excerpt = firstMatch(block, /<p[^>]*class="[^"]*\bpost-excerpt\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const section = /<section[^>]*class="[^"]*\bpost-body\b[^"]*"[^>]*>([\s\S]*?)<\/section>/i.exec(block);
  const body: string[] = [];
  if (section) {
    PARAGRAPH_RE.lastIndex = 0;
    let paragraph = PARAGRAPH_RE.exec(section[1]);
    while (paragraph !== null) {
      const text = clean(paragraph[1]);
      if (text.length > 0) body.push(text);
      paragraph = PARAGRAPH_RE.exec(section[1]);
    }
  }
  const tags = [...block.matchAll(/#([a-z0-9][a-z0-9-]*)/gi)].map((tag) => tag[1].toLowerCase());

  const post: AnnouncementPost = {
    slug,
    title,
    publishedAt: meta.date,
    author: meta.author,
    excerpt,
    tags: [...new Set(tags)],
    body: body.length > 0 ? body : excerpt ? [excerpt] : [],
  };
  postMemo.set(slug, post);
  rememberBody(slug, post.body);
  return post;
}

/* ------------------------------------------------------------- read state */

const READ_KEY = "notices.read.v1";
const READ_LIMIT = 400;
/** Announcement posts live in the same read list under this prefix. */
const POST_PREFIX = "a:";

/** Ids the student has opened, newest first. Reads are reactive. */
export const readIds = signal<string[]>([]);

let readHydrated = false;

export function hydrateReadState(): void {
  if (readHydrated) return;
  readHydrated = true;
  void readStore<string[]>(READ_KEY, []).then((saved) => {
    if (!Array.isArray(saved)) return;
    const current = readIds();
    const merged = [...new Set([...current, ...saved.filter((item) => typeof item === "string")])].slice(0, READ_LIMIT);
    readIds.set(merged);
  });
}

export function isRead(id: string): boolean {
  return readIds().includes(id);
}

export function markRead(id: string): void {
  const current = readIds();
  if (current.includes(id)) return;
  const next = [id, ...current].slice(0, READ_LIMIT);
  readIds.set(next);
  void writeStore(READ_KEY, next);
}

/** Marks one notice unread again; the board row flips back without a reload. */
export function markUnread(id: string): void {
  const current = readIds();
  if (!current.includes(id)) return;
  const next = current.filter((item) => item !== id);
  readIds.set(next);
  void writeStore(READ_KEY, next);
}

/** Flips one notice's read state. Returns the state it now has. */
export function toggleRead(id: string): boolean {
  if (isRead(id)) {
    markUnread(id);
    return false;
  }
  markRead(id);
  return true;
}

/**
 * Marks every id read. Returns the read list as it was before, so the screen
 * can offer an undo that restores it exactly (announcement keys included).
 */
export function markAllRead(ids: string[]): string[] {
  const before = readIds();
  const merged = [...new Set([...ids, ...before])].slice(0, READ_LIMIT);
  readIds.set(merged);
  void writeStore(READ_KEY, merged);
  return before;
}

/** Puts the read list back exactly as `ids` says (undo of `markAllRead`). */
export function restoreRead(ids: string[]): void {
  const next = [...new Set(ids)].slice(0, READ_LIMIT);
  readIds.set(next);
  void writeStore(READ_KEY, next);
}

/* Announcements: a product update is "new" until it has been opened once. */

/** The read id an announcement post uses in the shared read list. */
export function postReadKey(slug: string): string {
  return POST_PREFIX + slug;
}

export function isPostRead(slug: string): boolean {
  return isRead(postReadKey(slug));
}

export function markPostRead(slug: string): void {
  markRead(postReadKey(slug));
}

/** How many posts have not been opened yet. */
export function unreadPosts(posts: Announcement[]): number {
  return posts.filter((post) => !isPostRead(post.slug)).length;
}

