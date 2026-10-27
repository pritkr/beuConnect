# BEUConnect native — accessibility & small-screen audit

Read-only review of `native/src` on 2026-10-26. No source file was modified.
Scope: `src/ui/index.tsx`, `src/app/{tabbar,shell,more,coming-soon}.tsx`, every
`src/features/*/index.tsx` and the shared components they lean on
(`results/components.tsx`, `notices/parts.tsx`, `tools/kit.tsx`,
`pyqs/components.tsx`).

Method
- Contrast: WCAG 2.x relative-luminance maths over the hex tokens in `nsh.json`
  (`cssVars.theme.light|dark`). Alpha tints are composited over their base
  surface first. Text under 18.66 px bold needs 4.5:1 (3:1 above that — the 30 pt
  `Stat` and 40–44 pt headlines are judged as large text), non-text UI needs 3:1.
- Touch: 44 × 44 pt (Apple HIG / WCAG 2.5.5) as the bar, 24 pt as the absolute
  floor (2.5.8).
- Layout: 320 pt viewport, `fontScale` 1.0 / 1.3 / 2.0.

Severity: **blocker** = content is unreadable or unusable for a group of users;
**major** = a primary task is hard or a standard is clearly breached;
**minor** = real but survivable.

17 findings: **3 blocker, 8 major, 6 minor**.

---

## 1. Colour and contrast

### A1 — Dark mode: every `text-accent` is invisible · **blocker**
`nsh.json` → `cssVars.theme.dark.accent` is `#123B34` (a *surface* colour), but
19 call sites use it as ink.

| pair | ratio | needs |
|---|---|---|
| accent on card `#1A1714` | **1.45** | 4.5 |
| accent on background `#0E0C0A` | **1.58** | 4.5 |
| accent on accent/12 badge | **1.40** | 4.5 |

Hits: `src/ui/index.tsx:185` (`Chip` mint), `:359` (`Badge` mint), `:394`
(`Stat` mint); `src/features/tools/kit.tsx:115,156`; `src/features/pyqs/components.tsx:31,52`;
`src/features/results/components.tsx:325,356`; `src/features/results/battle.tsx:40,254,286`;
`src/features/home/index.tsx:235`; `src/features/pyqs/gate.tsx:310`;
`src/features/settings/index.tsx:289`; `src/features/tools/index.tsx:971`.

The dark mint badge is *darker* than the card, so "mint" reads as a muddy hole
and the label disappears. Light mode is fine (5.36–6.41).

Fix — add a dedicated ink token per theme and swap the 19 `text-accent` uses to
it. Do **not** recolour `accent` itself: `accent-foreground` on `accent` is
already correct (light 6.24, dark 9.21) and `bg-accent` is a fill in the
studied-topic checkbox.

```jsonc
// nsh.json
"light": { "accent-ink": "#0E6B5C" },   // = today's accent, 6.05 on background
"dark":  { "accent-ink": "#6FE3C9" }    // 11.48 on card, 12.56 on background
```

```diff
- props.tone === "mint" ? "text-accent" : "text-foreground"
+ props.tone === "mint" ? "text-accent-ink" : "text-foreground"
```

### A2 — Light mode: `muted-foreground` fails on every surface · **blocker**
`nsh.json` → light `muted-foreground` `#8A7D6D`. It is the app's most-used text
colour (`Muted` `src/ui/index.tsx:83`, `Label` `:92`, `Subtitle` `:75`), so this
is most of the secondary copy in the app.

| on | ratio |
|---|---|
| background `#FBF8F4` | **3.79** |
| card `#FFFFFF` | **4.01** |
| muted `#F3ECE3` | **3.42** |
| secondary `#F1E9DF` | **3.34** |
| accent/12 over card | **3.35** |

Dark is fine across the board (6.08–7.27).

Fix — `muted-foreground: "#6E6252"` → 5.62 / 5.95 / 5.07 / 4.94 on the four
opaque surfaces. `#756858` is the lightest value that still clears 4.5 on
`secondary` (4.50) if you want to keep it warm and faint.

### A3 — Light mode: `primary` as ink and as a button fill · **blocker**
`nsh.json` → light `primary` `#E4572E`.

| pair | ratio | where |
|---|---|---|
| primary text on background (13 px) | **3.48** | `ui/index.tsx:161` — every `SectionHeader` action |
| primary text on card (12–15 px) | **3.68** | `home/index.tsx:332` ("Open"), `notices/index.tsx:281` (in-body link), `tools/index.tsx:2388` |
| primary text on primary/12 (11 px) | **3.19** | `ui/index.tsx:358` — `Badge` ember |
| primary-foreground on primary (15 px) | **3.53** | `ui/index.tsx:210` + `:225` — the label inherits `text-primary-foreground` from the View, so **every primary `Btn`** is at 3.53 |

