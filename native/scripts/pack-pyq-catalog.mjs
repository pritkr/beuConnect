#!/usr/bin/env bun
/**
 * Packs the PYQ catalogue into a wire format, the way the syllabus packs were.
 *
 * `catalog-data.ts` carries one string literal: `JSON.parse` of it is the whole
 * catalogue. Readable, and 319 KB of the bundle — a third of the whole app — for
 * 458 subjects and 1054 papers. Nearly all of that is the JSON's own spelling:
 * every paper repeats `"variant":`, `"questions":`, `"marks":` and so on, and
 * 1054 papers have only 3 distinct durations and 219 distinct titles.
 *
 * The packed form is still JSON (one `JSON.parse`, no parser of our own) but it
 * indexes the repetition:
 *
 *   { g: generated, b: branches, y: years,
 *     t: titles, v: variants, h: times, m: marks, c: paper codes,
 *     n: subject names, s2: subject types,
 *     s: [[branch, sem, name, key, code, codes, type, credits, flags, paperIds], …],
 *     p: [[code, year, variant, id, questions, title, marks, time], …] }
 *
 * `decode` puts the original shape back, so nothing downstream changes except
 * calling it. `key` is stored once and `slug` derived from it (`key` is always
 * `branch|sem|slug`; the generator asserts that before writing).
 *
 *   bun scripts/pack-pyq-catalog.mjs            # pack, verify, write
 *   bun scripts/pack-pyq-catalog.mjs --check    # report sizes only
 *
 * It refuses to write when the round-trip does not match exactly: a smaller
 * catalogue that lost a paper is worse than a large one. The verification
 * imports the generated module itself, not a copy of its logic.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FILE = "src/features/pyqs/catalog-data.ts";
const CHECK_ONLY = process.argv.includes("--check");

/** `export const RAW = "…"` — the literal's bounds and its decoded text. */
function readRaw(path) {
  const source = readFileSync(path, "utf8");
  const at = source.indexOf("export const RAW = ");
  if (at < 0) throw new Error(`${path}: no \`export const RAW = \``);
  let index = source.indexOf('"', at) + 1;
  let end = index;
  while (end < source.length) {
    if (source[end] === "\\") {
      end += 2;
      continue;
    }
    if (source[end] === '"') break;
    end += 1;
  }
  // Generated data, so undoing its escapes as a string literal is exact.
  return { source, raw: eval(`"${source.slice(index, end)}"`) };
}

/** Distinct values in first-seen order, with a lookup into the list. */
function dictionary(values) {
  const seen = new Map();
  for (const value of values) if (!seen.has(value)) seen.set(value, seen.size);
  return { list: [...seen.keys()], at: (value) => seen.get(value) };
}

/**
 * Ten papers reached the snapshot with `year: 0` and a title reading
 * "B.Tech Examination, 0": the scraper that built the catalogue could not read
 * the year from those pages and left a zero behind. Their `id` *is* the year, so
 * the year is recovered from it, and the title's trailing zero with it.
 *
 * This lives here because the generator (`scripts/generate_catalog.py`) is not
 * in this repository: the file being packed is the only copy, so a repair has to
 * happen on the way through. It is idempotent and reports what it touched.
 */
function repairYears(catalog) {
  const repaired = [];
  for (const paper of catalog.papers) {
    if (paper.year > 1900) continue;
    if (!/^(19|20)\d{2}$/.test(paper.id)) continue;
    const year = Number(paper.id);
    paper.year = year;
    paper.title = paper.title.replace(/,\s*0\s*$/, `, ${year}`);
    repaired.push(`${paper.code} ${year}`);
  }
  return repaired;
}

/**
 * Five final-year Mechanical subjects exist in BEU's paper archive but not in
 * the syllabus pack, which stops at Sem 6. A mech student in Sem 7 therefore
 * opened the shelf on a semester with no rows at all. Codes, names and years
 * below come from `beu_dataset/beu_btech_question_papers.json` (9 papers,
 * 2021–2022). That dataset carries no marks, duration or question count, so
 * those stay zero and the paper card hides a zero instead of inventing one.
 *
 * Idempotent: a catalogue that already lists the code is left alone, and the
 * paper years are added to `years` so `pack()` can index them.
 */
