/**
 * The app's own release channel, and the one thing every student will use:
 * sending the app to a classmate.
 *
 * There is no Play Store, so GitHub Releases is the store. The repository is
 * public, `releases/latest` is the newest non-draft release, and the APK asset
 * is named `BEUConnect.apk` in every release — which gives one URL that always
 * downloads the current build:
 *
 *   https://github.com/pritkr/beuconnect/releases/latest/download/BEUConnect.apk
 *
 * Two consumers:
 *   - `checkForUpdates()` compares the release tag with the running build and
 *     answers "v1.1.1 is out" without ever opening a browser;
 *   - `shareMessage()` is the text the Share button hands to WhatsApp, and it
 *     names that URL rather than a file, because a chat attachment cannot be
 *     updated and a link can.
 *
 * Nothing here throws: a phone with no connection, a rate-limited API and a
 * repo with no release yet all answer `null`, and the caller renders the
 * version it already knows.
 */

import { signal } from "nsh";
import { APP_VERSION } from "./app-info";
import { fetchJson, readStore, writeStore } from "./net";

/** `owner/repo` of the public source repository; the release channel lives here. */
export const RELEASE_REPO = "pritkr/beuconnect";

/** The repository, in a browser. */
export const REPO_URL = `https://github.com/${RELEASE_REPO}`;

/** The newest release page, whatever its version. */
export const RELEASE_PAGE = `${REPO_URL}/releases/latest`;

/**
 * The APK that always points at the newest release. GitHub resolves
 * `/releases/latest/download/<asset>` server-side, so this URL survives every
 * version bump as long as the asset keeps its name.
 */
export const APK_URL = `${RELEASE_PAGE}/download/BEUConnect.apk`;

/** How long a check is trusted before the next launch asks GitHub again. */
const CHECK_MAX_AGE = 6 * 60 * 60 * 1000;
const CHECK_KEY = "release.check";

export interface AppRelease {
  /** `1.1.1` — the tag without its `v`. */
  version: string;
  /** The tag exactly as published, e.g. `v1.1.1`. */
  tag: string;
  /** The release page. */
  page: string;
  /** The APK asset, when the release has one. */
  apk: string;
  /** The release notes, trimmed for a phone screen. */
  notes: string;
  /** ISO date of publication, or "" when GitHub did not say. */
  published: string;
}

interface RawAsset {
  name?: string;
  browser_download_url?: string;
}

interface RawRelease {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: RawAsset[];
}

/** `v1.2.3` and `1.2.3` both become `1.2.3`; anything else is returned as-is. */
export function versionFromTag(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

/**
 * Semver comparison without a dependency: -1, 0 or 1.
 *
 * Only the numeric head matters on this channel (`1.1.0`), so a build tag like
 * `1.1.0-beta.1` compares as `1.1.0` and never prompts an upgrade that is
 * actually a downgrade.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] =>
    versionFromTag(value)
      .split(/[.+-]/)
      .map((piece) => Number.parseInt(piece, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function parse(raw: RawRelease): AppRelease | null {
  const tag = (raw.tag_name ?? "").trim();
  if (tag === "") return null;
  const version = versionFromTag(tag);
  if (!/^\d+(\.\d+)*$/.test(version)) return null;

  // The APK asset first, then the page: a release without a build is still a
  // valid "what changed" answer, it just has nothing to install.
  const asset = (raw.assets ?? []).find((item) => /\.apk$/i.test(item.name ?? ""));
  return {
    version,
    tag,
    page: raw.html_url ?? RELEASE_PAGE,
    apk: asset?.browser_download_url ?? "",
    notes: (raw.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 1200),
    published: raw.published_at ?? "",
  };
}

/** The newest release, read from GitHub. `null` when it cannot be read. */
export async function fetchLatestRelease(): Promise<AppRelease | null> {
  try {
    const raw = await fetchJson<RawRelease>(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      timeout: 9000,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "BEUConnect",
      },
    });
    if (raw?.draft === true || raw?.prerelease === true) return null;
    return parse(raw);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- state */

/** The last release this phone saw; `null` until a check has ever succeeded. */
export const latestRelease = signal<AppRelease | null>(null);
/** `true` while a check is in flight, so a button can say "Checking…". */
export const checking = signal(false);
/** When the last completed check ran, successful or not; 0 before the first. */
export const lastCheckAt = signal(0);

let started = false;

/**
 * Checks GitHub at most once per `CHECK_MAX_AGE`.
 *
 * `force` is the Settings row: it ignores the freshness window but still caches
 * the answer, so a student tapping it twice does not spend two API calls.
 */
export async function checkForUpdates(force = false): Promise<AppRelease | null> {
  if (checking()) return latestRelease();
  checking.set(true);
  try {
    const saved = await readStore<{ at: number; release: AppRelease | null } | null>(CHECK_KEY, null);
    if (!force && saved !== null && Date.now() - saved.at < CHECK_MAX_AGE) {
      latestRelease.set(saved.release);
      lastCheckAt.set(saved.at);
      return saved.release;
    }
    const release = await fetchLatestRelease();
    lastCheckAt.set(Date.now());
    if (release !== null || saved === null) {
      latestRelease.set(release);
      void writeStore(CHECK_KEY, { at: Date.now(), release });
    }
    return release;
  } finally {
    checking.set(false);
  }
}

/** Once per launch, in the background: whatever the answer, no screen waits on it. */
export function startUpdateCheck(): void {
  if (started) return;
  started = true;
  void checkForUpdates(false);
}

/** The version to upgrade to, or "" when this build is current or newer. */
export function availableVersion(release: AppRelease | null = latestRelease()): string {
  if (release === null) return "";
  return compareVersions(release.version, APP_VERSION) > 0 ? release.version : "";
}

/** Where an update installs from: the APK asset, else the release page. */
export function updateUrl(release: AppRelease | null = latestRelease()): string {
  if (release === null) return RELEASE_PAGE;
  return release.apk !== "" ? release.apk : release.page;
}

/* ------------------------------------------------------------------- share */

/**
 * What one student sends another. Short on purpose: a WhatsApp message that
 * fits two lines on a phone is read; a paragraph is scrolled past. The URL is
 * the always-current APK, not the release page, so the receiver taps once.
 */
export function shareMessage(): string {
  return `BEUConnect — syllabus, previous papers, results, rank and attendance for BEU students. Free, no login, works offline.\n\nDownload: ${APK_URL}`;
}

/** `wa.me/?text=` opens the WhatsApp app on Android, or WhatsApp Web without it. */
export function whatsappShareUrl(): string {
  return `https://wa.me/?text=${encodeURIComponent(shareMessage())}`;
}

/** The same text for a chat that is not WhatsApp. */
export function shareText(): string {
  return shareMessage();
}
