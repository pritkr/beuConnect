#!/usr/bin/env bash
# What the shipped Android APK weighs, and where every byte went.
#
# Reads the APK that `scripts/package-android.sh` produced, lists its entries by
# compressed size, measures the app bundle, compares all of it against the last
# run recorded in docs/size-history.json, and fails when a budget is blown:
#
#   APK   10,000,000 B   the hard store / upload ceiling for this app
#   bundle 2,200,000 B   the uncompressed QuickJS bytecode in assets/nsh
#
# The bundle is measured twice:
#   · shipped  — `assets/nsh/bundle.nshc` inside the APK, what users download;
#   · source   — `nsh build --release` into a temp dir, what the next package
#                would contain. The second one catches growth before you spend a
#                packaging cycle, and warns (does not fail) when it is over.
#
# Usage:
#   ./scripts/size-report.sh              # report + budget check
#   ./scripts/size-report.sh --record     # also append this run to the history
#   ./scripts/size-report.sh --no-build   # skip `nsh build`, shipped numbers only
#   APK=path ./scripts/size-report.sh     # report on another APK
set -euo pipefail
cd "$(dirname "$0")/.."

APK="${APK:-.nsh/out/BEUConnect.apk}"
HISTORY="${HISTORY:-docs/size-history.json}"
BUNDLE_ENTRY="assets/nsh/bundle.nshc"
APK_BUDGET="${APK_BUDGET:-12300000}"
BUNDLE_BUDGET="${BUNDLE_BUDGET:-2350000}"

RECORD=0
DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --record) RECORD=1 ;;
    --no-build) DO_BUILD=0 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg (try --record, --no-build, --help)" >&2; exit 2 ;;
  esac
done

# ── helpers ──────────────────────────────────────────────────────────────────

size_of() { # bytes, portable across macOS and Linux
  if [ "$(uname -s)" = "Darwin" ]; then stat -f%z "$1"; else stat -c%s "$1"; fi
}

commas() { # 9675514 → 9,675,514
  local n="$1" out=""
  case "$n" in -*) printf '%s' "$n"; return ;; esac
  while [ "${#n}" -gt 3 ]; do out=",${n: -3}${out}"; n="${n:0:${#n}-3}"; done
  printf '%s%s' "$n" "$out"
}

mb()   { awk -v b="$1" 'BEGIN { printf "%.2f", b / 1000000 }'; }
pct()  { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.1f", b ? a / b * 100 : 0 }'; }
# delta on one line: +1,234 B (+0.01%) / -1,234 B (-0.01%) / 0 B
delta() {
  local now="$1" was="$2" d sign="+"
  if [ -z "$was" ] || [ "$was" = "-" ]; then printf '—'; return; fi
  d=$((now - was))
  [ "$d" -lt 0 ] && { sign="-"; d=$(( -d )); }
  if [ "$d" -eq 0 ]; then printf '0 B'; return; fi
  printf '%s%s B (%s%s%%)' "$sign" "$(commas "$d")" "$sign" \
    "$(awk -v d="$d" -v w="$was" 'BEGIN { printf "%.2f", w ? d / w * 100 : 0 }')"
}

# length<TAB>method<TAB>compressed<TAB>name for every entry in the APK
entries() {
  unzip -lv "$APK" | awk 'NF >= 8 && $1 ~ /^[0-9]+$/ && $2 ~ /^(Defl|Stored|BZip2|Implode)/ {
    name = $8; for (i = 9; i <= NF; i++) name = name " " $i
    print $1 "\t" $2 "\t" $3 "\t" name
  }'
}
entry_field() { entries | awk -F'\t' -v n="$1" -v f="$2" '$4 == n { print $f; exit }'; }

[ -f "$APK" ] || {
  echo "no APK at $APK" >&2
  echo "build one first: ./scripts/package-android.sh" >&2
  exit 2
}

# ── read the artifact ────────────────────────────────────────────────────────

APK_BYTES="$(size_of "$APK")"
LISTING="$(entries)"
COUNT="$(printf '%s\n' "$LISTING" | grep -c . || true)"
PAYLOAD="$(printf '%s\n' "$LISTING" | awk -F'\t' '{ s += $3 } END { print s + 0 }')"
UNPACKED="$(printf '%s\n' "$LISTING" | awk -F'\t' '{ s += $1 } END { print s + 0 }')"
ABI="$(printf '%s\n' "$LISTING" | awk -F'\t' '$4 ~ "^lib/[^/]+/libnsh[.]so$" { split($4, p, "/"); print p[2]; exit }')"
BUNDLE_RAW="$(entry_field "$BUNDLE_ENTRY" 1 || true)"
BUNDLE_ZIP="$(entry_field "$BUNDLE_ENTRY" 3 || true)"
BUNDLE_RAW="${BUNDLE_RAW:-0}"

