# Icons

One font, one component. Every mark in the app is a Boxicons glyph rendered by
`src/ui/icons.tsx`; there are no loose SVGs and no hand-drawn characters in a
`<Text>`.

```
src/ui/icons.tsx                 the map: name → codepoint (regular, solid)
assets/fonts/boxicons.ttf        the subset the app bundles (16,832 B)
assets/fonts/boxicons.LICENSE    Boxicons' MIT licence
build-boxicons.py                rebuild the subset from the map
verify.mjs                       the gate: font and map must agree
```

## Adding an icon

1. Find the name and codepoint in the full Boxicons set — `boxicons@2.1.4`.
   `r` is the regular glyph, `s` the solid one. Solid is for selected and
   filled states only (active tab, saved star, PDF badge); everything else is
   regular.
2. Add `"name": { r: 0x…, s: 0x… }` to `ICONS` in `src/ui/icons.tsx`.
   `IconName` follows from it — no second list to update.
3. Rebuild the font: `uv run scripts/icons/build-boxicons.py`.
4. `bun scripts/icons/verify.mjs` (also runs inside `./scripts/check.sh`) and
   `./scripts/size-report.sh`.

The subset only carries what the map names, so a name without a glyph and a
glyph without a name both fail the gate. That is the point: the two halves are
generated from each other, and a missing glyph is invisible at runtime.

## Why a font and not SVGs

- **Bytes.** The full TTF is 320,944 B; the 93-codepoint subset the app
  actually uses is 16,832 B (8,235 B gzipped) against a 12,000,000 B APK
  budget.
- **One family.** Every glyph shares the same stroke weight, so a row of them
  reads as one system instead of a scrapbook.
- **Layout.** An icon is text: it scales with `fontSize`, inherits the caller's
  colour class, and never reflows a row when it changes.
- **Accessibility.** `Icon` is hidden from the accessibility tree and does not
  scale with the system font size; the control around it always owns the
  spoken label.

## Credit

Boxicons — <https://boxicons.com> — by Aniket Suvarna, used under the MIT
licence (see `assets/fonts/boxicons.LICENSE`). Version pinned in
`build-boxicons.py`, which verifies the upstream SHA-256 before subsetting.
