/**
 * Proves that the wire format still decodes to exactly the data the app had
 * before it was packed: `scripts/data/packs-snapshot.json` holds the counts, the
 * subject-code set and a hash of the canonical JSON of every branch, every GATE
 * paper and the whole PYQ catalogue.
 *
 *   bun scripts/data/verify-packs.ts            # verify (exit 1 on any drift)
 *   bun scripts/data/verify-packs.ts --capture  # rewrite the snapshot
 *
 * Only capture when the data changes on purpose; the snapshot is the invariant
 * the packing has to keep. Canonical JSON sorts keys, so re-ordering fields in
 * the decoded objects is allowed — dropping or changing a value is not.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const packs = await import("../../src/features/syllabus/data/packs.ts");
const cat = await import("../../src/features/pyqs/catalog-data.ts");

function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon((value as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Everything the snapshot records, recomputed from the live modules. */
function measure() {
  const branches: Record<string, { sems: number; subjects: number; sha: string; codes: string[] }> = {};
  const codes = new Set<string>();
  let subjects = 0;
  let contentChars = 0;
  let references = 0;

  for (const [code, raw] of Object.entries<string>(packs.BRANCH_PACKS)) {
    const pack = JSON.parse(raw);
    const mine: string[] = [];
    let semCount = 0;
    let count = 0;
    for (const [sem, list] of Object.entries<any[]>(pack.semesters)) {
      if (!Array.isArray(list)) throw new Error(`${code} semester ${sem} is not a list`);
      semCount++;
      for (const s of list) {
        subjects++;
        count++;
        if (s.code) {
          codes.add(s.code);
          mine.push(s.code);
        }
        if (typeof s.content === "string") contentChars += s.content.length;
        if (Array.isArray(s.references)) references += s.references.length;
      }
    }
    mine.sort();
    branches[code] = { sems: semCount, subjects: count, sha: sha(canon(pack)), codes: mine };
  }

  const gate: Record<string, { sections: number; sha: string; name: string }> = {};
  let sections = 0;
  for (const [code, raw] of Object.entries<string>(packs.GATE_PACKS)) {
    const pack = JSON.parse(raw);
    gate[code] = { sections: pack.sections.length, sha: sha(canon(pack)), name: pack.name };
    sections += pack.sections.length;
  }

  // `catalog-data.ts` travels as plain JSON; pyqs owns the wire.
  const catalog = JSON.parse(cat.RAW);
  let papers = 0;
  for (const s of catalog.subjects) papers += s.papers.length;

  return {
    snapshot: { data: packs.DATA_SNAPSHOT, catalog: cat.SNAPSHOT },
    branches,
    meta: {
      branches: packs.BRANCH_META.map((m: any) => m.code),
      gate: packs.GATE_META.map((m: any) => m.code),
    },
    gate: { codes: Object.keys(gate), papers: gate, sections },
    catalog: {
      subjects: catalog.subjects.length,
      branches: catalog.branches.length,
      papers,
      years: catalog.years.join(","),
      sha: sha(canon(catalog)),
      branchesSha: sha(canon(catalog.branches)),
    },
    codes: [...codes].sort(),
    totals: { subjects, contentChars, references },
  };
}

const live = measure();
const file = new URL("./packs-snapshot.json", import.meta.url);

if (process.argv.includes("--capture")) {
  const snapshot = {
    note: "Invariant of the app's syllabus packs and PYQ catalogue: counts, subject codes and a canonical-JSON hash per branch, per GATE paper and for the catalogue. Regenerate with `bun scripts/data/verify-packs.ts --capture` only when the data changes on purpose.",
    ...live,
    branches: Object.fromEntries(Object.entries(live.branches).map(([k, v]) => [k, { sems: v.sems, subjects: v.subjects, sha: v.sha }])),
  };
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`captured ${JSON.stringify(snapshot).length} B of invariants into ${file.pathname}`);
} else {
  const want = JSON.parse(readFileSync(file, "utf8"));
  const fails: string[] = [];
  const eq = (what: string, a: unknown, b: unknown) => {
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (!same) fails.push(what);
    return same;
  };

  eq("DATA_SNAPSHOT", live.snapshot, want.snapshot);
  eq("subject code set", live.codes, want.codes);
  eq("totals (subjects / content / references)", live.totals, want.totals);
  eq("BRANCH_META order", live.meta.branches, Object.keys(want.branches));
  eq("GATE_META order", live.meta.gate, want.gate.codes);
  eq("catalogue", live.catalog, want.catalog);

  for (const [code, was] of Object.entries<any>(want.branches)) {
    const now = live.branches[code];
    if (!now) { fails.push(`branch missing: ${code}`); continue; }
    eq(`${code} subjects`, now.subjects, was.subjects);
    eq(`${code} semesters`, now.sems, was.sems);
    eq(`${code} content hash`, now.sha, was.sha);
  }
  for (const [code, was] of Object.entries<any>(want.gate.papers)) {
    const now = (live.gate.papers as any)[code];
    if (!now) { fails.push(`GATE paper missing: ${code}`); continue; }
    eq(`${code} sections`, now.sections, was.sections);
    eq(`${code} content hash`, now.sha, was.sha);
    eq(`${code} name`, now.name, was.name);
  }
  eq("GATE section total", live.gate.sections, want.gate.sections);
  eq("GATE paper list", live.gate.codes, want.gate.codes);

  const rows: [string, string][] = [
    ["branches", `${Object.keys(live.branches).length} · ${live.totals.subjects} subjects · ${live.totals.contentChars} content chars · ${live.totals.references} references`],
    ["GATE", `${live.gate.codes.length} papers · ${live.gate.sections} sections`],
    ["catalogue", `${live.catalog.subjects} subjects · ${live.catalog.papers} papers · ${live.catalog.branches} branches`],
    ["hashes", `${Object.keys(live.branches).length + live.gate.codes.length + 1} canonical JSON documents`],
  ];
  for (const [what, value] of rows) console.log(`  ${what.padEnd(10)} ${value}`);
  if (fails.length) {
    console.error(`\n✗ ${fails.length} mismatch(es): ${fails.join(", ")}`);
    process.exit(1);
  }
  console.log("\n✓ identical to the snapshot — no subject, topic, credit, code or GATE section changed");
}
