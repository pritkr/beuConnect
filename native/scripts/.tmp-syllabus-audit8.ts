// Throwaway — the coverage invariant a test will assert.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const STOP = new Set([
  "unit", "units", "module", "modules", "part", "parts", "section", "sections",
  "detailed", "contents", "content", "syllabus",
  "hrs", "hr", "hours", "hour", "periods", "period", "lectures", "lecture",
]);

const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w));

const problems: string[] = [];
let checked = 0;
for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      const content: string = subject.content ?? "";
      const units = parseSyllabus(content);
      checked++;
      const bag = new Map<string, number>();
      const parsed = [
        ...units.map((u) => `${u.title} ${u.hours ?? ""}`),
        ...units.flatMap((u) => u.topics.map((t) => `${t.title} ${t.body} ${t.hours ?? ""}`)),
      ].join(" ");
      for (const w of words(parsed)) bag.set(w, (bag.get(w) ?? 0) + 1);
      const missing: string[] = [];
      for (const w of words(content)) {
        const n = bag.get(w) ?? 0;
        if (n > 0) bag.set(w, n - 1);
        else if (missing.length < 8) missing.push(w);
      }
      if (missing.length) problems.push(`${meta.code}|${sem}|${subject.code} :: ${missing.join(" ")}`);
    }
  }
}
console.log({ checked, problems: problems.length });
console.log(problems.slice(0, 20).join("\n"));
