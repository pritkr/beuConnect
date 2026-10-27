#!/usr/bin/env bun
/**
 * WCAG contrast gate for the app's theme.
 *
 *   bun scripts/contrast.ts            # every measured pair, exit 1 on a fail
 *   bun scripts/contrast.ts --quiet    # only the failures + the summary
 *   bun scripts/contrast.ts --json     # machine-readable, same exit code
 *
 * Reads `nsh.json` → `theme.cssVars.light|dark` (with `cssVars.theme` as the
 * shared layer) and checks the pairs the app actually renders:
 *
 *   - text ink (foreground, muted-foreground, primary-ink, accent-ink,
 *     destructive) on every opaque surface and on the tinted washes the kit
 *     draws over a card                                            → 4.5:1
 *   - each `*-foreground` on the surface it is written for          → 4.5:1
 *   - control borders (`border-strong`) and the focus ring          → 3:1 (UI)
 *   - chart series, progress fills and the ember fill on the track  → 3:1 (UI)
 *
 * Alpha anywhere (a token written `#rrggbbaa`, or a `/12` wash composited over
 * its base) is flattened before the ratio is taken, so a pair is measured as
 * pixels, not as intent.
 *
 * Why `border` is reported but not gated: the hairline is decoration (WCAG
 * 1.4.11 exempts boundaries that are not required to identify a component).
 * Where the border *is* the control — Chip, Field, Search, Stepper — the kit
 * uses `border-strong`, and that token is gated at 3:1.
 */

import { readFileSync } from "node:fs";

const TEXT = 4.5;
const UI = 3.0;

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Ink {
  /** Theme token name. */
  token: string;
  /** Wash strength when the token is painted over another surface (0–1). */
  alpha?: number;
  /** Token it is painted over, for a wash. */
  over?: string;
}

interface Theme extends Record<string, string> {}

interface Pair {
  need: number;
  kind: "text" | "large" | "ui";
  fg: Ink;
  bg: Ink;
  /** Free-form suffix, e.g. "decorative, not gated". */
  note?: string;
}

const root = new URL("..", import.meta.url);
const args = new Set(process.argv.slice(2));
const quiet = args.has("--quiet");
const asJson = args.has("--json");

if (args.has("--help") || args.has("-h")) {
  console.log("usage: bun scripts/contrast.ts [--quiet|--json]");
  console.log("exit 1 when any pair is below its WCAG threshold");
  process.exit(0);
}

/* ------------------------------------------------------------------ colour */

