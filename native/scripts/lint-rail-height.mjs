#!/usr/bin/env bun
/**
 * A horizontal `Scroll` that is `flex-1` in a column lays out at zero height.
 *
 * A scroll view is the viewport, and it takes its size from its parent. `flex-1`
 * grows along the parent's main axis — inside a column that is the *height*, and
 * with no definite height to grow into the viewport ends up 0 px tall. The
 * label above it and the gaps around it still paint, so the screen looks like a
 * heading with nothing under it. `app.texts()` reports the chips anyway, so no
 * rendering test can see it: the data table's sort rail was invisible this way.
 *
 * The rule: a horizontal `<Scroll>` may be `flex-1` only when it also carries a
 * height (`h-11`, `min-h-11`, …). Otherwise it takes its height from its
 * content, which is what a rail wants. A rail that needs width can wrap the
 * scroll in a view with `flex-1` and put `h-11` on the scroll itself.
 *
 *   bun scripts/lint-rail-height.mjs           # exit 1 on a violation
 *   bun scripts/lint-rail-height.mjs --quiet   # only failures
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const QUIET = process.argv.includes("--quiet");
const GROWS = /(^|[\s"'`])(flex-1|grow)([\s"'`]|$)/;
const HEIGHT = /(^|[\s"'`])(h-\d|h-\[|min-h-|max-h-|h-full|absolute|inset-0)/;

/** Every `.tsx` under `dir`, recursively. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".nsh" || entry === ".tmp") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (entry.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** The opening tag starting at `start`, braces and strings tracked. */
function openingTag(source, start) {
  let depth = 0;
  let quote = "";
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth <= 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** `class="…"`, `class={`…`}` or `class={"…"}` inside a tag. */
function classOf(tag) {
  const match = tag.match(/class=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

const problems = [];
let rails = 0;

for (const path of walk(join(ROOT, "src"))) {
  const source = readFileSync(path, "utf8");
  let index = source.indexOf("<Scroll");
  while (index >= 0) {
    // `<ScrollBar` is a different component.
    const next = source[index + 7];
    if (next === undefined || !/[A-Za-z]/.test(next)) {
      const tag = openingTag(source, index);
      if (/(^|\s)horizontal(\s|=|>|$)/.test(tag.replace(/\s+/g, " "))) {
        rails += 1;
        const cls = classOf(tag);
        if (GROWS.test(cls) && !HEIGHT.test(cls)) {
          const line = source.slice(0, index).split("\n").length;
          problems.push({ file: relative(ROOT, path), line, tag: tag.replace(/\s+/g, " ").slice(0, 120) });
        }
      }
    }
    index = source.indexOf("<Scroll", index + 7);
  }
}

const red = (text) => (process.stdout.isTTY ? `\u001b[31m${text}\u001b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text);

if (!QUIET) console.log(`▸ rail height ${dim(`(${rails} horizontal scrolls)`)}`);

if (problems.length === 0) {
  if (!QUIET) console.log(`  ${rails} rail(s) take their height from content`);
  process.exit(0);
}

console.error(red(`✗ ${problems.length} horizontal scroll(s) will paint at zero height`));
for (const problem of problems) {
  console.error(`  ${problem.file}:${problem.line}`);
  console.error(dim(`    ${problem.tag}`));
}
console.error('  drop `flex-1`, use `min-h-11`, or wrap the scroll in a sized view');
process.exit(1);
