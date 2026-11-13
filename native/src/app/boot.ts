/**
 * What runs before the shell exists — and the only code that does.
 *
 * Two things happen here, in this order:
 *
 *  1. The saved appearance is applied, so a student who chose dark never sees a
 *     light flash on launch. `setColorScheme` is device-wide and idempotent;
 *     "system" is left alone because it is already the platform default.
 *  2. The shell mounts. Nothing else belongs in this file — feature folders own
 *     everything below it.
 *
 * Both entry points call this: `App.tsx` for the GitHub APK, `App.play.tsx` for
 * the Play build, which sets the channel first.
 *
 * The read is best-effort: storage that fails must never stop the app from
 * starting, so both the success and failure paths mount exactly once.
 */

import { mount, setColorScheme } from "nsh";

import { readStore } from "../lib/net";
import { guardTimers } from "../lib/timers";
import { Root } from "./root";

type Scheme = "light" | "dark" | "system";

let mounted = false;

function start(): void {
  if (mounted) return;
  mounted = true;
  mount(Root);
}

export function boot(): void {
  // Before anything schedules a timer: a throw inside one has no boundary
  // above it and would end the JS context (see `src/lib/timers.ts`).
  guardTimers();
  void readStore<Scheme>("appearance", "system")
    .then((scheme) => {
      if (scheme === "light" || scheme === "dark") setColorScheme(scheme);
    })
    .catch(() => {
      /* a corrupt or unavailable preference is not worth a failed launch */
    })
    .then(start, start);
}
