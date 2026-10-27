# Android build and install

The APK is **12,110,647 B (12.11 MB)** — arm64, stripped, deflated, signed with
the release key — built by `scripts/package-android.sh` and measured by
`scripts/size-report.sh`. Details of where the bytes go: `docs/SIZE.md`.

The release key is not the debug key. Every APK shared over WhatsApp must be
signed with the same key, or the next version cannot install over it.

## 1. What you need

| Piece | Why | Where |
|---|---|---|
| JDK 21 | `apksigner` runs on it | `~/.config/nsh/env.sh` exports `JAVA_HOME` |
| Android SDK, build-tools | `zipalign`, `apksigner`, `aapt2` | `$ANDROID_HOME/build-tools/<newest>` |
| Android NDK | `llvm-strip` | `$ANDROID_HOME/ndk/<newest>` |
| `~/.config/beuconnect/signing.env` | release signing identity | created by `scripts/signing.sh` |
| platform-tools | `adb` | `$ANDROID_HOME/platform-tools` |
| a phone or an arm64 AVD | to run it | USB debugging on, or an emulator |

```sh
source ~/.config/nsh/env.sh       # JDK, SDK, NDK, adb on PATH (once per shell)
adb devices                       # your phone must be listed as "device"
```

If the SDK pieces are missing:

```sh
sdkmanager "platform-tools" "build-tools;35.0.1" "ndk;28.2.13676358"
```

Any NDK version works — the script takes the newest under `$ANDROID_HOME/ndk`.
If the release identity is missing on this machine, restore
`~/.config/beuconnect/` from its backup. Creating a *new* one is only correct
for a fork: it changes the certificate, so the old app must be uninstalled and
its local data is lost. `scripts/signing.sh` creates one when none exists and
prints the certificate fingerprint to keep.

## 2. Build it

```sh
./scripts/package-android.sh            # arm64-v8a, the phone build → .nsh/out/BEUConnect.apk
./scripts/package-android.sh x86_64     # Intel emulator
./scripts/package-android.sh all        # universal, ~50 MB, testing only
INSTALL=1 ./scripts/package-android.sh  # build, adb install, launch
```

`package-android.sh` runs the compile gate, then `build-android-host.sh`, which
is the only Android build path. `nsh package` alone produces the ~50 MB universal
APK: both ABIs, and — because its manifest says `extractNativeLibs="false"` — the
32.28 MB runtime stored uncompressed. The app's own bundle is ~2.5 MB, so the host
build replaces everything around it:

1. **Bundle once.** `nsh package App.tsx --target android -o .nsh/out/raw`; only
   `assets/nsh/*` is kept. The manifest, resources and signature are the host's,
   not the stock shell's.
2. **Build the host.** `aapt2 compile` + `link` against
   `android/AndroidManifest.xml` and `android/res`; `javac` the classes under
   `android/java` with `classes.jar` from `nsh.aar` on the classpath; `d8` both
   into `classes.dex`. §2.1 explains why.
3. **Keep one ABI** (`arm64-v8a`). arm64 is every current Android phone, and an
   Apple Silicon emulator is arm64 too, so nothing is lost in development. The
   other ABI's runtime is a second copy of the same 24.70 MB.
4. **`llvm-strip --strip-unneeded libnsh.so`** — 32.28 → 24.70 MB. Symbol names
   are not needed at runtime; the unstripped library stays in
   `~/.nsh/runtime/android/release/lib/<abi>/libnsh.so` if a native stack ever
   needs reading.
5. **Re-zip, align, sign.** `zip -9` deflates the library 24.70 → 11.06 MB;
   `resources.arsc` is added stored (`-0`) because Android mmaps it and targetSdk
   30+ expects it aligned; then `zipalign -f 4` and `apksigner sign` with the
   debug key.

The host manifest sets `android:extractNativeLibs="true"`, which is what permits
step 5's deflate: Android extracts the library at install time instead of mmapping
it out of the APK. The stock manifest sets it to `false`; keeping that leaves the
runtime stored and the APK near 50 MB.

The result is 11.98 MB instead of 50 MB and installs identically; the only
difference is the install-time extraction. 92.3% of the download is the runtime,
so going lower means a custom runtime built without unused engine features
(investigated, not implemented — `docs/SIZE.md`).

### 2.1 The custom host, and the PDF page

`scripts/package-android.sh` delegates to `scripts/build-android-host.sh`, which
builds BEUConnect's own Android host instead of the stock runtime shell. The
host is why Notes can open a PDF: Android's WebView has no PDF viewer, so the
stock runtime could only hand the file to Google Docs or leave a blank frame.
`android/java/com/longbridge/nsh/PdfPageView.java` registers a `PdfPage`
component backed by `android.graphics.pdf.PdfRenderer`: one continuous column of
pages, drag and fling to scroll, pinch and double tap to zoom, and a save that
writes the file to `Downloads/BEUConnect/`. No WebView, no JavaScript viewer, no
server-side rendering.

