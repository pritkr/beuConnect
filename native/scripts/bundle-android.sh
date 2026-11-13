#!/usr/bin/env bash
# The Play artifact: one AAB from the same host as the APK.
#
# Play no longer accepts an APK for a new app, and since 2026-08-31 anything
# targeting below API 36 is rejected at upload. So this is not a variant of
# `package-android.sh`, it is the only artifact Play accepts. The host is the
# same one (same manifest, dex, runtime); only the packaging differs:
#
#   1. build the Play host     → `App.play.tsx`, so no off-Play update path
#   2. aapt2 link --proto-format → the module format bundletool reads
#   3. module zip              → manifest/, resources.pb, dex/, res/, assets/, lib/
#   4. bundletool build-bundle → the .aab, without Gradle
#   5. jarsigner, upload key   → Play rejects an unsigned bundle
#   6. bundletool validate     → the bundle Play will actually inspect
#
# Usage:
#   ./scripts/bundle-android.sh              # → .nsh/out/BEUConnect-<version>.aab
#   ./scripts/bundle-android.sh --install    # build the split APKs and adb install them
#   CHECK=0 ./scripts/bundle-android.sh      # skip the compile gate (throwaway)
#   UNSIGNED=1 ./scripts/bundle-android.sh   # skip signing (split-install testing only)
#
# `--install` proves the splits launch, which is the one thing a sideloaded APK
# cannot prove: Play delivers a different set of APKs than the one APK we test
# by hand.
set -euo pipefail
source ~/.config/nsh/env.sh >/dev/null 2>&1
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "bundle-android: unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

ENTRY="${ENTRY:-App.play.tsx}"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BUILD_TOOLS="$(find "$SDK/build-tools" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)"
PLATFORM="$SDK/platforms/android-36/android.jar"
AAPT2="$BUILD_TOOLS/aapt2"
BUNDLETOOL="${BUNDLETOOL:-$HOME/.nsh/tools/bundletool.jar}"
BUNDLETOOL_VERSION="${BUNDLETOOL_VERSION:-1.18.3}"

read -r APP_VERSION APP_BUILD <<<"$(bun -e 'const j = require("./nsh.json"); console.log(`${j.version} ${j.build}`)')"
[ -n "${APP_VERSION:-}" ] && [ -n "${APP_BUILD:-}" ] || { echo "nsh.json has no version/build" >&2; exit 1; }

OUT="$ROOT/.nsh/out"
WORK="$OUT/bundle"
MODULE="$WORK/module"
APK="$OUT/BEUConnect-play.apk"
NAME="$OUT/BEUConnect-$APP_VERSION.aab"

for tool in "$AAPT2" "$PLATFORM"; do
  [ -e "$tool" ] || { echo "missing: $tool (sdkmanager \"platforms;android-36\")" >&2; exit 1; }
done

if [ ! -f "$BUNDLETOOL" ]; then
  mkdir -p "$(dirname "$BUNDLETOOL")"
  echo "▸ fetching bundletool $BUNDLETOOL_VERSION"
  curl -fsSL -o "$BUNDLETOOL" \
    "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VERSION/bundletool-all-$BUNDLETOOL_VERSION.jar" \
    || { echo "could not download bundletool; put it at $BUNDLETOOL" >&2; exit 1; }
fi

if [ "${CHECK:-1}" != "0" ]; then
  echo "▸ checking the tree (CHECK=0 skips)"
  ./scripts/check.sh check || { echo "bundle-android: the tree does not compile; fix it or run CHECK=0 for a throwaway build" >&2; exit 1; }
fi

echo "▸ building the Play host ($ENTRY)"
# Same host build as the APK, one channel flag apart. The suffix keeps it from
# overwriting `.nsh/out/BEUConnect.apk`, which is the GitHub artifact.
rm -f "$APK"
SUFFIX="-play" ENTRY="$ENTRY" ./scripts/build-android-host.sh arm64-v8a >/dev/null

echo "▸ compiling resources (proto)"
rm -rf "$WORK"
mkdir -p "$WORK/res" "$MODULE"
"$AAPT2" compile --dir android/res -o "$WORK/res/resources.zip"
"$AAPT2" link \
  -o "$WORK/base.apk" \
  -I "$PLATFORM" \
  --proto-format \
  --manifest android/AndroidManifest.xml \
  --min-sdk-version 28 --target-sdk-version 36 \
  --version-code "$APP_BUILD" --version-name "$APP_VERSION" \
  -R "$WORK/res/resources.zip" \
  --auto-add-overlay

