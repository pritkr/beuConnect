// Throwaway — coverage + shape after the parser fixes.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1);

let subjects = 0;
let emptyUnits = 0;
let unitTotal = 0;
let topicTotal = 0;
let maxTopics = { where: "", n: 0 };
let maxUnits = { where: "", n: 0 };
const losses: { where: string; lost: number; sample: string }[] = [];
const zeroTopic: string[] = [];

for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      subjects++;
      const content: string = subject.content ?? "";
      const units = parseSyllabus(content);
      const where = `${meta.code}|${sem}|${subject.code}`;
      const topics = units.flatMap((u) => u.topics);
      unitTotal += units.length;
      topicTotal += topics.length;
      if (topics.length > maxTopics.n) maxTopics = { where, n: topics.length };
      if (units.length > maxUnits.n) maxUnits = { where, n: units.length };
      if (units.length && units.every((u) => !u.topics.length)) zeroTopic.push(where);
      for (const u of units) if (!u.topics.length) emptyUnits++;

      const parsedBag = new Map<string, number>();
      for (const w of words([...units.map((u) => u.title), ...topics.map((t) => `${t.title} ${t.body}`)].join(" "))) {
        parsedBag.set(w, (parsedBag.get(w) ?? 0) + 1);
      }
      let lost = 0;
      const samples: string[] = [];
      for (const w of words(content)) {
        const n = parsedBag.get(w) ?? 0;
        if (n > 0) parsedBag.set(w, n - 1);
        else {
          lost++;
          if (samples.length < 5) samples.push(w);
        }
      }
      if (lost > 0) losses.push({ where, lost, sample: samples.join(" ") });
    }
  }
}

console.log({ subjects, unitTotal, topicTotal, avgTopics: +(topicTotal / subjects).toFixed(1), emptyUnits, zeroTopic: zeroTopic.length, maxTopics, maxUnits });
console.log("subjects with any lost word:", losses.length);
console.log(losses.slice(0, 8));
