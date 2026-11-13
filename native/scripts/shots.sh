#!/usr/bin/env bash
# Screenshot every route of the BEUConnect native app on macOS, in one command.
#
#   ./scripts/shots.sh                  # full set, light: .nsh/shots/shot-01-home.png …
#   ./scripts/shots.sh --only rank      # one screen (label or route name, comma separated)
#   ./scripts/shots.sh --scheme both    # light + dark (-dark files)
#   ./scripts/shots.sh --width 320      # narrow-phone pass (-320 files)
#   ./scripts/shots.sh --list           # the route table, in shot order
#   ./scripts/shots.sh --mode run       # fallback host: nsh run + screencapture (home only)
#
# Why a generated test file instead of `nsh run`: `nsh run` exposes no way to
# drive the app (no steps, no deep links, no route flag), so the macOS host can
# only be navigated through the test runner with the platform attached. A test
# file — not stdin steps — is used because one stdin step run has a single 30 s
# budget and `dispose()` ends the host; a test file gets one app per screen.
#
# Every nsh call goes through ./scripts/check.sh: the `.nsh` build cache is one
# directory shared by the parallel agents, so it must be locked (scripts/AGENTS.md).
#
# Exit: 0 all shots captured, 1 build/run/capture failure, 2 captured with
# warnings (a route not registered yet, or two routes shot identical pixels).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
source "$HOME/.config/nsh/env.sh" >/dev/null 2>&1 || true

APP="$ROOT/App.tsx"
GATE="$ROOT/scripts/check.sh"
OUT="$ROOT/.nsh/shots"
LOGS="$OUT/logs"
PLAN_DIR="$OUT/.plan"
PLAN="$PLAN_DIR/.shots.test.tsx"
SWIFT_FIND="$PLAN_DIR/find-window.swift"
MANIFEST="$OUT/manifest.txt"
LOG="$LOGS/shots.log"

# --- knobs (env or flags) ---------------------------------------------------
MODE="${SHOTS_MODE:-host}"          # host (automation) | run (nsh run + screencapture)
SCHEME="${SHOTS_SCHEME:-light}"     # light | dark | both
WIDTH="${SHOTS_WIDTH:-390}"         # points; the app's phone frame
HEIGHT="${SHOTS_HEIGHT:-844}"
ONLY="${SHOTS_ONLY:-}"              # comma separated labels or route names
OFFLINE="${SHOTS_OFFLINE:-0}"       # 1: no live network (error/empty states)
SEED_ONBOARDING="${SHOTS_SEED_ONBOARDING:-1}" # 1: pre-set beu.onboarding so the first-run gate is skipped
TEST_TIMEOUT="${SHOTS_TEST_TIMEOUT:-40}"     # seconds the screen's own test may take
SCREEN_TIMEOUT="${SHOTS_SCREEN_TIMEOUT:-300}" # seconds incl. waiting for the .nsh lock
WINDOW_NAME="${SHOTS_WINDOW_NAME:-BEUConnect}"
KEEP_PLAN="${SHOTS_KEEP_PLAN:-0}"

# --- route table: label | route | presses ------------------------------------
# Order is the user's route order: the five tabs, then the More screen's groups
# (Study, Daily, App). `presses` are accessibility labels pressed in sequence;
# `home` needs none because the app opens on it. Add a screen here only — file
# numbering, the generated plan and the manifest all follow this table.
SHOTS=(
  "home|home|"
  "syllabus|syllabus|Syllabus"
  "results|results|Results"
  "tools|tools|Tools"
  "more|more|More"
  "pyqs|pyqs|More;Previous year papers"
  "notices|notices|More;Notices"
  "calculator|tools.calculator|More;SGPA / CGPA calculator"
  "rank|results.rank|More;University rank"
  "merit|results.merit|More;Merit list"
  "battle|results.battle|More;Result battle"
  "students|students|More;Student register"
  "colleges|students.colleges|More;Student register;Colleges"
  "attendance|tools.attendance|More;Attendance"
  "routine|tools.routine|More;Routine"
  "holidays|tools.holidays|More;Holidays"
  "data|data|More;Data browser"
  "wifi|tools.wifi|More;Wi-Fi help"
  "profile|settings.profile|More;Profile"
  "settings|settings|More;Settings"
  "notifications|settings.notifications|More;Settings;Notifications"
  "feedback|tools.feedback|More;Send feedback"
  "about|settings.about|More;About BEUConnect"
)

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

say() { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; }
die() { fail "$*"; exit 1; }

strip_ansi() { perl -pe 's/\e\[[0-9;]*[A-Za-z]//g'; }

js_str() { printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"; }

js_presses() {
  local raw="$1" label out="" old_ifs="$IFS"
  IFS=';'
  for label in $raw; do
    [ -n "$label" ] && out="$out$(js_str "$label"), "
  done
  IFS="$old_ifs"
  printf '%s' "$out"
}

kill_tree() {
  local pid="$1" child
  [ -n "$pid" ] || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  [ "$KEEP_PLAN" = "1" ] || rm -f "$PLAN"
}
trap cleanup EXIT

# --- flags ------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --only)     ONLY="${2:-}"; shift 2 ;;
    --scheme)   SCHEME="${2:-}"; shift 2 ;;
    --width)    WIDTH="${2:-}"; shift 2 ;;
    --height)   HEIGHT="${2:-}"; shift 2 ;;
    --mode)     MODE="${2:-}"; shift 2 ;;
    --dark)     SCHEME="dark"; shift ;;
    --light)    SCHEME="light"; shift ;;
    --offline)  OFFLINE="1"; shift ;;
    --list)     MODE="list"; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          die "unknown option: $1 (try --help)" ;;
  esac
done

case "$SCHEME" in light|dark|both) ;; *) die "--scheme must be light, dark or both" ;; esac
case "$MODE" in host|run|list) ;;   *) die "--mode must be host or run" ;; esac
case "$WIDTH$HEIGHT" in *[!0-9]*) die "--width/--height must be numbers" ;; esac

# --- route selection --------------------------------------------------------
matches() {
  [ -z "$ONLY" ] && return 0
  local want label="$1" route="$2" old_ifs="$IFS"
  IFS=','
  for want in $ONLY; do
    want="$(printf '%s' "$want" | tr -d ' ')"
    [ -z "$want" ] && continue
    case "$label" in *"$want"*) IFS="$old_ifs"; return 0 ;; esac
    case "$route" in *"$want"*) IFS="$old_ifs"; return 0 ;; esac
  done
  IFS="$old_ifs"
  return 1
}

FILES=(); ROUTES=(); PRESSES=(); SCHEMES=()

add_cases() {
  local scheme="$1" entry label route presses n suffix
  n=0
  for entry in "${SHOTS[@]}"; do
    IFS='|' read -r label route presses <<< "$entry"
    n=$((n + 1))
    [ -n "$route" ] || continue
    matches "$label" "$route" || continue
    suffix=""
    [ "$WIDTH" != "390" ] && suffix="$suffix-$WIDTH"
    [ "$scheme" = "dark" ] && suffix="$suffix-dark"
    FILES+=("$(printf 'shot-%02d-%s%s.png' "$n" "$label" "$suffix")")
    ROUTES+=("$route")
    PRESSES+=("$presses")
    SCHEMES+=("$scheme")
  done
}

case "$SCHEME" in
  light) add_cases light ;;
  dark)  add_cases dark ;;
  both)  add_cases light; add_cases dark ;;
esac

if [ "$MODE" = "list" ]; then
  say "route order (label / route / entry):"
  n=0
  for entry in "${SHOTS[@]}"; do
    IFS='|' read -r label route presses <<< "$entry"
    n=$((n + 1))
    say "$(printf '%02d' "$n")  $label  $route  ${presses:-app opens here}"
  done
  exit 0
fi

