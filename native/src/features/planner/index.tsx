/**
 * Study planner — one course, one exam date, and the days between them.
 *
 * What this screen owns:
 *  - `beu.planner` — `{ branch, sem, exam, minutesPerDay, at }`, the plan the
 *    student last set up. This is the only store written here.
 *  - `beu.syllabus.studied` — the same key the syllabus screens write, through
 *    the same `branch|sem|code|topicId` keys. Ticking a topic here ticks it
 *    there, and the write re-reads the store first so a tick made in the
 *    syllabus tab while this screen was open is never clobbered.
 *
 * What it only reads: `beu.syllabus.course` and `beu.profile`, for the course
 * to fall back on when the route carries no `branch`/`sem`. Nothing here writes
 * the student's saved course.
 *
 * The arithmetic lives in `./plan.ts` and is deterministic; this file only
 * feeds it signals and renders what comes back.
 */

import { List, View, cleanup, computed, effect, signal, type Accessor, type JSX } from "nsh";

import type { Nav, RouteDef } from "../../app/router";
import { numParam, param } from "../../app/router";
import { Badge, Body, Btn, Chip, Loading, Screen, SectionHeader } from "../../ui";
import { readStore, writeStore } from "../../lib/net";
import { BRANCH_META, branchPack } from "../syllabus/active";
import { dataVersion } from "../data-feed/pyqs";
import { parseSyllabus, type BranchPack, type Subject } from "../syllabus/parse";
import { isoDay, parseDay, scheduleFor, type PlanUnitSeed, type Schedule } from "./plan";
import {
  Chooser,
  DayCard,
  FeasibilityPanel,
  PlanSettings,
  PlanSummary,
  PlannerEmpty,
  UnitCard,
  type Course,
  type Marks,
  type UnitRow,
} from "./parts";

/* ------------------------------------------------------------------- store */

const KEYS = {
  planner: "planner",
  studied: "syllabus.studied",
  course: "syllabus.course",
  profile: "profile",
} as const;

const DEFAULT_MINUTES = 60;

interface PlannerStore {
  branch: string;
  sem: number;
  /** `YYYY-MM-DD`, "" when no date is set. */
  exam: string;
  minutesPerDay: number;
  /** When the record was last written, so a future migration can order copies. */
  at: number;
}

const planStore = signal<PlannerStore | null>(null);
/** The `branch`/`sem` of `planStore`, separate so saving a date keeps the course reference. */
const planCourse = signal<Course | null>(null);
/** The saved course from settings / the syllabus landing, read-only here. */
const savedCourse = signal<Course | null>(null);
/** The live syllabus marks: `branch|sem|code|topicId` → true. */
const studied = signal<Record<string, boolean>>({});
/** Today as `YYYY-MM-DD`, so the countdown rolls over without a reload. */
const today = signal(isoDay(new Date()));
/** A course picked in the chooser during this session; beats the route params. */
const choice = signal<Course | null>(null);
const hydrated = signal(false);

/* --------------------------------------------------------------- validation */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function branchMeta(value: string): { code: string; name: string; short: string } | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return (
    BRANCH_META.find(
      (item) => item.code === key || item.short.toLowerCase() === key || item.name.toLowerCase() === key,
    ) ?? null
  );
}

/** `{ branch, sem }` from any store that carries a course, or null. */
function courseFrom(value: unknown): Course | null {
  const row = asRecord(value);
  if (!row) return null;
  const raw =
    typeof row.branch === "string"
      ? row.branch
      : typeof row.branchCode === "string"
        ? row.branchCode
        : typeof row.course === "string"
          ? row.course
          : "";
  const meta = branchMeta(raw);
  const rawSem = row.sem ?? row.semester;
  const sem = Math.round(Number(rawSem));
  if (!meta || !(sem >= 1 && sem <= 8)) return null;
  return { branch: meta.code, sem };
}

