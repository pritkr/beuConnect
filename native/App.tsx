/**
 * The app entry point — and the only place that runs before the shell exists.
 *
 * Two things happen here, in this order:
 *
 *  1. The saved appearance is applied, so a student who chose dark never sees a
 *     light flash on launch. `setColorScheme` is device-wide and idempotent;
 *     "system" is left alone because it is already the platform default.
 *  2. The shell mounts. Nothing else belongs in this file — feature folders own
 *     everything below it.
 *
 * The read is best-effort: storage that fails must never stop the app from
 * starting, so both the success and failure paths mount exactly once.
 */

import { mount, setColorScheme } from "nsh";

import { readStore } from "./src/lib/net";
import { Shell } from "./src/app/shell";

type Scheme = "light" | "dark" | "system";

let mounted = false;

function start(): void {
  if (mounted) return;
  mounted = true;
  mount(Shell);
}

void readStore<Scheme>("appearance", "system")
  .then((scheme) => {
    if (scheme === "light" || scheme === "dark") setColorScheme(scheme);
  })
  .catch(() => {
    /* a corrupt or unavailable preference is not worth a failed launch */
  })
  .then(start, start);
