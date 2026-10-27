/**
 * Feedback, end to end: the draft on this phone, the context attached to it,
 * and the one request that delivers it.
 *
 * The backend is the site's `/api/feedback` — same endpoint, same fields, same
 * Telegram channel — so a report from Android lands beside a report from the
 * web app. What the native app adds is the context a browser cannot give: the
 * screen that was open, the params it was showing, the build, the platform and
 * the saved branch and semester.
 *
 * Everything here is a module-level signal: the sheet can be opened from any
 * screen and the dedicated page reads the same draft, so switching between them
 * never loses a sentence.
 */

import { platform, signal } from "nsh";

import type { Route } from "../../app/router";
import { APP_BUILD, APP_VERSION } from "../../lib/app-info";
import { NetError, SITE, postJson, readStore, writeStore } from "../../lib/net";
import { branchShort, collegeShortLabel, useProfile } from "../settings/profile";
import type { FeedbackDraft, FeedbackMemory, FeedbackType } from "./state";
import {
  CONTEXT_LIMIT,
  COOLDOWN_MS,
  DRAFT_KEY,
  EMPTY_DRAFT,
  EMPTY_MEMORY,
  HISTORY_LIMIT,
  LEGACY_DRAFT_KEYS,
  MEMORY_KEY,
  MIN_MESSAGE,
  PAGE_LIMIT,
  normaliseDraft,
  normaliseMemory,
} from "./state";

export const SITE_FEEDBACK = `${SITE}/api/feedback`;

export type SendStatus = "idle" | "sending" | "sent";

export interface FeedbackTarget {
  /** What `/api/feedback` receives as `page`. */
  page: string;
  /** What it receives as `context`. */
  context: string;
}

interface FeedbackResponse {
  ok?: boolean;
  message?: string;
}

/* --------------------------------------------------------------- signals */

export const draft = signal<FeedbackDraft>(EMPTY_DRAFT);
export const memory = signal<FeedbackMemory>(EMPTY_MEMORY);
export const status = signal<SendStatus>("idle");
export const failure = signal("");
export const sheetOpen = signal(false);
export const target = signal<FeedbackTarget>({ page: "native/app", context: "" });

/** Ticks once a second while a feedback form is on screen, so the cooldown counts down. */
export const tick = signal(Date.now());

/* --------------------------------------------------------------- hydrate */

let hydrated = false;

async function hydrate(): Promise<void> {
  const stored = await readStore<unknown>(DRAFT_KEY, null);
  let value = stored;
  if (value === null) {
    for (const key of LEGACY_DRAFT_KEYS) {
      const legacy = await readStore<unknown>(key, null);
      if (legacy !== null) {
        value = legacy;
        break;
      }
    }
  }
  draft.set(normaliseDraft(value));
  memory.set(normaliseMemory(await readStore<unknown>(MEMORY_KEY, null)));
  hydrated = true;
}

void hydrate();

/* ---------------------------------------------------------------- writes */

let draftTimer: ReturnType<typeof setTimeout> | undefined;

/** Saves the draft now — after a send, when the debounce would be wasted. */
export function saveDraft(): void {
  if (draftTimer !== undefined) {
    clearTimeout(draftTimer);
    draftTimer = undefined;
  }
  void writeStore(DRAFT_KEY, draft());
}

function saveDraftSoon(): void {
  if (!hydrated) return;
  if (draftTimer !== undefined) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = undefined;
    void writeStore(DRAFT_KEY, draft());
  }, 350);
}

/** The one way a screen changes the draft: signal first, storage after a pause. */
export function patchDraft(patch: Partial<FeedbackDraft>): void {
  draft.update((current) => ({ ...current, ...patch }));
  if (status() === "sent") status.set("idle");
  if (failure().length > 0) failure.set("");
  saveDraftSoon();
}

/* ---------------------------------------------------------------- target */