function plannerFrom(value: unknown): PlannerStore | null {
  const row = asRecord(value);
  const course = courseFrom(row);
  if (!row || !course) return null;
  const examDate = typeof row.exam === "string" ? parseDay(row.exam) : null;
  const minutes = Number(row.minutesPerDay);
  const at = Number(row.at);
  return {
    branch: course.branch,
    sem: course.sem,
    exam: examDate ? isoDay(examDate) : "",
    minutesPerDay: Number.isFinite(minutes) && minutes > 0 && minutes <= 600 ? Math.round(minutes) : DEFAULT_MINUTES,
    at: Number.isFinite(at) ? at : 0,
  };
}

/** Only `true` survives: a corrupt or legacy value never reads as "studied". */
function marksFrom(value: unknown): Record<string, boolean> {
  const row = asRecord(value);
  if (!row) return {};
  const marks: Record<string, boolean> = {};
  for (const key of Object.keys(row)) {
    if (row[key] === true) marks[key] = true;
  }
  return marks;
}

/* -------------------------------------------------------------------- load */

let reading: Promise<void> | null = null;

function load(): Promise<void> {
  if (hydrated() || reading) return reading ?? Promise.resolve();
  reading = (async () => {
    const [plannerRow, courseRow, profileRow, marksRow] = await Promise.all([
      readStore<unknown>(KEYS.planner, null),
      readStore<unknown>(KEYS.course, null),
      readStore<unknown>(KEYS.profile, null),
      readStore<unknown>(KEYS.studied, null),
    ]);
    const planner = plannerFrom(plannerRow);
    planStore.set(planner);
    planCourse.set(planner ? { branch: planner.branch, sem: planner.sem } : null);
    savedCourse.set(courseFrom(courseRow) ?? courseFrom(profileRow));
    studied.set(marksFrom(marksRow));
    hydrated.set(true);
  })().finally(() => {
    reading = null;
  });
  return reading;
}

let marksReading: Promise<void> | null = null;
/** Bumped on every local tick, so a read that started earlier cannot undo it. */
let marksVersion = 0;

/**
 * Re-reads the marks on every visit and on the poll: the syllabus tab is
 * allowed to be ahead. A read that started before a local tick is discarded
 * rather than applied, so an in-flight poll can never blink a tick off.
 */
function refreshStudied(): Promise<void> {
  if (marksReading) return marksReading;
  const version = marksVersion;
  marksReading = readStore<unknown>(KEYS.studied, null)
    .then((row) => {
      if (version === marksVersion) studied.set(marksFrom(row));
    })
    .finally(() => {
      marksReading = null;
    });
  return marksReading;
}

/** The 2.5 s tick: marks another screen may have written, and the calendar day. */
function poll(): void {
  const now = isoDay(new Date());
  if (today() !== now) today.set(now);
  void refreshStudied();
}

function writePlan(record: PlannerStore): void {
  planStore.set(record);
  const current = planCourse();
  const same = current !== null && current.branch === record.branch && current.sem === record.sem;
  if (!same && record.branch && record.sem >= 1) planCourse.set({ branch: record.branch, sem: record.sem });
  void writeStore(KEYS.planner, record);
}

/* ------------------------------------------------------------------- marks */

let writes: Promise<void> = Promise.resolve();

/**
 * Toggles one topic, on screen at once, then merges the change into the newest
 * stored copy in order. The read-before-write is deliberate: the syllabus
 * screen holds the same record and a blind overwrite would drop its ticks.
 */
function toggleTopic(key: string): void {
  const on = studied()[key] !== true;
  marksVersion += 1;
  studied.update((marks) => {
    const next = { ...marks };
    if (on) next[key] = true;
    else delete next[key];
    return next;
  });
  writes = writes
    .then(async () => {
      const marks = marksFrom(await readStore<unknown>(KEYS.studied, null));
      if (on) marks[key] = true;
      else delete marks[key];
      await writeStore(KEYS.studied, marks);
    })
    .catch(() => {
      /* storage is best effort: the tick stays on screen and is retried next time */
    });
}

/* -------------------------------------------------------------------- data */

const packCache = new Map<string, BranchPack>();
const courseCache = new Map<string, { rows: UnitRow[]; seeds: PlanUnitSeed[] }>();

