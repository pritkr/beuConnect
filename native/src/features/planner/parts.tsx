/**
 * The planner's presentation: the summary card, the feasibility panel, the
 * setup cards, one day card and one unit card.
 *
 * Nothing here owns state. Signals live in `./index.tsx`, and every value that
 * changes arrives as an accessor (`plan`, `studied`, `open`) so the expressions
 * inside the JSX keep re-reading it. A `const total = …` above the JSX would
 * freeze at first paint; that is why each derived number is computed inside the
 * expression that shows it.
 *
 * The day card is the plan's unit of work: two to four tappable topics, or one
 * revision day, or a free day with nothing left to place. Ticking a topic is the
 * same studied mark the syllabus screens write, so the label says so.
 */

import { Text, View, signal, type Accessor } from "nsh";

import { Badge, Btn, Card, Check, Chip, Divider, EmptyState, Field, Label, Muted, Panel, Progress, Stat } from "../../ui";
import { BRANCH_META } from "../syllabus/data/packs";
import type { Topic } from "../syllabus/parse";
import {
  PACES,
  TOPIC_MINUTES,
  addDays,
  isoDay,
  parseDay,
  type Feasibility,
  type PlanFix,
  type Schedule,
  type ScheduleDay,
  type ScheduledUnit,
} from "./plan";

/* ------------------------------------------------------------------- types */

export interface Course {
  branch: string;
  sem: number;
}

/** One tappable topic, with the exact key the syllabus store uses. */
export interface UnitTopic {
  topic: Topic;
  key: string;
}

/** One unit of one subject, ready to render. */
export interface UnitRow {
  /** `code|unitId`, unique inside a semester. */
  key: string;
  code: string;
  subject: string;
  title: string;
  topics: UnitTopic[];
}

export type Marks = Readonly<Record<string, boolean>>;

/* ----------------------------------------------------------------- helpers */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const QUICK_DATES = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
];

/** "CSE" — the short name the rest of the app uses. */
export function branchShort(code: string): string {
  return BRANCH_META.find((item) => item.code === code)?.short ?? code.toUpperCase();
}

function branchName(code: string): string {
  return BRANCH_META.find((item) => item.code === code)?.name ?? code.toUpperCase();
}

