#!/usr/bin/env bash
# The embedding SDK for the `nsh` that is installed.
#
# Until 0.4 the installer's tarball carried `embed/android/nsh.aar`; 0.5 moved
# the embedding SDKs out of the distribution into a release asset of their own
# (`nsh-embed-android.zip`), so `nsh update` now leaves the path the host build
# reads empty. This fetches and verifies the matching AAR once, from the same
# release as the CLI, and keeps it outside `~/.nsh` so an update cannot delete it.
#
# Usage:
#   ./scripts/fetch-nsh-embed.sh            # prints the AAR path
#   ./scripts/fetch-nsh-embed.sh --check    # exits 1 unless it is already there
#
# Output: ${XDG_CACHE_HOME:-~/.cache}/beuconnect/nsh-embed/v<version>/nsh.aar
#
# `NSH_EMBED_VERSION` overrides the release tag (default: `nsh --version`),
# `NSH_EMBED_DIR` the directory the AAR sits in.
set -euo pipefail

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

version="${NSH_EMBED_VERSION:-}"
if [ -z "$version" ]; then
  raw="$(nsh --version 2>/dev/null | awk '{print $2}')"
  [ -n "$raw" ] || { echo "fetch-nsh-embed: no nsh on PATH" >&2; exit 1; }
  # `nsh 0.5.0 (f4d68f7)` and a nightly build both name a tag: `v0.5.0` and
  # `nightly`. A dev build from a checkout has no release to match.
  case "$raw" in
    nightly*) version=nightly ;;
    *) version="v$raw" ;;
  esac
fi

cache="${XDG_CACHE_HOME:-$HOME/.cache}/beuconnect/nsh-embed"
dir="${NSH_EMBED_DIR:-$cache/$version}"
aar="$dir/nsh.aar"

if [ -f "$aar" ]; then
  echo "$aar"
  exit 0
fi
if [ "$CHECK" = "1" ]; then
  echo "fetch-nsh-embed: $aar is missing — run ./scripts/fetch-nsh-embed.sh" >&2
  exit 1
fi

command -v curl >/dev/null 2>&1 || { echo "missing: curl" >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "missing: unzip" >&2; exit 1; }

url="https://github.com/longbridge/nsh/releases/download/$version/nsh-embed-android.zip"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT INT TERM

echo "▸ fetching the Android embedding SDK ($version)" >&2
curl -fsSL --retry 3 "$url" -o "$work/embed.zip"
curl -fsSL --retry 3 "$url.sha256" -o "$work/embed.zip.sha256"

(
  cd "$work"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c embed.zip.sha256 >/dev/null
  else
    sha256sum -c embed.zip.sha256 >/dev/null
  fi
) || { echo "fetch-nsh-embed: checksum mismatch for $url" >&2; exit 1; }

unzip -q -o "$work/embed.zip" -d "$work/out"
mkdir -p "$dir"
cp "$work/out/nsh-embed-android/nsh.aar" "$aar"
cp "$work/out/nsh-embed-android/nsh-dev.aar" "$dir/nsh-dev.aar"

echo "$aar"
