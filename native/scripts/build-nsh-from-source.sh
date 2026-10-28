#!/usr/bin/env bash
# BEUConnect's Android APK, built from source only.
#
# The normal build reads two binaries that the nsh installer drops in `~/.nsh`:
# the `nsh` CLI it runs, and `embed/android/nsh.aar` it compiles against. Every
# line in both is Apache-2.0 Rust and Java in longbridge/nsh, but the files
# themselves come out of a release tarball. A repository that may only use
# binaries from a trusted build — F-Droid's, for one — cannot install that
# tarball, so this script builds the same two artifacts from a checkout and
# hands them to `build-android-host.sh`.
#
# Usage:
#   NSH_SRC=~/src/nsh ./scripts/build-nsh-from-source.sh              # arm64-v8a
#   NSH_SRC=~/src/nsh ./scripts/build-nsh-from-source.sh armeabi-v7a
#   NSH_SRC=~/src/nsh ./scripts/build-nsh-from-source.sh all
#
# `NSH_SRC` defaults to `../../nsh`, `../nsh` or `.nsh/src/nsh`, whichever is a
# checkout first. `NSH_DIST` collects the built CLI, runtime and AAR and defaults
# to `.nsh/nsh-dist`.
#
# Needs cargo and rustc (rustup, any channel ≥ 1.85), the Android SDK, the NDK
# and a JDK — the same set `build-android-host.sh` already requires.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

ABI="${1:-arm64-v8a}"

# The pinned upstream. A build from an arbitrary HEAD is not reproducible, so a
# tag or commit is required, not a branch.
NSH_REV="${NSH_REV:-v0.3.0}"

find_nsh() {
  local candidate
  for candidate in "${NSH_SRC:-}" "$ROOT/../../nsh" "$ROOT/../nsh" "$ROOT/.nsh/src/nsh"; do
    [ -n "$candidate" ] || continue
    [ -f "$candidate/Cargo.toml" ] && [ -d "$candidate/crates/nsh-cli" ] || continue
    (cd "$candidate" && pwd)
    return 0
  done
  return 1
}

if ! NSH_SRC="$(find_nsh)"; then
  cat >&2 <<'EOF'
build-nsh-from-source: no nsh checkout.
Clone the pinned revision next to this repo, or point at one:

  git clone --depth 1 --branch v0.3.0 https://github.com/longbridge/nsh ../nsh
  NSH_SRC=../nsh ./scripts/build-nsh-from-source.sh
EOF
  exit 1
fi

DIST="${NSH_DIST:-$ROOT/.nsh/nsh-dist}"
CLI="$DIST/bin/nsh"
RUNTIME="$DIST/runtime/android/release"
AAR="$DIST/embed/android/nsh.aar"

for tool in cargo rustc javac jar; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }
done

PINNED=0
if git -C "$NSH_SRC" rev-parse --git-dir >/dev/null 2>&1; then
  HAVE="$(git -C "$NSH_SRC" rev-parse --short HEAD)"
  HEAD_TAG="$(git -C "$NSH_SRC" describe --tags --exact-match HEAD 2>/dev/null || true)"
  if [ -n "$HEAD_TAG" ]; then
    PINNED=1
  elif git -C "$NSH_SRC" rev-parse --verify --quiet "$NSH_REV^{commit}" >/dev/null; then
    [ "$(git -C "$NSH_SRC" rev-parse "$NSH_REV^{commit}")" = "$(git -C "$NSH_SRC" rev-parse HEAD)" ] && PINNED=1
  fi
  if [ "$PINNED" = "0" ] && [ "${NSH_ALLOW_UNPINNED:-0}" != "1" ]; then
    cat >&2 <<EOF
build-nsh-from-source: $NSH_SRC is at $HAVE, which is neither a tag nor $NSH_REV.
An app that cannot name the revision it was built from cannot be rebuilt, so
check the checkout out first:

  git -C $NSH_SRC fetch --depth 1 origin tag $NSH_REV
  git -C $NSH_SRC checkout $NSH_REV

NSH_ALLOW_UNPINNED=1 builds the working tree anyway, for a local experiment.
EOF
    exit 1
  fi
  echo "▸ nsh source ${HEAD_TAG:-$HAVE}"
else
  echo "▸ nsh source $NSH_SRC (not a git checkout; nothing pins the revision)"
fi

# `cargo xtask android` builds libnsh.so and compiles the Java runtime into
# classes.jar + classes.dex with javac and d8, so the NDK, SDK and JDK all have
# to be visible to it.
source ~/.config/nsh/env.sh >/dev/null 2>&1 || true

echo "▸ building the nsh CLI"
cargo build --release --manifest-path "$NSH_SRC/Cargo.toml" -p nsh-cli
rm -rf "$DIST/bin"
mkdir -p "$DIST/bin"
cp "$NSH_SRC/target/release/nsh" "$CLI"

if [ "$ABI" = "all" ]; then
  ABIS=(arm64-v8a armeabi-v7a x86_64)
else
  ABIS=("$ABI")
fi
ABI_FLAGS=()
for abi in "${ABIS[@]}"; do ABI_FLAGS+=(--abi "$abi"); done

echo "▸ building the Android runtime (${ABIS[*]})"
rm -rf "$RUNTIME"
(cd "$NSH_SRC" && cargo xtask android --release "${ABI_FLAGS[@]}")

BUILT="$NSH_SRC/target/android/release"
for artefact in classes.jar classes.dex; do
  [ -f "$BUILT/$artefact" ] || { echo "build-nsh-from-source: no $BUILT/$artefact" >&2; exit 1; }
done
for abi in "${ABIS[@]}"; do
  [ -f "$BUILT/lib/$abi/libnsh.so" ] || { echo "build-nsh-from-source: no $BUILT/lib/$abi/libnsh.so" >&2; exit 1; }
done

# `nsh package` looks for `runtime/android/release` beside its own `bin/`, and
# reads `lib/<abi>/libnsh.so` from it.
mkdir -p "$RUNTIME/lib"
cp "$BUILT/classes.jar" "$BUILT/classes.dex" "$RUNTIME/"
for abi in "${ABIS[@]}"; do
  mkdir -p "$RUNTIME/lib/$abi"
  cp "$BUILT/lib/$abi/libnsh.so" "$RUNTIME/lib/$abi/libnsh.so"
done

echo "▸ packaging the AAR"
rm -rf "$DIST/embed" "$DIST/aar-work"
mkdir -p "$DIST/aar-work" "$DIST/embed/android"
# The same four files `cargo xtask dist` writes into `nsh.aar`.
cat > "$DIST/aar-work/AndroidManifest.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.longbridge.nsh">
    <uses-sdk android:minSdkVersion="28" />
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
EOF
: > "$DIST/aar-work/R.txt"
cp "$BUILT/classes.jar" "$DIST/aar-work/classes.jar"
for abi in "${ABIS[@]}"; do
  mkdir -p "$DIST/aar-work/jni/$abi"
  cp "$BUILT/lib/$abi/libnsh.so" "$DIST/aar-work/jni/$abi/libnsh.so"
done
rm -f "$AAR"
(cd "$DIST/aar-work" && jar --create --file "$AAR" .)
rm -rf "$DIST/aar-work"

echo "▸ assembling the APK through build-android-host.sh"
PATH="$DIST/bin:$PATH" NSH_AAR="$AAR" ./scripts/build-android-host.sh "$ABI"