function pack(branch: string): BranchPack | null {
  const key = `${branch}@${dataVersion()}`;
  const cached = packCache.get(key);
  if (cached) return cached;
  const raw = branchPack(branch);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BranchPack;
    packCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function subjectsOf(course: Course): Subject[] {
  const parsed = pack(course.branch);
  if (!parsed) return [];
  return parsed.semesters[String(course.sem)] ?? [];
}

/** The whole semester as flat unit rows, in syllabus order, parsed once per course. */
function dataFor(course: Course): { rows: UnitRow[]; seeds: PlanUnitSeed[] } {
  const cacheKey = `${course.branch}|${course.sem}@${dataVersion()}`;
  const cached = courseCache.get(cacheKey);
  if (cached) return cached;

  const rows: UnitRow[] = [];
  for (const subject of subjectsOf(course)) {
    const code = subject.code || "";
    if (!code) continue;
    for (const unit of parseSyllabus(subject.content)) {
      rows.push({
        key: `${code}|${unit.id}`,
        code,
        subject: subject.name,
        title: unit.title,
        topics: unit.topics.map((topic) => ({
          topic,
          key: `${course.branch}|${course.sem}|${code}|${topic.id}`,
        })),
      });
    }
  }

  const data = {
    rows,
    seeds: rows.map((row) => ({
      code: row.code,
      subject: row.subject,
      title: row.title,
      topicIds: row.topics.map((entry) => entry.topic.id),
      topicTitles: row.topics.map((entry) => entry.topic.title),
    })),
  };
  courseCache.set(cacheKey, data);
  return data;
}

function emptyPlan(): Schedule {
  return scheduleFor({ units: [], studied: {}, exam: null, minutesPerDay: DEFAULT_MINUTES, now: today() });
}

/* ----------------------------------------------------------------- screen */

function PlannerScreen(props: { nav: Nav }) {
  const routeBranch = param(props.nav, "branch");
  const routeSem = numParam(props.nav, "sem");

  // Re-read the clock on every mount: the module initialises at app start, and
  // a pushed page can be opened later, or after the clock has been set in a test.
  today.set(isoDay(new Date()));
  void load();
  void refreshStudied();

  // A tick made in the syllabus tab while this screen is open, and the day
  // rolling over at midnight, both arrive through this one tick.
  effect(() => {
    const timer = setInterval(poll, 2500);
    cleanup(() => clearInterval(timer));
  });

  return (
    <Screen>
      {() =>
        hydrated() ? (
          <PlannerBody routeBranch={routeBranch} routeSem={routeSem} />
        ) : (
          <Body>
            <Loading label="Reading your plan" />
          </Body>
        )
      }
    </Screen>
  );
}

function PlannerBody(props: { routeBranch: string; routeSem: number }) {
  const choosing = signal(false);
  const settingsOpen = signal(false);
  const draft = signal<Course>({ branch: "", sem: 0 });
  /** True once the chooser has been used, so its pick outranks the route params. */
  const overridden = signal(false);

  const course = (): Course | null => {
    if (overridden()) {
      const picked = choice();
      if (picked) return picked;
    }
    const asked = courseFrom({ branch: props.routeBranch, sem: props.routeSem });
    if (asked) return asked;
    const picked = choice();
    if (picked) return picked;
    const planned = planCourse();
    if (planned) return planned;
    return savedCourse();
  };

  const plan = computed<Schedule>(() => {
    const current = course();
    if (!current) return emptyPlan();
    return scheduleFor({
      units: dataFor(current).seeds,
      studied: studied(),
      exam: planStore()?.exam ?? "",
      minutesPerDay: planStore()?.minutesPerDay || DEFAULT_MINUTES,
      now: today(),
      course: current,
    });
  });

  const save = (patch: Partial<PlannerStore>): void => {
    const current = course();
    const base = planStore();
    const record: PlannerStore = {
      branch: current?.branch ?? base?.branch ?? "",
      sem: current?.sem ?? base?.sem ?? 0,
      exam: patch.exam ?? base?.exam ?? "",
      minutesPerDay: patch.minutesPerDay ?? base?.minutesPerDay ?? DEFAULT_MINUTES,
      at: Date.now(),
    };
    writePlan(record);
  };

  const pickCourse = (next: Course): void => {
    overridden.set(true);
    choice.set(next);
    draft.set(next);
    save({});
  };

  const chooseBranch = (code: string): void => {
    const base = draft();
    const next: Course = { branch: code, sem: base.sem || course()?.sem || 0 };
    draft.set(next);
    if (next.sem >= 1) pickCourse(next);
  };

  const chooseSemester = (sem: number): void => {
    const base = draft();
    const next: Course = { branch: base.branch || course()?.branch || "", sem };
    draft.set(next);
    if (next.branch) pickCourse(next);
  };

  const openChooser = (): void => {
    const current = course();
    draft.set(current ?? { branch: "", sem: 0 });
    choosing.update((value) => !value);
  };

  const toggleSettings = (): void => settingsOpen.update((value) => !value);

  return (
    <View class="flex-1">
      {() => {
        const current = course();
        if (!current) {
          return (
            <Body contentClass="p-4 gap-4 pb-8">
              <SectionHeader title="CHOOSE YOUR COURSE" />
              <Chooser
                draft={draft()}
                hasCourse={false}
                onBranch={chooseBranch}
                onSemester={chooseSemester}
                onDone={() => choosing.set(false)}
              />
            </Body>
          );
        }
        // A course is a plain prop and a component body runs once, so a pick
        // has to rebuild the screen: `Each` keyed by the course does exactly
        // that. The feed version is in the key too, so a live syllabus update
        // cannot leave the units list on the pack the plan no longer uses.
        return (
          <Each of={[`${current.branch}|${current.sem}@${dataVersion()}`]}>
            {() => (
              <PlannerContent
                course={current}
                plan={plan}
                studied={studied}
                choosing={choosing}
                draft={draft}
                settingsOpen={settingsOpen}
                onExam={(iso: string) => save({ exam: iso })}
                onPace={(minutes: number) => save({ minutesPerDay: minutes })}
                onBranch={chooseBranch}
                onSemester={chooseSemester}
                onDone={() => choosing.set(false)}
                onChangeCourse={openChooser}
                onToggleSettings={toggleSettings}
              />
            )}
          </Each>
        );
      }}
    </View>
  );
}

function PlannerContent(props: {
  course: Course;
  plan: Accessor<Schedule>;
  studied: Accessor<Marks>;
  choosing: Accessor<boolean>;
  draft: Accessor<Course>;
  settingsOpen: Accessor<boolean>;
  onExam: (iso: string) => void;
  onPace: (minutes: number) => void;
  onBranch: (code: string) => void;
  onSemester: (sem: number) => void;
  onDone: () => void;
  onChangeCourse: () => void;
  onToggleSettings: () => void;
}) {
  // One accordion for this course: a remount starts closed.
  const open = signal<Record<string, boolean>>({});
  /** The day list shows the first week until asked for the whole run. */
  const expanded = signal(false);
  /** Schedule and Units share one screen; a tab keeps either readable at 320 pt. */
  const view = signal<"schedule" | "units">("schedule");
  const rows = dataFor(props.course).rows;

  // The saved date and pace are read here, in expressions, so setting them does
  // not re-create this component (and the date field keeps its focus).
  const exam = (): string => planStore()?.exam ?? "";
  const pace = (): number => planStore()?.minutesPerDay || DEFAULT_MINUTES;

  const toggleOpen = (key: string): void => {
    open.update((value) => ({ ...value, [key]: !value[key] }));
  };
  const toggleExpanded = (): void => expanded.update((value) => !value);

  const unitsHeading = () => (
    <SectionHeader
      title="Units"
      trailing={
        <View>
          {() => (
            <Badge tone="mint">{`${rows.length} unit${rows.length === 1 ? "" : "s"} · ${props.plan().topicsLeft} left`}</Badge>
          )}
        </View>
      }
    />
  );

  /**
   * The top of the screen, shared by the scrolling page and the units list.
   *
   * The controls read their saved values through `exam`/`pace`/`today` inside
   * their own expressions, so a date or a pace edit does not re-create them.
   */
  const top = (heading: JSX.Element | null) => (
    <View class="gap-4">
      <PlanSummary
        course={props.course}
        plan={props.plan}
        exam={exam}
        minutesPerDay={pace}
        settingsOpen={props.settingsOpen}
        onCourse={props.onChangeCourse}
        onSettings={props.onToggleSettings}
      />

      {() =>
        props.choosing() ? (
          <Chooser
            draft={props.draft()}
            hasCourse
            onBranch={props.onBranch}
            onSemester={props.onSemester}
            onDone={props.onDone}
          />
        ) : null
      }

      {() =>
        props.settingsOpen() ? (
          <PlanSettings
            exam={exam}
            minutesPerDay={pace}
            today={today()}
            onExam={props.onExam}
            onPace={props.onPace}
          />
        ) : null
      }

      <FeasibilityPanel
        plan={props.plan}
        onFixMinutes={(minutes: number) => props.onPace(minutes)}
        onFixDate={(iso: string) => props.onExam(iso)}
      />

      <View class="flex-row gap-2">
        <Chip
          class="flex-1 justify-center"
          active={view() === "schedule"}
          onPress={() => view.set("schedule")}
        >
          Schedule
        </Chip>
        <Chip class="flex-1 justify-center" active={view() === "units"} onPress={() => view.set("units")}>
          Units
        </Chip>
      </View>

      {heading}
    </View>
  );

  return (
    <View class="flex-1">
      {() => {
        // A real semester is 30–110 units, so the units tab virtualises. The
        // summary sits in the list header: one scroll host, never a List in a
        // Scroll, and the top card stays above the rows as they recycle.
        if (view() === "units") {
          return (
            <List
              class="flex-1"
              testID="planner-units"
              each={rows}
              keyExtractor={(row: UnitRow) => row.key}
              estimatedItemSize={176}
              contentClass="gap-2 px-4 pb-8"
              header={<View class="pt-4">{top(rows.length ? unitsHeading() : null)}</View>}
              empty={
                <PlannerEmpty plan={props.plan} onDate={props.onToggleSettings} onCourse={props.onChangeCourse} />
              }
            >
              {(row: () => UnitRow, index: () => number) => (
                <UnitCard
                  row={row()}
                  plan={() => props.plan().units[index()]}
                  dated={() => props.plan().feasibility !== null}
                  studied={props.studied}
                  open={open}
                  onOpen={() => toggleOpen(row().key)}
                  onTopic={toggleTopic}
                />
              )}
            </List>
          );
        }

        return (
          <Body contentClass="p-4 gap-4 pb-8">
            {top(null)}

            {() => {
              const schedule = props.plan();
              if (!schedule.days.length) {
                return (
                  <PlannerEmpty
                    plan={props.plan}
                    onDate={props.onToggleSettings}
                    onCourse={props.onChangeCourse}
                  />
                );
              }
              const shown = expanded() ? schedule.days : schedule.days.slice(0, 7);
              return (
                <View class="gap-2">
                  <SectionHeader
                    title="Day by day"
                    trailing={
                      <Badge tone="mint">{`${schedule.target} topic${schedule.target === 1 ? "" : "s"} a day`}</Badge>
                    }
                  />
                  {shown.map((day) => (
                    <DayCard day={day} today={today()} studied={props.studied} onTopic={toggleTopic} />
                  ))}
                  {schedule.days.length > 7 ? (
                    <Btn variant="ghost" onPress={toggleExpanded}>
                      {expanded() ? "Show the first week" : `Show all ${schedule.days.length} days`}
                    </Btn>
                  ) : null}
                </View>
              );
            }}
          </Body>
        );
      }}
    </View>
  );
}

/* ----------------------------------------------------------------- routes */

export const plannerRoutes: RouteDef[] = [
  {
    name: "planner",
    title: () => "Study planner",
    render: (nav) => <PlannerScreen nav={nav} />,
  },
];
