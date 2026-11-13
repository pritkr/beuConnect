#!/usr/bin/env bash
# The Play listing's images, generated from the tree rather than redrawn.
#
# Play rejects an upload for a wrong pixel format, not a wrong picture, so each
# asset here is produced to spec and then measured. Nothing is written to the
# repo: the Console takes a file, not a checkout, so the output lives under
# `.nsh/out/play/` beside the artifacts it belongs to.
#
#   ./scripts/store-assets.sh          # → .nsh/out/play/icon-512.png
#   ./scripts/store-assets.sh --check  # measure what is there, build nothing
#
# `icon.png` (1024²) is the source of truth. The APK's launcher icon is derived
# from the same file by `package-android.sh`, so the listing and the installed
# app cannot drift apart.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/.nsh/out/play"
SRC="$ROOT/icon.png"
ICON="$OUT/icon-512.png"

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "store-assets: unknown argument: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# dimension, colour model, alpha of a PNG, straight from the file header + IHDR.
measure() {
  sips -g pixelWidth -g pixelHeight -g hasAlpha "$1" 2>/dev/null \
    | awk '/pixelWidth/ {w=$2} /pixelHeight/ {h=$2} /hasAlpha/ {a=$2} END {print w "x" h " alpha=" a}'
}

expect() {
  local file="$1" want="$2" got
  [ -f "$file" ] || { echo "store-assets: missing $file" >&2; exit 1; }
  got="$(measure "$file")"
  [ "$got" = "$want" ] || {
    echo "store-assets: $file is $got, Play wants $want" >&2
    exit 1
  }
  echo "  ✓ $(basename "$file") — $got"
}

if [ "$CHECK_ONLY" = "0" ]; then
  [ -f "$SRC" ] || { echo "store-assets: no icon.png to derive from" >&2; exit 1; }
  mkdir -p "$OUT"
  echo "▸ icon"
  # No interpolation flag: sips' default Lanczos is the right filter for a 2×
  # downscale, and a sharper one would alias the ring in the mark.
  sips -s format png -z 512 512 "$SRC" --out "$ICON" >/dev/null
fi

echo "▸ measuring"
expect "$ICON" "512x512 alpha=yes"
echo "✓ $OUT"
