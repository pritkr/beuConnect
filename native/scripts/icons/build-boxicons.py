#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools>=4.53"]
# ///
"""Rebuild `assets/fonts/boxicons.ttf` from `src/ui/icons.tsx`.

The app ships one icon font, not a folder of SVGs: every glyph the code names
is copied out of Boxicons and everything else is dropped. The font is therefore
a build artefact of the icon map — add a name to `ICONS`, run this, and the
two agree again. `scripts/icons/verify.mjs` (which runs in the gate) is what
fails when they do not.

    uv run scripts/icons/build-boxicons.py            # rebuild in place
    uv run scripts/icons/build-boxicons.py --check    # size + coverage only

The full 320,944 B Boxicons TTF is never committed: at 12 MB of APK budget the
difference between 20 KB and 320 KB is a real feature. The subset keeps the
family name `boxicons` so `import family from "…/boxicons.ttf"` stays stable.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import re
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = "2.1.4"
URL = f"https://unpkg.com/boxicons@{VERSION}/fonts/boxicons.ttf"
# The upstream bytes we hashed once. A different font under the same version
# string would silently change every glyph in the app.
SHA256 = "47509a2dd79b019b0b914eed0ba4120748124889467a30a51f095c7adb41dc06"

ROOT = Path(__file__).resolve().parents[2]
ICONS_TSX = ROOT / "src/ui/icons.tsx"
OUT = ROOT / "assets/fonts/boxicons.ttf"
CACHE = Path.home() / "Library/Caches/beuconnect" / f"boxicons-{VERSION}.ttf"

ENTRY = re.compile(r"([rs]):\s*0x([0-9a-fA-F]{4,6})")


def codepoints() -> list[int]:
    """Every codepoint named in the icon map, regular and solid."""
    source = ICONS_TSX.read_text()
    start = source.index("const ICONS = {")
    end = source.index("} satisfies", start)
    codes = sorted({int(hex_code, 16) for _, hex_code in ENTRY.findall(source[start:end])})
    if not codes:
        sys.exit("build-boxicons: no codepoints found in src/ui/icons.tsx")
    return codes


def source_font() -> Path:
    """The pinned upstream TTF, downloaded once into the user's cache."""
    if CACHE.exists():
        digest = hashlib.sha256(CACHE.read_bytes()).hexdigest()
        if digest == SHA256:
            return CACHE
        CACHE.unlink()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"build-boxicons: fetching boxicons@{VERSION}")
    try:
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read()
    except OSError as error:
        sys.exit(f"build-boxicons: download failed: {error}")
    digest = hashlib.sha256(data).hexdigest()
    if digest != SHA256:
        sys.exit(f"build-boxicons: checksum mismatch\n  want {SHA256}\n  got  {digest}")
    CACHE.write_bytes(data)
    return CACHE


def build(codes: list[int]) -> None:
    font = TTFont(source_font())
    options = subset.Options()
    options.name_IDs = [1, 2, 4, 6]  # family stays `boxicons`
    options.name_languages = [0x409]
    options.layout_features = []  # icon glyphs carry no shaping
    options.drop_tables += ["GSUB", "GPOS", "GDEF", "BASE", "JSTF"]
    options.hinting = True
    options.desubroutinize = True

    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codes)
    subsetter.subset(font)

    # The exported family name is what nsh hands the runtime; a subsetter that
    # renames it would leave the app pointing at a font nobody defines.
    family = {record.toUnicode() for record in font["name"].names if record.nameID == 1}
    if family != {"boxicons"}:
        sys.exit(f"build-boxicons: family name changed: {sorted(family)}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUT)
    font.close()


def report(codes: list[int]) -> int:
    if not OUT.exists():
        print("build-boxicons: assets/fonts/boxicons.ttf is missing", file=sys.stderr)
        return 1
    data = OUT.read_bytes()
    covered = set(TTFont(OUT).getBestCmap())
    missing = [hex(code) for code in codes if code not in covered]
    extra = [hex(code) for code in sorted(covered) if code not in set(codes)]
    print(
        f"boxicons.ttf  {len(data):,} B  gzip {len(gzip.compress(data, 9)):,} B  "
        f"{len(covered)} glyphs  {len(codes)} named"
    )
    for label, items in (("missing from the font", missing), ("dead glyphs", extra)):
        if items:
            print(f"  {label}: {', '.join(items)}", file=sys.stderr)
            return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Subset Boxicons to the app's icon map.")
    parser.add_argument("--check", action="store_true", help="report only; never write")
    args = parser.parse_args()

    codes = codepoints()
    if not args.check:
        build(codes)
    return report(codes)


if __name__ == "__main__":
    raise SystemExit(main())
