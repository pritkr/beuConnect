/**
 * Packs the app's syllabus snapshot into the wire format that
 * `src/features/syllabus/data/packs.ts` ships.
 *
 * ── how to regenerate ───────────────────────────────────────────────────────
 *
 *   bun scripts/data/build-packs.ts              # re-pack, byte-identical
 *   bun scripts/data/build-packs.ts --check      # exit 1 if the shipped file is stale
 *   bun scripts/data/build-packs.ts --from-site  # import ../src/assets/data/{branches,gate} first
 *
 * The source of truth is the app's own export (`BRANCH_PACKS` / `GATE_PACKS`),
 * which is the site's JSON plus the fixes this app carries, so a plain run is a
 * lossless re-pack: it decodes what ships, re-encodes it and reports the sizes.
 * `--from-site` pulls the newer data out of the site's JSON instead, flattens
 * it into the app shape and prints what changed, branch by branch; the result
 * is only written together with `--write`.
 *
 * The GATE half has a second entry point: `scripts/data/extract_gate.py`
 * re-extracts the section text from the official 2026 syllabus PDFs.
 *
 * `bun scripts/data/verify-packs.ts` proves the packed file still decodes to
 * the same data (subject counts, codes, per-branch hash).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_TOKENS, SEPARATOR, Table, literal, pack, rankPhrases, renderChunk, renderDict, symbol } from "./wire-lib.ts";

const DATA = new URL("../../src/features/syllabus/data/", import.meta.url);
const SITE = new URL("../../../src/assets/data/", import.meta.url);
const LIMIT = 48000; // literal bytes per generated file, so no chunk is a 500 KB blob

const args = new Set(process.argv.slice(2));
const fromSite = args.has("--from-site");
const check = args.has("--check");

interface Subject {
  name: string;
  type: string;
  credits: number;
  code?: string;
  lecture?: number;
  tutorial?: number;
  practical?: number;
  elective?: boolean;
  content?: string;
  references?: string[];
}
interface BranchPack {
  code: string;
  name: string;
  semesters: Record<string, Subject[]>;
}
interface GatePack {
  code: string;
  name: string;
  sections: { title: string; content: string }[];
}

// ── read the current snapshot through the app's own public API ──────────────

const packs = await import("../../src/features/syllabus/data/packs.ts");
const branchMeta: { code: string; name: string; short: string }[] = packs.BRANCH_META;
const gateMeta: { code: string; name: string }[] = packs.GATE_META;
const branches: Record<string, BranchPack> = {};
for (const [code, raw] of Object.entries<string>(packs.BRANCH_PACKS)) branches[code] = JSON.parse(raw);
const gate: Record<string, GatePack> = {};
for (const [code, raw] of Object.entries<string>(packs.GATE_PACKS)) gate[code] = JSON.parse(raw);

// ── optional: the site's JSON as the data source ────────────────────────────

if (fromSite) {
  let changed = 0;
  for (const meta of branchMeta) {
    const file = new URL(`branches/${meta.code}.json`, SITE);
    const site = JSON.parse(readFileSync(file, "utf8"));
    const pack = branches[meta.code];
    for (const [sem, block] of Object.entries<any>(site.semesters)) {
      const list: Subject[] = (block.subjects ?? []).map((s: any) => {
        const subject: Subject = { name: s.name, type: s.type, credits: s.credits };
        if (s.code) subject.code = s.code;
        for (const key of ["lecture", "tutorial", "practical"] as const) {
          if (s.summary && typeof s.summary[key] === "number") subject[key] = s.summary[key];
        }
        if (s.electiveGroup) subject.elective = true;
        if (typeof s.content === "string" && s.content) subject.content = s.content;
        if (Array.isArray(s.references) && s.references.length) subject.references = s.references;
        return subject;
      });
      const was = JSON.stringify(pack.semesters[sem] ?? []);
      if (was !== JSON.stringify(list)) {
        changed++;
        pack.semesters[sem] = list;
      }
    }
  }
  console.log(`site import: ${changed} semester(s) differ from the shipped snapshot`);
  if (!args.has("--write")) {
    console.log("dry run — re-run with --write to keep the site data");
    process.exit(0);
  }
}

// ── encode ──────────────────────────────────────────────────────────────────

const problems: string[] = [];
function bad(where: string, char: string, text: string) {
  if (text.includes(char)) problems.push(`${where}: contains ${JSON.stringify(char)}`);
}

const table = new Table();
const ref = (value: string, owner: string) => String(table.add(value, owner));

const branchWires: Record<string, string> = {};
for (const meta of branchMeta) {
  const pack = branches[meta.code];
  const rows = [pack.name];
  for (const sem of Object.keys(pack.semesters).sort((a, b) => +a - +b)) {
    rows.push(`#${sem}`);
    for (const s of pack.semesters[sem]) {
      for (const [field, value] of Object.entries({
        name: s.name,
        type: s.type,
        code: s.code ?? "",
      })) {
        bad(`${meta.code}#${sem} ${s.name} ${field}`, "|", String(value));
        bad(`${meta.code}#${sem} ${s.name} ${field}`, "\n", String(value));
      }
      const body = s.content === undefined ? "-" : ref(s.content, meta.code);
      const refs = s.references === undefined ? "-" : ref(s.references.join("\n"), meta.code);
      if (s.references) for (const r of s.references) bad(`${meta.code} ${s.name} reference`, "\n", r);
      const row = [
        s.name,
        s.type,
        String(s.credits),
        s.code ?? "",
        s.lecture === undefined ? "" : String(s.lecture),
        s.tutorial === undefined ? "" : String(s.tutorial),
        s.practical === undefined ? "" : String(s.practical),
        body,
        refs,
      ].join("|");
      rows.push(s.elective ? `${row}|e` : row);
    }
  }
  branchWires[meta.code] = rows.join("\n");
}

const gateWires: Record<string, string> = {};
for (const meta of gateMeta) {
  const pack = gate[meta.code];
  const rows = [pack.name];
  for (const section of pack.sections) {
    bad(`${meta.code} "${section.title}"`, "|", section.title);
    bad(`${meta.code} "${section.title}"`, "\n", section.title);
    rows.push(`${section.title}|${ref(section.content, "gate")}`);
  }
  gateWires[meta.code] = rows.join("\n");
}
if (problems.length) {
  console.error("cannot encode, the data contains the wire delimiters:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

// ── render ──────────────────────────────────────────────────────────────────

const chunks = table.chunk(LIMIT);
const corpus = table.entries.map((e) => e.value).join(SEPARATOR);
const dict = rankPhrases(corpus, MAX_TOKENS);
const total = table.entries.reduce((n, e) => n + e.value.length, 0);
let packed = 0;
const files: Record<string, string> = {};

files["dict.ts"] = renderDict(dict);

files["table/index.ts"] = `/* eslint-disable */
/**
 * The prose of the syllabus snapshot, one copy per distinct string, packed in
 * ~${Math.round(LIMIT / 1000)} KB chunks so no single file is an unreviewable blob.
 *
 * Generated by \`scripts/data/build-packs.ts\`; \`packs.ts\` holds indices into
 * this table and \`../decode.ts\` documents the format.
 */
