import { BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";
const [branch, sem, code] = (process.argv[2] ?? "cse|2|100219").split("|");
const pack = JSON.parse(BRANCH_PACKS[branch]);
const subject = (pack.semesters[sem] as any[]).find((s: any) => s.code === code);
const units = parseSyllabus(subject.content);
for (const t of units[0].topics) console.log(JSON.stringify(t.title), "|", JSON.stringify(t.body.slice(0, 80)));
