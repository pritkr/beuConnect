import { BRANCH_META, BRANCH_PACKS, GATE_PACKS } from "./src/features/syllabus/data/packs";
import { parseGate, parseSyllabus, type BranchPack, type GatePack, type Subject } from "./src/features/syllabus/parse";
import { COLLEGE_NAMES } from "./src/features/pyqs/colleges";
import {
  datasetEntry, destinationEntries, featuredDestinations, gateEntry, noticeEntry, searchAll, subjectEntry,
  type SearchEntry, type SubjectInput,
} from "./src/features/search/rank";

const PACK_CACHE = new Map<string, BranchPack>();
function packOf(branch: string): BranchPack | null {
  const cached = PACK_CACHE.get(branch);
  if (cached !== undefined) return cached;
  const raw = BRANCH_PACKS[branch];
  if (!raw) return null;
  const parsed = JSON.parse(raw) as BranchPack;
  PACK_CACHE.set(branch, parsed);
  return parsed;
}
const GENERIC_SECTION = /^(course content|(unit|module|part|section)\s+[\divxlcdm.]+)$/i;
function sectionsOf(subject: Subject): string[] {
  if (typeof subject.content !== "string" || subject.content.length === 0) return [];
  return parseSyllabus(subject.content).map((u) => u.title.trim()).filter((t) => t.length > 2 && !GENERIC_SECTION.test(t));
}
function subjectEntries(): SearchEntry[] {
  const merged = new Map<string, { input: SubjectInput; branches: string[] }>();
  for (const meta of BRANCH_META) {
    const pack = packOf(meta.code); if (!pack) continue;
    for (const key of Object.keys(pack.semesters)) {
      const sem = Number(key);
      for (const subject of pack.semesters[key] ?? []) {
        if (!subject || typeof subject.name !== "string" || typeof subject.code !== "string" || !subject.code) continue;
        const id = `${subject.code}|${subject.name}|${sem}`;
        const known = merged.get(id);
        if (known) { if (!known.branches.includes(meta.short)) known.branches.push(meta.short); continue; }
        merged.set(id, { branches: [meta.short], input: { code: subject.code, name: subject.name, branch: meta.code, branchShort: meta.short, branches: [meta.short], sem, sections: sectionsOf(subject) } });
      }
    }
  }
  return [...merged.values()].map((o) => subjectEntry({ ...o.input, branches: o.branches }));
}
const GATE_CODES = ["AE","AG","AR","BM","BT","CE","CH","CS","CY","DA","EC","EE","ES","EY","GE","GG","IN","MA","ME","MN","MT","NM","PE","PH","PI","ST","TF","XE","XL","XH-C1","XH-C2","XH-C3","XH-C4","XH-C5","XH-C6"];
const GATE_NAMES: Record<string,string> = { AE:"Aerospace Engineering", AG:"Agricultural Engineering", AR:"Architecture and Planning", BM:"Biomedical Engineering", BT:"Biotechnology", CE:"Civil Engineering", CH:"Chemical Engineering", CS:"Computer Science & Information Technology", CY:"Chemistry", DA:"Data Science & Artificial Intelligence", EC:"Electronics & Communication Engineering", EE:"Electrical Engineering", ES:"Environmental Science & Engineering", EY:"Ecology and Evolution", GE:"Geomatics Engineering", GG:"Geology & Geophysics", IN:"Instrumentation Engineering", MA:"Mathematics", ME:"Mechanical Engineering", MN:"Mining Engineering", MT:"Metallurgical Engineering", NM:"Naval Architecture & Marine Engineering", PE:"Petroleum Engineering", PH:"Physics", PI:"Production & Industrial Engineering", ST:"Statistics", TF:"Textile Engineering & Fibre Science", XE:"Engineering Sciences", XL:"Life Sciences", "XH-C1":"Economics (XH-C1)", "XH-C2":"English (XH-C2)", "XH-C3":"Linguistics (XH-C3)", "XH-C4":"Philosophy (XH-C4)", "XH-C5":"Psychology (XH-C5)", "XH-C6":"Sociology (XH-C6)" };
const GATE_PAPERS: Record<string, {n: number; lo: number; hi: number}> = {};
function gateEntries(): SearchEntry[] {
  return GATE_CODES.map((code) => {
    const raw = GATE_PACKS[code] ?? GATE_PACKS[code.split("-")[0] ?? ""];
    let sections: string[] = [];
    if (raw) sections = parseGate(JSON.parse(raw) as GatePack).map((u) => u.title.trim()).filter((t) => t.length > 2);
    const p = GATE_PAPERS[code] ?? { n: 0, lo: 0, hi: 0 };
    return gateEntry({ code, name: GATE_NAMES[code], sections, papers: p.n, oldest: p.lo, newest: p.hi });
  });
}
import { RAW as GATE_RAW } from "./src/features/pyqs/gate-data";
const GATE_CATALOG = JSON.parse(GATE_RAW) as { papers: { code: string; name: string; papers: { year: number }[] }[] };
for (const s of GATE_CATALOG.papers) {
  const ys = s.papers.map((p) => p.year).filter((y) => Number.isFinite(y) && y > 0);
  GATE_PAPERS[s.code] = { n: s.papers.length, lo: ys.length ? Math.min(...ys) : 0, hi: ys.length ? Math.max(...ys) : 0 };
}