That last one is the main call to action on Home, Results, Syllabus and every
empty state.

Fix — darken the light ember fill to `#B8431F`. One token fixes all four:
5.14 on background, 5.44 on card, 4.55 on primary/12, and `#FFF9F4` on the fill
= 5.21. Dark already passes (5.78–7.57), leave it.

### A4 — Interactive outlines sit at 1.2–1.5:1 · **major**
`border-border` is `#E9DFD3` (light) / `#2E2822` (dark), i.e. a 1.24–1.34:1
hairline. It is decorative on cards, but it is also the *only* affordance on
real controls, where WCAG 1.4.11 wants 3:1:

- `src/ui/index.tsx:188` — inactive `Chip` (`border-border bg-card`)
- `src/ui/index.tsx:254` — `Field` input box
- `src/features/tools/index.tsx:2153,2160` — calendar prev/next buttons
- `src/features/syllabus/index.tsx:383` — unchecked studied-topic checkbox
  (checked is `border-accent bg-accent`: **1.45** against the dark card, so the
  box outline vanishes in dark mode and only the ✓ glyph distinguishes state)
- `src/features/tools/kit.tsx:61,75` — Stepper −/+

Fix — add `--border-strong` and use it where the border *is* the control.
`#9C8B78` = 3.29 on card / 3.11 on background; dark `#71655A` = 3.15 / 3.45.
Leave card and divider borders on `border-border`.

```diff
- class="min-h-9 flex-row items-center rounded-full border px-3.5 ..."
+ class="min-h-11 flex-row items-center rounded-full border border-border-strong px-4 ..."
```

### A5 — Light mode: `chart-3` as text and as a progress fill · **minor**
`#E9A23B` is 2.17 on card and 2.05 on background. `tools/kit.tsx:156` renders
an 18 px bold metric in it — 18 px bold is just under the 18.66 px "large text"
line, so it needs 4.5 and has 2.17. As a 2 pt fill on the `bg-muted` track it is
**1.85** (`tools/index.tsx:1628`, the attendance risk bar) where 3:1 applies.

Fix — text: `text-foreground` on an amber wash; `Badge` amber already does the
right thing (`bg-chart-3/20 text-foreground`). Fill: `bg-[#B26A00]` → 3.62 vs
`#F3ECE3`. Dark mode is fine (9.34–10.91).

---

## 2. Touch targets

### T1 — `Chip` is 36 pt, and it is the app's primary filter control · **major**
`src/ui/index.tsx:188` — `min-h-9` (36 pt), used **49 times** across every
feature (branch, semester, batch, mode, category, year). Next to a 4 pt gap it
is a miss-tap generator on a 5" phone.

Fix: `min-h-9` → `min-h-11`, and `px-3.5` → `px-4` so the 44 pt pill doesn't
look squat. `Btn` (`:217`) already uses `min-h-11`, so this also makes the two
consistent.

### T2 — `SectionHeader` action is 36 pt · **major**
`src/ui/index.tsx:160` — `min-h-9` on the "See all" / "Refresh" link that heads
33 sections.

Fix: `min-h-11 justify-center rounded-full px-3` (keep `-mr-3` to keep the text
optically aligned to the gutter, and add `accessibilityLabel={props.action}`).

### T3 — Search clear button is 24 pt and unlabelled · **major**
`src/ui/index.tsx:296-297` — `h-6 w-6` around a 12 px `✕`, no `role`, no label.
Worst target in the app, on the control used to recover from a bad query.

```diff
- <View class="h-6 w-6 items-center justify-center rounded-full bg-muted active:bg-border" onPress={() => props.onChange("")}>
-   <Text class="text-[12px] text-muted-foreground">✕</Text>
+ <View class="h-11 w-11 -mr-3 items-center justify-center rounded-full active:bg-muted"
+   onPress={() => props.onChange("")} role="button" accessibilityLabel="Clear search">
+   <Text class="text-[13px] text-muted-foreground" accessibilityElementsHidden>✕</Text>
```

### T4 — Header back button is 40 pt · **major**
`src/app/shell.tsx:26` — `h-10 w-10`. It is the only way back on macOS/Windows/
web (`NavPage` header) and the visual fallback on Android. 4 pt short, and the
`h-12` row (`:23`) leaves no slack.

