import { readFileSync } from "node:fs";
const packs = await import("../../src/features/syllabus/data/packs.ts");
const ROOT = ".."; // repo root
const apps: Record<string, any> = {};
for (const [k, v] of Object.entries<string>(packs.BRANCH_PACKS)) apps[k] = JSON.parse(v);

for (const code of Object.keys(apps)) {
  const site = JSON.parse(readFileSync(`${ROOT}/src/assets/data/branches/${code}.json`, "utf8"));
  const a = apps[code];
  const aKeys = Object.keys(a);
  const sKeys = Object.keys(site);
  const semA = Object.keys(a.semesters).sort((x, y) => +x - +y);
  const semS = Object.keys(site.semesters).sort((x, y) => +x - +y);
  let diffs = 0;
  const notes: string[] = [];
  if (a.code !== site.code) notes.push(`code ${a.code} vs ${site.code}`);
  if (a.name !== site.name) notes.push(`name "${a.name}" vs "${site.name}"`);
  if (semA.join() !== semS.join()) notes.push(`sems ${semA.join()} vs ${semS.join()}`);
  const fields = new Set<string>();
  for (const sem of semA) {
    const al = a.semesters[sem] ?? [];
    const sl = site.semesters[sem] ?? [];
    if (al.length !== sl.length) notes.push(`sem ${sem}: ${al.length} vs ${sl.length} subjects`);
    for (let i = 0; i < Math.min(al.length, sl.length); i++) {
      for (const k of Object.keys(al[i])) fields.add(k);
      const diff = Object.keys({ ...al[i], ...sl[i] }).filter((k) => JSON.stringify(al[i][k]) !== JSON.stringify(sl[i][k]));
      if (diff.length) {
        diffs++;
        if (notes.length < 8) notes.push(`sem ${sem} #${i} "${al[i].name}": ${diff.join(",")}`);
      }
    }
  }
  console.log(code, "subject diffs", diffs, "| app fields", [...fields].join(","), "| site keys", sKeys.join(","), "| notes:", notes.slice(0, 6));
}
