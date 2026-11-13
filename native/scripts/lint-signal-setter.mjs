#!/usr/bin/env bun
/**
 * A signal setter passed as a prop must be wrapped in a function.
 *
 * `onChange={query.set}` looks like the clean way to bind a text field, and it
 * ships a screen that dies on the first keystroke: `set` is extracted from its
 * signal, so the write no longer happens in a live scope and the runtime throws
 * `TypeError: not a live signal`. The screen is replaced by its error boundary
 * the moment a student types. The same applies to a chip strip
 * (`onChange={sem.set}`) — the first tap kills the screen.
 *
 * The fix is always the same shape, and it costs one closure:
 *
 *     onChange={(value) => query.set(value)}
 *
 * This scan is deliberately narrow: it only reports `={x.set}` / `={x.y.set}`,
 * a bare method reference as a whole attribute value. Calling a setter inside
 * an arrow, or passing any other kind of callback, is fine.
 *
 *   bun scripts/lint-signal-setter.mjs           # exit 1 on a violation
 *   bun scripts/lint-signal-setter.mjs --quiet   # only failures
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const QUIET = process.argv.includes("--quiet");
const BARE_SETTER = /=\{\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.set\s*\}/g;

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

const problems = [];

for (const path of walk(join(ROOT, "src"))) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(BARE_SETTER)) {
    const line = source.slice(0, match.index).split("\n").length;
    problems.push({ file: relative(ROOT, path), line, text: match[0].trim() });
  }
}

/** `#7` style: a sprinkling of colour when the terminal has one. */
const red = (text) => (process.stdout.isTTY ? `\u001b[31m${text}\u001b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text);

if (!QUIET) console.log("▸ signal setters");

if (problems.length === 0) {
  if (!QUIET) console.log("  no setter is passed bare");
  process.exit(0);
}

console.error(red(`✗ ${problems.length} signal setter(s) passed as a bare reference`));
for (const problem of problems) {
  console.error(`  ${problem.file}:${problem.line}`);
  console.error(dim(`    ${problem.text}`));
}
console.error("  wrap it: `onChange={(value) => query.set(value)}` — a bare `set` loses its scope and throws on the first event");
process.exit(1);