${chunks.map((c) => `import { ${symbol(c.name)}, ${symbol(c.name)}_COUNT } from "./${c.name}";`).join("\n")}

export const CHUNKS: string[] = [
${chunks.map((c) => `  ${symbol(c.name)},`).join("\n")}
];

/** Entries per chunk, so the decoder can turn an index into a chunk. */
export const COUNTS: number[] = [
${chunks.map((c) => `  ${symbol(c.name)}_COUNT,`).join("\n")}
];
`;

for (const chunk of chunks) {
  const entries = table.entries.slice(chunk.from, chunk.to).map((e) => e.value);
  const blob = entries.map((e) => pack(e, dict)).join(SEPARATOR);
  packed += blob.length;
  files[`table/${chunk.name}.ts`] = renderChunk(
    chunk,
    blob,
    `Syllabus prose, entries ${chunk.from}..${chunk.to - 1} of the shared string table — generated, do not edit.`,
  );
}

files["packs.ts"] = `/* eslint-disable */
/**
 * GENERATED — do not hand-edit.
 *
 * The app's syllabus snapshot: ${branchMeta.length} BEU branches and ${gateMeta.length} GATE papers, taken from the site's
 * \`src/assets/data/{branches,gate}/*.json\` plus the fixes this app carries.
 *
 * Neither the prose (one copy per distinct string, packed in \`./table\`) nor the
 * records below carry any formatting: \`./decode.ts\` documents the wire format
 * and turns it back into the \`JSON.parse\`-able strings the screens consume, on
 * first read per branch. Regenerate with \`bun scripts/data/build-packs.ts\`;
 * check it with \`bun scripts/data/verify-packs.ts\`.
 */
