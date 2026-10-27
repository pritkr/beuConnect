#!/usr/bin/env bun
/**
 * Every `<List` needs a height, or it paints nothing.
 *
 * `nsh`'s `List` is a scroll view: it takes its height from its parent's
 * constraints, and inside a `Screen` there is none to inherit, so a list without
 * `flex-1` (or an explicit `h-`) lays out at zero pixels. The failure is silent
 * and total — the list's own `header` and `footer` disappear with it, so the
 * screen shows a title bar over an empty page. `app.texts()` still reports every
 * string, so no rendering test can see it. This scan can.
 *
 * It reads the opening tag of each `<List`, from `<List` to the last prop before
 * the tag closes, and requires a height in its `class`. False positives are
 * possible in theory (a nested `<List` inside another list's props); the scan
 * reports the file and line, so a wrong hit is one look away.
 *
 *   bun scripts/lint-list-height.mjs          # exit 1 on a violation
 *   bun scripts/lint-list-height.mjs --quiet   # only failures
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const QUIET = process.argv.includes("--quiet");
const HEIGHT = /(^|[\s"'`])(flex-1|grow|h-\d|h-\[|h-full|absolute|inset-0)/;

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

/**
 * The text of the opening tag that starts at `<List`, up to the `>` that closes
 * it. Braces are tracked so a `=>` inside a prop or an object literal does not
 * end the tag early, and string literals are skipped the same way.
 */
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

/** `class="…"` or `class={`…`}` inside a tag, joined when it is a template. */
function classOf(tag) {
  const match = tag.match(/class=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

const problems = [];
let lists = 0;

for (const path of walk(join(ROOT, "src"))) {
  const source = readFileSync(path, "utf8");
  let index = source.indexOf("<List");
  while (index >= 0) {
    // `<ListBar` and `<ListView` are different components.
    const next = source[index + 5];
    const isList = next === undefined || !/[A-Za-z]/.test(next);
    if (isList) {
      lists += 1;
      const tag = openingTag(source, index);
      if (!HEIGHT.test(classOf(tag))) {
        const line = source.slice(0, index).split("\n").length;
        problems.push({ file: relative(ROOT, path), line, tag: tag.replace(/\s+/g, " ").slice(0, 120) });
      }
    }
    index = source.indexOf("<List", index + 5);
  }
}

/** `#7` style: a sprinkling of colour when the terminal has one. */
const red = (text) => (process.stdout.isTTY ? `\u001b[31m${text}\u001b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text);

if (!QUIET) console.log(`▸ list height ${dim(`(${lists} lists)`)}`);

if (problems.length === 0) {
  if (!QUIET) console.log(`  ${lists} list(s) carry a height`);
  process.exit(0);
}

console.error(red(`✗ ${problems.length} list(s) have no height and will paint nothing`));
for (const problem of problems) {
  console.error(`  ${problem.file}:${problem.line}`);
  console.error(dim(`    ${problem.tag}`));
}
console.error("  add `class=\"flex-1\"` (or an explicit height) to the <List>");
process.exit(1);
