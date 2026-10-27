/**
 * What a feedback report is, and what the phone remembers about it.
 *
 * The wire format is the site's, unchanged: `/api/feedback` reads `type`,
 * `message`, `regNo`, `contact`, `page`, `context` and the `hp` honeypot, and
 * drops the whole thing into the maintainer's Telegram. Anything added here has
 * to fit in those fields — `page` and `context` are the only free ones, and the
 * server clips them at 240 and 120 characters.
 *
 * The draft and the sent history are separate keys on purpose: clearing the
 * message after a send must never lose the list of what was already sent.
 */

export type FeedbackType = "bug" | "wrong-data" | "feature" | "other";

export interface FeedbackTypeOption {
  value: FeedbackType;
  /** The chip. Short enough that four fit one row at 320 pt. */
  label: string;
  /** The placeholder: the one sentence that makes a useful report. */
  placeholder: string;
}

export const FEEDBACK_TYPES: readonly FeedbackTypeOption[] = [
  { value: "bug", label: "Bug", placeholder: "What happened, and what you expected instead?" },
  { value: "wrong-data", label: "Wrong data", placeholder: "Which result or table, and what it gets wrong?" },
  { value: "feature", label: "Idea", placeholder: "What would you use every week?" },
  { value: "other", label: "Other", placeholder: "Anything about the app or the site." },
];

/** The server refuses anything shorter; saying it here saves a round trip. */
export const MIN_MESSAGE = 10;
export const MAX_MESSAGE = 1200;
/** One report per half minute, as on the site: a double tap is not a second bug. */
export const COOLDOWN_MS = 30_000;
/** How many sent reports stay on the phone. */
export const HISTORY_LIMIT = 5;

export const PAGE_LIMIT = 240;
export const CONTEXT_LIMIT = 120;

export interface FeedbackDraft {
  type: FeedbackType;
  message: string;
  regNo: string;
  contact: string;
}

export const EMPTY_DRAFT: FeedbackDraft = { type: "bug", message: "", regNo: "", contact: "" };

/** One report this phone delivered. `page` is what the maintainer saw. */
export interface SentReport {
  at: number;
  type: FeedbackType;
  message: string;
  page: string;
}

export interface FeedbackMemory {
  /** Newest first, capped at `HISTORY_LIMIT`. */
  sent: SentReport[];
  /** When the last report left this phone, for the cooldown. */
  lastSentAt: number;
}

export const EMPTY_MEMORY: FeedbackMemory = { sent: [], lastSentAt: 0 };

/** Storage keys, without the `beu.` prefix `src/lib/net.ts` adds. */
export const DRAFT_KEY = "feedback.draft";
export const MEMORY_KEY = "feedback.memory";

/**
 * Where a half-typed report lived before feedback became its own feature. Read
 * once so an upgrade does not throw away words someone already wrote.
 */
export const LEGACY_DRAFT_KEYS = ["tools.feedback:v2", "tools.feedback"];

export function isFeedbackType(value: unknown): value is FeedbackType {
  return value === "bug" || value === "wrong-data" || value === "feature" || value === "other";
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function normaliseDraft(value: unknown): FeedbackDraft {
  if (!value || typeof value !== "object") return EMPTY_DRAFT;
  const raw = value as Record<string, unknown>;
  return {
    type: isFeedbackType(raw.type) ? raw.type : "bug",
    message: text(raw.message, MAX_MESSAGE),
    regNo: text(raw.regNo, 20),
    contact: text(raw.contact, 80),
  };
}

export function normaliseMemory(value: unknown): FeedbackMemory {
  if (!value || typeof value !== "object") return EMPTY_MEMORY;
  const raw = value as Record<string, unknown>;
  const sent: SentReport[] = [];
  if (Array.isArray(raw.sent)) {
    for (const entry of raw.sent) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (!isFeedbackType(item.type)) continue;
      const at = typeof item.at === "number" && Number.isFinite(item.at) ? item.at : 0;
      const message = text(item.message, MAX_MESSAGE).trim();
      if (!at || !message) continue;
      sent.push({ at, type: item.type, message, page: text(item.page, PAGE_LIMIT) });
      if (sent.length >= HISTORY_LIMIT) break;
    }
  }
  const lastSentAt = typeof raw.lastSentAt === "number" && Number.isFinite(raw.lastSentAt) ? raw.lastSentAt : 0;
  return { sent, lastSentAt };
}

/** A one-line label for a type, for the history rows. */
export function typeLabel(type: FeedbackType): string {
  return FEEDBACK_TYPES.find((option) => option.value === type)?.label ?? "Other";
}

/** The placeholder for the chosen type. */
export function placeholderFor(type: FeedbackType): string {
  return FEEDBACK_TYPES.find((option) => option.value === type)?.placeholder ?? FEEDBACK_TYPES[0].placeholder;
}
