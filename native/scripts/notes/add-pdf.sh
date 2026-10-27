#!/usr/bin/env bash
# Add one handwritten PDF to the Notes & VVI shelf, then rebuild the manifest.
#
#   ./native/scripts/notes/add-pdf.sh <file.pdf> <branch> <sem> <code> "<Subject name>" [kind]
#
# Example:
#   ./native/scripts/notes/add-pdf.sh ~/Desktop/dsa-unit-1.pdf cse 3 105302 \
#     "Data Structure & Algorithms" handwritten
#
# kind is one of handwritten (default), short, formula, vvi. The file is copied
# to public/notes/<branch>/<sem>/<code>/<kind>-<name>.pdf, subject.json is
# created when missing, and public/data/notes.json is rebuilt.
#
# <code> is the subject code as the student sees it: a number for most papers
# (105302), letters when BEU uses them (EC105, PCC CE 304). It becomes a folder
# name, so it must not contain a slash.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 64
}

[ "$#" -ge 5 ] || usage
SRC="$1"
BRANCH="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
SEM="$3"
CODE="$4"
NAME="$5"
KIND="${6:-handwritten}"

case "$BRANCH" in
  cse|ece|ee|mech|civil|eee) ;;
  *) echo "add-pdf: branch must be cse, ece, ee, mech, civil or eee" >&2; exit 64 ;;
esac
case "$SEM" in
  [1-8]) ;;
  *) echo "add-pdf: semester must be 1 to 8" >&2; exit 64 ;;
esac
case "$CODE" in
  ""|*/*)
    echo "add-pdf: subject code must be non-empty and must not contain a slash" >&2
    exit 64
    ;;
esac
case "$KIND" in
  handwritten|short|formula|vvi) ;;
  *) echo "add-pdf: kind must be handwritten, short, formula or vvi" >&2; exit 64 ;;
esac
[ -f "$SRC" ] || { echo "add-pdf: no such file: $SRC" >&2; exit 66; }
case "$SRC" in
  *.pdf|*.PDF) ;;
  *) echo "add-pdf: expected a .pdf file" >&2; exit 65 ;;
esac

SIZE="$(wc -c < "$SRC" | tr -d ' ')"
if [ "$SIZE" -gt $((8 * 1024 * 1024)) ]; then
  echo "add-pdf: warning — $(echo "scale=1; $SIZE/1048576" | bc) MB is over the 8 MB guideline; compress it before deploying." >&2
fi

SLUG="$(basename "$SRC" .pdf | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
DIR="public/notes/$BRANCH/$SEM/$CODE"
mkdir -p "$DIR"

DEST="$DIR/$KIND-$SLUG.pdf"
n=2
while [ -e "$DEST" ]; do
  DEST="$DIR/$KIND-$SLUG-$n.pdf"
  n=$((n + 1))
done
cp "$SRC" "$DEST"

if [ ! -f "$DIR/subject.json" ]; then
  python3 - "$DIR/subject.json" "$NAME" <<'PY'
import json, sys
path, name = sys.argv[1], " ".join(sys.argv[2].split())
with open(path, "w", encoding="utf-8") as handle:
    json.dump({"name": name}, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY
  echo "add-pdf: wrote $DIR/subject.json"
fi

uv run native/scripts/notes/build-notes.py
echo
echo "add-pdf: copied to $DEST"
echo "add-pdf: it will be served at https://beu.prit.eu.org/${DEST#public/}"
echo "add-pdf: deploy the site for the app to pick it up."
