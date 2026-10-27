// throwaway analysis — prints counts only, never content
const packs = await import("../../src/features/syllabus/data/packs.ts");
const cat = await import("../../src/features/pyqs/catalog-data.ts");

const B = (s: string) => Buffer.byteLength(s, "utf8");

// ---------- packs ----------
const branches: Record<string, any> = {};
let jsonBytes = 0;
for (const [k, v] of Object.entries<string>(packs.BRANCH_PACKS)) {
  branches[k] = JSON.parse(v);
  jsonBytes += B(v);
}
let gateBytes = 0;
const gate: Record<string, any> = {};
for (const [k, v] of Object.entries<string>(packs.GATE_PACKS)) {
  gate[k] = JSON.parse(v);
  gateBytes += B(v);
}

const vals = { content: 0, name: 0, code: 0, references: 0, other: 0 };
const uniq = new Map<string, { n: number; len: number }>();
let subjects = 0;
let refsTotal = 0;
const charSet = new Set<string>();
let tabs = 0;
let nonAscii = 0;
const tildes = new Map<string, number>();

function scan(s: string, tag: string) {
  for (const ch of s) {
    charSet.add(ch);
    if (ch === "\t") tabs++;
    if (ch.charCodeAt(0) > 126) nonAscii++;
  }
  for (const d of ["~", "|", "^", "`", "#", "§", "\\", "\u001f", "\u001e", "\u0001"]) {
    if (s.includes(d)) tildes.set(d, (tildes.get(d) || 0) + 1);
  }
  const u = uniq.get(s) ?? { n: 0, len: B(s) };
  u.n++;
  if (!uniq.has(s)) vals[tag as keyof typeof vals] += B(s);
  uniq.set(s, u);
}

for (const pack of Object.values(branches)) {
  for (const list of Object.values<any[]>(pack.semesters)) {
    for (const s of list) {
      subjects++;
      scan(s.content ?? "", "content");
      scan(s.name ?? "", "name");
      if (s.code) scan(s.code, "code");
      if (s.references) {
        refsTotal += s.references.length;
        for (const r of s.references) scan(r, "references");
      }
    }
  }
}
let dupBytes = 0;
for (const [, u] of uniq) if (u.n > 1) dupBytes += u.len * (u.n - 1);

console.log("PACKS");
console.log("  branch json", jsonBytes, "gate json", gateBytes, "total", jsonBytes + gateBytes);
console.log("  subjects", subjects, "unique strings", uniq.size, "refs", refsTotal);
console.log("  unique-value bytes", vals);
console.log("  duplicate string bytes", dupBytes);
console.log("  delimiters present:", [...tildes].map(([d, n]) => `${JSON.stringify(d)}:${n}`).join(" ") || "none");
console.log("  tabs", tabs, "non-ascii chars", nonAscii, "charset", charSet.size);
const gateSections: { title: string; content: string }[] = [];
for (const p of Object.values(gate)) for (const s of p.sections) gateSections.push(s);
console.log("  gate sections", gateSections.length, "bytes", gateSections.reduce((a, s) => a + B(s.title) + B(s.content), 0));
const gUniq = new Set(gateSections.map((s) => s.title + s.content));
console.log("  gate unique sections", gUniq.size);

// ---------- pyqs catalog ----------
const raw = cat.RAW;
const c = JSON.parse(raw);
console.log("\nPYQS CATALOG raw", B(raw));
console.log("  subjects", c.subjects.length, "branches", c.branches.length, "years", c.years.length);
let papers = 0;
for (const s of c.subjects) papers += s.papers.length;
console.log("  papers", papers);
const cuniq = new Map<string, { n: number; len: number }>();
function cscan(s: string) {
  const u = cuniq.get(s) ?? { n: 0, len: B(s) };
  u.n++;
  cuniq.set(s, u);
}
for (const s of c.subjects) {
  cscan(s.key); cscan(s.slug); cscan(s.name); cscan(s.branch);
  for (const code of s.codes) cscan(code);
  for (const p of s.papers) { cscan(p.code); cscan(p.variant); cscan(p.id); cscan(p.title); cscan(p.time); }
}
let cdup = 0, cuniqBytes = 0;
for (const [, u] of cuniq) { cuniqBytes += u.len; if (u.n > 1) cdup += u.len * (u.n - 1); }
console.log("  unique string bytes", cuniqBytes, "duplicate bytes", cdup, "unique strings", cuniq.size);
const times = new Map<string, number>();
const titles = new Map<string, number>();
const variants = new Map<string, number>();
for (const s of c.subjects) for (const p of s.papers) {
  times.set(p.time, (times.get(p.time) || 0) + 1);
  titles.set(p.title, (titles.get(p.title) || 0) + 1);
  variants.set(p.variant, (variants.get(p.variant) || 0) + 1);
}
console.log("  times", [...times].slice(0, 6), "titles distinct", titles.size, "variants", [...variants].slice(0, 8));
console.log("  sample ledger: subject keys with longest names:", Math.max(...c.subjects.map((s: any) => B(s.name))));