`android/java/com/longbridge/nsh/AskAiComponent.java` registers the `AskAi`
bridge: an invisible view whose only job is `ACTION_SEND` with the prompt, so
Android's own chooser decides which assistant opens it. `src/ui/ask-ai.tsx`
mounts it once in the shell.

The host is compiled with `aapt2`, `javac`, `d8`, `zipalign` and `apksigner`
against `~/.nsh/embed/android/nsh.aar` — no Gradle — and reuses the bundle and
assets `nsh package` produces. `nsh.aar`'s `classes.jar` must be passed to `d8`
alongside the host classes, or the app dies at launch with
`NoClassDefFoundError: com/longbridge/nsh/DevActivity`.

The build and package scripts source `~/.config/beuconnect/signing.env`, so
`./scripts/package-android.sh` signs with the release key with no arguments. To
point at another keystore for one run:

```sh
KEYSTORE=~/keys/beuconnect.jks KEY_ALIAS=beuconnect KEY_PASS='…' \
  ./scripts/package-android.sh
```

## 3. Install and launch

```sh
adb install -r .nsh/out/BEUConnect.apk
adb shell am start -n org.beuconnect.app/com.longbridge.nsh.MainActivity
```

`-r` replaces an existing install that has the same signature. Or in one step:
`INSTALL=1 ./scripts/package-android.sh` (the script runs exactly those two
commands). The application id comes from `nsh.json` (`id`) and must match
`package` in `android/AndroidManifest.xml`; the launcher activity is that
manifest's `com.longbridge.nsh.MainActivity`. Do not hand-write a different one.

Device checks after launch:

```sh
./scripts/android.sh shot     # screencap → /tmp/beuconnect.png
./scripts/android.sh log      # nsh + AndroidRuntime logcat
```

## 4. Four common failures

| Symptom | Cause | Fix |
|---|---|---|
| `missing: …/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip` | no NDK under `$ANDROID_HOME/ndk` | `sdkmanager "ndk;28.2.13676358"`, re-source `env.sh`, or set `ANDROID_NDK_HOME` |
| `no lib/arm64-v8a in the runtime`, or `INSTALL_FAILED_NO_MATCHING_ABIS` on the device | the ABI you asked for is not in the prebuilt, or the APK's ABI does not match the device (arm64 APK on an x86_64 emulator) | list what exists: `unzip -l .nsh/out/raw/BEUConnect.apk \| grep lib/`, then build for a name in that list: `arm64-v8a` (phone), `x86_64` (Intel emulator) or `all` (universal check build) |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | the installed app was signed with a different key (the debug keystore was regenerated) | `adb uninstall org.beuconnect.app`, then install; keep one keystore to avoid it |
| "The portal did not load." on `results.portal` | a WebView host is missing from `nsh.json` | add it to `capabilities.webview.hosts` and rebuild |

### 4.1 The strip path says `darwin-x86_64` on an Apple Silicon Mac

That is correct. The NDK ships one `darwin-x86_64` prebuilt directory for both
Mac architectures; the binaries are universal. Do not "fix" the path.

### 4.2 Wrong ABI

`./scripts/package-android.sh all` always works because it keeps every ABI, and
is the fastest way to tell an ABI problem from a code problem. It is not the
shipping artifact: it is ~50 MB.

### 4.3 Signature mismatch

The release key identifies the app, not one machine. If it was lost and a new
one was generated, the new APK cannot replace the old install; the package
manager refuses before it touches data. Uninstalling loses the app's local
Storage (profile, attendance, routine, saved results), so keep
`~/.config/beuconnect/` in a backup and in a password manager. The same rule
applies to every APK sent over WhatsApp: same key, or the update needs a
manual uninstall.

### 4.4 "The page did not load."

The WebView refuses a host it was not granted, before any request is made. The
result page needs its own hosts, Cloudflare Turnstile, plus the reCAPTCHA
endpoints the older portal uses:

```jsonc
"webview": { "hosts": [
  "beu.prit.eu.org",
  "beu-bih.ac.in", "www.beu-bih.ac.in",
  "beu.ac.in", "www.beu.ac.in",
  "challenges.cloudflare.com",
  "www.google.com", "www.gstatic.com", "recaptcha.google.com",
  "docs.google.com", "docs.googleusercontent.com", "ssl.gstatic.com"
] }
```

`capabilities.network.hosts` is separate and only covers native `fetch`
(`beu.prit.eu.org`, `beu-bih.ac.in`, `rptbalyjcevtxoxyvzli.supabase.co` for
GECS attendance). A missing webview host is a configuration bug, not a network
failure: retrying, clearing cache or reinstalling cannot fix it — edit
`nsh.json`, rebuild, reinstall.