Fix: `h-11 w-11 -ml-1` (44 pt, and `-ml-1` keeps the glyph on the optical
margin). Same for the placeholder at `:34`.

### T5 — Syllabus topic controls are 24 pt and 32 pt · **major**
`src/features/syllabus/index.tsx:382` — the studied checkbox is `h-6 w-6`
(24 pt) with `role="checkbox"`; `:409` — the save star is `h-8 w-8` (32 pt).
Both sit inside a row where the *neighbouring* text block is also pressable
(`:396`), so a near-miss toggles the accordion instead of the checkbox.

Cheapest correct fix — keep the glyph size, expand the touch area:

```diff
- <View class="mt-0.5 h-6 w-6 items-center justify-center rounded-full border ..."
+ <View class="mt-0.5 h-6 w-6 items-center justify-center rounded-full border ..." hitSlop={10}
```

`hitSlop` is a `HostProps` field (`.nsh/types/nsh/types.d.ts:559`), so it costs
no layout. Do the same with `hitSlop={6}` on the star. If you prefer a real
44 pt box, `h-11 w-11` + `-my-2.5` preserves the row height.

---

## 3. Type scale, truncation and small screens

### S1 — A 44 px number in a 48 px line box clips at any font scale · **major**
`src/features/results/components.tsx:296` —
`text-[44px] font-bold leading-[48px]`. `leading-[48px]` is a fixed pixel
line-height: the glyphs scale with the OS font setting, the line box does not.
At `fontScale: 1.3` the text is 57 px inside 48 px → clipped ascenders and a
touching row below. This is the rank headline on the Rank screen.