const MANIFEST = (await (await fetch("https://beu.prit.eu.org/data/manifest/index.json")).json()) as Record<string, Record<string, string[]>>;
const PATH_RE = /sem(\d+)_([A-Za-z0-9]+)\.json$/;
const rows: { batch: string; branch: string; sem: number; college: string }[] = [];
for (const batch of Object.keys(MANIFEST)) for (const branch of Object.keys(MANIFEST[batch])) for (const file of MANIFEST[batch][branch]) {
  const m = PATH_RE.exec(file); if (!m) continue;
  rows.push({ batch, branch, sem: Number(m[1]), college: m[2] });
}
const BRANCHES: Record<string,string> = {"101":"Civil Engineering","102":"Mechanical Engineering","103":"Electrical Engineering","104":"Electronics & Communication","105":"Computer Science & Engineering","110":"Electrical & Electronics","161":"EEE (Specialization)"};
const shortBranch = (c: string) => BRANCHES[c] === "Computer Science & Engineering" ? "CSE" : BRANCHES[c] === "Electronics & Communication" ? "ECE" : BRANCHES[c] === "Electrical & Electronics" ? "EEE" : BRANCHES[c] === "Civil Engineering" ? "Civil" : BRANCHES[c] === "Mechanical Engineering" ? "Mech" : BRANCHES[c] === "Electrical Engineering" ? "EE" : (BRANCHES[c] ?? c);
const collegeName = (c: string) => COLLEGE_NAMES[c] ?? `College ${c}`;
const shortCollege = (c: string) => (COLLEGE_NAMES[c] ?? `College ${c}`).replace(/^Government Engineering College,\s*/i, "GEC ").replace(/^Government College of Engineering,?\s*/i, "GCE ").replace(/\s*\(.*\)$/, "").trim();
const cohort = new Map<string, number>();
for (const r of rows) { const k = `${r.batch}|${r.branch}|${r.sem}`; cohort.set(k, (cohort.get(k) ?? 0) + 1); }
const datasetEntries = rows.map((r) => datasetEntry({ id: `${r.batch}|${r.branch}|${r.sem}|${r.college}`, batch: r.batch, branch: r.branch, branchShort: shortBranch(r.branch), branchName: BRANCHES[r.branch] ?? `Branch ${r.branch}`, sem: r.sem, college: r.college, collegeShort: shortCollege(r.college), collegeName: collegeName(r.college), cohort: cohort.get(`${r.batch}|${r.branch}|${r.sem}`) ?? 1 }));

let noticeEntries: SearchEntry[] = [];
try {
  const feed = (await (await fetch("https://beu.prit.eu.org/api/notices/important?limit=20")).json()) as { items?: { id?: string; title?: string; date?: string }[] };
  noticeEntries = (feed.items ?? []).filter((n) => typeof n.title === "string" && n.title.length > 3).map((n, i) => noticeEntry({ id: String(n.id ?? `x${i}`), title: String(n.title), dateLabel: n.date ? new Date(n.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Undated", category: "Important", course: "B.Tech", semester: "Other" }));
} catch { console.log("(notices unavailable)"); }

const subjects = subjectEntries();
const gates = gateEntries();
const dests = destinationEntries();
const t0 = performance.now();
const index = [...subjects, ...gates, ...noticeEntries, ...datasetEntries, ...dests];
console.log("index", { subject: subjects.length, gate: gates.length, notice: noticeEntries.length, dataset: datasetEntries.length, destination: dests.length, total: index.length }, "built in", Math.round(performance.now() - t0), "ms");

function show(q: string) {
  const t = performance.now();
  const result = searchAll(q, index, 60);
  console.log(`\n== ${JSON.stringify(q)} -> ${result.hits.length} hits in ${(performance.now()-t).toFixed(1)}ms (took ${result.took})`);
  for (const h of result.hits.slice(0, 8)) console.log(`  ${h.score}  ${h.kind.padEnd(11)} ${h.title}  |  ${h.meta}`);
}
for (const q of ["cs", "digital electronics", "157", "engineering physics", "data structures", "sheikhpura", "attendance", "sem 3", "100110", "results.rank", "math", "dsa", "notice"]) show(q);
console.log("\nfeatured", featuredDestinations().map((d) => d.title));
