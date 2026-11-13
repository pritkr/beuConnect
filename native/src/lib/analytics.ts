/**
 * GA4 for the app.
 *
 * `gtag.js` cannot run in a QuickJS runtime, and a Measurement Protocol API
 * secret must never be shipped inside an APK anyone can unzip. So this module
 * batches events and hands them to the site's `/api/track`, which holds the
 * secret, validates the payload and forwards it to GA4. The app therefore
 * knows nothing secret and keeps working when the secret is rotated.
 *
 * What is tracked, in order of how much it costs:
 *
 *  - **Every screen**, from the shell's route renderer — this is the answer to
 *    "which feature is used", with no per-screen wiring.
 *  - **One `app_open` per launch**, carrying first-open, upgrade and version.
 *  - **Feature actions** (`pyq_pdf_download`, `calculator_save`, …) at the
 *    places where a student actually does the thing.
 *
 * Three rules that matter more than the events:
 *
 *  1. **Nothing personal leaves the phone.** Route params are allowlisted, and
 *     every string is scrubbed of long digit runs, so a registration number can
 *     never become a GA4 dimension.
 *  2. **The student can say no.** Settings → About → usage analytics. Turning
 *     it off clears the queued batch and every future call is a no-op.
 *  3. **Analytics never breaks a screen.** Sends are fire-and-forget with a
 *     timeout; a failure re-queues what was sent and stops there.
 */

import { Storage, platform, signal } from "nsh";
import type { Accessor } from "nsh";

import { APP_BUILD, APP_VERSION } from "./app-info";
import { EVENTS } from "./analytics-events";
import { postJson, SITE } from "./net";
import { currentStudent, ensureStudent, setStudent } from "./student-context";
import type { StudentLabels } from "./student-context";

export type { StudentLabels } from "./student-context";

export { EVENTS } from "./analytics-events";

export type ParamValue = string | number | boolean | null | undefined;
export type Params = Record<string, ParamValue>;

const CLIENT_KEY = "beu.analytics.client";
const META_KEY = "beu.analytics.meta";
const PENDING_KEY = "beu.analytics.pending";
const OPT_OUT_KEY = "beu.analytics.optout";

/** A GA4 session ends after 30 minutes of quiet. */
const SESSION_GAP_MS = 30 * 60 * 1000;
/** One request carries at most this many events. */
const BATCH = 12;
/** A persisted backlog is capped so an offline week cannot grow forever. */
const MAX_PENDING = 40;
/** How long quiet before a lone event is worth a request. */
const FLUSH_AFTER_MS = 20_000;

/** Params a screen may contribute: all of them are dimensions, none identify. */
const SCREEN_PARAMS = new Set([
  "branch",
  "sem",
  "semester",
  "scheme",
  "college",
  "subject",
  "paper",
  "batch",
  "kind",
  "year",
  "month",
  "tab",
  "source",
  "label",
]);

/* ---------------------------------------------------------------- student */

/**
 * The saved registration number, as an opaque id plus the facts it encodes.
 *
 * The number itself must never reach GA4 — it identifies a person and we cannot
 * delete a dimension. A short hash still answers "how many distinct students
 * opened this", which is the question a raw count of events cannot.
 *
 * The same number spells batch, branch and college (`YYBBBCCCXXX`), so those
 * three become dimensions on every event from a student who has saved one. That
 * is how a dashboard can say "Sem 3 CSE students in GEC Sheikhpura use PYQs
 * most" without ever storing a person.
 *
 * The parse and the saved copy live in `student-context.ts`, which `net.ts`
 * also reads to put `x-beu-*` headers on every request to our own API.
 */

/** Kept as the feature-facing name: results owns when a number is known. */
export function noteStudent(reg: string, labels: StudentLabels = {}): void {
  setStudent(reg, labels);
}

function studentParams(): Params {
  const student = currentStudent();
  if (student === null) return { has_profile: false };
  return {
    has_profile: true,
    student: student.hash,
    branch: student.branch,
    branch_name: student.branchName,
    college: student.college,
    college_name: student.collegeName,
    batch: student.batch,
  };
}

