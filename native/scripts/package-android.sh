#!/usr/bin/env bash
# Slim Android build.
#
# `nsh package` ships a universal APK: both ABIs, and — because the manifest says
# extractNativeLibs="false" — the 25 MB runtime stored uncompressed. That is 50 MB
# for an app whose own code is 2 MB.
#
# This script keeps one ABI, strips the runtime's symbols, deflates it, and signs
# the result. Output is ~9.5 MB instead of 50 MB, and it installs and runs the
# same way; the only difference is that Android extracts the library at install
# time instead of mapping it out of the APK.
#
# Usage:
#   ./scripts/package-android.sh                 # arm64-v8a, the phone build
#   ./scripts/package-android.sh x86_64          # emulator on Intel hosts
#   ./scripts/package-android.sh all             # universal (50 MB, for testing)
#   INSTALL=1 ./scripts/package-android.sh       # adb install the result too
#   CHECK=0 ./scripts/package-android.sh         # skip the compile gate (throwaway)
#
# It refuses to package a tree that does not compile. That gate exists because a
# build was once shipped from a tree two agents were mid-edit on, and three whole
# features reached the phone blank.
set -euo pipefail
source ~/.config/nsh/env.sh >/dev/null 2>&1
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

ABI="${1:-arm64-v8a}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
OUT="$ROOT/.nsh/out"
RAW="$OUT/raw"
STAGE="$OUT/stage"
WORK="$OUT/slim.apk"
BUILD_TOOLS="$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)"
NDK="${ANDROID_NDK_HOME:-$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)}"
HOST_TAG="$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64"
STRIP="$NDK/toolchains/llvm/prebuilt/$HOST_TAG/bin/llvm-strip"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"
KEYSTORE="${KEYSTORE:-$HOME/.android/debug.keystore}"
KEY_ALIAS="${KEY_ALIAS:-androiddebugkey}"
KEY_PASS="${KEY_PASS:-android}"

# Same signing identity as build-android-host.sh: one env file, one key.
if [ -f "$HOME/.config/beuconnect/signing.env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.config/beuconnect/signing.env"
fi

for tool in "$STRIP" "$ZIPALIGN" "$APKSIGNER" "$KEYSTORE"; do
  [ -e "$tool" ] || { echo "missing: $tool" >&2; exit 1; }
done

# A package is a promise: it compiles and its screens exist. Both have been
# shipped broken by building from a tree another agent was mid-edit on, so the
# gate is not optional. `CHECK=0` skips it only for a deliberate throwaway.
if [ "${CHECK:-1}" != "0" ]; then
  echo "▸ checking the tree (CHECK=0 skips)"
  ./scripts/check.sh check || { echo "package-android: the tree does not compile; fix it or run CHECK=0 for a throwaway build" >&2; exit 1; }
fi

# The APK is built by build-android-host.sh: the stock `nsh package` host has
# no PDF renderer, and BEUConnect's notes need one. Everything below the check
# gate (slim one ABI, strip symbols, deflate the runtime, align, sign) lives
# there, so there is one Android build path, not two.
./scripts/build-android-host.sh "$ABI"

if [ "${INSTALL:-0}" = "1" ]; then
  adb install -r "$OUT/BEUConnect.apk"
  adb shell am start -n org.beuconnect.app/com.longbridge.nsh.MainActivity
fi
