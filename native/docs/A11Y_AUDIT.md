# BEUConnect native — accessibility status

Status document, 2026-10-28. Supersedes the 2026-10-26 read-only audit. The
theme, the design system (`src/ui/index.tsx`) and the app shell (`src/app/`) are
fixed and measured. Feature screens are handed off as one mechanical sweep plus
two spoken-status patches, because five agents were editing `src/features/**`
when this landed.

Gate, 2026-10-28:

```
bun scripts/contrast.ts            OK — 112 gated pairs, every one at or above its threshold
./scripts/accent-ink-sweep.sh      dry run — 26 replacements in 17 of 75 files (last run)
```

The sweep count is a snapshot: feature agents were still writing, and two runs
minutes apart differed by a file. Re-run the dry run before applying; it is
idempotent and reports only what is left.

Method
- Contrast: WCAG 2.x relative luminance over the hex tokens in `nsh.json`
  (`cssVars.theme.light|dark`). Alpha tints are composited over their base
  surface first (`primary/12` over `card`, etc.). Text needs 4.5:1 (3:1 at
  ≥ 18.66 px bold or ≥ 24 px), non-text UI 3:1.
- Touch: 44 × 44 pt (Apple HIG / WCAG 2.5.5); 24 pt is the absolute floor
  (2.5.8), and nothing in `src/ui` or `src/app` relies on it.
- Layout: 320 pt viewport, `fontScale` 1.0 / 1.3 / 2.0.

---

## Verdict — all 24 findings

| # | Finding | Status | Where |
|---|---|---|---|
| A1 | Dark `text-accent` invisible | **Fixed + sweep** | `accent-ink` token; remaining feature sites swept |
| A2 | Light `muted-foreground` failed every surface | **Fixed** | token `#6A5E4F`, 4.85–6.31 |
| A3 | Light `primary` as ink and button fill | **Fixed + sweep** | `primary-ink`, `primary-foreground`; remaining sites swept |
| A4 | Control outlines at 1.2–1.5:1 | **Fixed + sweep** | `border-strong`, 3.53–4.14; feature controls swept |
| A5 | Light `chart-3` as text / progress fill | **Fixed + sweep** | token `#B26A00`, 3.62 on track; text uses swept |
| T1 | `Chip` 36 pt | **Fixed** | `min-h-11 px-4` in `src/ui` |
| T2 | `SectionHeader` action 36 pt | **Fixed** | `-mr-3 min-h-11 px-3` |
| T3 | Search clear 24 pt, unlabelled | **Fixed** | `h-11 w-11`, `role="button"`, label |
| T4 | Header back 40 pt | **Fixed** | `h-11 w-11`, hint, focus ring |
| T5 | Syllabus topic controls 24/32 pt | **Fixed + sweep** | checkbox 44 pt + `hitSlop`; studied box swept |
| S1 | Fixed 48 px line box clipped the rank number | **Fixed** | `leading-[48px]` gone (0 hits) |
| S2 | Truncation cut distinguishing text | **Fixed + sweep** | results fixed; notice/routine lines swept |
| S3 | 9 px type | **Fixed + sweep** | remaining 9 px labels swept to 11 px |
| S4 | 7-column holiday grid 33.7 pt wide | **Accepted** | see exception below |
| S5 | Rank caption / 52 pt time column | **Fixed** | `flex-wrap` on the rank row; clock column swept to `min-w` |
| R1 | `Progress` silent to a screen reader | **Fixed** | `role`, `accessibilityValue`, `label` prop |
| R2 | Async loads never announce | **Fixed** 2026-10-30 | lookup, notices board and announcement feed announce the load; background hydration stays quiet |
| T6 | Attendance month cells 40 pt tall | **Fixed** 2026-10-30 | `h-11` + `active:opacity-70`; width stays 39 pt at 320 (7 columns) |
| T7 | Syllabus undo bar 36 pt (Undo, dismiss) | **Fixed** 2026-10-30 | `min-h-11` / `h-11 w-11` |
| P1 | Pressables that gave no touch feedback | **Fixed** 2026-10-30 | syllabus topic + saved row, calendar cells, routine grid, Wi-Fi switch now take `active:` |
| N1 | Text overflowed its row at 320 pt | **Fixed** 2026-10-30 | home next-break value ellipsized, attendance "Target" label moved above its chips, data-browser placeholder shortened |
| N2 | Screen title repeated under the nav header | **Fixed** 2026-10-30 | More + six settings screens (Settings, Profile, Appearance, Reminders, Storage, About, Offline data) |
| N3 | Title truncation cut the differentiator | **Fixed** 2026-10-30 | notice title 2 → 3 lines, college name 1 → 2, settings profile title 1 → 2, result-table name 1 → 2 |
| N4 | Horizontal `Scroll` given `flex-1` in a column painted zero height | **Fixed** 2026-10-30 | `ChipRail`, recently-opened papers and the leads session rail now `min-h-11` |

