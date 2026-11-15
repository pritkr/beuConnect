# Android build and install

The APK is **17,479,740 B (17.48 MB)** — arm64, stripped, deflated, signed with
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
| `~/.config/beuconnect/upload.env` | Play upload key identity | created by `scripts/signing.sh --upload` |
| platform-tools | `adb` | `$ANDROID_HOME/platform-tools` |
| a phone or an arm64 AVD | to run it | USB debugging on, or an emulator |

```sh
source ~/.config/nsh/env.sh       # JDK, SDK, NDK, adb on PATH (once per shell)
adb devices                       # your phone must be listed as "device"
```

If the SDK pieces are missing:

```sh
sdkmanager "platform-tools" "build-tools;36.1.0" "platforms;android-36" "ndk;28.2.13676358"
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
./scripts/package-android.sh all        # every ABI, testing only
INSTALL=1 ./scripts/package-android.sh  # build, adb install, launch
```

`package-android.sh` runs the compile gate, then `build-android-host.sh`, which
is the only Android build path. The stock `nsh package` host is only a staging
step: its APK carries every ABI and — because its manifest says
`extractNativeLibs="false"` — stores each ABI's runtime uncompressed. The host
build replaces everything around the bundle:

1. **Bundle once.** `nsh package App.tsx --target android -o .nsh/out/raw`; only
   `assets/nsh/*` is kept. The manifest, resources and signature are the host's,
   not the stock shell's.
2. **Build the host.** `aapt2 compile` + `link` against
   `android/AndroidManifest.xml` and `android/res`; `javac` the classes under
   `android/java` with `classes.jar` from `nsh.aar` on the classpath; `d8` both
   into `classes.dex`. §2.1 explains why.
3. **Keep one ABI** (`arm64-v8a`). arm64 is every current Android phone, and an
   Apple Silicon emulator is arm64 too, so nothing is lost in development. Every
   additional ABI adds another copy of the same engine.
4. **`llvm-strip --strip-unneeded libnsh.so`** — 56,017,848 → 32,266,536 B.
   Symbol names are not needed at runtime; the cargo artifact with them stays in
   `~/.nsh/source/target/<triple>/release/libnsh.so` if a native stack ever needs
   reading.
5. **Re-zip, align, sign.** `zip -9` deflates the library 32.27 → 13.27 MB;
   `resources.arsc` is added stored (`-0`) because Android mmaps it and targetSdk
   30+ expects it aligned; then `zipalign -f 4` and `apksigner sign` with the
   release key from `~/.config/beuconnect/signing.env`.

The host manifest sets `android:extractNativeLibs="true"`, which is what permits
step 5's deflate: Android extracts the library at install time instead of mmapping
it out of the APK. The stock manifest sets it to `false`, so the stock host's
staging APK stores every ABI's runtime uncompressed.

The result is 17.48 MB for the phone build, 43.10 MB unpacked. It installs
identically; the only difference is the install-time extraction. 76% of the
download is the runtime, which is itself built from the app's feature set (see
§2.1) — the app-side bytes are `classes.dex` 3.09 MB, the bundle 0.71 MB and
resources 0.37 MB.

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
against `nsh.aar` — no Gradle — and reuses the bundle and assets `nsh package`
produces. `nsh.aar`'s `classes.jar` must be passed to `d8` alongside the host
classes, or the app dies at launch with
`NoClassDefFoundError: com/longbridge/nsh/DevActivity`.

The Java is deliberately small: 11 files, ≈3,160 lines, all under
`android/java/com/longbridge/nsh/` (`MainActivity`, the PDF page and its
renderer, the Ask AI share bridge, the Wi-Fi sign-in service, notifications and
the messaging service). Everything a student sees is TSX; Java exists only for
the platform APIs JSX cannot reach (PdfRenderer, `ACTION_SEND`, the Wi-Fi
receiver, FCM, notification channels).

Until nsh 0.4 the installer's tarball carried that AAR at
`~/.nsh/embed/android/nsh.aar`. Since 0.5 the embedding SDKs are a release asset
of their own, so an updated CLI leaves the path empty; `build-android-host.sh`
falls back to `scripts/fetch-nsh-embed.sh`, which downloads the AAR matching the
installed `nsh --version` into
`${XDG_CACHE_HOME:-~/.cache}/beuconnect/nsh-embed/v<version>/nsh.aar` and checks
the release's sha256. `NSH_AAR` still overrides both, for
`build-nsh-from-source.sh`.

The AAR's `libnsh.so` is no longer the one that ships. Since `nsh` on `main`
after 0.5.1 (`longbridge/nsh#2060`) `nsh package --target android`
cross-compiles the app's own library with only the native features its bundle
can reach: `shader` (wgpu), `term`, `editor`, `rich-editor`, `plot` and
`emoji-picker` drop out because nothing imports them, `TextView` keeps
`highlight` and `math`, and `js`, `net` and `svg` always stay.
`build-android-host.sh` takes that library from the APK `nsh package` just
wrote and falls back to the AAR's prebuilt one — every feature — only when the
app's did not build. Building it needs `cargo` and the NDK (the script exports
both); without them the CLI warns and the APK keeps the old, full runtime.

