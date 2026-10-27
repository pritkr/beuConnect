/**
 * Handing a link to another app.
 *
 * `openUrl` (nsh 0.3.0) fires an `ACTION_VIEW` intent on Android and the
 * equivalent elsewhere; `nsh.json` grants only the schemes it lists
 * (`capabilities.openUrl.schemes`). It throws when no app can take the link or
 * the scheme is not granted, which is the case callers handle by copying the
 * link instead — so this wrapper answers "did the handoff happen?" rather than
 * throwing at every call site.
 */

import { openUrl } from "nsh";

/** Opens a link in the device's browser; false means "copy it instead". */
export async function openExternal(url: string): Promise<boolean> {
  try {
    return await openUrl(url);
  } catch {
    return false;
  }
}
