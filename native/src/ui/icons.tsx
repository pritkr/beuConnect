/**
 * Boxicons, one component.
 *
 * The app ships a subset of the Boxicons TTF (see scripts/icons/) rather than
 * a set of hand-drawn marks, so every glyph comes from one family and weighs
 * the same at every size. Icons are text: they scale with the layout, inherit
 * the caller's colour class and never reflow a row when the state changes.
 *
 * Use `solid` for the selected / filled state of a control (active tab, saved
 * star, file type badges). Everything else stays regular.
 */

import { Text } from "nsh";

import family from "../../assets/fonts/boxicons.ttf";

type Glyph = { r?: number; s?: number };

/* Generated from boxicons@2.1.4 metadata; keep in sync with the subset font. */
const ICONS = {
  "home-alt-2": { r: 0xef2d, s: 0xef2b },
  "book-open": { r: 0xe9ef, s: 0xece5 },
  "bar-chart-alt-2": { r: 0xe9c6, s: 0xecbb },
  wrench: { r: 0xec8c, s: 0xef05 },
  "grid-alt": { r: 0xeafb, s: 0xedd5 },
  "chevron-left": { r: 0xea4d },
  "chevron-right": { r: 0xea50 },
  "chevron-down": { r: 0xea4a },
  "chevron-up": { r: 0xea57 },
  x: { r: 0xec8d },
  check: { r: 0xea41 },
  search: { r: 0xebf7, s: 0xee9a },
  plus: { r: 0xebc0 },
  minus: { r: 0xeb8b },
  "check-circle": { r: 0xea46, s: 0xed31 },
  inbox: { s: 0xedf3 },
  "error-circle": { r: 0xeac7, s: 0xeda4 },
  "file-blank": { r: 0xead6, s: 0xedaf },
  star: { r: 0xec27, s: 0xeeb8 },
  "user-x": { r: 0xec6a, s: 0xeeec },
  group: { r: 0xeaff, s: 0xedd6 },
  table: { r: 0xec39 },
  hash: { r: 0xeb05 },
  building: { r: 0xea0a, s: 0xecf4 },
  category: { r: 0xea39, s: 0xed27 },
  note: { r: 0xeba1, s: 0xee58 },
  "calendar-x": { r: 0xea20, s: 0xed0b },
  book: { r: 0xe9e1, s: 0xecd6 },
  data: { r: 0xea95, s: 0xed76 },
  trophy: { r: 0xec56, s: 0xeed7 },
  medal: { r: 0xeb5a, s: 0xee1b },
  "id-card": { r: 0xeb1a, s: 0xedef },
  "git-compare": { r: 0xeaf2 },
  certification: { r: 0xea3c, s: 0xed2a },
  "link-external": { r: 0xeb3e },
  download: { r: 0xeab9, s: 0xed95 },
  "file-pdf": { s: 0xedbc },
  paperclip: { r: 0xebaa },
  bot: { r: 0xe9fa, s: 0xece7 },
  "calendar-check": { r: 0xea17, s: 0xed02 },
  "calendar-star": { r: 0xea1e, s: 0xed09 },
  megaphone: { s: 0xee1c },
  cog: { r: 0xea6e, s: 0xed52 },
  "user-check": { r: 0xec64, s: 0xeee4 },
  calculator: { r: 0xea14, s: 0xecff },
  wifi: { r: 0xec7c },
  "message-square-dots": { r: 0xeb81, s: 0xee3f },
  "cloud-download": { r: 0xea61, s: 0xed4b },
  "info-circle": { r: 0xeb21, s: 0xedf4 },
  user: { r: 0xec63, s: 0xeee1 },
  "calendar-week": { r: 0xea1f, s: 0xed0a },
  file: { r: 0xead5, s: 0xedad },
  "time-five": { r: 0xec46, s: 0xeec8 },
  "up-arrow-alt": { r: 0xec5d, s: 0xeedc },
  "down-arrow-alt": { r: 0xeab7, s: 0xed92 },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof ICONS;

export function Icon(props: {
  name: IconName;
  /** Square size in points. Defaults to 18. */
  size?: number;
  /** Filled variant, for selected / on states. Falls back to regular. */
  solid?: boolean;
  class?: string;
}) {
  const glyph: Glyph = ICONS[props.name];
  const code = (props.solid ? (glyph.s ?? glyph.r) : (glyph.r ?? glyph.s)) as number;
  const size = props.size ?? 18;
  return (
    <Text
      class={`text-center ${props.class ?? ""}`}
      style={{ fontFamily: family, fontSize: size, lineHeight: size }}
      allowFontScaling={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {String.fromCodePoint(code)}
    </Text>
  );
}