Two environment variables decide *which* `nsh` does that, and both exist because
a second install on `PATH` silently changes the answer. `NSH_BIN` names the
binary to package with (`NSH_BIN=~/.nsh/bin/nsh ./scripts/build-android-host.sh`);
`fetch-nsh-embed.sh` reads the same variable, so the AAR and the CLI are always
the same release. A build from a source checkout looks for its runtime next to
`target/release`, not in `~/.nsh/runtime`, and a missing one makes it rebuild
the whole prebuilt runtime for every ABI with every feature: symlink the
installed one instead —

```sh
mkdir -p ~/.nsh/source/target/runtime/android
ln -sfn ~/.nsh/runtime/android/release ~/.nsh/source/target/runtime/android/release
ln -sfn ~/.nsh/runtime/android/dev     ~/.nsh/source/target/runtime/android/dev
```

Do not set `NSH_RUNTIME` for this: `package.rs` treats it as "a prebuilt runtime
was asked for" and skips the app's own library, so the APK quietly ships the
full runtime again.

**The Java runtime must be the same commit as the library.** `nsh package`
builds only the Rust half; `classes.jar` still comes from the AAR. A library from
`main` paired with 0.5.0's `classes.jar` starts and then dies on the first
mount with

```
java.lang.IllegalStateException: nsh: unknown mount opcode -1
    at com.longbridge.nsh.Mounter.apply(Mounter.java:608)
```

because the newer Rust emits a mount opcode the older Java does not know. Build
both from one checkout: `cargo xtask android --release --abi arm64-v8a` writes
`target/android/release/classes.jar`, and the host build accepts it through an
AAR made from that directory (`NSH_AAR=… ./scripts/build-android-host.sh`). The
release AAR (`nsh-embed-android.zip`) is only an option once a tagged release
contains the trim.

The build and package scripts source `~/.config/beuconnect/signing.env`, so
`./scripts/package-android.sh` signs with the release key with no arguments. To
point at another keystore for one run:

```sh
KEYSTORE=~/keys/beuconnect.jks KEY_ALIAS=beuconnect KEY_PASS='…' \
  ./scripts/package-android.sh
```

#### The Firebase runtime, and the two traps in it

`android/deps/build.gradle.kts` exists only to resolve FCM's dependency tree;
`scripts/fetch-android-libs.sh` copies the result into `android/libs` and the
host build treats that directory as a classpath. Gradle is not building the app,
and two things follow from that:

- **Library R classes.** A library's code refers to its own `R` — play-services
  reads `google_app_id` through `com.google.android.gms.common.R$string`. Gradle
  generates one `R.java` per AAR; aapt2 only does that for the app package unless
  each package is named with `--extra-packages`, so the build collects the
  packages the jars actually import. Miss one and the app dies at launch inside
  `FirebaseInitProvider` with `NoClassDefFoundError`.
- **`-android` artifacts.** Multiplatform modules publish a JVM and an Android
  variant, and without the Android plugin Gradle picks the JVM one. They are not
  the same code: `datastore-preferences` ships `PreferenceDataStoreDelegateKt`
  and `SharedPreferencesMigration` only in `datastore-*-android`, so a JVM-only
  graph crashes on the first disk read. The fetch script upgrades the four
  datastore modules and drops their JVM jars (both would be a duplicate class in
  d8).

After bumping `firebase-messaging`, install and open the app once and confirm
`FirebaseApp initialization successful` in `adb logcat`; both traps above fail
before anything is drawn.

### 2.2 When something fails

The app has three layers of containment:

| Layer | Where | What the student sees |
|---|---|---|
| One screen | `ScreenBoundary` in `src/app/crash.tsx`, mounted by the shell around every route | the header, the route name, "Go back" and "Try again" |
| The shell | `RootCrash` in `src/app/root.tsx`, mounted by `boot.ts` | "BEUConnect hit a problem", "Reopen" |
| The bundle | `MainActivity`'s `setErrorListener` → a native panel | "BEUConnect could not start", "Reopen" |

`qa/crash.test.tsx` covers the first two; the native panel is the last line when
the bundle itself cannot load.

`nsh` has no global JavaScript error hook, so an exception that escapes every
boundary ends the JS context; the root boundary is what keeps that from being a
blank window for most failures. Timers have no boundary above them at all, so
`boot.ts` calls `guardTimers()` (`src/lib/timers.ts`) before anything else: it
wraps `setTimeout`, `setInterval`, `requestAnimationFrame` and `queueMicrotask`
to log a throw and let the app keep running.