/** Route prefix → the feature name the site also reports. */
function featureOfRoute(route: string): string {
  const head = route.split(".")[0] ?? "home";
  if (head === "settings" || head === "more") return head;
  if (head === "onboarding") return "onboarding";
  return head;
}

const enabled = signal<boolean>(true);
let started = false;
let hydrated = false;
let optedOut = false;
let clientId = "";
let sessionId = 0;
let lastTouch = 0;
let lastScreen = "";
let lastScreenAt = 0;
let sending = false;
let pending: Array<{ name: string; params: Record<string, string | number | boolean> }> = [];

/** Whether analytics is on, for the settings switch. */
export function useAnalytics(): Accessor<boolean> {
  return enabled;
}

/** Analytics is on when the student has not turned it off. */
export function analyticsEnabled(): boolean {
  return !optedOut;
}

/* ------------------------------------------------------------------ scrub */

const LONG_DIGITS = /\d{6,}/g;

function scrub(value: string): string {
  return value
    .replace(LONG_DIGITS, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Keeps only the dimensions GA4 can report on, with no identity in them. */
function cleanParams(params: Params): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const key of Object.keys(params)) {
    if (count >= 25) break;
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else {
      // `student` is our own hash: scrubbing it would mangle a valid digest.
      // A registration number is never a param, so it is scrubbed like any
      // other string if a screen ever passes one by mistake.
      const text = key === "student" ? String(value).slice(0, 100) : scrub(String(value));
      if (text) out[key] = text;
    }
    count += 1;
  }
  return out;
}

/* --------------------------------------------------------------- identity */