const MECH_SEM7 = [
  ["102701", "internal-combustion-engines", "Internal Combustion Engines", [2021, 2022]],
  ["102702", "refrigeration-and-air-conditioning", "Refrigeration And Air Conditioning", [2021, 2022]],
  ["102703", "computer-aided-design", "Computer Aided Design", [2021, 2022]],
  ["102705", "automobile-engineering", "Automobile Engineering", [2021]],
  ["102706", "operation-research", "Operation Research", [2021, 2022]],
];

function fillMechSem7(catalog) {
  const added = [];
  for (const [code, slug, name, years] of MECH_SEM7) {
    if (catalog.subjects.some((subject) => subject.branch === "mech" && subject.sem === 7 && subject.code === code)) continue;
    const paperIds = years.map((year) => {
      const existing = catalog.papers.findIndex((paper) => paper.code === code && paper.year === year);
      if (existing >= 0) return existing;
      catalog.papers.push({
        code,
        year,
        variant: "",
        id: String(year),
        questions: 0,
        title: `B.Tech 7th Semester Examination, ${year}`,
        marks: 0,
        time: "",
      });
      if (!catalog.years.includes(year)) {
        catalog.years.push(year);
        catalog.years.sort((left, right) => left - right);
      }
      return catalog.papers.length - 1;
    });
    catalog.subjects.push({
      key: `mech|7|${slug}`,
      slug,
      name,
      branch: "mech",
      sem: 7,
      code,
      codes: [code],
      type: "theory",
      credits: 0,
      elective: false,
      legacy: false,
      paperIds,
    });
    added.push(`${code} ${name}`);
  }
  return added;
}

function pack(catalog) {
  const titles = dictionary(catalog.papers.map((paper) => paper.title));
  const variants = dictionary(catalog.papers.map((paper) => paper.variant));
  const times = dictionary(catalog.papers.map((paper) => paper.time));
  const marks = dictionary(catalog.papers.map((paper) => paper.marks));
  const codes = dictionary(catalog.papers.map((paper) => paper.code));
  const names = dictionary(catalog.subjects.map((subject) => subject.name));
  const types = dictionary(catalog.subjects.map((subject) => subject.type));
  const branches = catalog.branches.map((branch) => branch.key);
  const branchAt = new Map(branches.map((key, index) => [key, index]));

  for (const subject of catalog.subjects) {
    if (`${subject.branch}|${subject.sem}|${subject.slug}` !== subject.key) {
      throw new Error(`slug is not derivable from key: ${subject.key}`);
    }
  }

  return JSON.stringify({
    g: catalog.generated,
    b: catalog.branches.map((branch) => [branch.key, branch.name]),
    y: catalog.years,
    t: titles.list,
    v: variants.list,
    h: times.list,
    m: marks.list,
    c: codes.list,
    n: names.list,
    s2: types.list,
    s: catalog.subjects.map((subject) => [
      branchAt.get(subject.branch),
      subject.sem,
      names.at(subject.name),
      subject.key,
      subject.code,
      subject.codes,
      types.at(subject.type),
      subject.credits,
      (subject.elective ? 1 : 0) | (subject.legacy ? 2 : 0),
      subject.paperIds,
    ]),
    p: catalog.papers.map((paper) => [
      codes.at(paper.code),
      catalog.years.indexOf(paper.year),
      variants.at(paper.variant),
      paper.id,
      paper.questions,
      titles.at(paper.title),
      marks.at(paper.marks),
      times.at(paper.time),
    ]),
  });
}

