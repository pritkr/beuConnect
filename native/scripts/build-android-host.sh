#!/usr/bin/env bash
# BEUConnect's own Android host.
#
# The stock host (`nsh package`) cannot show a PDF: Android's WebView has no PDF
# viewer, so the app had to send files to Google Docs. This script builds the
# same standalone host with one registered native component, `PdfPage`, backed
# by android.graphics.pdf.PdfRenderer, plus a Downloads save. The APK it writes
# is the one to install; `package-android.sh` remains the stock-host build for
# comparison.
#
# Usage:
#   ./scripts/build-android-host.sh                 # arm64-v8a → .nsh/out/BEUConnect.apk
#   ./scripts/build-android-host.sh armeabi-v7a     # 32-bit phones → BEUConnect-armeabi-v7a.apk
#   ./scripts/build-android-host.sh all             # every ABI, for testing
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

ABI="${1:-arm64-v8a}"
ENTRY="${ENTRY:-App.tsx}"
SUFFIX="${SUFFIX:-}"
SDK="${ANDROID_HOME:-${ANDROID_SDK:-$HOME/Library/Android/sdk}}"
BUILD_TOOLS="$(find "$SDK/build-tools" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)"
NDK="${ANDROID_NDK_HOME:-${ANDROID_NDK:-}}"
if [ -z "$NDK" ] && [ -d "$SDK/ndk" ]; then
  NDK="$(find "$SDK/ndk" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)"
fi
HOST_TAG="$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64"
# The newest platform installed, not a pinned one: a build server and a laptop
# rarely have the same set, and `android-35` is a fine target for a `minSdk 28`
# app. The target SDK follows whichever platform is found.
PLATFORM="$(find "$SDK/platforms" -maxdepth 1 -mindepth 1 -type d -name 'android-*' | sort -V | tail -1)"
TARGET_SDK="${PLATFORM##*/android-}"
PLATFORM="$PLATFORM/android.jar"
AAPT2="$BUILD_TOOLS/aapt2"
D8="$BUILD_TOOLS/d8"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"
STRIP="$NDK/toolchains/llvm/prebuilt/$HOST_TAG/bin/llvm-strip"
# The NDK is the usual source of `llvm-strip`, but stripping an ELF is not
# Android-specific: a distro LLVM does it the same. Only when neither exists is
# the build missing a tool.
if [ ! -x "$STRIP" ] && command -v llvm-strip >/dev/null 2>&1; then
  STRIP="$(command -v llvm-strip)"
fi
# 0.4 and earlier put the AAR in the installer's tarball; 0.5 moved it to a
# release asset of its own, so an updated `nsh` leaves `~/.nsh/embed` empty.
# `NSH_AAR` (a build from source) wins; otherwise use the distribution's copy
# when it is there, and fetch the release's otherwise.
AAR="${NSH_AAR:-$HOME/.nsh/embed/android/nsh.aar}"
if [ ! -f "$AAR" ] && [ -z "${NSH_AAR:-}" ]; then
  AAR="$(./scripts/fetch-nsh-embed.sh)"
fi

# The version lives in exactly one place — `nsh.json` — and this reads it for
# the APK's versionCode/versionName. Hard-coding it here once already meant a
# 1.1.0 build reported itself as 1.0.0 to the in-app updater.
#
# `python3`, not `bun`: a build server that only has the Android SDK, a JDK and
# a Rust toolchain (F-Droid's, for one) still has python3, and this is the only
# line in the build that would otherwise need a JavaScript runtime.
read -r APP_VERSION APP_BUILD <<<"$(python3 -c 'import json; j = json.load(open("nsh.json")); print(j["version"], j["build"])')"
[ -n "${APP_VERSION:-}" ] && [ -n "${APP_BUILD:-}" ] || { echo "nsh.json has no version/build" >&2; exit 1; }

