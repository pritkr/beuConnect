# `android` — the custom Android host

The stock `nsh package` host cannot show a PDF (Android WebView has no PDF
viewer), so BEUConnect builds its own host. This folder is that host's source:
the manifest, resources, and the native components registered into nsh.

## What is here

| Path | Owns |
|---|---|
| `AndroidManifest.xml` | package, permissions, activity, `extractNativeLibs` |
| `java/com/longbridge/nsh/*.java` | native components (`PdfPageView`, `AskAiComponent`) |
| `res/` | icon, strings, theme resources |

The package id is `org.beuconnect.app` and must match `nsh.json` `id`. The
activity is `com.longbridge.nsh.MainActivity`; do not rename or re-parent it.

## Rules

- **No Gradle.** The host is compiled by `scripts/build-android-host.sh` with
  `aapt2`, `javac`, `d8`, `zipalign`, `apksigner` against
  `~/.nsh/embed/android/nsh.aar`. `classes.jar` from that AAR must go to `d8`
  or the app dies at launch with `NoClassDefFoundError`.
- **Build through the script.** `./scripts/package-android.sh` and
  `./scripts/release.sh` are the two entry points; they run the check gate and
  then this host.
- **A new component is a capability.** It is registered in the host and, if it
  touches the network or a WebView, the host belongs in `nsh.json`
  `capabilities`.
- **`extractNativeLibs` stays true.** The slim APK depends on install-time
  extraction; flipping it back makes the download ~50 MB.
- **No secrets.** Release keystores, `.env`, `.dev.vars` and tokens stay out of
  this folder and out of git.
- **Test on a device or emulator**, not just the macOS host: `adb devices`,
  `./scripts/android.sh log`, `./scripts/android.sh shot`.

## Files that matter

`PdfPageView.java` — one continuous column of `PdfRenderer` pages, drag/fling
scroll, pinch/double-tap zoom, save to `Downloads/BEUConnect/`.
`AskAiComponent.java` — `ACTION_SEND` chooser for "Ask AI"; invisible view,
command only. It needs no package names, so a new assistant works immediately.

See `docs/ANDROID.md` for the toolchain, signing and troubleshooting.
