import { BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import { parseSyllabus } from "../src/features/syllabus/parse";
const pack = JSON.parse((BRANCH_PACKS as any).ece);
const s = pack.semesters["4"].find((x: any) => x.code === "EC104");
console.log(s?.name, s?.content?.length);
const units = parseSyllabus(s?.content ?? "");
units.slice(0, 3).forEach((u: any) => {
  console.log(`\n${u.id} "${u.title}" [${u.hours ?? ""}] topics=${u.topics.length}`);
  u.topics.forEach((t: any) => console.log(`  ${t.id} "${t.title}" body=${t.body.length} ${JSON.stringify(t.body.slice(0,80))}`));
});