# A shared APK must upgrade itself. Signed with the debug key, every new
# machine's build is a different signer and Android refuses the install; a
# release key at a fixed path does not have that problem. The env file is
# created by `scripts/signing.sh` and is never committed.
if [ -f "$HOME/.config/beuconnect/signing.env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.config/beuconnect/signing.env"
fi
KEYSTORE="${KEYSTORE:-$HOME/.android/debug.keystore}"
KEY_ALIAS="${KEY_ALIAS:-androiddebugkey}"
KEY_PASS="${KEY_PASS:-android}"

OUT="$ROOT/.nsh/out"
WORK="$OUT/host"
STAGE="$WORK/stage"

for tool in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER" "$STRIP" "$AAR" "$PLATFORM" "$KEYSTORE"; do
  [ -e "$tool" ] || { echo "missing: $tool" >&2; exit 1; }
done

# Firebase Cloud Messaging ships as AARs. `android/libs` is filled once by
# scripts/fetch-android-libs.sh (Gradle is used as a dependency resolver, not as
# the app's build system) and is then a fixed classpath for javac/d8.
LIBS="$ROOT/android/libs"
if [ ! -f "$LIBS/manifest.txt" ]; then
  echo "▸ android/libs is empty"
  "$ROOT/scripts/fetch-android-libs.sh"
fi

# Firebase's runtime configuration, normally injected by the Google services
# Gradle plugin. Without a google-services.json this writes nothing and the app
# builds with push disabled instead of failing.
"$ROOT/scripts/firebase-config.sh"

echo "▸ bundling the app"
rm -rf "$WORK"
mkdir -p "$WORK/classes" "$WORK/dex" "$WORK/res" "$WORK/app" "$WORK/gen"
if [ "${SKIP_BUNDLE:-0}" = "1" ] && [ -f "$OUT/raw/BEUConnect.apk" ]; then
  echo "  reusing the existing bundle (SKIP_BUNDLE=1)"
else
  nsh package "$ENTRY" --target android -o "$OUT/raw" >/dev/null
fi
unzip -q -o "$OUT/raw/BEUConnect.apk" "assets/nsh/*" -d "$WORK/app"

echo "▸ compiling resources"
"$AAPT2" compile --dir android/res -o "$WORK/res/app.zip"
RES_ARGS=(-R "$WORK/res/app.zip")
mkdir -p "$WORK/aar"
# Rebuild the extraction from scratch: a dependency that disappeared would
# otherwise leave its old classes.jar in the glob and keep linking.
rm -rf "$WORK/aar"
mkdir -p "$WORK/aar"
for aar in "$LIBS"/*.aar; do
  name="$(basename "$aar" .aar)"
  unzip -q -o "$aar" -d "$WORK/aar/$name"
  # A library contributes resources (attrs, colours, strings) exactly like the
  # app does; aapt2 needs them as their own compiled archive so a name that
  # exists in both is an overlay, not a duplicate.
  if [ -d "$WORK/aar/$name/res" ]; then
    "$AAPT2" compile --dir "$WORK/aar/$name/res" -o "$WORK/res/lib-$name.zip"
    RES_ARGS+=(-R "$WORK/res/lib-$name.zip")
  fi
done
# Library code references its own generated R class — play-services-basement
# reads google_app_id through `com.google.android.gms.common.R$string`, and
# without that class the app dies in FirebaseInitProvider before the first
# frame. Gradle generates one R.java per AAR; aapt2 only does that for the app
# package unless every library package the jars import is named, so collect
# them from the bytecode instead of pinning a list that drifts with the deps.
# `android` is the platform's own R, which aapt2 cannot generate.
EXTRA_PACKAGES="$(
  for jar in "$WORK"/aar/*/classes.jar "$LIBS"/*.jar; do
    [ -e "$jar" ] || continue
    { unzip -p "$jar" '*.class' 2>/dev/null || true; } |
      grep -aoE '([a-z][a-z0-9_]*/)+R\$[A-Za-z]+' |
      sed 's#/R\$[A-Za-z]*##' | tr '/' '.'
  done | grep -vx android | sort -u | paste -sd: - || true
)"
"$AAPT2" link \
  -o "$WORK/base.apk" \
  -I "$PLATFORM" \
  --manifest android/AndroidManifest.xml \
  --min-sdk-version 28 --target-sdk-version "$TARGET_SDK" \
  --version-code "$APP_BUILD" --version-name "$APP_VERSION" \
  --java "$WORK/gen" \
  ${EXTRA_PACKAGES:+--extra-packages "$EXTRA_PACKAGES"} \
  "${RES_ARGS[@]}" \
  --auto-add-overlay

