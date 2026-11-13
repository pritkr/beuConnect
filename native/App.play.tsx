/**
 * The Play entry point: the same app with the channel set before the shell
 * mounts, which removes every off-Play update path (see `src/lib/channel.ts`).
 *
 * Build it with `ENTRY=App.play.tsx`; `scripts/bundle-android.sh` does that for
 * the AAB. Shipping this file's bundle from Play and the APK from GitHub is the
 * whole difference — no second `nsh.json`, no generated source.
 */

import { setChannel } from "./src/lib/channel";
import { boot } from "./src/app/boot";

setChannel("play");
boot();