function parseColor(raw: string, where: string): RGBA {
  const value = String(raw).trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    if (full.length !== 6 && full.length !== 8) {
      throw new Error(`${where}: "${value}" is not #rgb, #rrggbb or #rrggbbaa`);
    }
    const byte = (at: number) => parseInt(full.slice(at, at + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: full.length === 8 ? byte(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(value);
  if (!fn) throw new Error(`${where}: "${value}" is not a hex or rgb() colour`);
  return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: fn[4] === undefined ? 1 : Number(fn[4]) };
}

/** `top` over `base`: the pixel colour of a translucent wash. */
function flatten(top: RGBA, base: RGBA): RGBA {
  const a = top.a;
  return {
    r: top.r * a + base.r * (1 - a),
    g: top.g * a + base.g * (1 - a),
    b: top.b * a + base.b * (1 - a),
    a: 1,
  };
}

function luminance(c: RGBA): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function ratio(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------------------------------------------- theme */

const config = JSON.parse(readFileSync(new URL("nsh.json", root), "utf8")) as {
  theme?: { cssVars?: { theme?: Record<string, Theme> } };
};

const vars = config.theme?.cssVars;
if (!vars?.light || !vars?.dark) {
  console.error("nsh.json: theme.cssVars.light and theme.cssVars.dark are required");
  process.exit(1);
}

/** Tokens shared by both appearances, then the appearance's own overrides. */
const themes = {
  light: { ...vars.theme, ...vars.light } as Record<string, string>,
  dark: { ...vars.theme, ...vars.dark } as Record<string, string>,
};

const cache = new Map<string, RGBA>();

function token(theme: Theme, appearance: string, name: string): RGBA {
  const key = `${appearance}:${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = theme[name];
  if (raw === undefined) {
    console.error(`nsh.json: theme.${appearance} has no "${name}" token`);
    process.exit(1);
  }
  const color = parseColor(raw, `theme.${appearance}.${name}`);
  cache.set(key, color);
  return color;
}

/** The colour an ink paints, with its wash flattened onto its base. */
function paint(theme: Theme, appearance: string, ink: Ink): RGBA {
  const base = token(theme, appearance, ink.token);
  if (ink.over === undefined) return base;
  const under = paint(theme, appearance, { token: ink.over });
  const alpha = ink.alpha ?? base.a;
  return flatten({ ...base, a: alpha }, under);
}

function name(ink: Ink): string {
  const wash = ink.alpha === undefined ? "" : `/${Math.round(ink.alpha * 100)}`;
  return ink.over === undefined ? `${ink.token}${wash}` : `${ink.token}${wash} on ${ink.over}`;
}

/* ------------------------------------------------------------------- pairs */

function pairs(): Pair[] {
  const list: Pair[] = [];
  const text = (fg: Ink, bg: Ink, note?: string) => list.push({ fg, bg, need: TEXT, kind: "text", note });
  const ui = (fg: Ink, bg: Ink, note?: string) => list.push({ fg, bg, need: UI, kind: "ui", note });
  const t = (token: string): Ink => ({ token });
  const wash = (token: string, alpha: number, over: string): Ink => ({ token, alpha, over });

  const surfaces = ["background", "card", "muted", "secondary"].map(t);
  for (const ink of ["foreground", "muted-foreground", "primary-ink", "accent-ink", "destructive"].map(t)) {
    for (const surface of surfaces) text(ink, surface);
  }

  // Each `*-foreground` on the surface it was designed for.
  text(t("card-foreground"), t("card"));
  text(t("popover-foreground"), t("popover"));
  text(t("primary-foreground"), t("primary"));
  text(t("secondary-foreground"), t("secondary"));
  text(t("accent-foreground"), t("accent"));
  text(t("destructive-foreground"), t("destructive"));
  text(t("sidebar-foreground"), t("sidebar"));
  text(t("sidebar-accent-foreground"), t("sidebar-accent"));
  text(t("sidebar-primary-foreground"), t("sidebar-primary"));

  // Ink on the tinted washes the kit draws over a card (Panel, Badge, Stat).
  for (const ink of ["primary-ink", "muted-foreground", "accent-ink"].map(t)) {
    text(ink, wash("primary", 0.12, "card"), "ember badge");
    text(ink, wash("accent", 0.12, "card"), "mint badge");
  }
  text(t("primary-ink"), wash("primary", 0.1, "card"), "ember panel");
  text(t("primary-ink"), wash("primary", 0.08, "card"), "ember stat (large)");
  text(t("accent-ink"), wash("accent", 0.1, "card"), "mint panel");
  text(t("accent-ink"), wash("accent", 0.08, "card"), "mint stat (large)");
  text(t("destructive"), wash("destructive", 0.1, "card"), "danger button");
  text(t("foreground"), wash("chart-3", 0.2, "card"), "amber badge");
  text(t("foreground"), wash("chart-3", 0.15, "card"), "amber panel");

  // Non-text UI: anything whose shape or fill carries the message.
  for (const surface of ["background", "card", "muted"].map(t)) {
    ui(t("border-strong"), surface, "control outline");
    ui(t("ring"), surface, "focus ring");
  }
  for (const series of ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"].map(t)) {
    ui(series, t("card"), "chart series");
  }
  for (const fill of ["primary", "chart-3"].map(t)) {
    ui(fill, t("muted"), "progress fill on track");
  }
  ui(t("accent-ink"), t("muted"), "mint progress fill on track");

  return list;
}

/* ------------------------------------------------------------------ report */

const results: {
  appearance: string;
  pair: string;
  ratio: number;
  need: number;
  kind: string;
  pass: boolean;
  note?: string;
}[] = [];

for (const appearance of ["light", "dark"] as const) {
  const theme = themes[appearance];
  for (const pair of pairs()) {
    const measured = ratio(paint(theme, appearance, pair.fg), paint(theme, appearance, pair.bg));
    results.push({
      appearance,
      pair: `${name(pair.fg)} on ${name(pair.bg)}`,
      ratio: Math.round(measured * 100) / 100,
      need: pair.need,
      kind: pair.kind,
      pass: measured >= pair.need,
      note: pair.note,
    });
  }
  // Reported, never gated: the decorative hairline. 1.4.11 exempts it.
  const hairline = ratio(token(theme, appearance, "border"), token(theme, appearance, "card"));
  results.push({
    appearance,
    pair: "border on card (decorative hairline, not gated)",
    ratio: Math.round(hairline * 100) / 100,
    need: 0,
    kind: "info",
    pass: true,
    note: "decoration only; controls use border-strong",
  });
}

const failures = results.filter((row) => !row.pass);

if (asJson) {
  console.log(JSON.stringify({ results, failures: failures.length, ok: failures.length === 0 }, null, 2));
} else {
  if (!quiet) console.log("BEUConnect theme contrast — nsh.json (cssVars.theme)\n");
  for (const appearance of ["light", "dark"]) {
    const rows = results.filter((row) => row.appearance === appearance);
    if (!quiet) console.log(appearance);
    for (const row of rows) {
      if (quiet && row.pass) continue;
      const verdict = row.kind === "info" ? "INFO" : row.pass ? "PASS" : "FAIL";
      const need = row.kind === "info" ? " — " : row.need.toFixed(1);
      const ratioText = row.ratio.toFixed(2).padStart(5);
      const detail = row.note ? `   ${row.note}` : "";
      if (!quiet) console.log(`  ${verdict}  ${ratioText}  ${need}  ${row.pair}${detail}`);
      else console.log(`  ${verdict}  ${ratioText}  ${need}  ${appearance}: ${row.pair}${detail}`);
    }
    if (!quiet) console.log("");
  }
}

const total = results.filter((row) => row.kind !== "info").length;
if (failures.length === 0) {
  console.log(`OK — ${total} gated pairs, every one at or above its threshold.`);
  process.exit(0);
}
console.log(`${failures.length} of ${total} gated pairs below threshold:`);
for (const row of failures) {
  console.log(`  ${row.appearance}: ${row.pair} — ${row.ratio.toFixed(2)} < ${row.need.toFixed(1)}`);
}
process.exit(1);
