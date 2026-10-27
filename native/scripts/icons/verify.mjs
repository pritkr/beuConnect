#!/usr/bin/env bun
/**
 * Fails when `src/ui/icons.tsx` and `assets/fonts/boxicons.ttf` disagree.
 *
 * An icon is a codepoint in a font; a typo in either half is silent at
 * runtime — the row just paints an empty box, or nothing at all, and no
 * rendering test can see it. So the gate reads the font's own `cmap` table and
 * checks it against the map: every named codepoint must exist in the font,
 * and every glyph in the font must be named.
 *
 * Runs in `scripts/check.sh` before `nsh check`. No dependency, no Python.
 */

const ROOT = new URL("../..", import.meta.url).pathname;
const FONT = `${ROOT}assets/fonts/boxicons.ttf`;
const MAP = `${ROOT}src/ui/icons.tsx`;

function cmapCodes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    if (tag === "cmap") cmapOffset = view.getUint32(record + 8);
  }
  if (cmapOffset < 0) throw new Error("no cmap table");

  const codes = new Set();
  const tables = view.getUint16(cmapOffset + 2);
  for (let i = 0; i < tables; i += 1) {
    const subtable = cmapOffset + view.getUint32(cmapOffset + 4 + i * 8 + 4);
    const format = view.getUint16(subtable);
    if (format === 4) {
      const segments = view.getUint16(subtable + 6) / 2;
      const ends = subtable + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const ranges = deltas + segments * 2;
      for (let s = 0; s < segments; s += 1) {
        const end = view.getUint16(ends + s * 2);
        const start = view.getUint16(starts + s * 2);
        const delta = view.getInt16(deltas + s * 2);
        const range = view.getUint16(ranges + s * 2);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          // A segment maps a codepoint to a glyph id; keep the codepoint, and
          // only when it resolves to something the font can actually paint.
          const glyph =
            range === 0
              ? (code + delta) & 0xffff
              : view.getUint16(ranges + s * 2 + range + (code - start) * 2);
          if (glyph !== 0) codes.add(code);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(subtable + 12);
      for (let g = 0; g < groups; g += 1) {
        const group = subtable + 16 + g * 12;
        const start = view.getUint32(group);
        const end = view.getUint32(group + 4);
        for (let code = start; code <= end; code += 1) codes.add(code);
      }
    }
  }
  return codes;
}

function namedCodes(source) {
  const start = source.indexOf("const ICONS = {");
  const end = source.indexOf("} satisfies", start);
  if (start < 0 || end < 0) throw new Error("no ICONS map in src/ui/icons.tsx");
  const codes = new Set();
  for (const [, code] of source.slice(start, end).matchAll(/\b[rs]:\s*0x([0-9a-fA-F]+)/g)) {
    codes.add(Number.parseInt(code, 16));
  }
  return codes;
}

const font = cmapCodes(new Uint8Array(await Bun.file(FONT).arrayBuffer()));
const named = namedCodes(await Bun.file(MAP).text());
const hex = (code) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

const missing = [...named].filter((code) => !font.has(code));
const dead = [...font].filter((code) => !named.has(code));

if (missing.length > 0 || dead.length > 0) {
  if (missing.length > 0) {
    console.error(`icons: chased codepoints the font does not carry: ${missing.map(hex).join(", ")}`);
    console.error("icons: run `uv run scripts/icons/build-boxicons.py` to resubset it.");
  }
  if (dead.length > 0) {
    console.error(`icons: glyphs in the font that no icon names (${dead.length}): ${dead.map(hex).join(", ")}`);
    console.error("icons: drop the name from src/ui/icons.tsx, or rebuild to reclaim the bytes.");
  }
  process.exit(1);
}

console.log(`icons: ${named.size} codepoints, font and map agree`);
