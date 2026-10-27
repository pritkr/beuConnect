#!/usr/bin/env bash
# release.sh — one command from a clean tree to a verified Android artifact.
#
#   ./scripts/release.sh              # check + tests + package + size gate + verify
#   ./scripts/release.sh --skip-tests # package + verify only (fast iteration)
#
# It is deliberately boring: every step is an existing script, run in the one
# order that makes a failure meaningful. Nothing here edits source.
#
#   1. ./scripts/check.sh test     types, build and the full suite (lock-serialised)
#   2. ./scripts/package-android.sh arm64, stripped, deflated, aligned, signed
#   3. ./scripts/size-report.sh    the 10,000,000 B gate, recorded in the history
#   4. verify                      zipalign, apksigner, unzip, badging, sha256
#   5. dist/                       a copy named for the version and ABI
#
# Exit codes: 0 shipped, 1 a step failed (the step names itself in the output).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
source "$HOME/.config/nsh/env.sh" >/dev/null 2>&1 || true

APK=".nsh/out/BEUConnect.apk"
DIST="dist"
BUDGET="${APK_BUDGET:-12300000}"
SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "release: unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n▸ %s\n' "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

if [ "$SKIP_TESTS" -eq 0 ]; then
  step "types, build and tests"
  ./scripts/check.sh test || fail "check.sh test failed — fix the tree before packaging"
else
  step "types and build (tests skipped)"
  ./scripts/check.sh || fail "check.sh failed — fix the tree before packaging"
fi

step "package the APK"
./scripts/package-android.sh || fail "package-android.sh failed"

[ -f "$APK" ] || fail "no APK at $APK"

step "size gate"
./scripts/size-report.sh --no-build --record || fail "size-report.sh says the APK is over budget"

step "verify the artifact"
BYTES="$(wc -c < "$APK" | tr -d ' ')"
if [ "$BYTES" -ge "$BUDGET" ]; then
  fail "APK is $BYTES B, at or over the $BUDGET B ceiling"
fi

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
BT="$SDK/build-tools"
BTD="$(find "$BT" -maxdepth 1 -type d -name '[0-9]*' 2>/dev/null | sort -V | tail -1)"
[ -n "$BTD" ] || fail "no Android build-tools under $BT (set ANDROID_HOME)"

"$BTD/zipalign" -c -p 4 "$APK" || fail "zipalign check failed"
"$BTD/apksigner" verify --print-certs "$APK" >/dev/null || fail "apksigner verify failed"
unzip -tqq "$APK" >/dev/null || fail "zip integrity check failed"

BADGING="$("$BTD/aapt2" dump badging "$APK" 2>/dev/null || true)"
PACKAGE="$(printf '%s\n' "$BADGING" | sed -n "s/^package: name='\([^']*\)'.*versionName='\([^']*\)'.*/\1 \2/p")"
[ -n "$PACKAGE" ] || fail "could not read the package name out of the APK"

ENTRIES="$(unzip -l "$APK" | tail -1 | awk '{print $2}')"
LIB="$(unzip -l "$APK" | awk '/lib\/arm64-v8a\/libnsh\.so$/ {print $1; exit}')"
BUNDLE="$(unzip -l "$APK" | awk '/assets\/nsh\/bundle\.nshc$/ {print $1; exit}')"

step "ship"
mkdir -p "$DIST"
SET="${PACKAGE#* }"
NAME="BEUConnect-${SET}-arm64-v8a.apk"
cp -f "$APK" "$DIST/$NAME"
SHA="$(shasum -a 256 "$DIST/$NAME" | awk '{print $1}')"

cat <<EOF

APK      $DIST/$NAME
bytes    $BYTES  (budget $BUDGET, $(( BUDGET - BYTES )) B left)
package  $PACKAGE
entries  $ENTRIES
libnsh   ${LIB:-?} B packed
bundle   ${BUNDLE:-?} B packed
sha256   $SHA
verdict  shipped
EOF
