import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import { parseSyllabus, type BranchPack } from "../src/features/syllabus/parse";

for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]) as BranchPack;
  for (const sem of ["1", "3"]) {
    const subs = pack.semesters[sem] ?? [];
    if (!subs.length) continue;
    let units = 0, topics = 0;
    const rows: string[] = [];
    for (const s of subs) {
      const us = parseSyllabus(s.content);
      units += us.length;
      topics += us.reduce((n, u) => n + u.topics.length, 0);
      rows.push(`${s.code} ${s.name} -> ${us.map((u) => `${u.id}:${u.topics.length}`).join(",")}`);
    }
    console.log(`${meta.code} sem${sem}: ${subs.length} subjects, ${units} units, ${topics} topics`);
    if (meta.code === "cse" && sem === "3") console.log(rows.join("\n"));
  }
}
