#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]>=4.55", "brotli>=1.1"]
# ///
"""Rebuild the self-hosted BEUConnect webfonts.

Run by hand, commit the generated files:

    uv run scripts/subset-fonts.py
    uv run scripts/subset-fonts.py --source-dir /path/to/font-sources  # offline
    uv run scripts/subset-fonts.py --check                             # verify only

Why the files are split
-----------------------
Each family ships two files:

* ``*-core.woff2`` — printable ASCII, NBSP, the curly quotes/dashes/ellipsis
  the site actually uses, plus ``©`` and ``·``.  ``©`` is in every page footer
  and ``·`` is on most pages, so leaving them out of core would make nearly
  every page fetch the extended file.  Core also carries the two combining
  marks the old Google ranges exposed (macron, diaeresis), so decomposed
  ASCII text stays in one face.  Core is preloaded from ``Layout.astro``.
* ``*-ext.woff2`` — the rest of Latin-1 and Latin Extended-A plus the used
  characters outside those blocks (``•``, ``−``, ``ṅ``, ``₹``).  It is
  declared with ``unicode-range`` and fetched only when a page uses one of
  those characters.

``unicode-range`` is generated from each output file's real cmap, so the two
files never claim the same character.

Only reach for this script again when:

* the Latin-1 / Latin Extended-A requirement changes,
* a page starts using a character outside the sets below (add it to ``USED``),
* the upstream font files change (update URL + SHA-256 + weights/features), or
* the CSS feature list changes (e.g. a new ``font-variant-*`` request).

The previous inventory (430 built pages, 2026-10-30) found these non-ASCII
characters outside plain ASCII: © · – ’ — ” “ ° • ‟ „ ö → é 𝑛 𝑅 ṅ ṇ ā ‘ ➢
² ‗ ¹ … × π ³ ‐ ₂ ‑ ε ü ← ₹ Ω ∅ Å ◆ ‖ É ― Ž Ø Cyrillic/letterlike marks,
and a private-use bullet.  Only characters the old brand fonts could already
render are kept here; the rest were (and remain) system fallbacks.  The
mathematical italic letters (𝑛, 𝑅, 𝜋) and the dingbats (➢, ➔) are examples
of intentional fallbacks that this script must not add to the brand fonts.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "src" / "assets" / "fonts"
CSS_PATH = ROOT / "src" / "styles" / "fonts.css"

# Printable ASCII is the floor; everything else here is observed on the site.
CORE = set(range(0x20, 0x7F)) | {
    0x00A0,  # NBSP
    0x00A9,  # © — every page footer
    0x00B7,  # · — most pages
    0x2013,  # en dash
    0x2014,  # em dash
    0x2018,  # ‘
    0x2019,  # ’
    0x201C,  # “
    0x201D,  # ”
    0x201E,  # „
    0x201F,  # ‟
    0x2026,  # …
    # The old Google ranges only exposed these two combining marks, so they
    # belong in core: a decomposed ASCII letter + mark then stays in one face.
    0x0304,  # combining macron
    0x0308,  # combining diaeresis
}

# Latin-1 Supplement + Latin Extended-A.  Characters missing from a source
# font simply do not make it into that family's extended file.
LATIN = set(range(0x00A0, 0x0100)) | set(range(0x0100, 0x0180))

# Used characters outside Latin-1/Ext-A that the old shipped subsets could
# already render.  Do not add system-fallback characters such as →, ➢, 𝜋 or
# the Mathematical Italic block: that would change how the site looks.
USED = {
    0x1E45,  # ṅ
    0x2022,  # •
    0x20B9,  # ₹
    0x2212,  # − (minus sign, not hyphen)
}

SOURCES = {
    "public-sans": {
        "filename": "PublicSans-wght.ttf",
        "url": (
            "https://raw.githubusercontent.com/google/fonts/"
            "37caf657942042c2de8f5f11d9d6866a1b689b84/ofl/publicsans/"
            "PublicSans%5Bwght%5D.ttf"
        ),
        "sha256": "d75a7dc1a27eb9e336d5b33f55489d2ecb5621bf694d5c43b2415bce2ca830a8",
        "family": "Public Sans",
        "weight": "400 700",
        "features": [
            "ccmp",
            "locl",
            "liga",
            "calt",
            "kern",
            "tnum",
            "lnum",
            "mark",
            "mkmk",
        ],
        # Used weights are 400, 500, 550, 600, 650 and 700.  Keep the axis
        # variable over exactly that range; the default becomes 400.
        "axis_limits": {"wght": (400, 700)},
    },
    "instrument-serif": {
        "filename": "InstrumentSerif-Regular.woff2",
        "url": (
            "https://raw.githubusercontent.com/Instrument/instrument-serif/"
            "90dae9172e1c05b6c4661a98d5961b193a51ea16/fonts/webfonts/"
            "InstrumentSerif-Regular.woff2"
        ),
        "sha256": "ca21b99b0d6b88a0dc34cebfe48104611e5c7f8f92746bed26c37aa470174322",
        "family": "Instrument Serif",
        "weight": "400",
        "features": [
            "ccmp",
            "locl",
            "liga",
            "kern",
            "mark",
            "mkmk",
        ],
        "axis_limits": None,
    },
}

CSS_HEADER = """\
/* Self-hosted so the first paint never waits on fonts.googleapis.com.
   Generated by scripts/subset-fonts.py — edit the script and rerun it, not
   this file.

   Each family has a small preloaded core (ASCII + the punctuation used in
   every layout, plus © and ·) and an extended file that is fetched only when
   a character in its unicode-range appears.  The two ranges are disjoint and
   generated from the files' actual cmaps. */
