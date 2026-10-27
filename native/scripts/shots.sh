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
# only be navigated through `nsh test --target macos`. A test file — not stdin
# steps — is used because one stdin step run has a single 30 s budget and
# `dispose()` ends the host; a test file gets one app and one timeout per
# screen, and keeps going when one screen fails.
#
# Exit: 0 all shots captured, 1 build/run/capture failure, 2 captured with
# warnings (a route not registered yet).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
source "$HOME/.config/nsh/env.sh" >/dev/null 2>&1 || true

APP="$ROOT/App.tsx"
OUT="$ROOT/.nsh/shots"
LOGS="$OUT/logs"
PLAN_DIR="$OUT/.plan"
PLAN="$PLAN_DIR/.shots.test.tsx"
SWIFT_FIND="$PLAN_DIR/find-window.swift"
MANIFEST="$OUT/manifest.txt"
LOG="$LOGS/shots.log"
BUILD_LOG="$LOGS/build.log"

# --- knobs (env or flags) ---------------------------------------------------
MODE="${SHOTS_MODE:-host}"          # host (automation) | run (nsh run + screencapture)
SCHEME="${SHOTS_SCHEME:-light}"     # light | dark | both
WIDTH="${SHOTS_WIDTH:-390}"         # points; the app's phone frame
HEIGHT="${SHOTS_HEIGHT:-844}"
ONLY="${SHOTS_ONLY:-}"              # comma separated labels or route names
OFFLINE="${SHOTS_OFFLINE:-0}"       # 1: no live network (error/empty states)
TEST_TIMEOUT="${SHOTS_TEST_TIMEOUT:-40}"   # seconds per screen (nsh default is 30)
WINDOW_NAME="${SHOTS_WINDOW_NAME:-BEUConnect}"
KEEP_PLAN="${SHOTS_KEEP_PLAN:-0}"

# --- route table: label | route | presses ------------------------------------
# Order is the user's route order: the five tabs, then the More screen's groups
# (Study, Daily, App). `presses` are accessibility labels pressed in sequence;
# `home` needs none because the app opens on it. Add a screen here only — the
# generated test file, file numbering and manifest all follow this table.
SHOTS=(
  "home|home|"
  "syllabus|syllabus|Syllabus"
  "results|results|Results"
  "tools|tools|Tools"
  "more|more|More"
  "pyqs|pyqs|More;Previous year papers"
  "notes|notes|More;Notes & VVI"
  "notes-subject|notes.subject|More;Notes & VVI;Computer Organization & Architecture"
  "planner|planner|More;Study planner"
  "notices|notices|More;Notices"
  "calculator|tools.calculator|More;SGPA / CGPA calculator"
  "rank|results.rank|More;University rank"
  "merit|results.merit|More;Merit list"
  "battle|results.battle|More;Result battle"
  "attendance|tools.attendance|More;Attendance"
  "routine|tools.routine|More;Routine"
  "holidays|tools.holidays|More;Holidays"
  "data|data|More;Data browser"
  "wifi|tools.wifi|More;Wi-Fi help"
  "profile|settings.profile|More;Profile"
  "settings|settings|More;Settings"
  "feedback|tools.feedback|More;Send feedback"
  "about|settings.about|More;About BEUConnect"
)

# `data.table` is the one screen this table cannot reach: it takes a tap on a
# dataset row, and those rows are named after the live manifest ("Government
# Engineering College Sheikhpura, semester 5, batch 24"), so no label here would
# stay true. Its parent `data` is shot, and the table itself is covered by
# qa/routes.contract.ts.