`PdfPageView` is the other native surface that can kill the process: an
uncaught exception on its `io` executor is fatal. Every task goes through
`submit()` (a closed view drops the work instead of throwing
`RejectedExecutionException`), `render()` and `download()` catch `Throwable` (a
damaged page is blank, not a crash), and `onDraw` loses a frame instead of the
app.

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
| `no lib/ for ABI arm64-v8a`, or `INSTALL_FAILED_NO_MATCHING_ABIS` on the device | the ABI you asked for is not in the prebuilt, or the APK's ABI does not match the device (arm64 APK on an x86_64 emulator) | list what exists: `unzip -l .nsh/out/raw/BEUConnect.apk \| grep lib/`, then build for a name in that list: `arm64-v8a` (phone), `x86_64` (Intel emulator) or `all` (universal check build) |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | the installed app was signed with a different key (the release key changed, or the old install is debug-signed) | `adb uninstall org.beuconnect.app`, then install; keep one keystore to avoid it |
| "The portal did not load." on `results.portal` | a WebView host is missing from `nsh.json` | add it to `capabilities.webview.hosts` and rebuild |

### 4.1 The strip path says `darwin-x86_64` on an Apple Silicon Mac

That is correct. The NDK ships one `darwin-x86_64` prebuilt directory for both
Mac architectures; the binaries are universal. Do not "fix" the path.

### 4.2 Wrong ABI

`./scripts/package-android.sh all` always works because it keeps every ABI, and
is the fastest way to tell an ABI problem from a code problem. It is not the
shipping artifact: it carries three runtimes.

### 4.3 Signature mismatch

The release key identifies the app, not one machine. If it was lost and a new
one was generated, the new APK cannot replace the old install; the package
manager refuses before it touches data. Uninstalling loses the app's local
Storage (profile, attendance, routine, saved results), so keep
`~/.config/beuconnect/` in a backup and in a password manager. The same rule
applies to every APK sent over WhatsApp: same key, or the update needs a
manual uninstall.

### 4.4 "The BEU page did not load."

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

## 5. Campus Wi-Fi sign-in

BEU's Omada portal drops a client when the session ages out, when the data
quota resets, or when the phone reconnects. BEUConnect puts it back without the
student opening anything.

| File | Role |
|---|---|
| `WifiAutoLogin.java` | the whole portal client: probe, discover the entry URL, `getPortalPageSetting`, authenticate, verify |
| `WifiAutoLoginJob.java` | a persisted `JobScheduler` job, 15 minutes, network-required, plus a one-shot check and a wake lock |
| `WifiAutoLoginComponent.java` | the `WifiAuto` bridge: `status`, `save`, `check`; emits `state`; a 90 s in-app loop and a Wi-Fi callback |
| `WifiBootReceiver.java` | re-arms the job after a reboot and after the app is updated |

Why Java and not TSX: the job runs with the app closed, where the QuickJS
bundle is not loaded. Nothing in the background path touches JavaScript. The
screen (`src/features/tools/wifi.tsx`) is only a control surface — if it never
mounts, the job still runs from `SharedPreferences` (`beu_wifi_auto`).

**When it runs.** On first launch the shell mounts the bridge, which saves the
defaults and arms the job — opening the app once is enough. While the process
is alive it checks every 90 s when online, 15–60 s while it is failing, and
immediately when a Wi-Fi network appears. After the process dies, Android runs
the job about every 15 minutes, later in Doze. It never joins a network.

**What keeps it alive.** Four things, each covering a failure the others miss:

| Failure | Cover |
|---|---|
| the process dies | the persisted periodic job |
| the job is dropped by a reboot or an app update | `WifiBootReceiver` re-schedules and asks for one check 5 s later, instead of waiting 15 minutes |
| the phone sleeps mid-check | a `PARTIAL_WAKE_LOCK` held for the job's run — a `JobService` that hands its work to a thread holds no lock of its own once `onStartJob` returns |
| every phone retries at the same second | ±10 % jitter on the in-app delays |

A job is still deferred in Doze, and a force-stopped app has no jobs until it is
opened again. Both are Android policy; the app does not ask for a battery
exemption or keep a notification up for this.

**Failure handling.** The job never throws: `run` catches `Throwable`, the
worker always releases its lock and calls `jobFinished`, and `publish` writes
state and notifies the bridge independently so neither can lose the other. A
check that fails is retried by the next window, not by a hot loop. Connections
are explicitly `disconnect()`ed — `HttpURLConnection` is not `AutoCloseable`, so
a plain close would leave the socket to the collector.


**What it sends.** Only to the host the portal itself redirected to: the
client MAC, AP MAC, SSID and radio id from the entry URL, then the registration
number and password. TLS verification is relaxed for that host alone, because
Omada controllers ship a self-signed certificate. Cleartext HTTP is enabled
because the portal is a local page.

**The account.** `24105157049` / `123456` by default, both editable on the
screen. Nothing has to be typed: an unconfigured install counts as on, so
opening the app once saves the defaults and arms the job. With rotation on, an
"unknown local user" (`-41527`) makes the runner try two spread suffixes in
001–112 — the range the campus creates accounts in. `-41525` (wrong password)
stops immediately instead of hammering the portal.

**Checking it by hand:**

```sh
./scripts/android.sh log | grep -iE 'beu-wifi|JobScheduler'
adb shell dumpsys jobscheduler | grep -A4 org.beuconnect.app
```

The screen's "Check now" runs the same code path immediately and shows the
portal's own error sentence, so a wrong password is one tap away from being
visible.
