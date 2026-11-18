#!/usr/bin/env bun
/**
 * `display: "flex"` without a direction lays children out in a row.
 *
 * NSH follows CSS: a view with no `display` is a column, but setting
 * `display: "flex"` switches to flexbox's initial `flexDirection: "row"`.
 * A hidden-by-style section that turns flex on therefore becomes a
 * horizontal rail, and its cards run off the right edge while the space
 * below them stays empty. It mounts, the text exists, and no rendering test
 * can see the layout, so the screen ships broken.
 *
 * The rule: an opening tag that sets `display: "flex"` (or a conditional
 * that includes it) must state `flexDirection` in its inline style, or use a
 * `flex-row` / `flex-col` class. `display: "none"` alone is fine.
 *
 *   bun scripts/lint-flex-direction.mjs           # exit 1 on a violation
 *   bun scripts/lint-flex-direction.mjs --quiet   # only failures
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const QUIET = process.argv.includes("--quiet");
const FLEX = /display:\s*(?:"flex"|'flex'|`flex`)/;
const DIRECTION = /flexDirection:/;
const DIRECTION_CLASS = /(^|[\s"'`])(flex-row|flex-col|flex-row-reverse|flex-col-reverse)([\s"'`]|$)/;

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
let flexes = 0;

for (const path of walk(join(ROOT, "src"))) {
  const source = readFileSync(path, "utf8");
  const flex = new RegExp(FLEX.source, "g");
  let match = flex.exec(source);
  while (match) {
    const tagStart = source.lastIndexOf("<", match.index);
    const tagEnd = tagStart >= 0 ? tagStart + openingTag(source, tagStart).length : match.index;
    // A style in a `.map()` callback can sit outside the JSX tag's text; use
    // the nearest tag when the match is inside it, else this match alone.
    const tag =
      tagStart >= 0 && match.index < tagEnd
        ? source.slice(tagStart, tagEnd)
        : source.slice(match.index, match.index + 240);
    flexes += 1;
    if (!DIRECTION.test(tag) && !DIRECTION_CLASS.test(classOf(tag))) {
      const line = source.slice(0, match.index).split("\n").length;
      problems.push({ file: relative(ROOT, path), line, tag: tag.replace(/\s+/g, " ").slice(0, 140) });
    }
    match = flex.exec(source);
  }
}

const red = (text) => (process.stdout.isTTY ? `\u001b[31m${text}\u001b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text);

if (!QUIET) console.log(`▸ flex direction ${dim(`(${flexes} inline flex displays)`)}`);

if (problems.length === 0) {
  if (!QUIET) console.log(`  ${flexes} flex display(s) state a direction`);
  process.exit(0);
}

console.error(red(`✗ ${problems.length} flex display(s) will lay out in a row`));
for (const problem of problems) {
  console.error(`  ${problem.file}:${problem.line}`);
  console.error(dim(`    ${problem.tag}`));
}
console.error("  add `flexDirection: \"column\"` (or a `flex-col` class), or drop the inline display");
process.exit(1);
