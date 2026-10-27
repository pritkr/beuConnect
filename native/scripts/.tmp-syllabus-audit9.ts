// Throwaway — where do covered words go missing?
import { BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const [branch, sem, code] = (process.argv[2] ?? "cse|2|100219").split("|");
const pack = JSON.parse(BRANCH_PACKS[branch]);
const subject = (pack.semesters[sem] as any[]).find((s: any) => s.code === code);
const STOP = new Set(["unit", "units", "module", "modules", "part", "parts", "section", "sections", "detailed", "contents", "content", "syllabus", "hrs", "hr", "hours", "hour", "periods", "period", "lectures", "lecture"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w));
const units = parseSyllabus(subject.content);
const bag = new Map<string, number>();
for (const w of words([...units.map((u) => `${u.title} ${u.hours ?? ""}`), ...units.flatMap((u) => u.topics.map((t) => `${t.title} ${t.body} ${t.hours ?? ""}`))].join(" "))) bag.set(w, (bag.get(w) ?? 0) + 1);
const source = words(subject.content);
const missing = [];
for (const w of source) {
  const n = bag.get(w) ?? 0;
  if (n > 0) bag.set(w, n - 1);
  else missing.push(w);
}
console.log("missing:", missing);
console.log("\n--- headings ---");
for (const line of subject.content.split("\n")) {
  if (/^\s*(unit|module|part|section)/i.test(line)) console.log(JSON.stringify(line.slice(0, 120)));
}
console.log("\n--- parsed ---");
for (const u of units) console.log(`U ${JSON.stringify(u.title)} :: ${u.topics.length} topics`);
console.log("\ncontent lines:", subject.content.split("\n").length);
