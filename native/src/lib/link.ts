/**
 * Handing a link to another app.
 *
 * `openUrl` fires an `ACTION_VIEW` intent on Android and the equivalent
 * elsewhere; `nsh.json` grants only the schemes it lists
 * (`capabilities.openUrl.schemes`). Since 0.4 it reports `{ opened }` and
 * rejects when the scheme is not granted, which is the case callers handle by
 * copying the link instead — so this wrapper answers "did the handoff happen?"
 * rather than throwing at every call site.
 */

import { openUrl } from "nsh";

/** Opens a link in the device's browser; false means "copy it instead". */
export async function openExternal(url: string): Promise<boolean> {
  try {
    const { opened } = await openUrl(url);
    return opened;
  } catch {
    return false;
  }
}
