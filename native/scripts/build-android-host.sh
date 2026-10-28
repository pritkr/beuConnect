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
NDK="${ANDROID_NDK_HOME:-${ANDROID_NDK:-$(find "$SDK/ndk" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)}}"
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
AAR="${NSH_AAR:-$HOME/.nsh/embed/android/nsh.aar}"

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

echo "▸ bundling the app"
rm -rf "$WORK"
mkdir -p "$WORK/classes" "$WORK/dex" "$WORK/res" "$WORK/app"
nsh package "$ENTRY" --target android -o "$OUT/raw" >/dev/null
unzip -q -o "$OUT/raw/BEUConnect.apk" "assets/nsh/*" -d "$WORK/app"

echo "▸ compiling resources"
"$AAPT2" compile --dir android/res -o "$WORK/res/resources.zip"
"$AAPT2" link \
  -o "$WORK/base.apk" \
  -I "$PLATFORM" \
  --manifest android/AndroidManifest.xml \
  --min-sdk-version 28 --target-sdk-version "$TARGET_SDK" \
  --version-code "$APP_BUILD" --version-name "$APP_VERSION" \
  -R "$WORK/res/resources.zip" \
  --auto-add-overlay

echo "▸ compiling the host (PdfPage)"
rm -rf "$WORK/aar"
mkdir -p "$WORK/aar"
unzip -q "$AAR" classes.jar -d "$WORK/aar"
javac -source 11 -target 11 -Xlint:-options -nowarn \
  -classpath "$PLATFORM:$WORK/aar/classes.jar" \
  -d "$WORK/classes" \
  android/java/com/longbridge/nsh/*.java
"$D8" --min-api 28 --lib "$PLATFORM" --output "$WORK/dex" \
  "$WORK/aar/classes.jar" $(find "$WORK/classes" -name '*.class')

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
