/**
 * Live data on the device: hydrate once at launch, refresh in the background,
 * and apply only a complete snapshot.
 *
 * Why "complete": branch records carry indexes into the shared prose table. If
 * half of a new table were applied, every subject would point at the wrong
 * paragraph. So a new manifest is written **last**, after every payload it names
 * is already in Storage, and a missing payload at launch sends the app back to
 * the bundled copy instead of showing corrupted data.
 */

import { Storage, signal } from "nsh";

import { utf8Bytes } from "../../lib/bytes";
import { SITE, fetchText } from "../../lib/net";
import { BUNDLED } from "./bundled";
import {
  manifestSignature,
  parseManifest,
  requiredHashes,
  sameAsBundled,
  type FeedManifest,
} from "./model";

/**
 * One hour: the manifest is ~2 KB, so checking often is cheaper than a stale
 * fix. A failed check also waits this long, so a phone with no signal does not
 * retry on every screen open.
 */
const CHECK_MS = 60 * 60 * 1000;
/** Refuse to store more than this; a feed that large is a publisher bug. */
export const FEED_BUDGET = 2 * 1024 * 1024;

const MANIFEST_KEY = "beu.feed.manifest.v1";
const FILE_KEY = "beu.feed.file.";
const CHECKED_KEY = "beu.feed.checked";

const FEED_URL = `${SITE}/data/app/manifest.json`;

export interface ActiveFeed {
  manifest: FeedManifest;
  /** Only payloads that are not already in the binary. Bundled text is never copied. */
  files: ReadonlyMap<string, string>;
  at: number;
}

export interface FeedStatus {
  live: boolean;
  snapshot: string;
  checkedAt: number;
  files: number;
  bytes: number;
}

export type SyncOutcome = "current" | "updated" | "bundled" | "cooldown" | "offline";

export interface SyncResult {
  outcome: SyncOutcome;
  files: number;
  bytes: number;
}

let state: ActiveFeed | null = null;
let checkedAt = 0;
/**
 * Bumped on every applied snapshot. A signal, so a screen reading
 * `dataVersion()` re-renders with the new data instead of keeping what it
 * decoded a moment before the update landed.
 */
const revision = signal(0);
let hydration: Promise<void> | null = null;
let syncing: Promise<SyncResult> | null = null;

/** Increments whenever the active snapshot changes; readers use it to drop caches. */
export function dataVersion(): number {
  return revision();
}

export function activeFeed(): ActiveFeed | null {
  return state;
}

export function feedStatus(): FeedStatus {
  const bytes = state
    ? [...state.files.values()].reduce((total, text) => total + utf8Bytes(text), 0)
    : 0;
  return {
    live: state !== null,
    snapshot: state?.manifest.syllabus.snapshot ?? BUNDLED.snapshot,
    checkedAt,
    files: state?.files.size ?? 0,
    bytes,
  };
}

/** The cached file keys a manifest needs, minus everything already in the binary. */
function required(manifest: FeedManifest): string[] {
  return requiredHashes(manifest, BUNDLED);
}

async function readFiles(hashes: string[]): Promise<Map<string, string> | null> {
  const pairs = await Promise.all(
    hashes.map(async (hash) => {
      try {
        return [hash, await Storage.getItem(FILE_KEY + hash)] as const;
      } catch {
        return [hash, null] as const;
      }
    }),
  );
  const files = new Map<string, string>();
  for (const [hash, text] of pairs) {
    if (text === null || text === "") return null;
    files.set(hash, text);
  }
  return files;
}

/**
 * Reads the snapshot written by a previous launch. Local only, so the shell can
 * await it before the first paint without a network stall.
 */
export function hydrateDataFeed(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    try {
      checkedAt = Number((await Storage.getItem(CHECKED_KEY)) ?? 0) || 0;
      const raw = await Storage.getItem(MANIFEST_KEY);
      if (!raw) return;
      const envelope = JSON.parse(raw) as { at?: number; manifest?: unknown };
      const manifest = parseManifest(envelope.manifest);
      if (!manifest || sameAsBundled(manifest, BUNDLED)) {
        // This build already carries the feed's data: drop the manifest and any
        // payload it left behind, so Storage does not pay for a copy of itself.
        await Storage.removeItem(MANIFEST_KEY);
        await prune(new Set());
        return;
      }
      const files = await readFiles(required(manifest));
      if (!files) {
        // A partial snapshot must never be decoded: fall back to the binary.
        await Storage.removeItem(MANIFEST_KEY);
        return;
      }
      state = { manifest, files, at: Number(envelope.at) || 0 };
      revision.set(revision() + 1);
    } catch {
      state = null;
    }
  })();
  return hydration;
}