import { decodeBranch, decodeGate, lazy, makeTable, wireName } from "./decode";
import { CHUNKS, COUNTS } from "./table";

export const DATA_SNAPSHOT = ${JSON.stringify(packs.DATA_SNAPSHOT)};

export const BRANCH_META: { code: string; name: string; short: string }[] = [
${branchMeta.map((m) => `  { code: ${JSON.stringify(m.code)}, name: ${JSON.stringify(m.name)}, short: ${JSON.stringify(m.short)} },`).join("\n")}
];

/** The records in the wire format \`./decode.ts\` documents; live data reuses them. */
export const BRANCH_WIRE: Record<string, string> = {
${branchMeta.map((m) => `  ${m.code}: \`${literal(branchWires[m.code])}\`,`).join("\n")}
};

export const GATE_WIRE: Record<string, string> = {
${gateMeta.map((m) => `  ${JSON.stringify(m.code)}: \`${literal(gateWires[m.code])}\`,`).join("\n")}
};

const table = makeTable(CHUNKS, COUNTS);

/** GATE chips, in the order the papers are listed above. */
export const GATE_META: { code: string; name: string }[] = Object.keys(GATE_WIRE).map((code) => ({
  code,
  name: wireName(GATE_WIRE[code]),
}));

/** Decoded on first read: \`BRANCH_PACKS["cse"]\` is the branch's JSON, built once. */
export const BRANCH_PACKS: Record<string, string> = lazy(BRANCH_WIRE, (code, wire) => decodeBranch(code, wire, table));

export const GATE_PACKS: Record<string, string> = lazy(GATE_WIRE, (code, wire) => decodeGate(code, wire, table));
`;

// ── write, or compare ───────────────────────────────────────────────────────

const tableDir = new URL("table/", DATA);
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

let stale = 0;
for (const [name, text] of Object.entries(files)) {
  const file = new URL(name, DATA);
  const before = (() => {
    try { return readFileSync(file, "utf8"); } catch { return null; }
  })();
  if (before === text) continue;
  stale++;
  if (check) console.log(`  stale: src/features/syllabus/data/${name}`);
  else {
    mkdirSync(new URL("./", file), { recursive: true });
    writeFileSync(file, text);
  }
}

if (!check) {
  // chunk files that no longer correspond to anything
  mkdirSync(tableDir, { recursive: true });
  for (const name of readdirSync(tableDir)) {
    if (!name.endsWith(".ts")) continue;
    if (!(`table/${name}` in files)) {
      rmSync(join(tableDir.pathname, name));
      stale++;
    }
  }
}

const rendered = Object.entries(files).reduce((n, [, text]) => n + bytes(text), 0);
const wires = Object.values(branchWires).join("").length + Object.values(gateWires).join("").length;
const dictChars = dict.reduce((n, p) => n + p.length, 0);
console.log(`  prose      ${String(total).padStart(8)} chars in ${table.entries.length} strings`);
console.log(`  packed     ${String(packed).padStart(8)} chars (${(packed / total * 100).toFixed(1)}%) + ${dict.length} tokens/${dictChars} chars`);
console.log(`  wires      ${String(wires).padStart(8)} chars for ${Object.keys(branchWires).length} branches + ${Object.keys(gateWires).length} papers`);
console.log(`  files      ${String(rendered).padStart(8)} B in ${Object.keys(files).length} modules (${chunks.length} chunks, max ${Math.max(...chunks.map((c) => bytes(files[`table/${c.name}.ts`])))} B)`);
console.log(`  ${check ? (stale ? `✗ ${stale} file(s) out of date` : "✓ up to date") : `wrote ${stale} file(s)`}`);
if (check && stale) process.exit(1);
