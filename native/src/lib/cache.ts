/**
 * The download cache: one string per key, kept on the device.
 *
 * Everything the app fetches from the site and wants to open again — a paper,
 * the notice board, a result table — is written here as
 *
 *   beu.cache.<key> → { at: <epoch ms>, value: "<the body>" }
 *
 * `nsh`'s `Storage` is 5 MB per app, shared with the student's own work (their
 * profile, read marks, attendance), so the cache is a **budgeted** tenant:
 * `writeEntry` trims the oldest entries when the cache would cross
 * `CACHE_BUDGET`, and never touches a key outside its own prefix.
 *
 * Two rules make the app work offline without ever looking broken:
 *
 *   1. A reader asks for a max age. `0` means "never expire": the copy is
 *      whatever the device last saw, and is served when the network fails.
 *   2. A writer can ask for `revalidate` (see `src/lib/net.ts`): the cached copy
 *      is returned at once and refreshed in the background, so an offline
 *      launch is instant and an online one is fresh a moment later.
 */

import { Storage } from "nsh";

import { utf8Bytes } from "./bytes";

export const CACHE_PREFIX = "beu.cache.";

/** The runtime's storage ceiling for the whole app. */
export const STORAGE_LIMIT = 5 * 1024 * 1024;

/** How much of it downloads may claim; the rest is the student's. */
export const CACHE_BUDGET = 3.5 * 1024 * 1024;

export interface CacheEntry {
  /** When the copy was written, epoch ms. */
  at: number;
  /** The body, exactly as the network returned it. */
  value: string;
}

/** One stored cache row, as the Storage and Offline screens measure it. */
export interface CacheRow {
  /** The key without `beu.cache.`. */
  key: string;
  /** Full Storage key. */
  storageKey: string;
  at: number;
  /** Bytes this row costs: its key plus its value. */
  bytes: number;
}

export function cacheStorageKey(key: string): string {
  return CACHE_PREFIX + key;
}

/** True when `storageKey` is a cache row rather than the student's own data. */
export function isCacheKey(storageKey: string): boolean {
  return storageKey.startsWith(CACHE_PREFIX);
}

function parseEntry(raw: string | null): CacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; value?: unknown };
    if (!parsed || typeof parsed.value !== "string") return null;
    const at = typeof parsed.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0;
    return { at, value: parsed.value };
  } catch {
    return null;
  }
}

export async function readEntry(key: string): Promise<CacheEntry | null> {
  try {
    return parseEntry(await Storage.getItem(cacheStorageKey(key)));
  } catch {
    return null;
  }
}

/** Reads a value, refusing anything older than `maxAge` milliseconds (0 = no limit). */
export async function readValue(key: string, maxAge = 0, now = Date.now()): Promise<string | null> {
  const entry = await readEntry(key);
  if (entry === null) return null;
  if (maxAge > 0 && now - entry.at > maxAge) return null;
  return entry.value;
}

/** When the copy of `key` was fetched; 0 when there is none. */
export async function stampOf(key: string): Promise<number> {
  const entry = await readEntry(key);
  return entry === null ? 0 : entry.at;
}

/**
 * Writes a copy, trimming the cache first when it would cross the budget.
 *
 * Returns false when storage rejects the write (a full device, a runtime that
 * forbids it). Caching is best effort: a caller never fails because of it.
 */
export async function writeEntry(key: string, value: string, now = Date.now(), budget = CACHE_BUDGET): Promise<boolean> {
  const bytes = utf8Bytes(cacheStorageKey(key)) + utf8Bytes(value) + 24;
  if (bytes > budget) return false;
  try {
    const rows = await listEntries();
    const used = rows.reduce((total, row) => total + row.bytes, 0);
    if (used + bytes > budget) await trimCache(budget - bytes, [key]);
    await Storage.setItem(cacheStorageKey(key), JSON.stringify({ at: now, value } satisfies CacheEntry));
    return true;
  } catch {
    return false;
  }
}

export async function removeEntry(key: string): Promise<void> {
  try {
    await Storage.removeItem(cacheStorageKey(key));
  } catch {
    /* a key that cannot be removed is not worth failing a screen for */
  }
}

/** Every cache row, oldest first, with the bytes each one costs. */
export async function listEntries(): Promise<CacheRow[]> {
  let keys: string[];
  try {
    keys = await Storage.keys();
  } catch {
    return [];
  }
  const rows: CacheRow[] = [];
  for (const storageKey of keys) {
    if (!isCacheKey(storageKey)) continue;
    try {
      const raw = await Storage.getItem(storageKey);
      if (raw === null) continue;
      const entry = parseEntry(raw);
      rows.push({
        key: storageKey.slice(CACHE_PREFIX.length),
        storageKey,
        at: entry?.at ?? 0,
        bytes: utf8Bytes(storageKey) + utf8Bytes(raw),
      });
    } catch {
      /* unreadable rows are skipped, never fatal */
    }
  }
  rows.sort((left, right) => left.at - right.at || left.key.localeCompare(right.key));
  return rows;
}

/** Total bytes the cache holds right now. */
export async function cacheBytes(): Promise<number> {
  return (await listEntries()).reduce((total, row) => total + row.bytes, 0);
}

/**
 * Evicts the oldest rows until the cache fits in `budget`. `keep` names keys
 * that must survive this pass (the one about to be written, for example).
 *
 * Returns what was removed so a screen can say so out loud.
 */
export async function trimCache(
  budget = CACHE_BUDGET,
  keep: readonly string[] = [],
): Promise<{ removed: number; bytes: number }> {
  const rows = await listEntries();
  const protectedKeys = new Set(keep);
  let used = rows.reduce((total, row) => total + row.bytes, 0);
  let removed = 0;
  let bytes = 0;
  for (const row of rows) {
    if (used <= budget) break;
    if (protectedKeys.has(row.key)) continue;
    await removeEntry(row.key);
    used -= row.bytes;
    removed += 1;
    bytes += row.bytes;
  }
  return { removed, bytes };
}

/** Removes every cache row whose key `match` accepts. Returns what went. */
export async function clearCacheWhere(
  match: (key: string) => boolean,
): Promise<{ removed: number; bytes: number }> {
  const rows = await listEntries();
  let removed = 0;
  let bytes = 0;
  for (const row of rows) {
    if (!match(row.key)) continue;
    await removeEntry(row.key);
    removed += 1;
    bytes += row.bytes;
  }
  return { removed, bytes };
}