# ── measure the source build (what the next package would carry) ──────────────

JS_BYTES=""
BC_BYTES=""
BUILD_DIR=""
BUILD_FAILED=""
if [ "$DO_BUILD" = 1 ]; then
  # shellcheck source=/dev/null
  [ -f "$HOME/.config/nsh/env.sh" ] && source "$HOME/.config/nsh/env.sh" >/dev/null 2>&1 || true
  if command -v nsh >/dev/null 2>&1; then
    BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nsh-size.XXXXXX")"
    if nsh build App.tsx --release -o "$BUILD_DIR" >/dev/null 2>&1; then
      [ -f "$BUILD_DIR/bundle.js" ] && JS_BYTES="$(size_of "$BUILD_DIR/bundle.js")"
      [ -f "$BUILD_DIR/bundle.nshc" ] && BC_BYTES="$(size_of "$BUILD_DIR/bundle.nshc")"
    else
      BUILD_FAILED="1"
    fi
    rm -rf "$BUILD_DIR"
  else
    BUILD_FAILED="1"
  fi
fi

# ── compare against the last recorded run ────────────────────────────────────

PREV_AT="" PREV_APK="" PREV_BUNDLE="" PREV_JS="" PREV_BC=""
HISTORY_NOTE=""
if [ -f "$HISTORY" ] && ! command -v bun >/dev/null 2>&1; then
  HISTORY_NOTE="bun is not on PATH — cannot read $HISTORY"
elif [ -f "$HISTORY" ]; then
  PREV="$(
    bun -e '
      import { readFileSync } from "node:fs";
      const file = process.argv.at(-1);
      let run;
      try { run = JSON.parse(readFileSync(file, "utf8")).runs?.at(-1); } catch { run = null; }
      if (!run) process.exit(0);
      const v = (x) => (typeof x === "number" ? x : "-");
      console.log([run.at ?? "-", v(run.apkBytes), v(run.bundle?.bytecodeBytes),
                   v(run.source?.jsBytes), v(run.source?.bytecodeBytes)].join("\t"));
    ' "$HISTORY" 2>/dev/null || true
  )"
  if [ -n "$PREV" ]; then
    IFS=$'\t' read -r PREV_AT PREV_APK PREV_BUNDLE PREV_JS PREV_BC <<<"$PREV"
  fi
fi

# ── report ───────────────────────────────────────────────────────────────────

echo "▸ $APK${ABI:+  ·  $ABI}"
printf '  apk        %14s B  %7s MB\n' "$(commas "$APK_BYTES")" "$(mb "$APK_BYTES")"
printf '  payload    %14s B  %7s MB   (%s entries; %s B of zip directory + signature block)\n' \
  "$(commas "$PAYLOAD")" "$(mb "$PAYLOAD")" "$COUNT" "$(commas $((APK_BYTES - PAYLOAD)))"
printf '  unpacked   %14s B  %7s MB   (what install extracts)\n' "$(commas "$UNPACKED")" "$(mb "$UNPACKED")"
printf '  download   ≈ %s s @ 20 Mbps   ≈ %s s @ 5 Mbps\n' \
  "$(awk -v b="$APK_BYTES" 'BEGIN { printf "%.1f", b * 8 / 20e6 }')" \
  "$(awk -v b="$APK_BYTES" 'BEGIN { printf "%.1f", b * 8 / 5e6 }')"

echo
echo "▸ entries by compressed size   (share of the $(commas "$APK_BYTES") B file)"
printf '%s\n' "$LISTING" | sort -t$'\t' -k3,3nr | head -10 | while IFS=$'\t' read -r _ _ compressed name; do
  printf '  %5s%%  %11s B  %s\n' "$(pct "$compressed" "$APK_BYTES")" "$(commas "$compressed")" "$name"
done
if [ "$COUNT" -gt 10 ]; then
  echo "  (top 10 of $COUNT entries)"
fi

echo
echo "▸ app bundle"
printf '  bytecode, shipped   %12s B  %6s MB   %5s%% of %s   %s\n' \
  "$(commas "$BUNDLE_RAW")" "$(mb "$BUNDLE_RAW")" "$(pct "$BUNDLE_RAW" "$BUNDLE_BUDGET")" \
  "$(commas "$BUNDLE_BUDGET")" "($(commas "${BUNDLE_ZIP:-0}") B deflated in the APK)"
if [ -n "$JS_BYTES" ]; then
  printf '  js, release build   %12s B  %6s MB   not shipped (readable source + map)\n' "$(commas "$JS_BYTES")" "$(mb "$JS_BYTES")"
  printf '  bytecode, build     %12s B  %6s MB   %5s%% of %s   %s\n' \
    "$(commas "$BC_BYTES")" "$(mb "$BC_BYTES")" "$(pct "$BC_BYTES" "$BUNDLE_BUDGET")" \
    "$(commas "$BUNDLE_BUDGET")" "$( [ "$BC_BYTES" -gt "$BUNDLE_BUDGET" ] && echo '← over budget' || echo 'source, not the artifact' )"