function newClientId(): string {
  const hex = (): string => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-a${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`;
}

/** A session is a conversation: 30 quiet minutes start a new one. */
function touchSession(now: number): number {
  if (sessionId === 0 || now - lastTouch > SESSION_GAP_MS) {
    sessionId = Math.floor(now / 1000);
  }
  lastTouch = now;
  return sessionId;
}

/* --------------------------------------------------------------- lifecycle */

/**
 * Reads the device's identity and flags, fires `app_open`, and flushes whatever
 * an offline session left behind. Called once by the shell.
 */
export function initAnalytics(): void {
  if (started) return;
  started = true;

  void (async () => {
    try {
      optedOut = (await Storage.getItem(OPT_OUT_KEY)) === "1";
      enabled.set(!optedOut);
      if (optedOut) return;

      let stored = await Storage.getItem(CLIENT_KEY);
      if (!stored || stored.length < 8) {
        stored = newClientId();
        await Storage.setItem(CLIENT_KEY, stored);
      }
      clientId = stored;

      await ensureStudent();

      const meta = await readMeta();
      const now = Date.now();
      const firstOpen = meta.first === 0;
      const upgrade = meta.version !== "" && meta.version !== APP_VERSION;

      await writeMeta({
        first: firstOpen ? now : meta.first,
        last: now,
        opens: meta.opens + 1,
        version: APP_VERSION,
      });

      track(EVENTS.appOpen, {
        first_open: firstOpen,
        upgrade,
        app_version: APP_VERSION,
        app_build: APP_BUILD,
        platform: platform.os,
        days_since_install: firstOpen ? 0 : Math.round((now - meta.first) / 86_400_000),
        opens: meta.opens + 1,
      });

      pending = (await readPending()).concat(pending).slice(-MAX_PENDING);
      hydrated = true;
      void flushAnalytics();
    } catch {
      hydrated = true;
    }
  })();
}

interface Meta {
  first: number;
  last: number;
  opens: number;
  version: string;
}

async function readMeta(): Promise<Meta> {
  try {
    const raw = await Storage.getItem(META_KEY);
    if (!raw) return { first: 0, last: 0, opens: 0, version: "" };
    const parsed = JSON.parse(raw) as Partial<Meta>;
    return {
      first: cfgNumber(parsed.first),
      last: cfgNumber(parsed.last),
      opens: cfgNumber(parsed.opens),
      version: typeof parsed.version === "string" ? parsed.version : "",
    };
  } catch {
    return { first: 0, last: 0, opens: 0, version: "" };
  }
}

function cfgNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function writeMeta(meta: Meta): Promise<void> {
  try {
    await Storage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* analytics is never allowed to fail a launch */
  }
}

/* ------------------------------------------------------------------ track */

/**
 * Records one event. Safe anywhere: before init, while offline, with analytics
 * off. The queue is capped, so a long offline session just reports its last 40
 * actions when the network returns.
 */
export function track(name: string, params: Params = {}): void {
  if (optedOut) return;
  const now = Date.now();
  const clean = cleanParams({
    // Every event carries the session it belongs to; GA4 attributes an event
    // without one to a new session, which would inflate session counts.
    session_id: touchSession(now),
    engagement_time_msec: 1,
    platform: platform.os,
    // The dimension that separates the app from the site in one property. The
    // worker also stamps it, but a value here survives any proxy change.
    surface: "android",
    ...studentParams(),
    ...params,
  });
  pending.push({ name, params: clean });
  if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
  if (hydrated && pending.length >= BATCH) void flushAnalytics();
}

/**
 * Records a screen. The shell calls this for every route render, so this is the
 * one place that knows "which feature is used" across the whole app.
 *
 * Route params are filtered to the allowlist before they leave this function.
 */
export function trackScreen(route: string, params: Params = {}): void {
  if (optedOut || route === "") return;

  const allowed: Params = {};
  for (const key of Object.keys(params)) {
    if (SCREEN_PARAMS.has(key)) allowed[key] = params[key];
  }
  const key = `${route}|${JSON.stringify(allowed)}`;
  const now = Date.now();
  // The nav stack re-renders its child on unrelated signal changes; a screen is
  // one event, not one per render.
  if (key === lastScreen && now - lastScreenAt < 800) return;
  lastScreen = key;
  lastScreenAt = now;

  track(EVENTS.screenView, {
    screen_name: route,
    feature: featureOfRoute(route),
    ...allowed,
  });
}

/* ------------------------------------------------------------------ flush */

/** Sends the queue. Never throws; a failed batch goes back on the front. */
export async function flushAnalytics(): Promise<void> {
  if (optedOut || sending || pending.length === 0 || clientId === "") return;
  sending = true;
  const batch = pending.slice(0, BATCH);
  pending = pending.slice(batch.length);
  try {
    await postJson(
      `${SITE}/api/track`,
      {
        client_id: clientId,
        app: { platform: platform.os, version: APP_VERSION, build: APP_BUILD },
        events: batch,
      },
      8000,
    );
  } catch {
    pending = batch.concat(pending).slice(-MAX_PENDING);
    void persistPending();
  } finally {
    sending = false;
  }
}

/* ------------------------------------------------------------------- opt-out */

/** Turns analytics on or off, and remembers the choice on the device. */
export async function setAnalyticsEnabled(on: boolean): Promise<void> {
  optedOut = !on;
  enabled.set(on);
  try {
    if (on) await Storage.removeItem(OPT_OUT_KEY);
    else await Storage.setItem(OPT_OUT_KEY, "1");
  } catch {
    /* the in-memory flag still applies for this launch */
  }
  if (!on) {
    pending = [];
    try {
      await Storage.removeItem(PENDING_KEY);
    } catch {
      /* nothing to clear */
    }
  }
}

/* --------------------------------------------------------------- durability */

async function readPending(): Promise<Array<{ name: string; params: Record<string, string | number | boolean> }>> {
  try {
    const raw = await Storage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is { name: string; params: Record<string, string | number | boolean> } => {
        return Boolean(row) && typeof (row as { name?: unknown }).name === "string";
      })
      .slice(-MAX_PENDING);
  } catch {
    return [];
  }
}

/**
 * Persists the queue while it is waiting for a connection. Called at most once
 * per flush attempt rather than per event, so a busy session does not write to
 * Storage on every tap.
 */
async function persistPending(): Promise<void> {
  try {
    if (pending.length === 0) await Storage.removeItem(PENDING_KEY);
    else await Storage.setItem(PENDING_KEY, JSON.stringify(pending.slice(-MAX_PENDING)));
  } catch {
    /* the queue is best-effort */
  }
}

/* A quiet session should not strand its last few events: one timer, one small
 * request, and only when there is something to send. */
setInterval(() => {
  if (pending.length > 0) {
    void flushAnalytics().then(persistPending);
  }
}, FLUSH_AFTER_MS);
