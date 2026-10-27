/**
 * The address a PDF actually loads from, per platform.
 *
 * Android's system WebView has no PDF viewer: it is a browser without the
 * Chrome app's PDF plugin, so pointing it at a `.pdf` paints an empty frame
 * and fires no error. The file has to be rendered by someone else and handed
 * back as HTML. Google's document viewer does that: it fetches the file from
 * its own servers, so it also sidesteps the CORS and `Content-Disposition`
 * headers an official BEU file server sends.
 *
 * WKWebView (iOS, macOS) and Edge WebView2 (Windows) render a PDF themselves,
 * and so does a browser on the web target; those platforms load the file
 * directly, which keeps the app's own host in the address and avoids a round
 * trip through a third party.
 *
 * The helper takes the OS as an argument rather than reading `platform` so the
 * rule is testable on the macOS host the test runner runs on.
 */

/** Platforms whose WebView paints a PDF by itself. Anything else is remote. */
const SELF_RENDERING = new Set(["ios", "macos", "windows", "web"]);

/** Google's embeddable viewer: the file is fetched server-side, HTML comes back. */
const VIEWER = "https://docs.google.com/viewer?embedded=true&url=";

/**
 * True when this platform's WebView cannot show a PDF on its own, so the file
 * has to be rendered remotely.
 */
export function needsRemotePdf(os: string): boolean {
  return !SELF_RENDERING.has(os.trim().toLowerCase());
}

/**
 * The URL to hand a `WebView` for `url` on `os`.
 *
 * Only `http(s)` is wrapped; anything else is returned untouched so the caller
 * can refuse it (the host check lives with the caller, which owns the allowlist).
 */
export function pdfViewSource(url: string, os: string): string {
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return value;
  if (!needsRemotePdf(os) || isViewerUrl(value)) return value;
  return `${VIEWER}${encodeURIComponent(value)}`;
}

/** True when `url` is already a remote-viewer address, so it is not wrapped twice. */
export function isViewerUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "docs.google.com";
  } catch {
    return false;
  }
}
