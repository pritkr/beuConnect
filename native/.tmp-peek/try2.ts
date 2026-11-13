import { scheduleFor } from "../src/features/planner/plan";
import { BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import { parseSyllabus, type BranchPack } from "../src/features/syllabus/parse";

const pack = JSON.parse(BRANCH_PACKS["cse"]) as BranchPack;
const units = [];
for (const s of pack.semesters["3"]) {
  for (const u of parseSyllabus(s.content)) {
    units.push({ code: s.code, subject: s.name, title: u.title, topicIds: u.topics.map((t) => t.id), topicTitles: u.topics.map((t) => t.title) });
  }
}
const s = scheduleFor({ units, studied: {}, exam: "2026-11-20", minutesPerDay: 60, now: "2026-10-26", course: { branch: "cse", sem: 3 } });
for (const d of s.days.slice(0, 8)) console.log(d.day, d.topics.map((t) => `${t.code}/${t.unit}/${t.topicId}`));
const u = units.filter(x => x.code === "105306");
console.log(u.map(x => [x.title, x.topicIds.length]));