echo "▸ compiling the host (PdfPage, notifications)"
rm -rf "$WORK/nshaar"
mkdir -p "$WORK/nshaar"
unzip -q "$AAR" classes.jar -d "$WORK/nshaar"
# classes.jar first: javac reads a classpath left to right, and the host's own
# classes must win over a same-named copy inside a library.
CLASSPATH="$PLATFORM:$WORK/nshaar/classes.jar"
for jar in "$WORK"/aar/*/classes.jar "$LIBS"/*.jar; do
  [ -e "$jar" ] && CLASSPATH="$CLASSPATH:$jar"
done
javac -source 11 -target 11 -Xlint:-options -nowarn \
  -classpath "$CLASSPATH" \
  -d "$WORK/classes" \
  $(find "$WORK/gen" -name 'R.java') \
  android/java/com/longbridge/nsh/*.java
"$D8" --min-api 28 --lib "$PLATFORM" --output "$WORK/dex" \
  "$WORK/nshaar/classes.jar" \
  "$WORK"/aar/*/classes.jar \
  "$LIBS"/*.jar \
  $(find "$WORK/classes" -name '*.class')

echo "▸ assembling $ABI"
rm -rf "$STAGE"
mkdir -p "$STAGE"
unzip -q "$WORK/base.apk" -d "$STAGE"
cp "$WORK/dex/classes.dex" "$STAGE/"
mkdir -p "$STAGE/assets"
cp -R "$WORK/app/assets/nsh" "$STAGE/assets/"

unzip -q "$AAR" 'jni/*' -d "$WORK/aar"
for abi in arm64-v8a armeabi-v7a x86_64; do
  [ -d "$WORK/aar/jni/$abi" ] || continue
  [ "$ABI" = "all" ] || [ "$ABI" = "$abi" ] || continue
  mkdir -p "$STAGE/lib/$abi"
  cp "$WORK/aar/jni/$abi/libnsh.so" "$STAGE/lib/$abi/libnsh.so"
  "$STRIP" --strip-unneeded "$STAGE/lib/$abi/libnsh.so"
done
[ -d "$STAGE/lib" ] || { echo "no lib/ for ABI $ABI" >&2; exit 1; }

NAME="$OUT/BEUConnect${SUFFIX}-$ABI.apk"
[ "$ABI" = "arm64-v8a" ] && NAME="$OUT/BEUConnect${SUFFIX}.apk"
[ "$ABI" = "all" ] && NAME="$OUT/BEUConnect${SUFFIX}-universal.apk"

rm -f "$WORK/unsigned.apk" "$NAME"
(
  cd "$STAGE"
  # resources.arsc stays stored and aligned: Android mmaps it.
  zip -q -9 -X -r "$WORK/unsigned.apk" . -x "resources.arsc"
  zip -q -0 -X "$WORK/unsigned.apk" resources.arsc
)
"$ZIPALIGN" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"

# `SIGN=0` stops at the aligned APK. A repository that signs builds itself —
# F-Droid, for one — wants the APK unsigned and its own key on it, and an APK
# that already carries a signature cannot be handed to `apksigner` twice.
if [ "${SIGN:-1}" = "0" ]; then
  cp "$WORK/aligned.apk" "$NAME"
else
  "$APKSIGNER" sign \
    --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
    --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
    --out "$NAME" "$WORK/aligned.apk"
fi

SIZE="$(wc -c < "$NAME" | tr -d ' ')"
# awk, not bc: a slim build image may not carry bc.
echo "✓ $NAME — $(awk -v s="$SIZE" 'BEGIN { printf "%.1f", s / 1000000 }') MB ($SIZE bytes)"
if [ "${SIGN:-1}" = "0" ]; then
  echo "  unsigned (SIGN=0)"
else
  "$APKSIGNER" verify "$NAME" >/dev/null && echo "  signature ok"
fi
"$BUILD_TOOLS/aapt2" dump badging "$NAME" | grep -E "^package:|^native-code:|^sdkVersion:|^launchable-activity:" | sed 's/^/  /'