"""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resolve_source(spec: dict, source_dir: Path | None) -> Path:
    if source_dir is not None:
        path = source_dir / spec["filename"]
    else:
        cache_root = Path(
            os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")
        ) / "beuconnect-fonts"
        path = cache_root / spec["filename"]
        if not path.exists():
            cache_root.mkdir(parents=True, exist_ok=True)
            print(f"downloading {spec['filename']} …")
            try:
                urllib.request.urlretrieve(spec["url"], path)
            except OSError as error:
                raise SystemExit(
                    f"could not download {spec['url']}: {error}\n"
                    "Pass --source-dir with a local copy (see the URLs and "
                    "SHA-256 hashes in this script)."
                ) from error
    if not path.exists():
        raise SystemExit(f"missing source font: {path}")
    digest = sha256(path)
    if digest != spec["sha256"]:
        raise SystemExit(
            f"unexpected SHA-256 for {path}\n"
            f"  expected {spec['sha256']}\n"
            f"  got      {digest}\n"
            "The upstream file changed; review the differences before "
            "updating the hash."
        )
    return path


def compact_range(codepoints: set[int], width: int = 88) -> str:
    points = sorted(codepoints)
    if not points:
        raise ValueError("empty unicode set")
    chunks: list[tuple[int, int]] = []
    start = previous = points[0]
    for point in points[1:]:
        if point == previous + 1:
            previous = point
            continue
        chunks.append((start, previous))
        start = previous = point
    chunks.append((start, previous))

    pieces = [
        f"U+{start:04X}" if start == end else f"U+{start:04X}-{end:04X}"
        for start, end in chunks
    ]
    lines: list[str] = []
    line = ""
    for piece in pieces:
        candidate = f"{line}, {piece}" if line else piece
        if len(candidate) > width and line:
            lines.append(line)
            line = piece
        else:
            line = candidate
    if line:
        lines.append(line)
    return ",\n\t\t".join(lines)


def build_subset(
    source: Path,
    spec: dict,
    codepoints: set[int],
    out_path: Path,
) -> set[int]:
    font = TTFont(source)
    source_cmap = font.getBestCmap()
    wanted = codepoints & set(source_cmap)
    if not wanted:
        raise SystemExit(f"{spec['family']}: subset would be empty")

    if spec["axis_limits"] and "fvar" in font:
        instantiateVariableFont(
            font, spec["axis_limits"], inplace=True, optimize=True
        )

    options = Options()
    options.layout_features = spec["features"]
    options.hinting = False  # the shipped Google subsets were already unhinted
    options.desubroutinize = False
    options.prune_unicode_ranges = True
    options.recalc_bounds = True
    options.recalc_timestamp = False
    options.notdef_outline = True

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=sorted(wanted))
    subsetter.subset(font)

    font.flavor = "woff2"
    # Keep ``head.modified`` from the source font.  The default re-stamps it
    # with the current time, so every run would produce different bytes and
    # ``--check`` could never pass.
    font.recalcTimestamp = False
    font.save(out_path)

    result = TTFont(out_path)
    actual = set(result.getBestCmap())
    missing = wanted - actual
    if missing:
        raise SystemExit(
            f"{spec['family']} {out_path.name}: missing "
            f"{', '.join(f'U+{cp:04X}' for cp in sorted(missing))}"
        )
    extra = actual - wanted
    if extra:
        print(
            f"note: {out_path.name} cmap also contains "
            f"{', '.join(f'U+{cp:04X}' for cp in sorted(extra))}"
        )
    return actual


def describe(font_path: Path) -> dict:
    font = TTFont(font_path)
    features = set()
    for table in ("GSUB", "GPOS"):
        if table in font:
            features.update(
                record.FeatureTag
                for record in font[table].table.FeatureList.FeatureRecord
            )
    axes = {}
    if "fvar" in font:
        axes = {
            axis.axisTag: (axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in font["fvar"].axes
        }
    return {
        "bytes": font_path.stat().st_size,
        "glyphs": len(font.getGlyphOrder()),
        "cmap": len(font.getBestCmap()),
        "features": sorted(features),
        "axes": axes,
        "tables": sorted(font.keys()),
    }


def css_for(
    family: str,
    weight: str,
    core_name: str,
    ext_name: str,
    core_range: str,
    ext_range: str,
) -> str:
    return f"""