Fix: `text-[44px] font-bold tabular-nums tracking-tight` and delete the
`leading-[48px]` (nsh's default leading is relative), or use `leading-tight`.
Grep shows this is the only `leading-[Npx]` in `src` — everywhere else already
uses unitless leading.

### S2 — `numberOfLines` cuts the only distinguishing text · **major**
- `src/features/results/components.tsx:263` — student name, 1 line. Two students
  with the same first name and a long surname are indistinguishable in the table
  and the merit list.
- `src/features/results/components.tsx:267` — the reg number is `Mono` with **no**
  `numberOfLines` and no `shrink`, inside a `flex-row` with a flexible college
  name. At `fontScale ≥ 1.3` on 320 pt a 12-digit reg wraps **mid-number**.
- `src/features/notices/parts.tsx:276,302` — notice titles, 2 lines. BEU notices
  put the differentiator at the end ("… (B.Tech 3rd Sem)").
- `src/features/tools/index.tsx:2006` — routine subject, 1 line; long subject
  names become identical prefixes.

Fixes: name → `numberOfLines={2}`; reg → `numberOfLines={1}` **plus**
`class="shrink-0"` on the `Mono` and `flex-1` on the name so the number never
breaks; notice title → `numberOfLines={3}` with the excerpt dropped to 2 (the
card is already tall); routine subject → `numberOfLines={2}`.

### S3 — 9 px type in seven places · **minor**
`text-[9px]` sites: `home/index.tsx:255`, `syllabus/index.tsx:271` (the only
place a subject's credits appear), `pyqs/components.tsx:94`,
`pyqs/{gate:167,data:321,data-table:300,browse:81}`. 9 px at `fontScale: 1.0`
is 12 px physical on a 3× device — under the ~11 px legibility floor, and it is
never the decorative case: it is credits, paper variant and semester.

Fix: bump all seven to `text-[11px]`; `Badge` already renders at 11 px, so they
stay visually subordinate without being unreadable.

### S4 — Seven-column holiday grid is 34 pt wide at 320 pt · **minor**
`src/features/tools/index.tsx:2186` — `min-h-11 flex-1` cells inside `Row gap-1`
inside `Card p-3.5` inside `Body p-4`. At 320 pt: (320 − 32 − 28 − 24) / 7 =
**33.7 pt**. Height passes (44), width does not, and neighbours are 4 pt apart.

Fix: `gap-0.5` + `p-2` on the card buys ~3.4 pt per cell (→ 37.1) — still short of
44, which is a genuine limit of a 7-column month on 320 pt. If 44 pt is a hard
requirement, switch the month to a 4-column grid of week rows, or accept 37 pt
and record the exception. Do **not** hide the day dots to gain width: they are
the only signal that a day has a holiday.

### S5 — The "of 1,234" rank caption and the 52 pt time column · **minor**
`src/features/results/components.tsx:297` puts `#1234` (44 px) beside
`of 1,234` (13 px) in an `items-end` row with no `flex-wrap` and no `shrink`;
`src/features/tools/index.tsx:1965` and `:2005` reserve a hard `w-[52px]` for a
start/end time rendered at 14 px and 10–11 px — at `fontScale: 1.3` "10:45"
needs ~59 pt and is either clipped or pushes the subject column.

Fixes: add `flex-wrap` to the rank row (it degrades gracefully) and let the
`#` value `shrink`; change `w-[52px]` to `min-w-[52px]` in both places so the
column can grow instead of truncating the clock.

---

## 4. Semantics

### R1 — `Progress` is invisible to a screen reader · **minor**
`src/ui/index.tsx:370-379` — a `View` pair with a percentage width, no `role`,
no value. It is used at 7 sites, including `results/rank.tsx:191` (percentile)
and `tools/index.tsx:1628` (attendance risk), where the bar is the message.
`ProgressBar` in `syllabus/index.tsx:161` happens to print the percentage; the
raw uses do not.

```diff
- <View class={`h-2 w-full overflow-hidden rounded-full bg-muted ${props.class ?? ""}`}>
+ <View class={`h-2 w-full overflow-hidden rounded-full bg-muted ${props.class ?? ""}`}
+   role="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}
+   accessibilityLabel={props.label ?? "Progress"}>
```

`Progress` has no `label` prop today — add `label?: string`, or drop that line
and let the surrounding `ProgressBar` (`syllabus/index.tsx:161`) carry the text.

### R2 — Async results and notices never announce themselves · **minor**
`announce()` from `nsh` is not called anywhere in `src` (0 hits). Results
lookup (`results/lookup.tsx`), rank search (`results/rank.tsx`) and notice
refresh (`notices/index.tsx`) replace a loading state with content silently —
with VoiceOver/TalkBack the user hears nothing and cannot tell whether the tap
registered. The error path is fine (it renders text the reader reaches).

Fix: one call where the request resolves, e.g.

```ts
announce(`Result loaded. SGPA ${data.sgpa}, ${data.status.toLowerCase()}.`);
```

Keep it short and never announce a failure — the error card already has focus.

---

## What already passes (checked, no action)

- `TabBar` (`src/app/tabbar.tsx:80-82`) has `role="tab"`,
  `accessibilityState.selected` and a label; the active pill uses a background
  *and* weight, not colour alone. Only nit: the tabs are not wrapped in a
  `tablist`. Its 10 px text (`:86`) is the smallest type in the frame — fine for
  a tab bar, since each tab also carries `accessibilityLabel`.
- The studied-topic checkbox has a real `accessibilityState.checked` and a
  ✓-vs-number cue (`syllabus/index.tsx:386-391`) — state is not colour-only, and
  the label is written out (`:388`).
- The unread notice dot (`notices/parts.tsx:270`) is backed by a spoken
  "Unread." prefix (`:268`), so the state survives without colour.
- Dark `muted-foreground`, both themes' `accent-foreground` on `accent`, dark
  `primary`, and `foreground` on every tinted wash are all ≥ 6:1.
- `Field` is `min-h-12` and `Btn` is `min-h-11`; no fixed-height text containers
  outside S1, so `fontScale: 1.3` does not clip anywhere else.

---

## Fix order

1. `nsh.json` light `muted-foreground` → `#6E6252` (A2, fixes ~90% of secondary text).
2. `nsh.json` light `primary` → `#B8431F` (A3, fixes the main CTA and every ember label).
3. Add `accent-ink` per theme, swap the 19 `text-accent` uses (A1, unreadable in dark).
4. Add `border-strong`, apply to Chip / Field / Stepper / calendar nav / checkbox (A4).
5. `Chip` → `min-h-11 px-4` (T1, 49 call sites, one line).
6. `Search` clear → 44 pt + `role` + `accessibilityLabel` (T3, worst target).
7. `SectionHeader` action → `min-h-11` (T2); `PageHeader` back → `h-11 w-11` (T4).
8. `hitSlop={10}` on the syllabus checkbox, `hitSlop={6}` on the star (T5).
9. Delete `leading-[48px]` in the rank headline (S1); loosen `numberOfLines` and
   pin the reg number (S2).
10. Sweep `text-[9px]` → `text-[11px]`, add `role="progressbar"` to `Progress`,
    and one `announce()` per async load (S3, R1, R2) — then re-check S4/S5 at
    320 pt on a real device.
