import { scheduleFor, targetFor, revisionDaysFor } from "../src/features/planner/plan";
import { BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import { parseSyllabus, type BranchPack } from "../src/features/syllabus/parse";

const pack = JSON.parse(BRANCH_PACKS["cse"]) as BranchPack;
const units = [];
for (const s of pack.semesters["3"]) {
  for (const u of parseSyllabus(s.content)) {
    units.push({ code: s.code, subject: s.name, title: u.title, topicIds: u.topics.map((t) => t.id), topicTitles: u.topics.map((t) => t.title) });
  }
}
console.log("units", units.length, "topics", units.reduce((n, u) => n + u.topicIds.length, 0));
console.log("target60", targetFor(60), "rev10", revisionDaysFor(10), "rev25", revisionDaysFor(25));

const s = scheduleFor({ units, studied: {}, exam: "2026-11-20", minutesPerDay: 60, now: "2026-10-26", course: { branch: "cse", sem: 3 } });
console.log("days", s.days.length, "study", s.studyDays, "rev", s.revisionDays, "last", s.lastDay, "spare", s.spareDays, "overflow", s.overflow.length, "planned", s.days.reduce((n, d) => n + d.topics.length, 0));
console.log("feas", JSON.stringify(s.feasibility));
for (const d of s.days.slice(0, 6)) console.log(d.day, d.date, d.kind, d.topics.map((t) => `${t.code} ${t.title.slice(0, 40)}`));
console.log("...");
for (const d of s.days.slice(-3)) console.log(d.day, d.date, d.kind, d.topics.length);
const perDay = new Map<number, number>();
for (const d of s.days) perDay.set(d.topics.length, (perDay.get(d.topics.length) ?? 0) + 1);
console.log("topics per day histogram", [...perDay.entries()]);

// two long units never on the same day
const bad = s.days.filter((d) => {
  const longs = new Set(d.topics.filter((t) => (units.find((u) => u.code === t.code && u.title === t.unit)?.topicIds.length ?? 0) > s.target).map((t) => t.code + t.unit));
  return longs.size > 1;
});
console.log("days with two long units", bad.length);
