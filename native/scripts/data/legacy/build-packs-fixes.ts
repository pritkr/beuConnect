/**
 * One-time provenance, not part of the pipeline: this is the 2026-10-26 script
 * that merged the hand-written fixes into the site's syllabus JSON and rebuilt
 * the GATE packs before they were shipped.
 *
 * `scripts/data/build-packs.ts` replaced it: the fixes are baked into
 * `packs.ts` and it re-packs from the app's own exports. Kept so the repair set
 * (`patches.json`) and the GATE text recovered from the official 2026 PDFs
 * (`gate_extra.json`, made by `extract-gate.py`) can be audited.
 *
 * Run from the repo root, after restoring its inputs from git history:
 *
 *     git show f384b6b:native/src/features/syllabus/data/.tmp/patches.json    > native/src/features/syllabus/data/.tmp/patches.json
 *     git show f384b6b:native/src/features/syllabus/data/.tmp/gate_extra.json > native/src/features/syllabus/data/.tmp/gate_extra.json
 *     bun scripts/data/legacy/build-packs-fixes.ts
 */
import { existsSync, readFileSync, writeFileSync } from "fs";

const DIR = "native/src/features/syllabus/data";
const ROOT = ".";

for (const input of ["patches.json", "gate_extra.json"]) {
  if (!existsSync(`${DIR}/.tmp/${input}`)) {
    console.error(`missing ${DIR}/.tmp/${input} — see the header for the git command that restores it`);
    process.exit(1);
  }
}

const existing = await import(`../../src/features/syllabus/data/packs.ts`);
const branchMeta = existing.BRANCH_META;
const branchPacks = Object.fromEntries(
  Object.entries(existing.BRANCH_PACKS).map(([k, v]) => [k, JSON.parse(v)]),
);
const gateMeta = existing.GATE_META;
const gatePacks = Object.fromEntries(
  Object.entries(existing.GATE_PACKS).map(([k, v]) => [k, JSON.parse(v)]),
);

const patches = JSON.parse(readFileSync(`${DIR}/.tmp/patches.json`, "utf8"));
const extra = JSON.parse(readFileSync(`${DIR}/.tmp/gate_extra.json`, "utf8"));
const papers = JSON.parse(readFileSync(`${ROOT}/src/assets/data/gate-papers.json`, "utf8"));

function normalizeName(value) {
  return value.replace(/\s+/g, " ").trim();
}

for (const [branch, sems] of Object.entries(patches)) {
  for (const [sem, subjects] of Object.entries(sems)) {
    for (const [name, patch] of Object.entries(subjects)) {
      const list = branchPacks[branch].semesters[sem];
      const subject = list.find((s) => normalizeName(s.name) === normalizeName(name));
      if (!subject) throw new Error(`patch target missing: ${branch} ${sem} ${name}`);
      Object.assign(subject, patch);
      if (patch.name) subject.name = patch.name;
    }
  }
}

// GATE: rebuild from the paper catalogue, keeping every paper we have content for.
const gateSource = {};
for (const paper of papers) {
  const code = paper.code;
  if (gatePacks[code]) {
    gateSource[code] = gatePacks[code];
    continue;
  }
  if (extra[code]) {
    gateSource[code] = { code, name: paper.name, sections: extra[code].sections };
    continue;
  }
  const candidates = [code, `${code}-2026`];
  for (const cand of candidates) {
    try {
      const raw = JSON.parse(readFileSync(`${ROOT}/src/assets/data/gate/${cand}.json`, "utf8"));
      if (!raw.sections?.length) continue;
      gateSource[code] = { code, name: paper.name, sections: raw.sections };
      break;
    } catch {
      // missing file: not available
    }
  }
}

const nextGateMeta = papers.filter((p) => gateSource[p.code]).map((p) => ({ code: p.code, name: p.name }));
const nextGatePacks = {};
for (const { code } of nextGateMeta) {
  const pack = gateSource[code];
  nextGatePacks[code] = { code, name: pack.name || papers.find((p) => p.code === code).name, sections: pack.sections };
}

const header = `/* eslint-disable */
/**
 * GENERATED — do not hand-edit.
 *
 * A snapshot of the site's syllabus data (\`src/assets/data/branches/*.json\`
 * and \`src/assets/data/gate/*.json\`) packed as JSON strings so the module
 * loads one branch at a time and parses it lazily. See ./AUDIT.md for the
 * per-branch coverage table, sources and known gaps.
 */

export const DATA_SNAPSHOT = "2026-10-26";
`;

const parts = [header];
parts.push(`\nexport const BRANCH_META: { code: string; name: string; short: string }[] = ${JSON.stringify(branchMeta, null, 2)};\n`);
parts.push(`\nexport const BRANCH_PACKS: Record<string, string> = {\n`);
for (const meta of branchMeta) {
  const pack = branchPacks[meta.code];
  parts.push(`  ${meta.code}: ${JSON.stringify(JSON.stringify(pack))},\n`);
}
parts.push(`};\n`);
parts.push(`\nexport const GATE_META: { code: string; name: string }[] = ${JSON.stringify(nextGateMeta, null, 2)};\n`);
parts.push(`\nexport const GATE_PACKS: Record<string, string> = {\n`);
for (const meta of nextGateMeta) {
  parts.push(`  ${JSON.stringify(meta.code)}: ${JSON.stringify(JSON.stringify(nextGatePacks[meta.code]))},\n`);
}
parts.push(`};\n`);

writeFileSync(`${DIR}/packs.ts`, parts.join(""));
console.log(
  "branches",
  branchMeta.length,
  "gate papers",
  nextGateMeta.length,
  "bytes",
  readFileSync(`${DIR}/packs.ts`).length,
);
