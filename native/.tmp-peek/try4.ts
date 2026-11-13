import { scheduleFor } from "../src/features/planner/plan";
const units = [{ code: "X", subject: "X", title: "U", topicIds: Array.from({ length: 12 }, (_, i) => `t${i}`) }];
for (const exam of ["2026-10-31", "2026-11-02", "2026-11-05"]) {
  const s = scheduleFor({ units, studied: {}, exam, minutesPerDay: 60, now: "2026-10-26" });
  console.log(exam, JSON.stringify(s.feasibility), "days", s.days.length, "study", s.studyDays);
}
// two long units
const two = [
  { code: "A", subject: "A", title: "U1", topicIds: Array.from({ length: 7 }, (_, i) => `a${i}`) },
  { code: "B", subject: "B", title: "U1", topicIds: Array.from({ length: 7 }, (_, i) => `b${i}`) },
];
const s = scheduleFor({ units: two, studied: {}, exam: "2026-11-15", minutesPerDay: 60, now: "2026-10-26" });
for (const d of s.days.filter(d => d.topics.length)) console.log(d.day, d.topics.map(t => t.code));
