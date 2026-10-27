#!/usr/bin/env bash
# The launcher icon, generated from `icon.png` into Android's resource tree.
#
#   ./scripts/icons/build-launcher.sh
#
# Source art is one 1024 px full-bleed tile: ember #E4572E, a cream "B." mark.
# Android 8+ demands an adaptive icon (a background layer + a foreground layer
# that the launcher masks to its own shape); without one the launcher shrinks
# the whole square into a white circle, which is how BEUConnect shipped 1.0.0.
#
# Layers written here:
#   mipmap-anydpi-v26/ic_launcher.xml        background + foreground + monochrome
#   mipmap-*/ic_launcher_foreground.png      108 dp art, masked by the launcher
#   mipmap-*/ic_launcher_monochrome.png      Android 13 themed-icon silhouette
#   mipmap-*/ic_launcher.png                 legacy tile (API 26 and below)
#   mipmap-*/ic_launcher_round.png           legacy round tile
#
# A launcher draws the 108 dp foreground layer at 1.5x and shows only the
# central 72 dp, masking it to the device's shape. Stretching the art to 108 dp
# therefore crops the mark; the foreground is the art laid into that 72 dp
# viewport on a solid ember field instead, so what a student sees is exactly the
# composition `icon.png` was drawn with — and because both layers are the same
# ember, the launcher's parallax zoom cannot show a seam.
set -euo pipefail
cd "$(dirname "$0")/../.."

SRC="icon.png"
RES="android/res"
BG="#E4572E"

command -v magick >/dev/null || { echo "missing: magick (brew install imagemagick)" >&2; exit 1; }
[ -f "$SRC" ] || { echo "missing: $SRC" >&2; exit 1; }

# 108 dp adaptive layers, legacy 48 dp tiles.
for pair in mdpi:108:48 hdpi:162:72 xhdpi:216:96 xxhdpi:324:144 xxxhdpi:432:192; do
  density="${pair%%:*}"
  rest="${pair#*:}"
  adaptive="${rest%%:*}"
  legacy="${rest##*:}"
  dir="$RES/mipmap-$density"
  mkdir -p "$dir"

  # Adaptive foreground: the art laid into the 72 dp the launcher shows, on the
  # 108 dp canvas it masks.
  view=$((adaptive * 2 / 3))
  magick -size "${adaptive}x${adaptive}" "xc:$BG" \
    \( "$SRC" -resize "${view}x${view}" \) -gravity center -composite \
    -strip "$dir/ic_launcher_foreground.png"

  # Themed-icon silhouette: everything that is not the ember field, hardened to
  # one alpha shape so the system can tint it.
  magick -size "${adaptive}x${adaptive}" xc:none \
    \( "$SRC" -fuzz 14% -transparent "$BG" -alpha extract -threshold 45% \
       -resize "${view}x${view}" \) -gravity center -composite \
    -colorspace gray -strip "$dir/ic_launcher_monochrome.png"

  # Legacy square tile.
  magick "$SRC" -resize "${legacy}x${legacy}" -strip "$dir/ic_launcher.png"

  # Legacy round tile: the square clipped to a circle.
  magick "$SRC" -resize "${legacy}x${legacy}" \
    \( -size "${legacy}x${legacy}" xc:none -fill white -draw "circle $((legacy / 2)),$((legacy / 2)) $((legacy / 2)),0" \) \
    -alpha off -compose CopyOpacity -composite -strip "$dir/ic_launcher_round.png"
done

mkdir -p "$RES/mipmap-anydpi-v26" "$RES/values"
cat >"$RES/mipmap-anydpi-v26/ic_launcher.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
XML
cp "$RES/mipmap-anydpi-v26/ic_launcher.xml" "$RES/mipmap-anydpi-v26/ic_launcher_round.xml"

cat >"$RES/values/colors.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$BG</color>
    <!-- The window behind the app before its first frame: the same ember the
         icon is cut from, so launch reads as one surface, not a white flash. -->
    <color name="brand">$BG</color>
</resources>
XML

echo "▸ icons"
find "$RES" -name 'ic_launcher*' | sort | sed 's/^/  /'
