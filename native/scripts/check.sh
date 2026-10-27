#!/usr/bin/env bash
# Serialised `nsh check` / `nsh test` for parallel agents.
#
#   ./scripts/check.sh            # nsh check (types + build)
#   ./scripts/check.sh test       # nsh check, then nsh test
#   ./scripts/check.sh test-only  # nsh test only
#
# Why: the nsh build cache lives in one `.nsh/` directory per project, so two
# processes building at once corrupt each other. Every agent in this repo must
# go through this script instead of calling `nsh` directly; it takes a lock,
# runs the command, and always releases the lock (even on Ctrl-C).
#
# The lock is a directory: `mkdir` is atomic on every filesystem we use.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
source "$HOME/.config/nsh/env.sh" >/dev/null 2>&1 || true

LOCK="${TMPDIR:-/tmp}/beuconnect-nsh.lock"
MODE="${1:-check}"
DEADLINE=$(( $(date +%s) + ${CHECK_LOCK_WAIT:-900} ))

acquired=0
while [ "$acquired" -eq 0 ]; do
  if mkdir "$LOCK" 2>/dev/null; then
    acquired=1
    echo $$ > "$LOCK/pid"
  else
    holder="$(cat "$LOCK/pid" 2>/dev/null || echo "?")"
    if [ -n "$holder" ] && [ "$holder" != "?" ] && ! kill -0 "$holder" 2>/dev/null; then
      rm -rf "$LOCK"   # stale lock from a killed agent
      continue
    fi
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
      echo "check.sh: lock held by pid $holder for too long; running anyway" >&2
      acquired=1
    else
      sleep 2
    fi
  fi
done

cleanup() { [ "$acquired" -eq 1 ] && [ -d "$LOCK" ] && [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ] && rm -rf "$LOCK"; }
trap cleanup EXIT INT TERM

# A `<List` with no height paints nothing — not even its own header — and no
# rendering test can see it, because `app.texts()` reports text that exists
# whether or not layout gave it pixels. That is how Syllabus and Previous papers
# shipped to a phone as a title bar over an empty page. The scan reads source, so
# it runs first and it is cheap.
run_lint() {
  echo "── lint: list heights ──"
  bun scripts/lint-list-height.mjs
}

run_check() {
  run_lint || return 1
  # An icon is a codepoint baked into a subset font: a name the font does not
  # carry paints an empty box, and `app.texts()` cannot see it. Cheap, reads
  # the TTF's own cmap, so it runs before the build.
  echo "── icons: font coverage ──"
  bun scripts/icons/verify.mjs || return 1
  # The app knows what it already ships from a generated hash list; a stale one
  # would make every phone re-download its own syllabus.
  echo "── data: live feed hashes ──"
  bun scripts/data/publish-feed.ts --check || return 1
  echo "── nsh check ──"
  nsh check 2>&1 | tail -40
  return "${PIPESTATUS[0]}"
}

run_test() {
  echo "── nsh test ──"
  # Four classes are documented false positives (docs/ARCHITECTURE.md): the
  # engine resolves them from the theme, the static scanner does not. Filter a
  # warning line only when *every* class it names is in that allowlist — one
  # real typo in the same line must still reach the reader.
  nsh test "$@" 2>&1 | awk '
    # Per-file form: warn /abs/path:12:34: unknown class `name`
    /^warn .*: unknown class `[^`]*`$/ {
      if ($0 ~ /: unknown class `(text-primary-ink|border-border-strong|text-accent-ink|bg-accent-ink)`$/) next
    }
    # Aggregated form: warn unknown classes: a, b
    /^warn unknown classes: / {
      line = $0
      sub(/^warn unknown classes: /, "", line)
      count = split(line, names, /, */)
      known = 1
      for (i = 1; i <= count; i += 1) {
        if (names[i] !~ /^(text-primary-ink|border-border-strong|text-accent-ink|bg-accent-ink)$/) known = 0
      }
      if (known) next
    }
    { print }
  ' | tail -100
  return "${PIPESTATUS[0]}"
}

case "$MODE" in
  check)      run_check ;;
  test-only)  shift; run_test "$@" ;;
  test)       shift; run_check && run_test "$@" ;;
  *) echo "usage: check.sh [check|test|test-only] [test file…]" >&2; exit 64 ;;
esac