[ ${#FILES[@]} -gt 0 ] || die "no screen matched --only '$ONLY' (see --list)"
command -v nsh >/dev/null 2>&1 || die "nsh not on PATH (source ~/.config/nsh/env.sh)"
[ -x "$GATE" ] || die "missing $GATE (the repo's serialised nsh wrapper)"
[ -f "$APP" ] || die "missing $APP"

mkdir -p "$OUT" "$LOGS" "$PLAN_DIR"
: > "$LOG"

# Every dev host and every test host is titled BEUConnect, so with two on screen
# a capture can come from the other one. The PNG hash check below catches two
# routes with identical pixels; this warns about the cause.
others="$(pgrep -fl 'nsh (run|test)' 2>/dev/null | grep -v 'shots.sh' || true)"
if [ -n "$others" ]; then
  say "! another nsh host is running — it can be captured instead of this one:"
  printf '%s\n' "$others" | sed 's/^/    /'
  say "  close it before a sweep that has to be trusted."
fi

# --- one generated test per screen ------------------------------------------
# `nsh test` with the platform attached draws the app, so `app.screenshot` writes
# a real PNG. One screen per run: progress is visible, a wedged host cannot take
# the whole set down, and `scripts/check.sh` holds the .nsh lock for one screen.
write_plan() {
  local idx="$1"
  {
    printf '%s\n' "// Generated by scripts/shots.sh — do not edit; rerun the script."
    printf '%s\n' 'import { open, test } from "nsh/test";'
    printf '%s\n' 'import type { OpenOptions } from "nsh/test";'
    printf '\n'
    printf 'const APP = %s;\n' "$(js_str "$APP")"
    printf 'const OUT = %s;\n' "$(js_str "$OUT")"
    printf 'const WIDTH = %s;\n' "$WIDTH"
    printf 'const HEIGHT = %s;\n' "$HEIGHT"
    printf 'const OFFLINE = %s;\n' "$([ "$OFFLINE" = "1" ] && echo true || echo false)"
    printf 'const TEST_TIMEOUT = %s;\n' "$((TEST_TIMEOUT * 1000))"
    # The first-run gate replaces the whole stack with the intro screen, so the
    # tabs would not exist to press. Seed the flag the shell gates on.
    if [ "$SEED_ONBOARDING" = "1" ]; then
      printf 'const SEED: Record<string, string> | null = { "beu.onboarding": %s };\n' \
        "$(js_str '{"done":true,"at":1}')"
    else
      printf 'const SEED: Record<string, string> | null = null;\n'
    fi
    printf 'const CASE = { file: %s, route: %s, presses: [%s], scheme: %s };\n' \
      "$(js_str "${FILES[$idx]}")" \
      "$(js_str "${ROUTES[$idx]}")" \
      "$(js_presses "${PRESSES[$idx]}")" \
      "$(js_str "${SCHEMES[$idx]}")"
    cat <<'JS'

test(`shot ${CASE.file}`, async () => {
  const options: OpenOptions = OFFLINE
    ? { width: WIDTH, height: HEIGHT }
    : { width: WIDTH, height: HEIGHT, network: "live" };
  // Home would otherwise be the intro screen and every tab press would miss.
  if (SEED !== null) options.storage = SEED;
  const app = await open(APP, options);
  // `open({ colorScheme })` does not repaint the real macOS host; this does.
  await app.setColorScheme(CASE.scheme as "light" | "dark");
  await app.wait(150);
  for (const label of CASE.presses) {
    await app.press(label);
    await app.wait(120);
  }
  const bytes = await app.screenshot(`${OUT}/${CASE.file}`);
  const seen = app.texts().join(" · ");
  console.log(`SHOT ${CASE.file} ${bytes.length}B ${CASE.route}`);
  if (seen.includes("No screen for")) console.log(`WARN ${CASE.file} route not registered: ${CASE.route}`);
}, TEST_TIMEOUT);
JS
  } > "$PLAN"
}

# `check.sh test-only` takes the shared lock, then runs `nsh test` with the
# arguments after it. Its own output is buffered to the last 100 lines, so the
# human-facing progress comes from this loop.
run_screen() {
  local log="$1" pid guard status=0
  (
    "$GATE" test-only --target macos "$PLAN"
  ) > "$log" 2>&1 &
  pid=$!
  (
    sleep "$SCREEN_TIMEOUT"
    if kill -0 "$pid" 2>/dev/null; then
      printf '✗ watchdog: screen ran longer than %ss\n' "$SCREEN_TIMEOUT" >> "$log"
      kill_tree "$pid"
    fi
  ) </dev/null >/dev/null 2>&1 &
  guard=$!

  wait "$pid" || status=$?
  kill_tree "$guard" 2>/dev/null
  wait "$guard" 2>/dev/null || true
  return "$status"
}

if [ "$MODE" = "run" ]; then
  # ---- fallback: no automation, one window, screencapture ------------------
  # Window ids that exist *before* launching, so a stale window from an earlier
  # run can never be captured by mistake.
  cat > "$SWIFT_FIND" <<'SWIFT'
import CoreGraphics
import Foundation

// Prints the ids of windows whose title matches SHOT_WINDOW_TITLE.
let env = ProcessInfo.processInfo.environment
let title = env["SHOT_WINDOW_TITLE"] ?? "BEUConnect"
let list = (CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]) ?? []
for window in list {
  let name = window[kCGWindowName as String] as? String ?? ""
  let id = window[kCGWindowNumber as String] as? Int ?? 0
  if name == title, id > 0 { print(id) }
}
SWIFT

  window_ids() { SHOT_WINDOW_TITLE="$WINDOW_NAME" swift "$SWIFT_FIND" 2>/dev/null || true; }
  before="$(window_ids | paste -sd, -)"
  pick_new() {
    local id
    for id in $(window_ids); do
      case ",$before," in
        *",$id,"*) ;;
        *) printf '%s' "$id"; return 0 ;;
      esac
    done
    return 1
  }

  say "→ run mode: starting nsh run (no steps, no deep links — home only)"
  nsh run "$APP" --window-size "${WIDTH}x${HEIGHT}" > "$LOGS/run.log" 2>&1 &
  RUN_PID=$!
  trap 'kill_tree "${RUN_PID:-}"; cleanup' EXIT INT TERM

  file="$OUT/shot-01-home-run.png"
  win=""
  for _ in $(seq 1 "$TEST_TIMEOUT"); do
    if ! kill -0 "$RUN_PID" 2>/dev/null; then
      fail "the host exited while waiting for the window"
      strip_ansi < "$LOGS/run.log" | grep -v 'font family' | tail -n 30
      exit 1
    fi
    win="$(pick_new)"
    [ -n "$win" ] && break
    sleep 1
  done
  [ -n "$win" ] || { fail "no '$WINDOW_NAME' window appeared in ${TEST_TIMEOUT}s"; exit 1; }

  sleep 2  # first paint + web fonts
  screencapture -x -o -l "$win" "$file" >/dev/null 2>&1
  [ -s "$file" ] || die "screencapture failed (grant Terminal Screen Recording permission)"

  printf 'SHOT %s\n' "$(basename "$file")" >> "$LOG"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(basename "$file")" "home" "run mode" "scheme as set" "${WIDTH}x${HEIGHT}" "$(stat -f%z "$file")" > "$MANIFEST"
  say "✓ 1 shot → $OUT (run mode cannot navigate; use --mode host for the full set)"
  exit 0
