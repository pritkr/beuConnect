/**
 * The study planner's arithmetic — no UI, no storage, no clock of its own.
 *
 * A semester is a list of units, a unit is a list of topic ids, and the
 * syllabus screens own which ids are ticked. This file turns those three facts
 * plus one exam date into everything the planner screen shows: how many topics
 * are left, how many a day the remaining days demand, whether that is ahead of,
 * level with or behind the pace the student chose, and — the part that makes it
 * a plan rather than a count — which topic goes on which day.
 *
 * Determinism is the contract: `now` is always an argument, never `new Date()`,
 * so the same inputs always produce the same plan and the examples in the
 * comments below can be read as tests.
 *
 * Four rules keep the plan honest:
 *  - a ticked topic is removed from the work that still needs a day, so a
 *    half-finished unit starts today, not where it would have started a week
 *    ago;
 *  - no day is asked for more topics than the chosen minutes can carry
 *    (`targetFor`), and never more than four;
 *  - the last ~15% of the window is kept for revision and labelled as such,
 *    so the study days are the window minus that buffer; and
 *  - when the work cannot fit, the topics that have no day are returned in
 *    `overflow` and `feasibility` says how many days are short. Nothing is
 *    silently dropped.
 *
 * Placement is a greedy fill, one day at a time. Each slot goes to the unit
 * with the largest subject backlog. A unit gets one slot a day while another
 * unit still has work; when it is the last one left it fills the day instead
 * of leaving the day short. A day never starts a second long unit once it
 * already carries one. That is what spreads subjects: a day mixes the paper
 * that is furthest behind with the paper that is nearly finished, and a
 * 16-topic lab cannot swallow a whole week of days.
 */

/** Where the student stands against the pace they picked. */
export type Verdict = "ahead" | "on track" | "behind";

/** Anything the date helpers accept: a Date, an ISO day or epoch milliseconds. */
export type DayInput = Date | string | number;

/**
 * Minutes one topic is assumed to take when the plan has to put a number on
 * capacity. Matches the syllabus screen's fallback estimate (25 min a topic),
 * so "60 minutes a day" means 2.4 topics a day on both screens.
 */
export const TOPIC_MINUTES = 25;

/** The most topics one day is ever asked to carry, however many minutes are picked. */
export const MAX_TOPICS_PER_DAY = 4;

/** Share of the window kept for revision rather than new topics. */
export const REVISION_RATIO = 0.15;

/* ------------------------------------------------------------------- dates */

/**
 * Parses `YYYY-MM-DD` at local noon.
 *
 * Noon, not midnight: a date is a calendar fact, and noon keeps a clock change
 * from moving it to the day before. Returns null for anything that is not a
 * real day (`2026-02-30`, `2026-1-4`, text).
 *
 * ```ts
 * parseDay("2026-11-14")   // Date for Sat 14 Nov 2026, 12:00 local
 * parseDay("2026-1-4")     // Date for Sun 4 Jan 2026 — padding is optional
 * parseDay("2026-02-30")   // null — February never has 30 days
 * parseDay("14/11/2026")   // null — only year-first text is accepted
 * ```
 */
export function parseDay(text: string): Date | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

/**
 * The stored form of a day: `YYYY-MM-DD` from the device's local calendar.
 *
 * ```ts
 * isoDay(new Date(2026, 10, 14, 23, 59)) // "2026-11-14"
 * isoDay(new Date(2026, 0, 1))           // "2026-01-01"
 * isoDay(new Date(2025, 11, 31))         // "2025-12-31"
 * ```
 */
export function isoDay(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The same clock time `count` days later, at local noon.
 *
 * ```ts
 * isoDay(addDays(new Date(2026, 10, 14), 7))  // "2026-11-21"
 * isoDay(addDays(new Date(2026, 11, 30), 3))  // "2027-01-02" — crosses the year
 * isoDay(addDays(new Date(2026, 2, 1), -1))   // "2026-02-28" — day one is March
 * ```
 */
export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12, 0, 0, 0);
}