Count: 23 of 24 fixed, 1 accepted exception (S4). No partials.

---

## Tokens — before → after, measured

Tokens live in `nsh.json` → `theme.cssVars.light|dark`. Light `primary`
stays `#E4572E` as the ember **fill**; `primary-ink` is the readable form.
`accent` / `accent-foreground` stay the surface pair.

### Light

| Token | Before | After | Measured |
|---|---|---|---|
| `muted-foreground` | `#8A7D6D` | `#6A5E4F` | 5.96 bg · 6.31 card · 5.39 muted · 5.25 secondary (was 3.34–4.01) |
| `primary-foreground` | `#FFF9F4` | `#241008` | 4.95 on `primary` (was 3.53) |
| `sidebar-primary-foreground` | `#FFF9F4` | `#241008` | 4.95 (was 3.53) |
| `primary-ink` | — (used `primary`, 3.19–3.68) | `#B0401D` | 5.51 bg · 5.84 card · 4.98 muted · 4.85 secondary |
| `accent-ink` | — (used `accent`) | `#0E6B5C` | 6.05 bg · 6.41 card · 5.47 muted · 5.33 secondary |
| `border-strong` | — (used `border`, 1.32) | `#8B7A66` | 3.91 bg · 4.14 card · 3.53 muted |
| `chart-3` | `#E9A23B` | `#B26A00` | 4.24 card · 3.62 on the muted track (was 2.17 / 1.85) |

### Dark

| Token | Before | After | Measured |
|---|---|---|---|
| `muted-foreground` | `#A99C8B` | `#B2A493` | 8.02 bg · 7.33 card · 6.86 muted · 6.71 secondary |
| `primary-ink` | — (used `primary`) | `#FF7A4D` | 7.57 bg · 6.92 card |
| `accent-ink` | — (used `accent`, 1.40–1.58) | `#6FE3C9` | 12.56 bg · 11.48 card |
| `border-strong` | — (used `border`, 1.23) | `#7E7164` | 4.12 bg · 3.77 card · 3.53 muted |

`ring` was already compliant and is unchanged: 3.68 light / 6.92 dark, both
against the card. Decorative `border` stays at 1.32 / 1.23 — WCAG 1.4.11 does
not gate decoration, only the outline that *is* a control's affordance. The
gate prints it as INFO and does not fail on it.

`bun scripts/contrast.ts --json` emits the same pairs for tooling;
`--quiet` prints only failures; `--help` documents the flags. Exit 1 on any
gated failure, so it can run in CI unchanged.

---

## Shell changes

### `src/ui/index.tsx`

- `Label` is `role="header"`; `SectionHeader` has a spoken heading, a
  `trailing` slot, a 44 pt action in `primary-ink`, and `numberOfLines={1}`.
- `Chip` is 44 pt (`min-h-11 px-4`), `border-border-strong` when inactive,
  `text-accent-ink` for mint, focus ring, bold-when-active and a selected state
  that is not colour-only.
- `Btn` carries colour in one place (`ink`), adds `focus:ring-2 ring-ring`,
  disables press when `disabled`, and reports `accessibilityState`.
- `Field` and `Search` use `border-strong` plus `focus-within:ring-2 ring-ring`;
  the clear control is a labelled 44 pt button.
- `Card` is only interactive when it has a handler: then 44 pt,
  `border-strong`, `role="button"`, label.
- `Loading` groups its skeletons into one polite live region; `ErrorState`
  uses `role="alert"`.
- `Badge` and `Stat` use `primary-ink` / `accent-ink`; `Stat` is
  `adjustsFontSizeToFit`, `minimumFontScale={0.6}`, `tabular-nums`.
- `Progress` is a real `progressbar` with `accessibilityValue` and an optional
  `label`; the fill animates `transform: scaleX`, not `width`, so it stays on
  the compositor and never re-lays-out the row; the mint fill is `accent-ink`
  (the dark `accent` surface reads as empty on the card).
- `Ring` draws with `chart-1` / `chart-2`, not the surface tokens.
- `Marquee` is a button only when it has `onPressItem`, with `hitSlop`.

### `src/app/`

