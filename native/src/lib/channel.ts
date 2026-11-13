/**
 * Which channel this build belongs to: the GitHub APK or Google Play.
 *
 * The screens are the same; the rules are not. On GitHub the APK is the
 * product, so the app shares its own download link and checks for a newer
 * build. Play prohibits exactly that — an app distributed by Play may not
 * update itself or point at an APK outside Play — so `App.play.tsx` switches
 * this before the shell mounts and the share text becomes the listing instead.
 *
 * A plain module variable, not a signal: it is set once before `boot()` and
 * never changes while the app runs.
 */

export type Channel = "github" | "play";

/** The listing a Play build points at wherever an APK build points at GitHub. */
export const PLAY_LISTING = "https://play.google.com/store/apps/details?id=org.beuconnect.app";

let current: Channel = "github";

export function setChannel(channel: Channel): void {
  current = channel;
}

export function channel(): Channel {
  return current;
}

export function isPlay(): boolean {
  return current === "play";
}
