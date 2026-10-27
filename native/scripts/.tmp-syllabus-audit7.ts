// Throwaway — a subject with no content, and one with clean topics, for tests.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const noContent: string[] = [];
for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      if (!(subject.content ?? "").trim()) noContent.push(`${meta.code}|${sem}|${subject.code} :: ${subject.name}`);
    }
  }
}
console.log("no content:", noContent.length);
console.log(noContent.slice(0, 12).join("\n"));

const pack = JSON.parse(BRANCH_PACKS["cse"]);
const target = (pack.semesters["1"] as any[]).find((s) => s.code === "100110");
console.log("\n100110:", target?.name, target?.credits);
for (const unit of parseSyllabus(target.content)) {
  console.log(`UNIT ${unit.title} (${unit.topics.length})`);
  for (const t of unit.topics.slice(0, 4)) console.log(`  · ${t.title}`);
}