@font-face {{
\tfont-family: "{family}";
\tfont-style: normal;
\tfont-weight: {weight};
\tfont-display: swap;
\tsrc: url("../assets/fonts/{core_name}") format("woff2");
\tunicode-range: {core_range};
}}

@font-face {{
\tfont-family: "{family}";
\tfont-style: normal;
\tfont-weight: {weight};
\tfont-display: swap;
\tsrc: url("../assets/fonts/{ext_name}") format("woff2");
\tunicode-range: {ext_range};
}}
"""


def render(source_dir: Path | None, destination: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    css = CSS_HEADER
    generated: list[Path] = []

    for key, spec in SOURCES.items():
        source = resolve_source(spec, source_dir)
        source_font = TTFont(source)
        available = set(source_font.getBestCmap())

        core = (CORE & available)
        ext = ((LATIN | USED) - CORE) & available
        overlap = core & ext
        if overlap:
            raise SystemExit(
                f"{spec['family']}: core/ext overlap "
                f"{', '.join(f'U+{cp:04X}' for cp in sorted(overlap))}"
            )

        family_dir = destination
        core_path = family_dir / f"{key}-core.woff2"
        ext_path = family_dir / f"{key}-ext.woff2"
        core_actual = build_subset(source, spec, core, core_path)
        ext_actual = build_subset(source, spec, ext, ext_path)
        generated.extend([core_path, ext_path])

        css += css_for(
            spec["family"],
            spec["weight"],
            core_path.name,
            ext_path.name,
            compact_range(core_actual),
            compact_range(ext_actual),
        )

        for path in (core_path, ext_path):
            info = describe(path)
            axes = ", ".join(
                f"{tag} {mn:g}–{mx:g} (default {df:g})"
                for tag, (mn, df, mx) in info["axes"].items()
            ) or "static"
            print(
                f"{path.name:32} {info['bytes']:>7,} B  "
                f"{info['glyphs']:>3} glyphs  {info['cmap']:>3} chars  "
                f"{axes}  features: {','.join(info['features'])}"
            )
            if "fpgm" in info["tables"] or "prep" in info["tables"]:
                raise SystemExit(f"{path.name}: hinting tables survived")
            if info["axes"] and spec["axis_limits"] is None:
                raise SystemExit(f"{path.name}: unexpected variable axes")

    css_path = destination / "fonts.css"
    css_path.write_text(css, encoding="utf-8")
    generated.append(css_path)
    return css_path


def compare_and_install(temp: Path) -> None:
    mismatches = []
    for path in sorted(temp.iterdir()):
        target = CSS_PATH if path.name == "fonts.css" else FONT_DIR / path.name
        if not target.exists() or target.read_bytes() != path.read_bytes():
            mismatches.append(path.name)

    if mismatches:
        raise SystemExit(
            "generated files differ from the committed ones: "
            + ", ".join(mismatches)
            + "\nRerun without --check and commit the result."
        )
    print("OK: committed fonts and fonts.css match the script output")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="directory containing the two source files (skips download)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed files instead of replacing them",
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="beu-fonts-") as temporary:
        temp = Path(temporary)
        render(args.source_dir, temp)

        if args.check:
            compare_and_install(temp)
            return

        FONT_DIR.mkdir(parents=True, exist_ok=True)
        for path in sorted(temp.iterdir()):
            target = CSS_PATH if path.name == "fonts.css" else FONT_DIR / path.name
            shutil.copyfile(path, target)
        print(f"wrote {CSS_PATH.relative_to(ROOT)} and {FONT_DIR.relative_to(ROOT)}/*.woff2")


if __name__ == "__main__":
    sys.exit(main())