function clip(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

/** "android 35", or just the OS where the version says nothing. */
function platformLine(): string {
  const version = platform.version.trim();
  return version === "" || version === "0.0" ? platform.os : `${platform.os} ${version}`;
}

/** The build, platform, branch and semester — the facts a bug report needs. */
export function deviceContext(): string {
  const profile = useProfile()();
  const parts = [`BEUConnect ${APP_VERSION} (${APP_BUILD})`, platformLine()];
  if (profile.branch) parts.push(branchShort(profile.branch));
  if (profile.sem > 0) parts.push(`sem ${profile.sem}`);
  if (profile.college) parts.push(collegeShortLabel(profile.college));
  return clip(parts.join(" · "), CONTEXT_LIMIT);
}

/**
 * The screen as the maintainer should see it: the route name plus the params it
 * was opened with, so "blank SGPA" arrives as
 * `native/results?reg=21105157098&sem=5` instead of a sentence to decode.
 */
export function describeRoute(route?: Route): FeedbackTarget {
  const params = route ? Object.entries(route.params) : [];
  const query = params
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}=${String(value).trim()}`)
    .join("&");
  return {
    page: clip(`native/${route ? route.name : "app"}${query ? `?${query}` : ""}`, PAGE_LIMIT),
    context: deviceContext(),
  };
}

/** The registration number a report should carry: the route's, else the profile's. */
export function registrationFor(route?: Route): string {
  const fromRoute = route?.params.reg;
  if (fromRoute !== undefined && fromRoute !== null && String(fromRoute).trim() !== "") {
    return String(fromRoute).trim().slice(0, 20);
  }
  return useProfile()().reg;
}

/* -------------------------------------------------------------- open/close */

export interface OpenFeedbackOptions {
  /** The screen the report is about. Its route becomes `page`, the device `context`. */
  route?: Route;
  /** Pre-typed type, for a screen that already knows it is a data problem. */
  type?: FeedbackType;
  /** Overrides, for a report about something not on screen. */
  page?: string;
  context?: string;
}

/** Opens the quick sheet from anywhere. The page footer calls this. */
export function openFeedback(options: OpenFeedbackOptions = {}): void {
  prepareFeedback(options);
  status.set("idle");
  failure.set("");
  sheetOpen.set(true);
}

/**
 * Points the form at a screen without showing the sheet. The full page calls
 * this on mount so its `page` is the route that is actually open.
 */
export function prepareFeedback(options: OpenFeedbackOptions = {}): void {
  const described = describeRoute(options.route);
  target.set({
    page: clip(options.page ?? described.page, PAGE_LIMIT),
    context: clip(options.context ?? described.context, CONTEXT_LIMIT),
  });

  const reg = registrationFor(options.route);
  draft.update((current) => ({
    ...current,
    type: options.type ?? current.type,
    regNo: current.regNo.trim().length > 0 ? current.regNo : reg,
  }));
}

export function closeFeedback(): void {
  sheetOpen.set(false);
  status.set("idle");
  failure.set("");
}

/* --------------------------------------------------------------- the route */

/**
 * The route on screen right now. Plain state, not a signal: the shell writes it
 * during render and only the footer reads it, when the user taps. That keeps
 * the footer (which sits inside `Body`, far from the shell) able to attach the
 * same context a screen itself would describe.
 */
let onScreen: Route = { name: "app", params: {} };

export function rememberRoute(route: Route): void {
  onScreen = route;
}

export function currentRoute(): Route {
  return onScreen;
}

/* ------------------------------------------------------------------- send */

export function cooldownRemaining(now: number = Date.now()): number {
  const last = memory().lastSentAt;
  if (!last) return 0;
  return Math.max(0, COOLDOWN_MS - (now - last));
}

export function typedLength(): number {
  return draft().message.trim().length;
}

export function canSend(now: number = Date.now()): boolean {
  return typedLength() >= MIN_MESSAGE && status() !== "sending" && cooldownRemaining(now) === 0;
}

function sendFailure(error: unknown): string {
  // `status === 0` is "never reached the server": offline, a timeout, a reset.
  if (error instanceof NetError && error.status === 0) {
    return "The message could not reach the server. It is saved on this phone — try again in a moment.";
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Feedback could not be sent. Try again in a bit.";
}

/**
 * Sends the draft to the site's endpoint.
 *
 * Success clears the message but keeps the registration number and contact: the
 * next report is usually from the same student. Failure keeps everything, so a
 * long report typed on a bad connection is never lost to a retry.
 */
export async function sendFeedback(): Promise<void> {
  if (status() === "sending") return;

  const current = draft();
  const message = current.message.trim();
  if (message.length < MIN_MESSAGE) {
    failure.set(`Add at least ${MIN_MESSAGE} characters so the report is useful.`);
    return;
  }

  const wait = cooldownRemaining();
  if (wait > 0) {
    failure.set(`Please wait ${Math.ceil(wait / 1000)}s before sending another report.`);
    return;
  }

  const where = target();
  status.set("sending");
  failure.set("");

  try {
    const response = await postJson<FeedbackResponse>(
      SITE_FEEDBACK,
      {
        type: current.type,
        message,
        regNo: current.regNo.trim(),
        contact: current.contact.trim(),
        page: where.page,
        context: where.context,
        hp: "",
      },
      20000,
    );
    if (response && response.ok === false) {
      throw new Error(response.message || "The feedback was not delivered.");
    }

    draft.update((value) => ({ ...value, message: "" }));
    saveDraft();

    const at = Date.now();
    memory.update((value) => ({
      sent: [{ at, type: current.type, message, page: where.page }, ...value.sent].slice(0, HISTORY_LIMIT),
      lastSentAt: at,
    }));
    void writeStore(MEMORY_KEY, memory());
    status.set("sent");
  } catch (error) {
    status.set("idle");
    failure.set(sendFailure(error));
  }
}

/** "Send another" on the success panel. */
export function resetSent(): void {
  status.set("idle");
  failure.set("");
}
