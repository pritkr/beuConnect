/**
 * Getting something out of the app and into another one.
 *
 * `Share` is the system sheet: on Android it is every app the student has,
 * which is the whole point of a share button. It is not everywhere — the
 * desktop hosts, and a browser without `navigator.share`, answer `false` and
 * reject with `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` — so every caller needs the
 * same two-step: try the sheet, copy the line where there is none. This module
 * is that two-step, and it answers *which route it took* instead of throwing,
 * the same bargain `openExternal` makes for `openUrl`.
 *
 * Three rules:
 *
 *  1. **Nothing here throws.** A share button that fails is worse than a share
 *     button that copies; a screen must never see an error from it.
 *  2. **The clipboard is the fallback, not the failure.** A sheet that refuses
 *     the content (a relative URL, an empty body) still ends with one copied
 *     line, which is what these buttons did before the sheet existed.
 *  3. **Dismissing is a decision.** The student closed the sheet; the caller
 *     stays quiet rather than apologising for it.
 */

import { Clipboard, Share, type ShareContent } from "nsh";

/** How a share ended: the sheet took it, the student closed it, or the clipboard did. */
export type ShareOutcome = "shared" | "dismissed" | "copied" | "failed";

export interface ShareInput {
  /** A subject line where the target has one (mail, Android's chooser). */
  title?: string;
  /** The line or block to share, exactly as the screen shows it. */
  text?: string;
  /** A link: an absolute `https:` / `http:` / `mailto:` address, shared as a link. */
  url?: string;
}

/** The two link kinds a screen here actually has. */
const LINK = /^(https?:\/\/|mailto:)/i;

function line(value: string | undefined): string {
  return (value ?? "").replace(/[ \t]+$/gm, "").trim();
}

/** The URL as a link, or null for anything a share target cannot open. */
export function shareableUrl(url: string | undefined): string | null {
  const value = line(url);
  return value !== "" && LINK.test(value) ? value : null;
}

/**
 * What the clipboard gets: the title, the link, then the note after a blank
 * line. A part that is not there takes its line with it, so a missing link can
 * never leave a stray blank line in the middle of the text.
 */
export function shareText(input: ShareInput): string {
  const title = line(input.title);
  const link = line(input.url);
  const note = line(input.text);
  const head = [title, link].filter((part) => part !== "").join("\n");
  if (head === "") return note;
  return note === "" ? head : `${head}\n\n${note}`;
}

/**
 * The sheet's own split: a subject, a body and a link, with no line repeated.
 * A link the sheet cannot take is still text, so it rides in the body instead
 * of disappearing; with nothing but a title to say, the title is the body.
 */
export function shareContent(input: ShareInput): ShareContent {
  const title = line(input.title);
  const url = shareableUrl(input.url);
  const body = [line(input.text), url === null ? line(input.url) : ""]
    .filter((part) => part !== "")
    .join("\n");
  const text = body !== "" ? body : url !== null ? "" : title;
  return {
    title: title === "" ? null : title,
    text: text === "" ? null : text,
    url,
  };
}

let probe: Promise<boolean> | null = null;

/** Whether this host has a sheet; the answer cannot change while the app runs. */
function shareAvailable(): Promise<boolean> {
  if (probe === null) probe = Share.available().catch(() => false);
  return probe;
}

/**
 * Share it if the device can, copy it if it cannot.
 *
 * Everything the sheet can answer with is handled here: `"shared"` and
 * `"dismissed"` are the student's business and leave the screen alone, while
 * no sheet, no capability, content the sheet refuses and a clipboard that is
 * missing all come back as a plain outcome. The caller says "Copied" only when
 * the answer is `"copied"`, and nothing at all after a sheet.
 */
export async function shareOrCopy(input: ShareInput): Promise<ShareOutcome> {
  const content = shareContent(input);
  if (content.title !== null || content.text !== null || content.url !== null) {
    try {
      if (await shareAvailable()) {
        const result = await Share.show(content);
        if (result.action === "shared") return "shared";
        if (result.action === "dismissed") return "dismissed";
      }
    } catch {
      /* No sheet on this host, or it would not take this: copy it instead. */
    }
  }
  const text = shareText(input);
  if (text === "") return "failed";
  try {
    await Clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
