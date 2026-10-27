// Throwaway — dumps one subject's raw content and the parse of it.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const want = process.argv[2] ?? "ece|4|EC104";
const [branch, sem, code] = want.split("|");
const pack = JSON.parse(BRANCH_PACKS[branch]);
const subject = (pack.semesters[sem] as any[]).find((s) => s.code === code);
console.log("=== RAW ===");
console.log(JSON.stringify(subject.content));
console.log("=== PARSE ===");
for (const unit of parseSyllabus(subject.content)) {
  console.log(`UNIT ${unit.id} title=${JSON.stringify(unit.title)} hours=${unit.hours} topics=${unit.topics.length}`);
  for (const t of unit.topics) console.log(`  · ${JSON.stringify(t.title)} [${t.hours}] body=${JSON.stringify(t.body.slice(0, 100))}`);
}