/** A Date from any accepted input, or null when it is not a real moment. */
function asDate(value: DayInput): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const day = parseDay(value);
  if (day) return day;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local calendar day as a UTC midnight, so subtraction ignores the clock. */
function calendarDay(value: DayInput): number | null {
  const date = asDate(value);
  if (!date) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days from `a` to `b`; negative when `b` is earlier.
 *
 * Times of day are ignored on purpose — an exam at 10:00 tomorrow is "1 day
 * left" at 23:00 tonight, and a tick count should not depend on the hour. Both
 * ends are normalised through UTC so a daylight-saving change cannot add or
 * lose a day. Unparseable input returns 0 rather than NaN, so a bad store
 * cannot poison a plan.
 *
 * ```ts
 * daysBetween("2026-11-01", "2026-11-15")                       // 14
 * daysBetween(new Date(2026, 0, 11, 23, 50), new Date(2026, 0, 12, 0, 10)) // 1
 * daysBetween("2026-11-15", "2026-11-01")                       // -14
 * ```
 */
export function daysBetween(a: DayInput, b: DayInput): number {
  const from = calendarDay(a);
  const to = calendarDay(b);
  if (from === null || to === null) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** "1 day" / "3 days" — grammar that keeps a sentence readable at any count. */
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------- marks */

/**
 * The ticked topics, as `code|topicId`.
 *
 * `studied` is the raw `beu.syllabus.studied` record, whose keys are
 * `branch|sem|code|topicId`. Only the last two segments matter here — the
 * planner is already looking at one course — so `cse|3|105302|u1-t2` and
 * `105302|u1-t2` both count. A key of `cse|3|105302` (a saved *subject*, not a
 * topic) is deliberately ignored.
 */
function doneSet(studied: Readonly<Record<string, boolean>>): Set<string> {
  const marks = new Set<string>();
  if (!studied) return marks;
  for (const key of Object.keys(studied)) {
    if (studied[key] !== true) continue;
    const parts = key.split("|");
    if (parts.length < 2) continue;
    const topic = parts[parts.length - 1];
    const code = parts[parts.length - 2];
    if (code && topic) marks.add(`${code}|${topic}`);
  }
  return marks;
}

/* --------------------------------------------------------------------- plan */

/** One unit, as the syllabus parser and the store describe it. */
export interface PlanUnitSeed {
  /** Subject code, `105302`. */
  code: string;
  /** Paper name, `Data Structure & Algorithms`. Falls back to the code. */
  subject?: string;
  /** The unit heading, `Trees`. */
  title: string;
  /** Topic ids exactly as `parseSyllabus` emits them, `u1-t2`. */
  topicIds: readonly string[];
  /** Topic titles, aligned with `topicIds`; a missing one falls back to the id. */
  topicTitles?: readonly string[];
}

/** One unit after scheduling. */
export interface PlannedUnit {
  code: string;
  title: string;
  /** Topics in the whole unit. */
  topics: number;
  /** Topics already ticked. */
  done: number;
  /** First day of the suggested block, 1 = today; 0 when nothing is left or no date is set. */
  startDay: number;
  /** Last day of the suggested block, 1 = today; 0 in the same two cases. */
  endDay: number;
}

export interface Plan {
  /** One row per input unit, in the same order. */
  units: PlannedUnit[];
  total: number;
  done: number;
  topicsLeft: number;
  /** Exam day minus today, signed: -2 means the date was two days ago. */
  examInDays: number;
  /** Study days left, clamped at 0. */
  daysLeft: number;
  /** Topics a remaining day demands, `topicsLeft / daysLeft`. */
  perDay: number;
  /** Topics a day the chosen minutes can carry, `minutesPerDay / TOPIC_MINUTES`. */
  capacity: number;
  /** null until an exam date exists: a pace with no deadline has no verdict. */
  verdict: Verdict | null;
}

/** The five things a plan is a function of. */
export interface PlanInput {
  units: readonly PlanUnitSeed[];
  studied: Readonly<Record<string, boolean>>;
  exam: DayInput | null;
  minutesPerDay: number;
  now: DayInput;
}

/**
 * Whether `perDay` sits inside the pace `capacity` allows.
 *
 * The top 20% of capacity is "on track" rather than "ahead": a plan that asks
 * for 3.5 topics when 4 fit is not early, it is exactly as tight as it looks.
 * No work left (`perDay <= 0`) counts as ahead; no capacity at all counts as
 * behind, because the deadline cannot be met by waiting.
 *
 * ```ts
 * verdictFor({ perDay: 2, capacity: 4 })     // "ahead"    — 2 <= 4 * 0.8
 * verdictFor({ perDay: 3.5, capacity: 4 })   // "on track" — fits, but only just
 * verdictFor({ perDay: 6, capacity: 4 })     // "behind"   — 6 > 4
 * ```
 */
export function verdictFor(input: { perDay: number; capacity: number }): Verdict {
  const perDay = Number.isFinite(input.perDay) ? Math.max(0, input.perDay) : 0;
  const capacity = Number.isFinite(input.capacity) ? Math.max(0, input.capacity) : 0;
  if (perDay <= 0) return "ahead";
  if (capacity <= 0) return "behind";
  if (perDay <= capacity * 0.8) return "ahead";
  if (perDay <= capacity) return "on track";
  return "behind";
}

/**
 * The whole plan: per-unit days, the remaining work and the verdict.
 *
 * Scheduling happens over topic positions, not units. The `topicsLeft`
 * remaining topics are spread evenly over `daysLeft` days, so the first topic
 * lands on day 1 and the last on the final day, and each unit takes the days
 * its own remaining topics fall on. A fully ticked unit gets `startDay` and
 * `endDay` 0 — there is no day to start it. With no exam date every unit is
 * unscheduled (0/0) and `verdict` is null; with a date in the past every
 * remaining topic is pushed to day 1 (`daysLeft` is clamped at 0).
 *
 * `scheduleFor` builds on this and replaces the unit blocks with the exact days
 * the day-by-day plan lands on, so the two never disagree on screen.
 *
 * ```ts
 * // One unit, one topic still open, exam in 4 days, an hour a day:
 * planFor({ units: [{ code: "105302", title: "Trees", topicIds: ["u1-t1", "u1-t2"] }],
 *           studied: { "cse|3|105302|u1-t1": true }, exam: "2026-11-18",
 *           minutesPerDay: 60, now: "2026-11-14" })
 * // → topicsLeft 1, daysLeft 4, perDay 0.25, capacity 2.4, verdict "ahead",
 * //   units[0] = { topics: 2, done: 1, startDay: 1, endDay: 1 }
 *
 * // Two 5-topic units over five days at two a day — the units share day 3:
 * // unit A (topics 0–4) → days 1–3, unit B (topics 5–9) → days 3–5
 *
 * // No exam date yet: every unit is 0/0, perDay 0, verdict null.
 * ```
 */
export function planFor(input: PlanInput): Plan {
  const marks = doneSet(input.studied ?? {});
  const minutes = Number.isFinite(input.minutesPerDay) ? Math.max(0, input.minutesPerDay) : 0;
  const capacity = minutes / TOPIC_MINUTES;

  const seeds = input.units ?? [];
  const remaining: number[] = [];
  const finished: number[] = [];
  let total = 0;
  let done = 0;

  for (const seed of seeds) {
    const count = seed.topicIds.length;
    let ticked = 0;
    for (const id of seed.topicIds) {
      if (marks.has(`${seed.code}|${id}`)) ticked += 1;
    }
    total += count;
    done += ticked;
    finished.push(ticked);
    remaining.push(count - ticked);
  }

  const topicsLeft = Math.max(0, total - done);
  const examDate = input.exam === null || input.exam === undefined ? null : asDate(input.exam);
  const examInDays = examDate ? daysBetween(input.now, examDate) : 0;
  const daysLeft = examDate ? Math.max(0, examInDays) : 0;
  const perDay = topicsLeft === 0 ? 0 : daysLeft > 0 ? topicsLeft / daysLeft : topicsLeft;
  const verdict = examDate ? verdictFor({ perDay, capacity }) : null;

  // One day is the minimum window so a plan for today still has a day number.
  const days = Math.max(1, daysLeft);
  const units: PlannedUnit[] = [];
  let seen = 0;

  seeds.forEach((seed, index) => {
    const left = remaining[index];
    let startDay = 0;
    let endDay = 0;
    if (examDate && left > 0 && topicsLeft > 0) {
      const first = seen;
      const last = seen + left - 1;
      startDay = Math.floor((first * days) / topicsLeft) + 1;
      endDay = Math.floor((last * days) / topicsLeft) + 1;
      seen += left;
    }
    units.push({
      code: seed.code,
      title: seed.title,
      topics: seed.topicIds.length,
      done: finished[index],
      startDay,
      endDay,
    });
  });

  return { units, total, done, topicsLeft, examInDays, daysLeft, perDay, capacity, verdict };
}

/* ----------------------------------------------------------------- schedule */

/**
 * Revision days inside a window of `days` days: the last ~15%, and none at all
 * for a window too short to give one up (under five days).
 *
 * ```ts
 * revisionDaysFor(2)   // 0 — every day has to carry new topics
 * revisionDaysFor(7)   // 1
 * revisionDaysFor(20)  // 3
 * revisionDaysFor(60)  // 9
 * ```
 */
export function revisionDaysFor(days: number): number {
  const total = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  if (total < 5) return 0;
  return Math.max(1, Math.round(total * REVISION_RATIO));
}

/**
 * Topics one study day is asked to carry at this pace: the minutes divided by
 * `TOPIC_MINUTES`, rounded **down** so a day never asks for more time than the
 * student picked, then held between one and four.
 *
 * ```ts
 * targetFor(30)  // 1 — 50 min would not fit in half an hour
 * targetFor(60)  // 2 — 2.4 topics, so two (50 min)
 * targetFor(90)  // 3 — 3.6 topics, so three (75 min)
 * targetFor(120) // 4 — the ceiling, four topics (100 min)
 * ```
 */
export function targetFor(minutesPerDay: number): number {
  const minutes = Number.isFinite(minutesPerDay) ? Math.max(0, minutesPerDay) : 0;
  return Math.max(1, Math.min(MAX_TOPICS_PER_DAY, Math.floor(minutes / TOPIC_MINUTES)));
}

/** One topic, placed on a day. */
export interface PlannedTopic {
  /** The exact `beu.syllabus.studied` key: `branch|sem|code|topicId`. */
  key: string;
  /** The key without the course prefix: `code|topicId`. */
  mark: string;
  code: string;
  /** Paper name, or the code when the seed carried none. */
  subject: string;
  /** Unit heading, `Unit 5` or `Trees`. */
  unit: string;
  topicId: string;
  title: string;
}

/** One day of the plan. */
export interface ScheduleDay {
  /** 1 = today. */
  day: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /**
   * `study` carries new topics, `free` is a study day with nothing left to
   * place, `revision` is one of the days kept back at the end.
   */
  kind: "study" | "free" | "revision";
  topics: PlannedTopic[];
}

/** How the remaining work sits against the days that are left. */
export type PaceState = "no-date" | "no-topics" | "done" | "past" | "today" | "fits" | "short";

/** The one thing worth changing, with the value it should change to. */
export type PlanFix = { kind: "minutes"; minutes: number } | { kind: "date"; date: string };

export interface Feasibility {
  state: PaceState;
  /** Whether the remaining topics fit in the study days left. */
  fits: boolean;
  /** Study days the remaining topics ask for at the chosen pace. */
  requiredDays: number;
  /** Study days available once the revision buffer is taken out. */
  studyDays: number;
  /** Days short; 0 when it fits. */
  shortByDays: number;
  /** Topics that have no day before the exam. */
  unplaced: number;
  /** The one fix worth offering, or null when nothing needs fixing. */
  fix: PlanFix | null;
  /** One plain sentence about where the plan stands. */
  message: string;
  /** A second sentence with the arithmetic behind `message`; may be "". */
  detail: string;
}

/** One unit after the day-by-day placement. */
export interface ScheduledUnit extends PlannedUnit {
  /** Topics still open. */
  left: number;
  /** Topics this plan put on a day. */
  planned: number;
}

export interface Schedule extends Plan {
  /** One row per input unit, with the days the placement actually used. */
  units: ScheduledUnit[];
  /** Topics a study day aims for, 1–4. */
  target: number;
  /** Study days in the window (the window minus the revision buffer). */
  studyDays: number;
  /** Days at the end kept for revision. */
  revisionDays: number;
  /** Every day from today to the exam, in order. */
  days: ScheduleDay[];
  /** Topics that found no day before the exam. Empty when everything fits. */
  overflow: PlannedTopic[];
  /** The last day that carries a new topic, 1 = today; 0 when nothing is scheduled. */
  lastDay: number;
  /** Study days left over after the last new topic. */
  spareDays: number;
  /** null only when no exam date is set — a pace without a deadline has no verdict. */
  feasibility: Feasibility | null;
}

/** The paces the settings card offers; a suggested fix lands on one of them. */
export const PACES = [30, 45, 60, 90, 120] as const;

/**
 * The plan, day by day.
 *
 * Builds the window from today to the exam, keeps the last ~15% of it for
 * revision, and fills the study days greedily:
 *
 *  1. Each slot goes to the unit with the largest **subject** backlog, so a
 *     paper that is far behind is never starved by one that is nearly done.
 *  2. A unit contributes one topic per slot and is not repeated on the same
 *     day, unless it can be finished that day — a two-topic unit stays one
 *     unit, a twenty-topic lab does not eat a week of days.
 *  3. A day that already carries a long unit (one that cannot finish today)
 *     only takes short units after it. Two long units never share a day.
 *  4. When the study days run out, the rest is `overflow` and `feasibility`
 *     states the shortfall. Nothing is dropped quietly.
 *
 * `course` only makes each topic carry its exact studied key; without it the
 * key is `code|topicId`, which `planFor` still understands.
 *
 * ```ts
 * scheduleFor({ units, studied, exam: "2026-11-20", minutesPerDay: 60,
 *               now: "2026-11-10", course: { branch: "cse", sem: 3 } })
 * // → 10 days: revisionDaysFor(10) === 2, so 8 study days at 2 topics
 * //   and 2 labelled revision days at the end
 * ```
 */
export function scheduleFor(input: PlanInput & { course?: { branch: string; sem: number } }): Schedule {
  const plan = planFor(input);
  const minutes = Number.isFinite(input.minutesPerDay) ? Math.max(0, input.minutesPerDay) : 0;
  const target = targetFor(minutes);
  const revisionDays = revisionDaysFor(plan.daysLeft);
  const studyDays = Math.max(0, plan.daysLeft - revisionDays);
  const start = asDate(input.now) ?? new Date(0);
  const examDate = input.exam === null || input.exam === undefined ? null : asDate(input.exam);
  const prefix = input.course ? `${input.course.branch}|${input.course.sem}|` : "";

  interface Work {
    /** Index into `input.units`, so the unit rows stay in syllabus order. */
    index: number;
    code: string;
    subject: string;
    unit: string;
    ids: readonly string[];
    titles: readonly string[];
    /** How many topics of this unit have been handed out (placed or overflowed). */
    taken: number;
    /** How many of them landed on a day. */
    scheduled: number;
    /** First day of the unit's block, 1 = today; 0 when it never got a day. */
    firstDay: number;
    lastDay: number;
  }

  const marks = doneSet(input.studied ?? {});
  const seeds = input.units ?? [];
  const work: Work[] = [];
  const unitDone: number[] = [];

  seeds.forEach((seed, index) => {
    const ids: string[] = [];
    const titles: string[] = [];
    let ticked = 0;
    seed.topicIds.forEach((id, at) => {
      const key = `${seed.code}|${id}`;
      if (marks.has(key)) {
        ticked += 1;
        return;
      }
      ids.push(id);
      titles.push(seed.topicTitles?.[at] ?? id);
    });
    unitDone.push(ticked);
    if (!ids.length) return;
    work.push({
      index,
      code: seed.code,
      subject: seed.subject || seed.code,
      unit: seed.title,
      ids,
      titles,
      taken: 0,
      scheduled: 0,
      firstDay: 0,
      lastDay: 0,
    });
  });

  // Remaining topics per paper, kept up to date so "largest backlog" is one look.
  const backlog = new Map<string, number>();
  for (const item of work) {
    backlog.set(item.code, (backlog.get(item.code) ?? 0) + item.ids.length);
  }

  const pick = (pool: readonly Work[]): Work => {
    let best = pool[0];
    for (let at = 1; at < pool.length; at += 1) {
      const unit = pool[at];
      const mine = backlog.get(unit.code) ?? 0;
      const theirs = backlog.get(best.code) ?? 0;
      if (mine > theirs || (mine === theirs && unit.index < best.index)) best = unit;
    }
    return best;
  };

  const days: ScheduleDay[] = [];
  const overflow: PlannedTopic[] = [];
  let placed = 0;
  let lastDay = 0;
  let busyDays = 0;

  const place = (unit: Work): PlannedTopic => {
    const at = unit.taken;
    const id = unit.ids[at];
    unit.taken += 1;
    backlog.set(unit.code, (backlog.get(unit.code) ?? 0) - 1);
    return {
      key: `${prefix}${unit.code}|${id}`,
      mark: `${unit.code}|${id}`,
      code: unit.code,
      subject: unit.subject,
      unit: unit.unit,
      topicId: id,
      title: unit.titles[at],
    };
  };

  const open = (): Work[] => work.filter((unit) => unit.taken < unit.ids.length);
  /** A unit needs more than one day when its remaining work is over a day's quota. */
  const isLong = (unit: Work): boolean => unit.ids.length - unit.taken > target;

  for (let day = 1; day <= studyDays; day += 1) {
    const topics: PlannedTopic[] = [];
    const used = new Set<Work>();
    const papers = new Set<string>();
    let longOnDay = false;

    while (topics.length < target) {
      const remaining = open();
      if (!remaining.length) break;
      // A unit gets one slot a day; the second slot only when it can finish.
      const fresh = remaining.filter((unit) => !used.has(unit));
      let pool = fresh.length ? fresh : remaining;
      // One paper a day while another paper still has work: that is the spread.
      const spread = pool.filter((unit) => !papers.has(unit.code));
      if (spread.length) pool = spread;
      if (longOnDay) {
        const short = pool.filter((unit) => !isLong(unit));
        if (short.length) {
          pool = short;
        } else {
          const started = remaining.filter((unit) => used.has(unit));
          if (started.length) pool = started;
        }
      }
      if (!pool.length) break;

      const unit = pick(pool);
      const long = isLong(unit);
      const room = target - topics.length;
      const take = long ? 1 : Math.min(unit.ids.length - unit.taken, room);
      for (let step = 0; step < take; step += 1) {
        topics.push(place(unit));
        unit.scheduled += 1;
      }
      used.add(unit);
      papers.add(unit.code);
      if (long) longOnDay = true;
      if (!unit.firstDay) unit.firstDay = day;
      unit.lastDay = day;
    }

    if (topics.length) {
      placed += topics.length;
      lastDay = day;
      busyDays += 1;
    }
    days.push({ day, date: isoDay(addDays(start, day - 1)), kind: topics.length ? "study" : "free", topics });
  }

  for (const unit of work) {
    while (unit.taken < unit.ids.length) overflow.push(place(unit));
  }

  for (let day = studyDays + 1; day <= plan.daysLeft; day += 1) {
    days.push({ day, date: isoDay(addDays(start, day - 1)), kind: "revision", topics: [] });
  }

  const units: ScheduledUnit[] = seeds.map((seed, index) => {
    const item = work.find((unit) => unit.index === index);
    const total = seed.topicIds.length;
    const done = unitDone[index] ?? 0;
    return {
      code: seed.code,
      title: seed.title,
      topics: total,
      done,
      startDay: item ? item.firstDay : 0,
      endDay: item ? item.lastDay : 0,
      left: total - done,
      planned: item ? item.scheduled : 0,
    };
  });

  const requiredDays = plan.topicsLeft === 0 ? 0 : Math.ceil(plan.topicsLeft / target);
  const shortByDays = Math.max(0, requiredDays - studyDays);
  const topicsLeft = plan.topicsLeft;

  let state: PaceState;
  if (!examDate) state = "no-date";
  else if (plan.total === 0) state = "no-topics";
  else if (topicsLeft === 0) state = "done";
  else if (plan.examInDays < 0) state = "past";
  else if (studyDays === 0) state = "today";
  else if (requiredDays <= studyDays) state = "fits";
  else state = "short";

  let fix: PlanFix | null = null;
  if (examDate && topicsLeft > 0 && (state === "today" || state === "past" || state === "short")) {
    const needPerDay = studyDays > 0 ? Math.ceil(topicsLeft / studyDays) : Number.POSITIVE_INFINITY;
    if (needPerDay <= MAX_TOPICS_PER_DAY) {
      const need = needPerDay * TOPIC_MINUTES;
      fix = { kind: "minutes", minutes: PACES.find((value) => value >= need) ?? 180 };
    } else {
      const need = Math.ceil(topicsLeft / target);
      let windowDays = Math.max(1, need);
      while (windowDays < 3650 && windowDays - revisionDaysFor(windowDays) < need) windowDays += 1;
      fix = { kind: "date", date: isoDay(addDays(start, windowDays)) };
    }
  }

  const minutesLabel = Math.round(minutes);
  const spareDays = Math.max(0, studyDays - requiredDays);
  let message = "";
  let detail = "";
  if (state === "no-date") {
    message = "A plan needs one date. Set the exam date and the days fill in.";
  } else if (state === "no-topics") {
    message = "This course has no parsed topics to schedule.";
    detail = "Pick another course, or check the syllabus text.";
  } else if (state === "done") {
    message = "Every topic is ticked. Nothing is left to schedule.";
    detail = `${plural(plan.total, "topic")} studied. The same ticks show in Syllabus.`;
  } else if (state === "past") {
    message = `The date passed ${plural(-plan.examInDays, "day")} ago with ${plural(topicsLeft, "topic")} left.`;
    detail = "Set a new date to carry the remaining topics forward.";
  } else if (state === "today") {
    message =
      topicsLeft === 1
        ? "The exam is today and 1 topic was never scheduled."
        : `The exam is today and ${topicsLeft} topics were never scheduled.`;
    detail = "Set a new date to plan the rest.";
  } else if (state === "fits") {
    message = `Every topic has a day: ${plural(requiredDays, "study day")} of the ${studyDays} left.`;
    detail =
      revisionDays > 0
        ? `${plural(revisionDays, "day")} at the end ${revisionDays === 1 ? "is" : "are"} kept for revision${
            spareDays > 0 ? `, with ${plural(spareDays, "day")} spare` : ""
          }.`
        : `${plural(spareDays, "study day")} spare before the exam.`;
  } else {
    message = `At ${minutesLabel} min a day this course needs ${plural(shortByDays, "more day")}.`;
    detail =
      overflow.length === 1
        ? "1 topic has no day before the exam."
        : `${overflow.length} topics have no day before the exam.`;
  }

  const feasibility: Feasibility | null = examDate
    ? {
        state,
        fits: requiredDays <= studyDays,
        requiredDays,
        studyDays,
        shortByDays,
        unplaced: overflow.length,
        fix,
        message,
        detail,
      }
    : null;

  // The demand is measured against the study days, so the revision buffer and
  // the verdict agree with the days the student actually sees.
  const perDay = topicsLeft === 0 ? 0 : studyDays > 0 ? topicsLeft / studyDays : topicsLeft;

  return {
    ...plan,
    units,
    target,
    studyDays,
    revisionDays,
    days: state === "no-topics" || state === "done" ? [] : days,
    overflow,
    lastDay,
    spareDays,
    perDay,
    verdict: examDate ? verdictFor({ perDay, capacity: plan.capacity }) : null,
    feasibility,
  };
}