const DECODE = `interface Packed {
  g: string;
  b: [string, string][];
  y: number[];
  t: string[];
  v: string[];
  h: string[];
  m: number[];
  c: string[];
  n: string[];
  s2: ("theory" | "lab")[];
  /** [branch, sem, name, key, code, codes, type, credits, flags, paperIds] */
  s: [number, number, number, string, string, string[], number, number, number, number[]][];
  /** [code, year, variant, id, questions, title, marks, time] */
  p: [number, number, number, string, number, number, number, number][];
}

/** Expands the packed wire form back into a \`Catalog\`. */
export function decode(raw: string): Catalog {
  const wire = JSON.parse(raw) as Packed;
  const branches: CatalogBranch[] = wire.b.map(([key, name]) => ({ key, name }));
  const papers: CatalogPaper[] = wire.p.map(([code, year, variant, id, questions, title, marks, time]) => ({
    code: wire.c[code],
    year: wire.y[year],
    variant: wire.v[variant],
    id,
    questions,
    title: wire.t[title],
    marks: wire.m[marks],
    time: wire.h[time],
  }));
  const subjects: CatalogSubjectRaw[] = wire.s.map(
    ([branch, sem, name, key, code, codes, type, credits, flags, paperIds]) => ({
      key,
      slug: key.slice(\`\${wire.b[branch][0]}|\${sem}|\`.length),
      name: wire.n[name],
      branch: wire.b[branch][0],
      sem,
      code,
      codes,
      type: wire.s2[type],
      credits,
      elective: (flags & 1) === 1,
      legacy: (flags & 2) === 2,
      paperIds,
    }),
  );
  return { generated: wire.g, branches, papers, subjects, years: wire.y };
}`;

const { source, raw } = readRaw(FILE);
// The file is the only copy, and this tool rewrites it in packed form. Loading
// it through its own `decode` (when it has one) makes a second run safe: the
// wire format is unpacked back to the catalogue before anything is repaired or
// packed again.
const current = await import(`${pathToFileURL(FILE).href}?v=${Date.now()}`);
const catalog = typeof current.decode === "function" ? current.decode(current.RAW) : JSON.parse(raw);
const repaired = repairYears(catalog);
const filled = fillMechSem7(catalog);
const packed = pack(catalog);

const header = source.slice(0, source.indexOf("export const RAW = ")).trimEnd();
const next = `${header}

/**
 * The packed wire form. Call \`decode\`; this is not the catalogue's shape.
 * Reproduce it with \`bun scripts/pack-pyq-catalog.mjs\`.
 */
export const RAW = ${JSON.stringify(packed)};

${DECODE}
`;

// Prove it before writing: import the module we are about to write, decode it,
// and compare with what is on disk now, field order included.
const scratch = join(tmpdir(), `beu-catalog-verify-${process.pid}.ts`);
writeFileSync(scratch, next);
const module = await import(`${pathToFileURL(scratch).href}?v=${Date.now()}`);
const before = JSON.stringify(catalog);
const after = JSON.stringify(module.decode(module.RAW));
if (before !== after) {
  throw new Error(`round-trip mismatch: ${before.length} B in, ${after.length} B out — refusing to write`);
}

const kb = (size) => `${(size / 1024).toFixed(1)} KB`;
const wire = JSON.parse(packed);
const unpacked = Buffer.byteLength(JSON.stringify(catalog));
if (repaired.length > 0) console.log(`  repaired ${repaired.length} paper year(s): ${repaired.join(", ")}`);
if (filled.length > 0) console.log(`  added ${filled.length} mech Sem 7 subject(s): ${filled.join(", ")}`);
console.log(`catalogue   ${kb(unpacked)} JSON → ${kb(Buffer.byteLength(packed))} packed`);
console.log(`  ${catalog.subjects.length} subjects · ${catalog.papers.length} papers · round-trip identical`);
console.log(`  ${wire.t.length} titles · ${wire.v.length} variants · ${wire.n.length} names · ${wire.c.length} codes`);

if (CHECK_ONLY) {
  console.log(`  module would go ${kb(Buffer.byteLength(source))} → ${kb(Buffer.byteLength(next))}`);
  process.exit(0);
}

writeFileSync(FILE, next);
console.log(`wrote ${FILE} — ${kb(Buffer.byteLength(source))} → ${kb(Buffer.byteLength(next))}`);
