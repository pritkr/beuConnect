#!/usr/bin/env bash
# Fills `android/libs` with the Firebase Cloud Messaging runtime.
#
# The host is compiled without Gradle (aapt2 / javac / d8). This script uses
# Gradle for exactly one thing: resolving firebase-messaging's dependency tree,
# which is a dozen AARs and a handful of jars with exclusions that change
# between releases. `android/deps/build.gradle.kts` pins the version; the rest
# is transitive.
#
# Output:
#   android/libs/*.aar, *.jar      the runtime the host compiles against
#   android/libs/manifest.txt      sha256 of every file, so a later build can
#                                  tell the cache from a corrupted one
#
# Usage:
#   ./scripts/fetch-android-libs.sh          # resolve into android/libs
#   ./scripts/fetch-android-libs.sh --check  # verify android/libs against the manifest
#
# Requires a JDK and Gradle. In CI, `--check` is enough if android/libs is cached.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LIBS="$ROOT/android/libs"
DEPS="$ROOT/android/deps"
GRADLE="${GRADLE:-gradle}"

if [ "${1:-}" = "--check" ]; then
  [ -f "$LIBS/manifest.txt" ] || { echo "android/libs/manifest.txt is missing" >&2; exit 1; }
  ( cd "$LIBS" && shasum -a 256 -c manifest.txt --quiet ) || {
    echo "android/libs does not match its manifest — run ./scripts/fetch-android-libs.sh" >&2
    exit 1
  }
  echo "✓ android/libs matches manifest.txt ($(grep -c . "$LIBS/manifest.txt") files)"
  exit 0
fi

command -v "$GRADLE" >/dev/null 2>&1 || {
  echo "missing: $GRADLE (needed once to resolve firebase-messaging)" >&2
  exit 1
}

echo "▸ resolving firebase-messaging into android/libs"
# Start clean: a downgraded dependency would otherwise leave its old AAR in
# place and the manifest would describe a mix of two versions.
rm -rf "$LIBS"
"$GRADLE" --project-dir "$DEPS" --console=plain --quiet copyDeps

# The datastore modules have to be fetched by hand. They are multiplatform:
# without an Android plugin Gradle resolves the JVM variants, and those are not
# the same code. FirebaseInstallations exploded on the first disk read —
# `PreferenceDataStoreDelegateKt` and `SharedPreferencesMigration` exist only in
# the Android artifacts, and the plain AARs are empty stubs. The `-android`
# artifact replaces its JVM jar (it carries a superset of the classes, so keeping
# both is a duplicate-class error in d8); the version follows the resolved JVM
# jar so the two can never drift.
for module in datastore datastore-core datastore-preferences datastore-preferences-core; do
  JVM_JAR="$(ls "$LIBS/$module-jvm-"*.jar 2>/dev/null | head -1)"
  [ -n "$JVM_JAR" ] || continue
  MODULE_VERSION="${JVM_JAR##*/$module-jvm-}"
  MODULE_VERSION="${MODULE_VERSION%.jar}"
  AAR="$module-android-$MODULE_VERSION.aar"
  curl -fsSL \
    "https://dl.google.com/dl/android/maven2/androidx/datastore/$module-android/$MODULE_VERSION/$AAR" \
    -o "$LIBS/$AAR"
  rm -f "$JVM_JAR"
  echo "  + $AAR (Android variant, replaces the JVM jar)"
done

: > "$LIBS/manifest.txt"
( cd "$LIBS" && shasum -a 256 *.aar *.jar 2>/dev/null | sort -k2 ) > "$LIBS/manifest.txt"

echo "✓ $(grep -c . "$LIBS/manifest.txt") artifacts, $(du -sh "$LIBS" | cut -f1) on disk"
