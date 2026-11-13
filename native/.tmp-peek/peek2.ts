import { BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import { parseSyllabus, type BranchPack } from "../src/features/syllabus/parse";
const pack = JSON.parse(BRANCH_PACKS["cse"]) as BranchPack;
for (const s of pack.semesters["3"].slice(0, 3)) {
  console.log("==", s.code, s.name);
  for (const u of parseSyllabus(s.content)) console.log(" ", u.id, "|", u.title, "|", u.topics.map(t => `${t.id}:${t.title}`).join(" // "));
}