fi

# --- host mode: one screen at a time ---------------------------------------
say "→ shooting ${#FILES[@]} screen(s) at ${WIDTH}x${HEIGHT} (${SCHEME}), live network: $([ "$OFFLINE" = "1" ] && echo no || echo yes)"
say "  log: $LOG"

# One screen: its own app, its own locked `nsh test`. Returns 0 when the PNG
# appeared, 1 when this screen failed, 2 when the bundle itself did not
# compile — that error would hit every remaining screen too.
shoot_one() {
  local i="$1" attempt="${2:-0}"
  local file="${FILES[$i]}" route="${ROUTES[$i]}" tmp="$LOGS/tmp.log"
  local started elapsed hash

  rm -f "$OUT/$file"
  write_plan "$i"
  started=$SECONDS
  run_screen "$tmp"
  elapsed=$((SECONDS - started))
  printf '%s\n' "── ${file} ──" >> "$LOG"
  strip_ansi < "$tmp" >> "$LOG"

  if [ -s "$OUT/$file" ]; then
    hash="$(md5 -q "$OUT/$file")"
    # Two routes cannot be pixel-identical. When this one is, the host shot the
    # wrong window (every dev host is titled BEUConnect) or a press landed on
    # the wrong row; shoot it once more.
    if [ "$attempt" -eq 0 ] && cut -f1 "$OUT/.hashes" | grep -qx "$hash"; then
      say "! ${file} is pixel-identical to an earlier screen — shooting it again"
      shoot_one "$i" 1
      return $?
    fi
    printf '%s\t%s\n' "$hash" "$file" >> "$OUT/.hashes"
    say "✓ $((i + 1))/${#FILES[@]}  ${file}  ${route}  ${elapsed}s"
    return 0
  fi

  # File mode prints the whole OXC diagnostic here: file, symbol, line.
  fail "no screenshot for ${file} (${route})"
  strip_ansi < "$tmp" | grep -vE '^$|font family' | tail -n 14 | sed 's/^/    /'
  if grep -qE 'MISSING_EXPORT|UNRESOLVED_IMPORT|Failed to bundle|building .* failed|open\(".*App\.tsx"\): src/' "$tmp"; then
    return 2
  fi
  return 1
}

