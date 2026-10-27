// prototype: measure a 2-char-token phrase dictionary over the syllabus prose
import { Table } from "./wire-lib.ts";

const packs = await import("../../src/features/syllabus/data/packs.ts");
const texts: string[] = [];
const seen = new Set<string>();
function add(s: string) {
  if (seen.has(s)) return;
  seen.add(s);
  texts.push(s);
}
for (const raw of Object.values<string>(packs.BRANCH_PACKS)) {
  const pack = JSON.parse(raw);
  for (const list of Object.values<any[]>(pack.semesters)) for (const s of list) {
    if (s.content) add(s.content);
    if (s.references) add(s.references.join("\n"));
  }
}
for (const raw of Object.values<string>(packs.GATE_PACKS)) {
  const pack = JSON.parse(raw);
  for (const section of pack.sections) {
    add(section.title);
    add(section.content);
  }
}
const corpus = texts.join("\u0001");
console.log("corpus", corpus.length, "strings", texts.length);

// candidate phrases: 1..4 words with their exact separators
const WORD = /[A-Za-z][A-Za-z'’.-]*|\d+(?:\.\d+)?|[^A-Za-z0-9]+/g;
type Unit = { start: number; end: number };
const units: Unit[] = [];
for (const m of corpus.matchAll(WORD)) units.push({ start: m.index!, end: m.index! + m[0].length });
console.log("units", units.length);

const counts = new Map<string, number>();
for (let i = 0; i < units.length; i++) {
  const start = units[i].start;
  for (let n = 1; n <= 4 && i + n - 1 < units.length; n++) {
    const end = units[i + n - 1].end;
    const len = end - start;
    if (n === 1 && len < 4) continue; // too short to profit from a 2-char token
    if (len > 40) break;
    const phrase = corpus.slice(start, end);
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
}
console.log("candidates", counts.size);

const scored = [...counts]
  .map(([phrase, count]) => ({ phrase, count, gain: (phrase.length - 2) * count - phrase.length }))
  .filter((c) => c.gain > 0 && c.count > 1)
  .sort((a, b) => b.gain - a.gain);
console.log("profitable", scored.length, "top gain", scored.slice(0, 3).map((s) => `${s.phrase.length}x${s.count}`));

for (const MAX of [1200, 2280, 3000]) {
  const dict = scored.slice(0, MAX).map((s) => s.phrase);
  // trie
  const trie = new Map<string, any>();
  for (const p of dict) {
    let node = trie;
    for (const ch of p) {
      let next = node.get(ch);
      if (!next) { next = new Map(); node.set(ch, next); }
      node = next;
    }
    node.set("", true);
  }
  let out = 0;
  let tokens = 0;
  let i = 0;
  while (i < corpus.length) {
    let node = trie;
    let best = 0;
    let j = i;
    while (j < corpus.length) {
      const next = node.get(corpus[j]);
      if (!next) break;
      node = next;
      j++;
      if (node.get("")) best = j - i;
    }
    if (best >= 4) { out += 2; tokens++; i += best; }
    else {
      const ch = corpus.charCodeAt(i);
      out += ch < 128 ? 1 : 3; // non-ascii stays 2 bytes in utf-8, +1 flag maybe
      i++;
    }
  }
  const dictBytes = dict.reduce((n, p) => n + p.length + 4, 0);
  console.log(`MAX=${MAX} dict=${dictBytes}B encoded=${out}B ratio=${(out / corpus.length).toFixed(3)} tokens=${tokens} total=${((out + dictBytes) / corpus.length).toFixed(3)}`);
}