- `tabbar.tsx`: `role="tablist"`, 52 pt minimum destinations on a full-width
  surface, `role="tab"` + `accessibilityState.selected`, focus ring, 11 px
  labels capped at `maxFontSizeMultiplier={1.4}`. Selected reads as a 56 × 30
  indicator plus a solid icon and a bold label, so it survives greyscale; a
  change of tab plays the selection haptic.
- `shell.tsx`: back is `h-11 w-11` with a hint and focus ring, header is
  `min-h-12`, title is `role="header"` and one line, glyphs use `primary-ink`.
- `more.tsx`: four spoken groups, 20 pt between groups / 8 pt inside, every row
  `min-h-11` with a hint and `numberOfLines={2}`, chevron present.
- `coming-soon.tsx`: 404 uses `primary-ink`; the fallback action is a secondary
  `Btn`.

No router or route-table change was needed.

---

## Platform layer — 2026-10-30

### Reduce Motion

`src/ui/motion.ts` exports `motionOn()` (`!reduceMotion()`) and
`scrollAnimated()` for `scrollTo` / `scrollToIndex`. nsh already lands
`createMotion` presets without moving, but every hand-rolled scroll was
hard-coded `animated: true`, and every CSS transition ran regardless.

Hand-rolled scrolls that jump instead of gliding when the setting is on:

| File | What it jumps |
|---|---|
| `src/features/home/pager.tsx` | `go()` from a dot; nothing advances on a timer |
| `src/features/syllabus/index.tsx` | `scrollToUnit` |
| `src/features/results/table.tsx` | jump to a student's row |
| `src/features/pyqs/data-table.tsx` | jump to a table row |
| `src/features/pyqs/paper.tsx` | jump to a question |

Class-level motion uses the `motion-reduce:` variant, which nsh maps to
`reduce_motion()` and so reacts the moment the setting changes:
`motion-reduce:transition-none` on every press and focus transition
(`Card`, `Chip`, `Btn`, `Row`, `Check`, `Search`) and
`motion-safe:animate-pulse` on `Skeleton`. Neither the `Marquee` nor the Home
notice strip advances on a timer: a strip that moves while a student reads takes
the page away from them. The notice strip is moved by swiping it or pressing a
dot.

Entrances have one convention, `Enter` (`src/ui/enter.tsx`): content that
replaces a skeleton arrives over 240 ms from `opacity: 0` and `translateY: 8`
on the shared curve (`EASE` in `src/ui/motion.ts` — the same
`cubic-bezier(0.23, 1, 0.32, 1)` the progress fill uses). The motion is created
once per mount, so a signal changing inside it never replays. It is not used on
a tab root: Home's focus card is opened many times a day and simply appears.
With Reduce Motion the motion lands at rest: nothing moves and nothing is left
invisible.

A confirmation line that is inserted into the page (`flash()` in
`features/notices/parts.tsx`) appears in one frame and goes in one three seconds
later. It is the last child of its container, so nothing below it moves — a
label is data, not an entrance.

### Rails that painted nothing

Three horizontal rails put `class="flex-1"` on the `Scroll` itself. A scroll
view is the viewport and takes its size from its parent; inside a **column**,
`flex-1` sets the *height* to zero, so the label and the row gaps painted and
the chips did not. The chips were on screen for `app.texts()` and invisible to
the student — a rendering test could not see it either.

| File | Rail |
|---|---|
| `src/features/pyqs/components.tsx` | `ChipRail` (sort, batch, branch, semester, GATE year) |
| `src/features/pyqs/browse.tsx` | recently opened papers |
| `src/features/students/leads.tsx` | session chips |

All three now use `class="min-h-11"`: a horizontal scroll takes its height from
its content, and the floor is one chip. The notice rails already did this
(`class="h-11"`), which is why they worked.

### One title per screen

The nav header already names the route on every platform, so no screen repeats
its own name as the first thing in the body. `more.tsx` lost its
"BEUConnect / More" block, and the settings area lost `ScreenIntro` — a
label + title pair ("The app / About", "On this phone / Storage") that opened
seven screens: Settings, Your profile, Appearance, Reminders, Storage, About and
Offline data. Every one of those now opens on its first real control.

### 320 pt pass — 2026-10-30

`./scripts/shots.sh --width 320` shoots all 22 routes at 320×844. Three layout
breaks showed up only at that width:

- **Home, next break** — `9 days · Diwali / Bhai Dooj / Chhath Puja` ran off the
  right edge. The label is now `shrink-0` and the value `flex-1 text-right` with
  `numberOfLines={1}`, so it ellipsizes inside the card instead of leaving it.