: > "$OUT/.hashes"
i=0
retry=()
while [ $i -lt ${#FILES[@]} ]; do
  shoot_one "$i"
  status=$?
  if [ "$status" -eq 2 ]; then
    # Not a screen's problem: every remaining screen would print the same
    # compile error. Queue them all and let the tree settle for the retry.
    say "  the bundle does not compile right now — queueing the rest for the retry"
    while [ $i -lt ${#FILES[@]} ]; do retry+=("$i"); i=$((i + 1)); done
    break
  fi
  if [ "$status" -ne 0 ]; then retry+=("$i"); fi
  i=$((i + 1))
done

# One second pass. Several agents write this tree at once, so a module can be
# saved mid-write for a few seconds (a missing `<Presets>`, a missing export);
# that is transient, not a broken screen, and one retry is usually enough.
if [ ${#retry[@]} -gt 0 ]; then
  say ""
  say "↻ retrying ${#retry[@]} screen(s): the tree may have been mid-write"
  for i in "${retry[@]}"; do
    shoot_one "$i"
    status=$?
    if [ "$status" -eq 2 ]; then
      say "  still not compiling — the rest of the retry would hit the same error"
      break
    fi
  done
fi

# --- report -----------------------------------------------------------------
missing=0
warnings=0
: > "$MANIFEST"
: > "$OUT/.hashes"
i=0
while [ $i -lt ${#FILES[@]} ]; do
  file="${FILES[$i]}"
  entry="${PRESSES[$i]}"
  entry="${entry//;/ › }"
  if [ -s "$OUT/$file" ]; then
    bytes="$(stat -f%z "$OUT/$file")"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$file" "${ROUTES[$i]}" "${entry:-app opens here}" "${SCHEMES[$i]}" "${WIDTH}x${HEIGHT}" "$bytes" >> "$MANIFEST"
    printf '%s\t%s\n' "$(md5 -q "$OUT/$file")" "$file" >> "$OUT/.hashes"
  else
    missing=$((missing + 1))
  fi
  i=$((i + 1))
done

grep -h '^WARN ' "$LOG" >&2 || true
warnings="$(grep -c '^WARN ' "$LOG" 2>/dev/null || true)"
[ -n "$warnings" ] || warnings=0

# Two routes cannot be pixel-identical. When they are, a press landed on the
# wrong row (the host was busy and the list moved under the tap) and the same
# screen was shot twice — flag it instead of shipping a wrong screenshot.
dupes=0
while IFS= read -r hash; do
  [ -n "$hash" ] || continue
  pair="$(awk -F'\t' -v h="$hash" '$1 == h { printf "%s ", $2 }' "$OUT/.hashes")"
  say "! identical screenshots: ${pair% } — a press landed on the wrong row"
  dupes=$((dupes + 1))
done <<EOF
$(cut -f1 "$OUT/.hashes" | sort | uniq -d)
EOF
rm -f "$OUT/.hashes"

say ""
say "manifest: $MANIFEST (file, route, entry, scheme, viewport, bytes)"

if [ "$missing" -gt 0 ]; then
  fail "$missing of ${#FILES[@]} screens were not captured after one retry (see $LOG)"
  say "hint: several agents edit this repo at once, so a module can be mid-write;"
  say "      rerun once ./scripts/check.sh passes. Nothing was left running."
  exit 1
fi

say "✓ ${#FILES[@]} shot(s) → $OUT"
if [ "$warnings" -gt 0 ] || [ "$dupes" -gt 0 ]; then
  [ "$warnings" -gt 0 ] && say "! $warnings route warning(s): the screen rendered 'No screen for' — a route is not registered yet"
  [ "$dupes" -gt 0 ] && say "! $dupes duplicate pair(s): rerun those with --only <label> (see above)"
  exit 2
fi
exit 0