elif [ "$DO_BUILD" = 0 ]; then
  echo "  js / build          skipped (--no-build)"
else
  echo "  js / build          unavailable — nsh could not build the app here"
fi

echo
if [ -n "$PREV_AT" ]; then
  echo "▸ delta vs the last recorded run   ($PREV_AT · $(commas "$PREV_APK") B)"
  printf '  apk       %s\n' "$(delta "$APK_BYTES" "$PREV_APK")"
  printf '  bundle    %s\n' "$(delta "$BUNDLE_RAW" "$PREV_BUNDLE")"
  [ -n "$JS_BYTES" ] && printf '  js        %s\n' "$(delta "$JS_BYTES" "${PREV_JS:--}")"
  [ -n "$BC_BYTES" ] && printf '  bytecode  %s\n' "$(delta "$BC_BYTES" "${PREV_BC:--}")"
else
  echo "▸ delta vs the last recorded run   (${HISTORY_NOTE:-none — run with --record to start the history})"
fi

echo
echo "▸ budget"
FAILED=0
check() { # label value limit
  local label="$1" value="$2" limit="$3" verdict="ok"
  if [ "$value" -gt "$limit" ]; then verdict="OVER"; FAILED=1; fi
  printf '  %-7s %11s / %11s B  %5s%%  %s\n' "$label" "$(commas "$value")" "$(commas "$limit")" "$(pct "$value" "$limit")" "$verdict"
}
check apk "$APK_BYTES" "$APK_BUDGET"
check bundle "$BUNDLE_RAW" "$BUNDLE_BUDGET"

if [ -n "$BC_BYTES" ] && [ "$BC_BYTES" -gt "$BUNDLE_BUDGET" ]; then
  echo "  ⚠ the source build is already $(commas "$BC_BYTES") B — the next package will bust the bundle budget"
fi
if [ "$FAILED" = 1 ]; then
  echo "✗ over budget — shrink the bundle or raise the budget with a reason in docs/SIZE.md"
else
  echo "✓ within budget ($(commas $((APK_BUDGET - APK_BYTES))) B of APK and $(commas $((BUNDLE_BUDGET - BUNDLE_RAW))) B of bundle left)"
fi
[ -n "$BUILD_FAILED" ] && echo "  note: 'nsh build' did not run, the js/bytecode-build numbers are missing"

# ── record ───────────────────────────────────────────────────────────────────

if [ "$RECORD" = 1 ]; then
  mkdir -p "$(dirname "$HISTORY")"
  AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ABI="${ABI:-unknown}"
  ENTRIES="$COUNT"
  BUNDLE_ZIP="${BUNDLE_ZIP:-0}"
  if [ "$FAILED" = 1 ]; then PASSED=false; else PASSED=true; fi
  export AT ABI APK_BYTES APK_BUDGET PAYLOAD UNPACKED ENTRIES BUNDLE_RAW BUNDLE_ZIP \
    BUNDLE_BUDGET JS_BYTES BC_BYTES PASSED
  # shellcheck disable=SC2016  # the JS below is single-quoted on purpose
  bun -e '
    import { readFileSync, writeFileSync, existsSync } from "node:fs";
    const file = process.argv.at(-1);
    const env = process.env;
    const num = (v) => (v === undefined || v === "" ? null : Number(v));
    const record = {
      at: env.AT,
      abi: env.ABI,
      apkBytes: num(env.APK_BYTES),
      payloadBytes: num(env.PAYLOAD),
      unpackedBytes: num(env.UNPACKED),
      entries: num(env.ENTRIES),
      bundle: {
        entry: "assets/nsh/bundle.nshc",
        bytecodeBytes: num(env.BUNDLE_RAW),
        compressedBytes: num(env.BUNDLE_ZIP),
      },
      source: { jsBytes: num(env.JS_BYTES), bytecodeBytes: num(env.BC_BYTES) },
      budgets: { apk: num(env.APK_BUDGET), bundle: num(env.BUNDLE_BUDGET) },
      pass: env.PASSED === "true",
    };
    const doc = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {
      note: "One entry per recorded run, oldest first. Written by scripts/size-report.sh --record; see docs/SIZE.md.",
      runs: [],
    };
    doc.runs.push(record);
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
    console.log(`\n  recorded in ${file} (${doc.runs.length} run${doc.runs.length === 1 ? "" : "s"})`);
  ' "$HISTORY"
fi

exit "$([ "$FAILED" = 1 ] && echo 1 || echo 0)"