echo "▸ assembling the base module"
unzip -q "$WORK/base.apk" -d "$MODULE"
mkdir -p "$MODULE/manifest" "$MODULE/dex" "$MODULE/lib/arm64-v8a"
mv "$MODULE/AndroidManifest.xml" "$MODULE/manifest/AndroidManifest.xml"
unzip -p "$APK" classes.dex >"$MODULE/dex/classes.dex"
unzip -q "$APK" 'assets/nsh/*' -d "$MODULE"
unzip -p "$APK" lib/arm64-v8a/libnsh.so >"$MODULE/lib/arm64-v8a/libnsh.so"
[ -f "$MODULE/resources.pb" ] || { echo "aapt2 did not emit resources.pb" >&2; exit 1; }

printf '{}\n' >"$WORK/BundleConfig.json"
(
  cd "$MODULE"
  rm -f "$WORK/base.zip"
  zip -q -X -r "$WORK/base.zip" .
)

echo "▸ building the bundle"
rm -f "$NAME"
java -jar "$BUNDLETOOL" build-bundle \
  --modules="$WORK/base.zip" \
  --output="$NAME" \
  --config="$WORK/BundleConfig.json"

# Play rejects an unsigned bundle, so this is not optional. The signing is JAR
# signing (jarsigner), not `apksigner`: an .aab is a zip of modules, not an
# installable APK. UNSIGNED=1 exists only for split-install testing.
if [ -f "$HOME/.config/beuconnect/upload.env" ]; then
  echo "▸ signing (upload key)"
  # shellcheck disable=SC1091
  . "$HOME/.config/beuconnect/upload.env"
  jarsigner -keystore "$UPLOAD_KEYSTORE" \
    -storepass "$UPLOAD_KEY_PASS" -keypass "$UPLOAD_KEY_PASS" \
    -sigalg SHA256withRSA -digestalg SHA-256 \
    "$NAME" "$UPLOAD_KEY_ALIAS" >/dev/null
  jarsigner -verify "$NAME" >/dev/null || { echo "bundle-android: signing did not verify" >&2; exit 1; }
elif [ "${UNSIGNED:-0}" = "1" ]; then
  echo "▸ unsigned (UNSIGNED=1) — Play will reject this bundle"
else
  echo "bundle-android: no upload key. Run ./scripts/signing.sh --upload" >&2
  echo "                (or UNSIGNED=1 to build one only for split-install testing)" >&2
  exit 1
fi

java -jar "$BUNDLETOOL" validate --bundle="$NAME" >/dev/null

echo "✓ $NAME — $(stat -f%z "$NAME") B"
java -jar "$BUNDLETOOL" dump manifest --bundle="$NAME" \
  | grep -E "package=|versionCode|versionName|targetSdkVersion|minSdkVersion" | sed 's/^/  /'

if [ "$INSTALL" = "1" ]; then
  echo "▸ installing the split APKs"
  rm -f "$WORK/splits.apks"
  # Play re-signs the bundle with the app-signing key, which for this app is the
  # release key the GitHub APK already carries. Signing the splits with anything
  # else makes them fail to upgrade the installed app (and proves nothing about
  # the thing this check exists to prove: that a sideloaded install survives).
  SPLIT_ARGS=()
  if [ -f "$HOME/.config/beuconnect/signing.env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.config/beuconnect/signing.env"
    SPLIT_ARGS=(
      --ks="$KEYSTORE" --ks-pass="pass:$KEY_PASS"
      --ks-key-alias="$KEY_ALIAS" --key-pass="pass:$KEY_PASS"
    )
    echo "  (signed with $KEY_ALIAS, the app-signing key)"
  fi
  java -jar "$BUNDLETOOL" build-apks --bundle="$NAME" \
    --output="$WORK/splits.apks" --mode=universal "${SPLIT_ARGS[@]}" >/dev/null
  java -jar "$BUNDLETOOL" install-apks --apks="$WORK/splits.apks"
  adb shell am start -n org.beuconnect.app/com.longbridge.nsh.MainActivity
fi

rm -f "$APK"
