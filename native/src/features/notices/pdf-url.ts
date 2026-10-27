/**
 * Which links may open in the app's PDF frame — the pure half of `./pdf`.
 *
 * Kept apart from the screen so a list row can hint "PDF" without importing a
 * component (and without a parts → pdf → parts import cycle). The host lists
 * are the WebView allowlist in `nsh.json`, narrowed to the hosts a circular
 * actually lives on. `scope` widens "beu" to include the app's own host for
 * notes; nothing else about the allowlist changes.
 */

/**
 * Which hosts a PDF may load from. `beu` is the official university file
 * server; `notes` adds the app's own host, where handwritten notes live. Any
 * other host is refused natively instead of being fetched.
 */
export type PdfScope = "beu" | "notes";

const BEU_HOSTS = ["beu-bih.ac.in", "www.beu-bih.ac.in", "beu.ac.in", "www.beu.ac.in"];
const PDF_HOSTS: Record<PdfScope, Set<string>> = {
  beu: new Set(BEU_HOSTS),
  notes: new Set([...BEU_HOSTS, "beu.prit.eu.org"]),
};
const PDF_IN_TEXT = /https?:\/\/[^\s<>"'`)\]]+\.pdf(?:\?[^\s<>"'`)\]]*)?/gi;

/** The URL when it may load in the app's WebView, `null` when it may not. */
export function pdfUrl(raw: string, scope: PdfScope = "beu"): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return PDF_HOSTS[scope].has(host) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The first allowed PDF linked in a post's text, if there is one. */
export function postPdf(post: { excerpt: string; body: string[] }): string | null {
  const text = [post.excerpt, ...post.body].join("\n");
  for (const match of text.match(PDF_IN_TEXT) ?? []) {
    const safe = pdfUrl(match.replace(/[.,;:!?]+$/, ""));
    if (safe) return safe;
  }
  return null;
}
