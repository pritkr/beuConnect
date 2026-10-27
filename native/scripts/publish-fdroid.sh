#!/usr/bin/env bash
# publish-fdroid.sh — generate the self-hosted F-Droid repo for a released APK.
#
#   ./scripts/publish-fdroid.sh v1.1.0 ../beuconnect-fdroid
#
# Downloads the signed APK from the GitHub release, checks that its signer is
# the one the metadata allows, assembles a scratch fdroidserver directory from
# `fdroid/metadata` and `fastlane/metadata`, runs `fdroid update`, and replaces
# `<repo>/repo` with the result. Commit and push that directory to publish.
#
# Requires: `fdroid` on PATH (`uv tool install fdroidserver`), `gh` authenticated
# for pritkr/beuConnect, and the repo signing identity sourced from
# ~/.config/beuconnect/fdroid-signing.env (override with BEUCONNECT_FDROID_ENV).
#
# The repo index key is the trust anchor for every installed client. Losing it
# means each user removes and re-adds the repository. Back it up offline.
set -euo pipefail

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
  exit 2
}
step() { printf '\n▸ %s\n' "$1"; }
fail() { printf '✗ %s\n' "$1" >&2; exit 1; }

TAG="${1:-}"
OUT="${2:-}"
[ -n "$TAG" ] && [ -n "$OUT" ] || usage

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${BEUCONNECT_FDROID_ENV:-$HOME/.config/beuconnect/fdroid-signing.env}"
META="$ROOT/fdroid/metadata/org.beuconnect.app.yml"
FASTLANE="$ROOT/fastlane/metadata/android/en-US"
FDROID_BIN="${FDROID_BIN:-fdroid}"

[ -f "$ENV_FILE" ] || fail "no signing identity at $ENV_FILE (see docs/FDROID.md §2)"
# shellcheck source=/dev/null
. "$ENV_FILE"
: "${FDROID_KEYSTORE:?set in $ENV_FILE}"
: "${FDROID_KEY_ALIAS:?set in $ENV_FILE}"
: "${FDROID_KEY_PASS:?set in $ENV_FILE}"
: "${FDROID_KEY_DNAME:?set in $ENV_FILE}"
command -v "$FDROID_BIN" >/dev/null || fail "fdroidserver not on PATH — uv tool install fdroidserver"
[ -f "$META" ] || fail "missing $META"
[ -d "$FASTLANE/images" ] || fail "missing $FASTLANE/images"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
APKSIGNER="$(command -v apksigner || true)"
[ -n "$APKSIGNER" ] || APKSIGNER="$SDK/build-tools/$(ls -1 "$SDK/build-tools" | sort -V | tail -1)/apksigner"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/beuconnect-fdroid.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
FD="$WORK/fdroid"

step "fetch $TAG"
gh release download "$TAG" -R pritkr/beuConnect -p BEUConnect.apk -D "$WORK" --clobber \
  || fail "no BEUConnect.apk on release $TAG"
APK="$WORK/BEUConnect.apk"

step "check the signer against the metadata"
SIGNER="$("$APKSIGNER" verify --print-certs "$APK" | awk -F': ' '/SHA-256 digest/ { print tolower($2); exit }')"
ALLOWED="$(awk -F': ' '/^AllowedAPKSigningKeys:/ { print tolower($2); exit }' "$META")"
[ -n "$SIGNER" ] || fail "apksigner could not read a signer from $APK"
[ "$SIGNER" = "$ALLOWED" ] || fail "APK signer $SIGNER is not $ALLOWED"

step "assemble the fdroidserver directory"
mkdir -p "$FD/metadata/org.beuconnect.app/en-US/phoneScreenshots"
cp "$META" "$FD/metadata/org.beuconnect.app.yml"
cp "$FASTLANE/images/icon.png" "$FASTLANE/images/featureGraphic.png" \
  "$FD/metadata/org.beuconnect.app/en-US/"
cp "$FASTLANE"/images/phoneScreenshots/*.png \
  "$FD/metadata/org.beuconnect.app/en-US/phoneScreenshots/"
cp "$FASTLANE/images/icon.png" "$FD/icon.png"
cp "$APK" "$FD/BEUConnect.apk"

cat >"$FD/config.yml" <<EOF
repo_url: https://pritkr.github.io/beuconnect-fdroid/repo
repo_name: BEUConnect
repo_icon: icon.png
repo_description: >-
  BEUConnect releases for Bihar Engineering University students: syllabus,
  previous year papers, results, rank, attendance, routine and notices.
archive_older: 0
keystore: $FDROID_KEYSTORE
repo_keyalias: $FDROID_KEY_ALIAS
keystorepass: $FDROID_KEY_PASS
keypass: $FDROID_KEY_PASS
keydname: $FDROID_KEY_DNAME
sdk_path: $SDK
EOF
chmod 600 "$FD/config.yml"

step "fdroid update"
(cd "$FD" && "$FDROID_BIN" update --clean --pretty) >"$WORK/update.log" 2>&1 \
  || { tail -30 "$WORK/update.log" >&2; fail "fdroid update failed"; }

# `--clean` drops repo/icons/icon.png and writes a 886-byte placeholder. Put the
# real icon back and rewrite the index; this is the only hand-touch the tool
# needs, and it is idempotent.
if ! cmp -s "$FD/icon.png" "$FD/repo/icons/icon.png"; then
  cp "$FD/icon.png" "$FD/repo/icons/icon.png"
  (cd "$FD" && "$FDROID_BIN" update --pretty) >>"$WORK/update.log" 2>&1 \
    || { tail -30 "$WORK/update.log" >&2; fail "fdroid update (icon restore) failed"; }
fi

VERSIONS="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(" ".join(sorted(d["packages"]["org.beuconnect.app"]["versions"], key=int)))' "$FD/repo/index-v2.json")"

step "write $OUT/repo"
mkdir -p "$OUT"
rm -rf "${OUT:?}/repo"
cp -R "$FD/repo" "$OUT/repo"

printf '\n✓ %s\n  versionCodes: %s\n  signer: %s\n' "$TAG" "$VERSIONS" "$SIGNER"
printf '  next: git -C %s add repo && git commit && git push\n' "$OUT"