- **Attendance, target** — "Target" was squeezed into "TARG / ET" by three
  chips in one row. The label now sits above the chips, which wrap.
- **Data browser, search** — the placeholder "College, branch, batch or
  semester" was cut mid-word by the field; it reads "College, branch or batch".

Four truncation limits were also raised, because the word that tells two rows
apart was the one being cut: a notice title (2 → 3 lines), a college name in the
register (1 → 2), the settings profile title (1 → 2), a student name in a result
table (1 → 2 — "PAPPU KUMAR Y…" now reads in full).

---

## Deferred sweep — `scripts/accent-ink-sweep.sh`

Feature files are owned by other agents, so their fix is a script, not an edit
here. It touches only `src/features/**/*.tsx` and never `*.test.tsx`,
`src/ui/**` or `src/app/**`.

```sh
./scripts/accent-ink-sweep.sh            # dry run, prints file + rule + count
./scripts/accent-ink-sweep.sh --apply    # rewrite in place
bun scripts/contrast.ts && ./scripts/check.sh test
```

Every rule is a pure substitution and stops matching after it applies, so a
second run is zero changes. Rules already fixed by a feature agent report
nothing.

Dry runs on 2026-10-28 reported 26–30 replacements in 17–20 of 74–75 files.
The number moved on every run because feature agents were still editing, so this
document does not pin it: the dry run prints the authoritative per-file list and
per-rule totals, and only that output should be used when applying.

| Rule | Replaces | Why |
|---|---|---|
| `text-accent` → `text-accent-ink` | mint ink | dark mint was a surface used as ink (A1) |
| `text-primary` → `text-primary-ink` | ember ink | light ember text was 3.19–3.68 (A3) |
| `text-chart-3` → `text-foreground` | amber ink | amber is a wash, not ink (A5) |
| `bg-accent/70` → `bg-accent-ink` | battle meter | would read as empty in dark |
| filter chip `min-h-10` → `min-h-11` | 44 pt | T1 |
| calendar prev/next → `border-border-strong` | control outline | A4 |
| `text-[9px]` → `text-[11px]` | legibility floor | S3 |
| `w-[52px]` → `min-w-[52px]` | clock column | grows instead of clipping (S5) |
| post title 2 → 3 lines, excerpt 3 → 2 | truncation | the differentiator is at the end (S2) |

The script also keeps zero-match guard rules for the studied-topic checkbox
(`accent-ink` outline + `border-strong` unchecked), `hitSlop` on the syllabus
checkbox and save star, the 44 pt stepper, the destructive icon button, the
routine subject (2 lines) and the rank headline (`leading-[48px]`). Those are
already applied; the rules stay so a regression is caught by the next run.
The clock rule earned its keep: it caught a `w-[52px]` reintroduced in
`tools/routine.tsx` during the feature work.

---

## Manual patches (not substitutions)

### R2 — announce async loads (applied 2026-10-30)

`results/rank.tsx` and `results/battle.tsx` already announced. Three more
screens swapped loading for content in silence:

- `results/lookup.tsx` — right after `state.set({ status: "ready", … })` it now
  speaks the SGPA and the PASS/FAIL word when there is one, else "Result
  loaded."
- `notices/parts.tsx` `syncNotices` — captures `wasLoaded` before the fetch and
  announces only on a first load or an explicit refresh (`force || !wasLoaded`),
  so the background hydration of a stale board stays quiet.
- `notices/parts.tsx` `syncAnnouncements` — the same guard, worded for the feed.

Never announced: an error. The error card is text the reader reaches, and a
spoken alert over it would double the message.

### S4 — accepted exception: holiday month grid

`src/features/tools/holidays.tsx` renders seven `flex-1` cells inside
`Row gap-1` → `Card p-3.5` → `Body p-4`. At 320 pt each cell is
(320 − 32 − 28 − 24) / 7 = **33.7 pt wide**, 44 pt tall, 4 pt apart. Height
passes; width cannot reach 44 without dropping a weekday.

Accepted, because hiding the day dots to gain width removes the only signal
that a day is a holiday. Day cells are 44 pt tall and their neighbours are
4 pt apart, so the target is usable; the spoken label is the full date.
If the exception ever has to go, switch the month to week rows of four
columns — do not shrink the dots.

---

## Re-check before release

```sh
bun scripts/contrast.ts
./scripts/accent-ink-sweep.sh          # expect 0 after --apply
./scripts/check.sh test
./scripts/shots.sh --scheme both       # visual check at fontScale 1.3
```

Touch and layout still need one pass on a 320 pt device at `fontScale 1.3` for
the screens the sweep touches; the token and semantics gates are automated.
