#!/usr/bin/env bash
# accent-ink-sweep.sh — the cross-feature half of docs/A11Y_AUDIT.md.
#
# Five feature agents are editing src/features/** in parallel, so the shell's
# owner must not touch those files. This script is the hand-off: every fix that
# is a pure class/token substitution, expressed once, run after the agents
# finish.
#
#   ./scripts/accent-ink-sweep.sh            # dry run: what would change
#   ./scripts/accent-ink-sweep.sh --apply    # write it
#
# It never touches *.test.tsx, src/ui/**, src/app/** or the docs — those are
# owned elsewhere (the kit and the shell already use the new tokens).
#
# Idempotent: every rule is a substitution that no longer matches once applied,
# so a second run reports zero changes. Rules that a feature agent already
# fixed simply report nothing.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

APPLY=0
case "${1:-}" in
  ""|--dry-run) APPLY=0 ;;
  --apply) APPLY=1 ;;
  -h|--help)
    echo "usage: ./scripts/accent-ink-sweep.sh [--apply]"
    echo "dry run by default; --apply rewrites src/features/**/*.tsx in place"
    exit 0
    ;;
  *)
    echo "usage: ./scripts/accent-ink-sweep.sh [--apply]" >&2
    exit 64
    ;;
esac

# label | sed -E script
RULES=(
  'text-accent → text-accent-ink (mint ink)|s/text-accent([^-a-zA-Z0-9])/text-accent-ink\1/g'
  'text-primary → text-primary-ink (ember ink)|s/text-primary([^-a-zA-Z0-9])/text-primary-ink\1/g'
  'text-chart-3 → text-foreground (amber is a wash, not ink)|s/text-chart-3/text-foreground/g'
  'chart series: token("accent") → token("chart-2")|s/token\("accent"\)/token("chart-2")/g'
  'mint battle bar: bg-accent/70 → bg-accent-ink|s/bg-accent\/70/bg-accent-ink/g'
  'studied box: accent-ink outline + strong unchecked border|s/isDone \? "border-accent bg-accent" : "border-border bg-card"/isDone ? "border-accent-ink bg-accent" : "border-border-strong bg-card"/g'
  'studied box: hitSlop={10}|/onPress=\{\(\) => toggleTopic\(branch, sem, code, topic\.id\)\}$/ s/$/ hitSlop={10}/'
  'save star: hitSlop={6}|/onPress=\{\(\) => toggleSaved\(key\)\}$/ s/$/ hitSlop={6}/'
  'filter chip 40 pt → 44 pt|s/min-h-10/min-h-11/g'
  'grade pill 40 pt → 44 pt|s/min-w-10/min-w-11/g'
  'stepper 44 pt + control border|s/h-10 w-10 items-center justify-center rounded-full border border-border bg-card/h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-card/g'
  'calendar prev/next: control border|s/class="h-11 w-11 items-center justify-center rounded-full border border-border active:bg-muted"/class="h-11 w-11 items-center justify-center rounded-full border border-border-strong active:bg-muted"/g'
  'icon button: control border|s/"border-destructive\/30" : "border-border"/"border-destructive\/30" : "border-border-strong"/g'
  'micro type 9 px → 11 px|s/text-\[9px\]/text-[11px]/g'
  'clock column: grow, never clip|s/w-\[52px\]/min-w-[52px]/g'
  'routine subject: 2 lines|s/class="flex-1 text-\[13px\] leading-5 text-foreground" numberOfLines=\{1\}/class="flex-1 text-[13px] leading-5 text-foreground" numberOfLines={2}/g'
  'notice title: 3 lines|s/numberOfLines=\{2\}>\{props\.notice\.title\}/numberOfLines={3}>{props.notice.title}/g'
  'post title: 3 lines|s/numberOfLines=\{2\}>\{props\.post\.title\}/numberOfLines={3}>{props.post.title}/g'
  'post excerpt: 2 lines|s/numberOfLines=\{3\}>\{props\.post\.excerpt\}/numberOfLines={2}>{props.post.excerpt}/g'
  'rank headline: drop the fixed line box|s/ leading-\[48px\]//g'
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

files=0
touched=0
total=0
declare -a per_rule
for _ in "${RULES[@]}"; do per_rule+=("0"); done

echo "BEUConnect accent/ink sweep — $([ "$APPLY" -eq 1 ] && echo "apply" || echo "dry run (add --apply to write)")"
echo

while IFS= read -r file; do
  files=$((files + 1))
  cp "$file" "$WORK/work"
  file_changes=0
  detail=""

  for index in "${!RULES[@]}"; do
    label="${RULES[$index]%%|*}"
    script="${RULES[$index]#*|}"
    cp "$WORK/work" "$WORK/prev"
    sed -E "$script" "$WORK/prev" > "$WORK/next" || {
      echo "sed failed: $file :: $label" >&2
      exit 1
    }
    mv "$WORK/next" "$WORK/work"
    changes=$(diff "$WORK/prev" "$WORK/work" | grep -c '^>' || true)
    if [ "$changes" -gt 0 ]; then
      file_changes=$((file_changes + changes))
      per_rule[$index]=$(( ${per_rule[$index]} + changes ))
      detail="${detail}  ${changes} × ${label}"$'\n'
    fi
  done

  if [ "$file_changes" -gt 0 ]; then
    touched=$((touched + 1))
    total=$((total + file_changes))
    if [ "$APPLY" -eq 1 ]; then
      cp "$WORK/work" "$file"
      echo "WROTE $file ($file_changes)"
    else
      echo "$file ($file_changes)"
    fi
    printf '%s' "$detail"
  fi
done < <(find src/features -type f -name '*.tsx' ! -name '*.test.tsx' | sort)

echo
if [ "$APPLY" -eq 1 ]; then
  echo "Applied $total replacements in $touched of $files files."
  echo "Next: bun scripts/contrast.ts && ./scripts/check.sh"
else
  echo "Would apply $total replacements in $touched of $files files."
fi

echo
echo "Per rule:"
for index in "${!RULES[@]}"; do
  if [ "${per_rule[$index]}" -gt 0 ]; then
    printf '  %3d  %s\n' "${per_rule[$index]}" "${RULES[$index]%%|*}"
  fi
done
