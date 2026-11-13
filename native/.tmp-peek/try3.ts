import { scheduleFor, revisionDaysFor, targetFor, planFor } from "../src/features/planner/plan";

const units = [
  { code: "A", subject: "Alpha", title: "U1", topicIds: ["t1", "t2", "t3"], topicTitles: ["a1", "a2", "a3"] },
  { code: "B", subject: "Beta", title: "U1", topicIds: ["t1", "t2", "t3"], topicTitles: ["b1", "b2", "b3"] },
];

const normal = scheduleFor({ units, studied: {}, exam: "2026-11-20", minutesPerDay: 60, now: "2026-10-26" });
console.log("normal", normal.days.length, normal.studyDays, normal.revisionDays, JSON.stringify(normal.feasibility));
for (const d of normal.days) console.log(" ", d.day, d.date, d.kind, d.topics.map(t => t.code + ":" + t.title));

console.log("past", JSON.stringify(scheduleFor({ units, studied: {}, exam: "2026-10-20", minutesPerDay: 60, now: "2026-10-26" }).feasibility));
console.log("today", JSON.stringify(scheduleFor({ units, studied: {}, exam: "2026-10-26", minutesPerDay: 60, now: "2026-10-26" }).feasibility));
console.log("zero", JSON.stringify(scheduleFor({ units: [], studied: {}, exam: "2026-11-20", minutesPerDay: 60, now: "2026-10-26" }).feasibility));
const doneMarks: Record<string, boolean> = {};
for (const u of units) for (const id of u.topicIds) doneMarks[`${u.code}|${id}`] = true;
const done = scheduleFor({ units, studied: doneMarks, exam: "2026-11-20", minutesPerDay: 60, now: "2026-10-26" });
console.log("done", done.days.length, done.overflow.length, JSON.stringify(done.feasibility), done.units.map(u => [u.done, u.left, u.planned]));
const impossible = scheduleFor({ units: [{ code: "X", title: "U", topicIds: Array.from({length: 100}, (_, i) => `t${i}`) }], studied: {}, exam: "2026-11-01", minutesPerDay: 60, now: "2026-10-26" });
console.log("impossible", JSON.stringify(impossible.feasibility), impossible.days.length, impossible.overflow.length);
const raise = scheduleFor({ units: [{ code: "X", title: "U", topicIds: Array.from({length: 12}, (_, i) => `t${i}`) }], studied: {}, exam: "2026-11-05", minutesPerDay: 60, now: "2026-10-26" });
console.log("raise", JSON.stringify(raise.feasibility));
console.log("planFor zero", JSON.stringify(planFor({ units: [], studied: {}, exam: null, minutesPerDay: 60, now: "2026-10-26" })));
