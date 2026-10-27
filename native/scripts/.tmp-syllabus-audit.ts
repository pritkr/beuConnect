// Throwaway audit — never ships. Prints shapes and loss counts, not prose.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);

let subjects = 0;
let withContent = 0;
let noUnits = 0;
const losses: { where: string; lost: number; sample: string }[] = [];
const emptyTitle: string[] = [];
const hourOdd: string[] = [];

for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      subjects++;
      const content = subject.content ?? "";
      if (content) withContent++;
      const units = parseSyllabus(content);
      if (!units.length) {
        noUnits++;
        continue;
      }
      const all = units.flatMap((u) => u.topics);
      const parsed = words(all.map((t) => `${t.title} ${t.body}`).join(" "));
      // `content` includes unit headings and numbering, so compare as multisets
      // only for words that appear in parsed output — losses are what matter.
      const bag = new Map<string, number>();
      for (const w of parsed) bag.set(w, (bag.get(w) ?? 0) + 1);
      let lost = 0;
      const samples: string[] = [];
      for (const w of words(content)) {
        const n = bag.get(w) ?? 0;
        if (n > 0) bag.set(w, n - 1);
        else {
          lost++;
          if (samples.length < 6) samples.push(w);
        }
      }
      // unit headings cost words too; flag only heavy loss (>25% of source words)
      const total = words(content).length;
      if (lost > Math.max(6, total * 0.25)) losses.push({ where: `${meta.code}|${sem}|${subject.code}`, lost, sample: samples.join(" ") });
      for (const t of all) if (!t.title.trim()) emptyTitle.push(`${meta.code}|${sem}|${subject.code}`);
      for (const u of units) for (const t of u.topics) if (t.hours && !/^\d+(\.\d+)? hrs$/.test(t.hours)) hourOdd.push(t.hours);
    }
  }
}

console.log({ subjects, withContent, noUnits, lossy: losses.length, emptyTitle: emptyTitle.length });
console.log("losses:", losses.slice(0, 12));
console.log("hours odd:", [...new Set(hourOdd)].slice(0, 10));