usage() { sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

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
[ -f "$APP" ] || die "missing $APP"

mkdir -p "$OUT" "$LOGS" "$PLAN_DIR"
: > "$LOG"

# --- preflight: fail before opening any window ------------------------------
# `nsh test` reduces a bundle error to "building App.tsx failed"; `nsh build`
# prints the actual diagnostic (`src/features/tools/index.tsx` mid-write shows
# up here). Also warms the bundle cache for the runs below.
say "→ building App.tsx"
if ! nsh build App.tsx > "$BUILD_LOG" 2>&1; then
  fail "bundle failed, so no screenshots were taken"
  strip_ansi < "$BUILD_LOG" | grep -v 'font family' | tail -n 40
  say ""
  say "hint: several agents edit this repo at once, so a feature module may be"
  say "      mid-write (today: tools/index.tsx, results/*.tsx, notices/api.ts)."
  say "      rerun when it settles; nothing was left running."
  exit 1
fi

# --- generated test plan, one test per screen -------------------------------
write_plan() {
  local idx press_js=""
  for idx in "$@"; do
    press_js="$press_js
  { file: $(js_str "${FILES[$idx]}"), route: $(js_str "${ROUTES[$idx]}"), presses: [$(js_presses "${PRESSES[$idx]}")], scheme: \"${SCHEMES[$idx]}\" },"
  done

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
    # A shot is of a screen a student can reach, so the app must start past
    # onboarding with a saved student. Without this every shot is the first-run
    # gate, which is how this script silently stopped covering the app.
    printf 'const STORAGE: Record<string, string> = {\n'
    printf '  "beu.onboarding": JSON.stringify({ done: true, at: 1 }),\n'
    printf '  "beu.profile": JSON.stringify({ name: "Prit Kumar", reg: "24105157010", college: "157", branch: "cse", sem: 1 }),\n'
    printf '};\n'
    printf 'const CASES: { file: string; route: string; presses: string[]; scheme: "light" | "dark" }[] = ['
    printf '%s\n' "$press_js"
    printf '%s\n' '];'
    cat <<'JS'

for (const c of CASES) {
  test(`shot ${c.file}`, async () => {
    const options: OpenOptions = OFFLINE
      ? { width: WIDTH, height: HEIGHT, storage: STORAGE }
      : { width: WIDTH, height: HEIGHT, network: "live", storage: STORAGE };
    const app = await open(APP, options);
    // `open({ colorScheme })` does not repaint the real macOS host; this does.
    await app.setColorScheme(c.scheme);
    await app.wait(150);
    for (const label of c.presses) {
      await app.press(label);
      await app.wait(120);
    }
    const bytes = await app.screenshot(`${OUT}/${c.file}`);
    const seen = app.texts().join(" · ");
    console.log(`SHOT ${c.file} ${bytes.length}B ${c.route}`);
    if (seen.includes("No screen for")) console.log(`WARN ${c.file} route not registered: ${c.route}`);
  }, TEST_TIMEOUT);
}
JS
  } > "$PLAN"
}

# One `nsh test` run of the current plan, with a watchdog so a wedged host can
# never hang the command. Returns the runner's exit status.
run_plan() {
  local watchdog="$1" runner guard status=0
  (
    nsh test --target macos "$PLAN" 2>&1 \
      | perl -pe 'BEGIN { $| = 1 } $_ = "" if /font family/;' \
      | tee -a "$LOG"
  ) &
  runner=$!
  (
    sleep "$watchdog"
    if kill -0 "$runner" 2>/dev/null; then
      printf '✗ watchdog: nsh test ran longer than %ss\n' "$watchdog" >> "$LOG"
      kill_tree "$runner"
    fi
  ) </dev/null >/dev/null 2>&1 &
  guard=$!

  wait "$runner" || status=$?
  kill_tree "$guard" 2>/dev/null
  wait "$guard" 2>/dev/null || true
  return "$status"
}

if [ "$MODE" = "run" ]; then
  # ---- fallback: no automation, one window, screencapture ------------------
  # The window ids that exist *before* launching, so a stale window from an
  # earlier run can never be captured by mistake.
  cat > "$SWIFT_FIND" <<'SWIFT'
import CoreGraphics
import Foundation

// Prints the ids of on-screen windows whose title matches SHOT_WINDOW_TITLE.
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

  say "→ run mode: starting nsh run (no steps, no deep links — home only)"
  nsh run "$APP" --window-size "${WIDTH}x${HEIGHT}" > "$LOGS/run.log" 2>&1 &
  RUN_PID=$!
  trap 'kill_tree "${RUN_PID:-}"; cleanup' EXIT INT TERM

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

  file="$OUT/shot-01-home.png"
  win=""
  for _ in $(seq 1 "$TEST_TIMEOUT"); do
    if ! kill -0 "$RUN_PID" 2>/dev/null; then
      fail "nsh run exited while waiting for the window"
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
  printf '%s\t%s\t%s\t%s\n' "$(basename "$file")" "home" "run mode" "$(file -b "$file" | cut -d, -f2 | tr -d ' ')" > "$MANIFEST"
  say "✓ 1 shot → $OUT (run mode cannot navigate; use --mode host for the full set)"
  exit 0
fi

# --- host mode: one test per screen on the real macOS host ------------------
say "→ shooting ${#FILES[@]} screen(s) at ${WIDTH}x${HEIGHT} (${SCHEME}), live network: $([ "$OFFLINE" = "1" ] && echo no || echo yes)"
say "  log: $LOG"

ALL=()
i=0
while [ $i -lt ${#FILES[@]} ]; do ALL+=("$i"); i=$((i + 1)); done

# This tree is edited by several agents at once, so a save can break the bundle
# halfway through a run. If that happens and the bundle is healthy again by the
# time the run ends, retry just the screens that are still missing (once).
pending=("${ALL[@]}")
attempt=1
status=0
while :; do
  write_plan "${pending[@]}"
  for i in "${pending[@]}"; do rm -f "$OUT/${FILES[$i]}"; done
  status=0
  run_plan $(( ${#pending[@]} * (TEST_TIMEOUT + 15) + 90 )) || status=$?

  left=()
  for i in ${pending[@]+"${pending[@]}"}; do
    [ -s "$OUT/${FILES[$i]}" ] || left+=("$i")
  done
  [ ${#left[@]} -eq 0 ] && break
  [ "$attempt" -ge 2 ] && break
  if nsh build App.tsx > "$BUILD_LOG" 2>&1; then
    say "↻ attempt $attempt left ${#left[@]} screen(s) uncaptured, bundle is healthy again — retrying those"
    pending=("${left[@]}")
    attempt=$((attempt + 1))
    continue
  fi
  break
done

# --- report -----------------------------------------------------------------
if [ "$status" -ne 0 ]; then
  fail "nsh test exited $status"
  if grep -q 'building .* failed' "$LOG"; then
    say "→ the bundle broke while shooting (a feature module is being written?)"
    nsh build App.tsx > "$BUILD_LOG" 2>&1
    strip_ansi < "$BUILD_LOG" | grep -v 'font family' | tail -n 40
  fi
  strip_ansi < "$LOG" | grep -vE '^$|font family' | tail -n 30
  exit 1
fi

missing=0
: > "$MANIFEST"
i=0
while [ $i -lt ${#FILES[@]} ]; do
  file="${FILES[$i]}"
  entry="${PRESSES[$i]}"
  entry="${entry//;/ › }"
  if [ -s "$OUT/$file" ]; then
    bytes="$(stat -f%z "$OUT/$file")"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$file" "${ROUTES[$i]}" "${entry:-app opens here}" "${SCHEMES[$i]}" "${WIDTH}x${HEIGHT}" "$bytes" >> "$MANIFEST"
  else
    fail "missing $file (${ROUTES[$i]})"
    missing=$((missing + 1))
  fi
  i=$((i + 1))
done

warnings="$(grep -c '^WARN ' "$LOG" 2>/dev/null || true)"
[ -n "$warnings" ] || warnings=0

say ""
say "manifest: $MANIFEST (file, route, entry, scheme, viewport, bytes)"
grep '^WARN ' "$LOG" >&2 || true

if [ "$missing" -gt 0 ]; then
  fail "$missing of ${#FILES[@]} screens were not captured (see $LOG)"
  exit 1
fi

say "✓ ${#FILES[@]} shot(s) → $OUT"
if [ "$warnings" -gt 0 ]; then
  say "! $warnings route warning(s): the screen rendered 'No screen for' — a route is not registered yet"
  exit 2
fi
exit 0