async function fetchPayloads(hashes: string[]): Promise<Map<string, string> | null> {
  const files = new Map<string, string>();
  let next = 0;
  const workers = Array.from({ length: Math.min(4, hashes.length) }, async () => {
    while (next < hashes.length) {
      const hash = hashes[next++];
      try {
        const text = await fetchText(`${SITE}/data/app/files/${hash}.txt`, {
          timeout: 20000,
          cache: "force-cache",
        });
        if (text === "") return;
        files.set(hash, text);
      } catch {
        return;
      }
    }
  });
  await Promise.all(workers);
  return files.size === hashes.length ? files : null;
}

async function prune(keep: Set<string>): Promise<void> {
  try {
    const keys = await Storage.keys();
    for (const key of keys) {
      if (!key.startsWith(FILE_KEY)) continue;
      if (keep.has(key.slice(FILE_KEY.length))) continue;
      await Storage.removeItem(key);
    }
  } catch {
    /* a stale payload is harmless; the next sync prunes it */
  }
}

async function download(manifest: FeedManifest): Promise<SyncResult> {
  const hashes = required(manifest);
  const fetched = hashes.length === 0 ? new Map<string, string>() : await fetchPayloads(hashes);
  if (!fetched) return { outcome: "offline", files: 0, bytes: 0 };

  let bytes = 0;
  for (const text of fetched.values()) {
    bytes += utf8Bytes(text);
    if (bytes > FEED_BUDGET) return { outcome: "offline", files: 0, bytes: 0 };
  }

  const files = new Map<string, string>();
  for (const hash of hashes) {
    const text = fetched.get(hash) ?? state?.files.get(hash);
    if (!text) return { outcome: "offline", files: 0, bytes: 0 };
    files.set(hash, text);
  }

  try {
    for (const hash of hashes) {
      if (state?.files.get(hash) === files.get(hash)) continue;
      await Storage.setItem(FILE_KEY + hash, files.get(hash)!);
    }
    // The manifest goes last: until it lands, the previous snapshot stays active.
    await Storage.setItem(MANIFEST_KEY, JSON.stringify({ at: Date.now(), manifest }));
  } catch {
    return { outcome: "offline", files: 0, bytes: 0 };
  }

  state = { manifest, files, at: Date.now() };
  revision.set(revision() + 1);
  await prune(new Set(hashes));
  return { outcome: "updated", files: hashes.length, bytes };
}

async function deactivate(): Promise<SyncResult> {
  await Storage.removeItem(MANIFEST_KEY);
  state = null;
  revision.set(revision() + 1);
  await prune(new Set());
  return { outcome: "bundled", files: 0, bytes: 0 };
}

async function check(force: boolean): Promise<SyncResult> {
  if (!force && checkedAt > 0 && Date.now() - checkedAt < CHECK_MS) {
    return { outcome: "cooldown", files: 0, bytes: 0 };
  }
  checkedAt = Date.now();
  try {
    await Storage.setItem(CHECKED_KEY, String(checkedAt));
  } catch {
    /* the timestamp is an optimisation, not data */
  }

  let text: string;
  try {
    text = await fetchText(FEED_URL, {
      timeout: 12000,
      cache: "no-cache",
      headers: { accept: "application/json" },
    });
  } catch {
    return { outcome: "offline", files: 0, bytes: 0 };
  }

  let manifest: FeedManifest | null = null;
  try {
    manifest = parseManifest(JSON.parse(text));
  } catch {
    manifest = null;
  }
  if (!manifest) return { outcome: "offline", files: 0, bytes: 0 };

  if (sameAsBundled(manifest, BUNDLED)) {
    if (state !== null) return deactivate();
    return { outcome: "current", files: 0, bytes: 0 };
  }

  if (state && manifestSignature(state.manifest) === manifestSignature(manifest)) {
    return { outcome: "current", files: 0, bytes: 0 };
  }

  return download(manifest);
}

/**
 * Checks the feed at most once an hour. Safe to call on every launch and every
 * time a data screen opens: the cooldown makes the second call a no-op.
 */
export function syncDataFeed(force = false): Promise<SyncResult> {
  if (syncing) return syncing;
  syncing = check(force).finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Fire-and-forget launch check; failures leave the bundled data untouched. */
export function startDataFeed(): void {
  void syncDataFeed(false);
}

/** Reverts to the data in this build and removes every downloaded payload. */
export async function clearDataFeed(): Promise<void> {
  const keys = await Storage.keys();
  for (const key of keys) {
    if (key === MANIFEST_KEY || key === CHECKED_KEY || key.startsWith(FILE_KEY)) {
      try {
        await Storage.removeItem(key);
      } catch {
        /* keep clearing the rest */
      }
    }
  }
  state = null;
  checkedAt = 0;
  revision.set(revision() + 1);
}

/** URL the manifest is served from; exported for docs and diagnostics. */
export const DATA_FEED_URL = FEED_URL;
