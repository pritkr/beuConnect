/**
 * The GitHub/APK entry point — the build that is shared as a file.
 *
 * It differs from `App.play.tsx` in one thing only: the channel stays
 * `"github"`, so Settings keeps the self-update row and the share link points
 * at the APK. The store build sets the channel before booting.
 */

import { boot } from "./src/app/boot";

boot();
