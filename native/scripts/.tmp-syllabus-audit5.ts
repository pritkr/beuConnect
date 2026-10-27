// Throwaway — unit headings that start with a bare 1-3 digit number.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const hits: string[] = [];
for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      for (const unit of parseSyllabus(subject.content ?? "")) {
        if (/^\d{1,3}\s+\S/.test(unit.title)) hits.push(`${meta.code}|${sem}|${subject.code} :: ${JSON.stringify(unit.title.slice(0, 60))}`);
      }
    }
  }
}
console.log(hits.length);
console.log(hits.slice(0, 20).join("\n"));