/** "Mon 26 Oct" from the stored `YYYY-MM-DD`. */
export function dayLabel(iso: string): string {
  const date = iso ? parseDay(iso) : null;
  if (!date) return "";
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Mon 26 Oct 2026" — the long form, used where a year could be in doubt. */
export function longDayLabel(iso: string): string {
  const date = iso ? parseDay(iso) : null;
  if (!date) return "";
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 2.4 → "2.4", 2 → "2", 0.25 → "0.3": never a long float in a stat. */
export function paceLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function topicCount(count: number): string {
  return `${count} topic${count === 1 ? "" : "s"}`;
}

function daysTitle(plan: Schedule): string {
  if (plan.feasibility === null) return "No exam date";
  if (plan.examInDays < 0) return "Exam date passed";
  if (plan.daysLeft === 0) return "Exam is today";
  if (plan.daysLeft === 1) return "One day left";
  return `${plan.daysLeft} days left`;
}

function doneIn(plan: ScheduledUnit | undefined, total: number): number {
  return Math.min(total, Math.max(0, plan?.done ?? 0));
}

function complete(plan: ScheduledUnit | undefined, total: number): boolean {
  return total > 0 && doneIn(plan, total) >= total;
}

function dayText(plan: ScheduledUnit | undefined, total: number, dated: boolean): string {
  if (complete(plan, total)) return "Done";
  const start = plan?.startDay ?? 0;
  if (start > 0) {
    const end = plan?.endDay ?? start;
    return start === end ? `Day ${start}` : `Day ${start}–${end}`;
  }
  if (!dated) return "No date";
  return (plan?.left ?? 0) > 0 ? "No room" : "No date";
}

function dayTone(plan: ScheduledUnit | undefined, total: number, dated: boolean): "mint" | "ember" | "neutral" {
  if (complete(plan, total)) return "mint";
  if ((plan?.startDay ?? 0) > 0) return "ember";
  if (!dated) return "neutral";
  return (plan?.left ?? 0) > 0 ? "ember" : "neutral";
}

function fixLabel(fix: PlanFix): string {
  if (fix.kind === "minutes") return `Study ${fix.minutes} min a day`;
  return `Move the date to ${dayLabel(fix.date)}`;
}

/** The one sentence the top card owes the student: where they stand on pace. */
function verdictText(plan: Schedule): string {
  if (plan.feasibility === null) return "No exam date, so no verdict yet.";
  if (plan.topicsLeft === 0) return "Every topic is ticked.";
  if (plan.verdict === "behind") return "Behind the pace you picked.";
  if (plan.verdict === "on track") return "On track at the pace you picked.";
  return "Ahead of the pace you picked.";
}

function verdictInk(plan: Schedule): string {
  if (plan.feasibility === null || plan.topicsLeft === 0) return "text-muted-foreground";
  if (plan.verdict === "behind") return "text-primary-ink";
  if (plan.verdict === "ahead") return "text-accent-ink";
  return "text-foreground";
}

/* ----------------------------------------------------------------- summary */

/**
 * The one card that answers "where am I?".
 *
 * The countdown, the pace and the three stats all read `plan()` inside their
 * own expressions, so the card updates the moment a topic is ticked without
 * being rebuilt (which would drop the date field's focus).
 */
export function PlanSummary(props: {
  course: Course;
  plan: Accessor<Schedule>;
  exam: Accessor<string>;
  minutesPerDay: Accessor<number>;
  settingsOpen: Accessor<boolean>;
  onCourse: () => void;
  onSettings: () => void;
}) {
  return (
    <Card class="overflow-hidden gap-4">
      <View class="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-primary/12" pointerEvents="none" />
      <View class="absolute -right-2 top-20 h-20 w-20 rounded-full bg-accent/12" pointerEvents="none" />

      <View class="gap-1">
        <View class="flex-row items-center justify-between gap-2">
          <Label class="flex-1">{`${branchShort(props.course.branch)} · SEMESTER ${props.course.sem}`}</Label>
          <Chip label="Change course" onPress={props.onCourse}>Course</Chip>
        </View>
        <Text class="text-[26px] font-bold leading-8 tracking-tight text-foreground" numberOfLines={2}>
          {daysTitle(props.plan())}
        </Text>
        <View class="flex-row items-center gap-2">
          <Muted class="flex-1" numberOfLines={2}>
            {`${props.exam() ? longDayLabel(props.exam()) : "No exam date yet"} · ${props.minutesPerDay()} min a day`}
          </Muted>
          <Chip
            active={props.settingsOpen()}
            label="Exam date and minutes a day"
            onPress={props.onSettings}
          >
            Dates
          </Chip>
        </View>
        <Text class={`text-[12px] font-semibold leading-5 ${verdictInk(props.plan())}`} numberOfLines={2}>
          {verdictText(props.plan())}
        </Text>
      </View>

      <View class="flex-row gap-2">
        <Stat
          value={props.plan().feasibility === null ? "—" : String(props.plan().daysLeft)}
          label="Days"
          hint="left"
        />
        <Stat value={String(props.plan().topicsLeft)} label="Topics" hint="left" />
        <Stat
          value={
            props.plan().topicsLeft === 0 || props.plan().daysLeft === 0
              ? "—"
              : paceLabel(props.plan().perDay)
          }
          label="Per day"
          hint="topics"
        />
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------- feasibility */

function feasibilityTone(feasibility: Feasibility): "mint" | "ember" | "amber" {
  if (feasibility.state === "fits") return "mint";
  if (feasibility.state === "done" || feasibility.state === "no-topics") return "mint";
  if (feasibility.state === "short") return "ember";
  return "amber";
}

/**
 * "Does this work?" — the sentence and the one fix, never a second suggestion.
 *
 * The fix is a single button: raising the pace writes the new minutes, moving
 * the date writes the new date. Both land on a value the planner already
 * computed, so the student never has to invent one.
 */
export function FeasibilityPanel(props: {
  plan: Accessor<Schedule>;
  onFixMinutes: (minutes: number) => void;
  onFixDate: (iso: string) => void;
}) {
  return (
    <View>
      {() => {
        const feasibility = props.plan().feasibility;
        // The empty states own no-date, no-topics, done and past/today; the
        // panel speaks only when there is a plan to judge.
        if (!feasibility) return null;
        if (feasibility.state !== "fits" && feasibility.state !== "short") return null;
        const fix = feasibility.fix;
        return (
          <Panel tone={feasibilityTone(feasibility)} class="gap-2">
            <Text class="text-[13px] font-semibold leading-5 text-foreground">{feasibility.message}</Text>
            {feasibility.detail ? (
              <Muted class="text-[12px] leading-5">{feasibility.detail}</Muted>
            ) : null}
            {fix ? (
              <Btn
                variant="secondary"
                onPress={() => {
                  if (fix.kind === "minutes") props.onFixMinutes(fix.minutes);
                  else props.onFixDate(fix.date);
                }}
              >
                {fixLabel(fix)}
              </Btn>
            ) : null}
          </Panel>
        );
      }}
    </View>
  );
}

/* ------------------------------------------------------------------ setup */

/**
 * Exam date and daily pace — the two inputs the plan is a function of.
 *
 * The field keeps its own `draft` so a half-typed date is never written to the
 * store: typing above the JSX would freeze, so the draft is read inside it.
 */
export function PlanSettings(props: {
  exam: Accessor<string>;
  minutesPerDay: Accessor<number>;
  /** Today as `YYYY-MM-DD`, so a quick chip is the same day the plan counts from. */
  today: string;
  onExam: (iso: string) => void;
  onPace: (minutes: number) => void;
}) {
  // The half-typed field: null means "show the saved date". A partial date is
  // never written to the store, so a stray keypress cannot move the plan.
  const draft = signal<string | null>(null);
  const type = (value: string): void => {
    const text = value.slice(0, 10);
    draft.set(text);
    if (text.trim() === "") {
      props.onExam("");
      return;
    }
    const date = parseDay(text);
    if (date) props.onExam(isoDay(date));
  };

  const quickDay = (days: number): string => {
    const base = parseDay(props.today);
    return base ? isoDay(addDays(base, days)) : "";
  };

  return (
    <Card class="gap-3">
      <View class="flex-row items-center justify-between gap-2">
        <Label class="flex-1">Exam date</Label>
        {props.exam() ? (
          <Chip
            label="Clear the exam date"
            onPress={() => {
              draft.set(null);
              props.onExam("");
            }}
          >
            Clear
          </Chip>
        ) : null}
      </View>

      <Field
        value={draft() ?? props.exam()}
        onChange={type}
        placeholder="YYYY-MM-DD"
        maxLength={10}
      />

      <View class="flex-row flex-wrap gap-2">
        {QUICK_DATES.map((quick) => (
          <Chip
            active={props.exam() !== "" && props.exam() === quickDay(quick.days)}
            onPress={() => {
              const day = quickDay(quick.days);
              if (!day) return;
              draft.set(null);
              props.onExam(day);
            }}
          >
            {quick.label}
          </Chip>
        ))}
      </View>

      <Divider />

      <View class="gap-2">
        <Label>MINUTES A DAY</Label>
        <View class="flex-row flex-wrap gap-2">
          {PACES.map((minutes) => (
            <Chip active={props.minutesPerDay() === minutes} onPress={() => props.onPace(minutes)}>
              {`${minutes} min`}
            </Chip>
          ))}
        </View>
      </View>
    </Card>
  );
}

/* ----------------------------------------------------------------- chooser */

/**
 * Branch and semester, as two rows of chips.
 *
 * A course needs both halves, so a branch tap alone only completes the choice
 * when a semester is already selected — the parent decides when to apply and
 * keeps this card open while it is open on purpose.
 */
export function Chooser(props: {
  draft: Course;
  hasCourse: boolean;
  onBranch: (code: string) => void;
  onSemester: (sem: number) => void;
  onDone: () => void;
}) {
  return (
    <Card class="gap-4">
      <View class="gap-1">
        <Label>Course</Label>
        <Text class="text-[19px] font-bold leading-6 tracking-tight text-foreground" numberOfLines={2}>
          {props.draft.branch ? branchName(props.draft.branch) : "Pick your branch and semester"}
        </Text>
      </View>

      <View class="gap-2">
        <Label>BRANCH</Label>
        <View class="flex-row flex-wrap gap-2">
          {BRANCH_META.map((item) => (
            <Chip active={props.draft.branch === item.code} onPress={() => props.onBranch(item.code)}>
              {item.short}
            </Chip>
          ))}
        </View>
      </View>

      <View class="gap-2">
        <Label>SEMESTER</Label>
        <View class="flex-row flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
            <Chip active={props.draft.sem === value} onPress={() => props.onSemester(value)}>
              {`Sem ${value}`}
            </Chip>
          ))}
        </View>
      </View>

      {props.hasCourse ? (
        <Btn variant="ghost" onPress={props.onDone}>
          Done
        </Btn>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------- days */

/**
 * One topic, tappable, with the studied mark it reads and writes.
 *
 * The checkbox reflects the shared `beu.syllabus.studied` record — not local
 * state — so a tick made in the syllabus tab while this screen is open shows up
 * here on the next read.
 */
export function TopicTick(props: {
  title: string;
  meta: string;
  studiedKey: string;
  studied: Accessor<Marks>;
  onTick: () => void;
}) {
  return (
    <View class="flex-row items-start gap-1 rounded-2xl pr-1">
      <Check
        checked={props.studied()[props.studiedKey] === true}
        onPress={props.onTick}
        label={`${props.title}, studied`}
        class="mt-0.5"
      />
      <View class="flex-1 gap-0.5 py-3">
        <Text
          class={`text-[13px] leading-5 ${
            props.studied()[props.studiedKey] === true ? "text-muted-foreground" : "text-foreground"
          }`}
          numberOfLines={2}
        >
          {props.title}
        </Text>
        <Muted class="text-[11px]" numberOfLines={1}>
          {props.meta}
        </Muted>
      </View>
    </View>
  );
}

/**
 * One day of the plan: the topics it carries, or the revision buffer, or a day
 * with nothing left to place.
 *
 * Revision days are the last ~15% of the window and are labelled as such — the
 * plan never pretends a revision day is a teaching day.
 */
export function DayCard(props: {
  day: ScheduleDay;
  today: string;
  studied: Accessor<Marks>;
  onTopic: (key: string) => void;
}) {
  if (props.day.kind === "revision") {
    return (
      <Panel tone="amber" class="gap-1">
        <View class="flex-row items-baseline justify-between gap-2">
          <Label>Revision</Label>
          <Muted class="tabular-nums">{dayLabel(props.day.date)}</Muted>
        </View>
        <Text class="text-[14px] font-semibold leading-5 text-foreground">No new topics</Text>
      </Panel>
    );
  }

  if (props.day.kind === "free") {
    return (
      <Card class="min-h-11 flex-row items-center justify-between gap-2">
        <Label>{`Day ${props.day.day}`}</Label>
        <Muted class="tabular-nums">
          {`${dayLabel(props.day.date)}${props.day.date === props.today ? " · today" : ""} · free`}
        </Muted>
      </Card>
    );
  }

  return (
    <Card class="gap-2">
      <View class="flex-row items-baseline justify-between gap-2">
        <Label>{`Day ${props.day.day}`}</Label>
        <Muted class="tabular-nums">
          {`${dayLabel(props.day.date)}${props.day.date === props.today ? " · today" : ""}`}
        </Muted>
      </View>
      <View class="flex-row items-center justify-between gap-2">
        <Text class="text-[13px] font-semibold text-foreground">{topicCount(props.day.topics.length)}</Text>
        <Muted class="text-[11px] tabular-nums">{`${props.day.topics.length * TOPIC_MINUTES} min`}</Muted>
      </View>
      <Divider />
      <View class="gap-1">
        {props.day.topics.map((topic) => (
          <TopicTick
            title={topic.title}
            meta={`${topic.code} · ${topic.unit}`}
            studiedKey={topic.key}
            studied={props.studied}
            onTick={() => props.onTopic(topic.key)}
          />
        ))}
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------------- unit */

/**
 * One unit: its subject, the days the plan gave it, and its topics behind a tap.
 *
 * `studied` is the live syllabus marks and `open` is the accordion; both are
 * read inside the JSX so a tick or a tap repaints the row without the list
 * rebuilding.
 */
export function UnitCard(props: {
  row: UnitRow;
  /** The unit after the latest plan; a list cell re-reads it after every tick. */
  plan: Accessor<ScheduledUnit | undefined>;
  /** False until an exam date exists, so 0/0 reads "No date", not "No room". */
  dated: Accessor<boolean>;
  studied: Accessor<Marks>;
  open: Accessor<Record<string, boolean>>;
  onOpen: () => void;
  onTopic: (key: string) => void;
}) {
  return (
    <Card class="overflow-hidden p-0">
      <View
        class="min-h-11 gap-2 p-4 active:bg-muted"
        onPress={props.onOpen}
        role="button"
        accessibilityLabel={`${props.row.subject}, ${props.row.title}`}
        accessibilityHint="Shows or hides the topics in this unit"
      >
        <View class="flex-row items-center gap-2">
          <Label class="flex-1">{props.row.code}</Label>
          <Badge tone={dayTone(props.plan(), props.row.topics.length, props.dated())}>
            {dayText(props.plan(), props.row.topics.length, props.dated())}
          </Badge>
        </View>

        <Muted class="text-[12px] leading-4" numberOfLines={1}>
          {props.row.subject}
        </Muted>

        <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {props.row.title}
        </Text>

        <Progress
          value={
            props.row.topics.length
              ? (doneIn(props.plan(), props.row.topics.length) / props.row.topics.length) * 100
              : 0
          }
          tone={complete(props.plan(), props.row.topics.length) ? "mint" : "ember"}
          class="h-1.5"
          label={`${props.row.title} progress`}
        />

        <View class="flex-row items-center justify-between gap-2">
          <Muted class="flex-1 text-[11px] tabular-nums" numberOfLines={1}>
            {`${doneIn(props.plan(), props.row.topics.length)} of ${props.row.topics.length} done`}
          </Muted>
          <Text class="text-[12px] font-semibold text-primary-ink" numberOfLines={1}>
            {props.open()[props.row.key] ? "Hide" : "Topics"}
          </Text>
        </View>
      </View>

      {props.open()[props.row.key] ? (
        <View class="border-t border-border px-2 pb-2 pt-1">
          {props.row.topics.map((entry) => (
            <TopicTick
              title={entry.topic.title}
              meta={entry.topic.hours ? `${props.row.code} · ${entry.topic.hours}` : props.row.code}
              studiedKey={entry.key}
              studied={props.studied}
              onTick={() => props.onTopic(entry.key)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------- empty */

/**
 * What stands where the schedule would be, and the one action that fixes it.
 *
 * The state comes from the plan, not from a placeholder: no date, no parsed
 * syllabus, a finished course and a passed date are four different sentences
 * and never a made-up day one.
 */
export function PlannerEmpty(props: {
  plan: Accessor<Schedule>;
  onDate: () => void;
  onCourse: () => void;
}) {
  return (
    <View class="py-4">
      {() => {
        const schedule = props.plan();
        if (schedule.total === 0) {
          return (
            <EmptyState
              title="No syllabus for this course"
              hint="No parsed papers in this semester."
              action="Pick another course"
              onAction={props.onCourse}
            />
          );
        }
        const state = schedule.feasibility?.state ?? "no-date";
        const feasibility = schedule.feasibility;
        if (state === "done") {
          return <EmptyState title="Every topic is ticked" />;
        }
        if (state === "past" || state === "today") {
          return (
            <EmptyState
              title={state === "past" ? "The exam date has passed" : "The exam is today"}
              hint={feasibility?.message ?? "There is no day left before the exam."}
              action="Set a new date"
              onAction={props.onDate}
            />
          );
        }
        return (
          <EmptyState
            title="No exam date"
            action="Set the exam date"
            onAction={props.onDate}
          />
        );
      }}
    </View>
  );
}
