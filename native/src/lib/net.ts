/**
 * Small, strict networking + storage helpers shared by the feature folders.
 * Everything here is dependency-free and safe on Android, iOS, desktop and web.
 */

import { Storage } from "nsh";

import { readValue, removeEntry, stampOf, writeEntry } from "./cache";

export const SITE = "https://beu.prit.eu.org";

export class NetError extends Error {
  status: number;
  /** The server's JSON body when it sent one: `/api/feedback` puts the sentence to show in `message`. */
  payload: unknown;
  constructor(message: string, status = 0, payload: unknown = null) {
    super(message);
    this.name = "NetError";
    this.status = status;
    this.payload = payload;
  }
}

export interface FetchOptions {
  /** Milliseconds before the request is aborted (default 20s). */
  timeout?: number;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** Fetch cache mode. `"no-cache"` revalidates a static manifest instead of trusting a stale copy. */
  cache?: "default" | "no-cache" | "reload" | "force-cache" | "only-if-cached";
  /** Cache key: when set, a successful response is persisted in Storage. */
  cacheKey?: string;
  /**
   * Max age of the cached copy in ms (default 10 min). `0` means the copy never
   * expires: it is served whenever the request fails, however old it is.
   */
  cacheMaxAge?: number;
  /**
   * Stale-while-revalidate: when a copy exists, return it at once and refresh
   * it in the background. This is what makes a screen open instantly on a bad
   * connection — and always offline — while still getting fresher next time.
   */
  revalidate?: boolean;
}

const inflight = new Map<string, Promise<string>>();

function withTimeout(url: string, init: RequestInit, timeout: number): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new NetError("The request timed out. Check your connection and try again.", 0));
    }, timeout);

    fetch(url, init).then(
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new NetError(String(error?.message ?? error ?? "Network request failed"), 0));
      },
    );
  });
}

/** GETs text with a timeout, retries once on a network failure, and optional cache. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const timeout = options.timeout ?? 20000;
  const key = options.cacheKey ?? url;

  // Serve the device's copy first when the caller asked for it, then refresh.
  if (options.cacheKey && options.revalidate) {
    const cached = await readValue(options.cacheKey, 0);
    if (cached !== null) {
      void refreshInBackground(url, options);
      return cached;
    }
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const run = (async () => {
    const response = await withTimeout(
      url,
      { method: "GET", headers: options.headers, cache: options.cache },
      timeout,
    );
    if (!response.ok) {
      throw new NetError(httpMessage(response.status), response.status);
    }
    return response.text();
  })();

  inflight.set(key, run);
  try {
    const text = await run;
    if (options.cacheKey) await putCache(options.cacheKey, text);
    return text;
  } catch (error) {
    if (options.cacheKey) {
      const cached = await getCache(options.cacheKey, options.cacheMaxAge ?? 10 * 60 * 1000);
      if (cached !== null) return cached;
    }
    throw error;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Refreshes a cached page without making the caller wait, and without ever
 * surfacing a failure: the copy on screen is already good enough.
 */
function refreshInBackground(url: string, options: FetchOptions): void {
  const key = options.cacheKey ?? url;
  if (inflight.has(key)) return;
  const run = (async () => {
    const response = await withTimeout(
      url,
      { method: "GET", headers: options.headers, cache: options.cache },
      options.timeout ?? 20000,
    );
    if (!response.ok) return "";
    const text = await response.text();
    if (options.cacheKey) await putCache(options.cacheKey, text);
    return text;
  })().catch(() => "");
  inflight.set(key, run);
  void run.finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
}

/** GETs and parses JSON. */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NetError("The server returned an unexpected response.", 0);
  }
}

/** POSTs JSON and returns the parsed response (empty object when there is none). */
export async function postJson<T>(url: string, body: unknown, timeout = 20000): Promise<T> {
  const response = await withTimeout(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    timeout,
  );
  const text = await response.text();
  const parsed = parseJson(text);

  // A refusal carries the sentence a person should read ("Please include a bit
  // more detail."), not the status code. Show the server's words when it sent
  // any, and fall back to the generic line when it sent HTML or nothing.
  if (!response.ok) {
    throw new NetError(serverMessage(parsed) ?? httpMessage(response.status), response.status, parsed);
  }

  if (!text.trim()) return {} as T;
  if (parsed === NOT_JSON) throw new NetError("The server returned an unexpected response.", 0);
  return parsed as T;
}

const NOT_JSON = Symbol("not-json");

function parseJson(text: string): unknown {
  if (!text.trim()) return NOT_JSON;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return NOT_JSON;
  }
}

/** The `message` a JSON body carries, when it is a sentence worth showing. */
function serverMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const said = (payload as Record<string, unknown>).message;
  if (typeof said !== "string") return null;
  const clean = said.replace(/\s+/g, " ").trim();
  return clean.length > 0 ? clean.slice(0, 240) : null;
}

export function httpMessage(status: number): string {
  if (status === 404) return "That information isn't available.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "The server is busy right now. Try again in a moment.";
  if (status === 0) return "You appear to be offline.";
  return `Request failed (${status}).`;
}

/* ------------------------------------------------------------------ cache */

/** Persists a copy of `value`; see `src/lib/cache.ts` for the budget rules. */
export async function putCache(key: string, value: string): Promise<void> {
  await writeEntry(key, value);
}

/** Reads a copy, refusing anything older than `maxAge` ms (0 = never expires). */
export async function getCache(key: string, maxAge = 10 * 60 * 1000): Promise<string | null> {
  return readValue(key, maxAge);
}

/** When the copy of `key` was fetched, 0 when there is none. */
export async function cacheStamp(key: string): Promise<number> {
  return stampOf(key);
}

/** Forgets one cached copy. */
export async function dropCache(key: string): Promise<void> {
  await removeEntry(key);
}

/** Reads a persisted JSON value, with a fallback. */
export async function readStore<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await Storage.getItem("beu." + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Persists a JSON value. Returns false when storage rejects it. */
export async function writeStore(key: string, value: unknown): Promise<boolean> {
  try {
    await Storage.setItem("beu." + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function removeStore(key: string): Promise<void> {
  try {
    await Storage.removeItem("beu." + key);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------- format */

export function formatDate(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return formatDate(input);
  const minute = 60_000;
  if (diff < minute) return "just now";
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}m ago`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))}h ago`;
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))}d ago`;
  return formatDate(date);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|\s|[-_])([a-z])/g, (_m, sep: string, ch: string) => sep.replace(/[-_]/, " ") + ch.toUpperCase());
}

/** Debounces a function (used by search fields). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 250): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
