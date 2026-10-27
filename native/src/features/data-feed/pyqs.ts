/**
 * Live PYQ payloads. Each one is independently optional: a new paper index
 * applies even if the GATE list did not change (or failed to download), because
 * the app falls back to the bundled text for anything absent.
 */

import { BUNDLED } from "./bundled";
import { activeFeed } from "./store";

export { dataVersion } from "./store";

type Kind = "catalog" | "pdfs" | "gate";

function live(kind: Kind): string | null {
  const active = activeFeed();
  if (!active) return null;
  const file = active.manifest.pyqs[kind];
  if (file.h === BUNDLED.pyqs[kind]) return null;
  return active.files.get(file.h) ?? null;
}

/** BEU subject/paper catalog, or null when the bundled copy is current. */
export function liveCatalogRaw(): string | null {
  return live("catalog");
}

/** BEU PDF index, or null when the bundled copy is current. */
export function livePdfRaw(): string | null {
  return live("pdfs");
}

/** GATE paper list, or null when the bundled copy is current. */
export function liveGateRaw(): string | null {
  return live("gate");
}
