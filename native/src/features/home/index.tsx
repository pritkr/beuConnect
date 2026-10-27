/**
 * Home — the front door, arranged by what a student is trying to do.
 *
 * Four blocks, in the order a day actually runs: Today (the next class, the
 * closest break or exam, the one action that matters now), Study, Results,
 * Campus. The three directory blocks share a single row shape, so the page
 * reads as one list of doors rather than four different card styles.
 *
 * Every number is read back from something the student saved (`state.ts`),
 * never invented. A door with nothing to say says nothing.
 */

import { Text, View, effect, signal, untracked } from "nsh";
import type { Nav, RouteDef, RouteParams } from "../../app/router";
import { Body, Label, Row, Screen, SectionHeader, Skeleton } from "../../ui";
import { Icon } from "../../ui/icons";
import { formatDate } from "../../lib/net";
import { daysUntil, isoDate, parseIso } from "../tools/engine";
import { nextHoliday } from "../tools/holidays-data";
import {
  classesToday,
  identity,
  minutesOf,
  planExam,
  profile,
  ready,
  refreshHome,
  routineAt,
  savedResult,
  shortBranch,
} from "./state";
import type { HomeClass, HomeProfile } from "./state";
import type { Identity } from "../results/identity";
import { CampusSection, ResultsSection, StudySection } from "./tiles";
import { ensureBoard } from "./pager";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Tone = "ember" | "mint" | "plain";

interface Action {
  eyebrow: string;
  title: string;
  /** A fact about the state — a time, a name. Never a description of the screen. */
  hint?: string;
  cta: string;
  route: string;
  params?: RouteParams;
  tone: Tone;
  stat?: string;
  statLabel?: string;
}

const TONE: Record<Tone, string> = {
  ember: "border-primary/25 bg-primary/8",
  mint: "border-accent/25 bg-accent/10",
  plain: "border-border bg-muted",
};

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/* -------------------------------------------------------------------- hero */

/**
 * The greeting line.
 *
 * `first` is not computed above the JSX on purpose: the name arrives after the
 * first paint (a cache read, then maybe a roster fetch), and only expressions
 * inside the tree re-read their props when that happens. A `const first` here
 * would freeze the greeting at "Still up." for the life of the screen.
 */
function greetingLine(hour: number, raw: string): string {
  const first = raw.trim().split(/\s+/)[0] ?? "";
  return first ? `${greeting(hour)}, ${first}.` : `${greeting(hour)}.`;
}

/** The letter on the avatar: the student's own initial, `B` when nobody is known. */
function initialOf(raw: string): string {
  const first = raw.trim().split(/\s+/)[0] ?? "";
  return first ? first.slice(0, 1).toUpperCase() : "B";
}

function Hero(props: { who: HomeProfile | null; whoIs: Identity | null }) {
  const now = new Date();
  // The name comes from the results layer when it knows the registration
  // number, so a student who typed only their number is still greeted by name.
  const known = (): string => (props.whoIs?.name || props.who?.name || "").trim();
  // The class the student is in now. `Identity` derives its semester from the
  // batch (`currentSemester`), so a roster that is two semesters behind never
  // pins the greeting to a class the student has already left.
  const course = (): string => {
    const branch = props.whoIs?.branchName || props.who?.branch || "";
    const sem = props.whoIs?.semester ?? props.who?.sem ?? 0;
    if (branch === "" || sem < 1) return "";
    const code = shortBranch(branch);
    return code ? `${code} · Sem ${sem}` : `Sem ${sem}`;
  };

  return (
    <View class="gap-1">
      <Row class="justify-between gap-3">
        <Label>{`${WEEKDAYS[now.getDay()].slice(0, 3)} · ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`}</Label>
        <View class="h-9 w-9 items-center justify-center rounded-2xl bg-primary">
          <Text class="text-[14px] font-bold text-primary-foreground">{initialOf(known())}</Text>
        </View>
      </Row>
      <Text class="mt-1 text-[26px] font-bold leading-8 tracking-tight text-foreground" numberOfLines={2}>
        {greetingLine(now.getHours(), known())}
      </Text>
      {course() ? (
        <Text class="text-[13px] text-muted-foreground" numberOfLines={1}>
          {course()}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ search */

function SearchDoor(props: { nav: Nav }) {
  return (
    <View
      class="min-h-11 flex-row items-center gap-2 rounded-full border border-border-strong bg-card px-4 active:bg-muted"
      onPress={() => props.nav.push("search")}
      role="button"
      accessibilityLabel="Search"
    >
      <Icon name="search" size={16} class="text-muted-foreground" />
      <Text class="text-[13px] text-muted-foreground">Search</Text>
    </View>
  );
}

/* -------------------------------------------------------------- next action */

/** `{ branch, sem }` for a screen that already reads the saved course. */
function courseParams(who: HomeProfile | null): RouteParams {
  return who ? { branch: who.branch, sem: who.sem } : {};
}

function inDays(days: number): string {
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * The single thing worth doing now, in priority order:
 *   a class is running or still to come → Routine
 *   the routine is saved but today is done → Routine (the week is there)
 *   an exam is within three weeks      → Planner
 *   a result is saved on the phone     → that result
 *   a course is saved                  → Planner (set the exam date)
 *   nothing is saved yet               → Profile (save the course first)
 */
function pick(now: Date): Action {
  const minute = now.getHours() * 60 + now.getMinutes();
  const today = classesToday();
  const left = today.filter((item: HomeClass) => minutesOf(item.end) > minute);

  if (left.length > 0) {
    const current = left.find((item) => minutesOf(item.start) <= minute) ?? null;
    const first = current ?? left[0];
    const room = first.room ? ` · Room ${first.room}` : "";
    return {
      eyebrow: current ? "Now" : "Next class",
      title: current ? `In ${current.subject} now` : `${left.length} class${left.length === 1 ? "" : "es"} left today`,
      hint: current ? `${current.start}–${current.end}${room}` : `${first.start}–${first.end} · ${first.subject}${room}`,
      cta: "Open routine",
      route: "tools.routine",
      tone: "mint",
      stat: current ? current.end : first.start,
      statLabel: current ? "ends" : "next",
    };
  }

  if (routineAt() > 0) {
    return {
      eyebrow: "Routine",
      title: today.length > 0 ? "Classes are done for today" : "No classes today",
      cta: "Open routine",
      route: "tools.routine",
      tone: "mint",
    };
  }

  const exam = planExam();
  const examDays = exam !== "" && parseIso(exam) ? daysUntil(exam, now) : -1;
  if (examDays >= 0 && examDays <= 21) {
    const who = profile();
    return {
      eyebrow: "Exam",
      title: examDays === 0 ? "Your exam is today" : `${inDays(examDays)} to your exam`,
      hint: formatDate(exam),
      cta: "Open planner",
      route: "planner",
      params: courseParams(who),
      tone: "ember",
      stat: examDays > 0 ? String(examDays) : undefined,
      statLabel: examDays > 0 ? "days" : undefined,
    };
  }

  const result = savedResult();
  if (result) {
    return {
      eyebrow: "Saved result",
      title: `Semester ${result.sem} result`,
      hint: result.name,
      cta: "Open result",
      route: "results",
      params: { reg: result.reg, sem: result.sem },
      tone: "ember",
      stat: result.sgpa !== null ? result.sgpa.toFixed(2) : undefined,
      statLabel: result.sgpa !== null ? "SGPA" : undefined,
    };
  }

  const who = profile();
  if (who) {
    return {
      eyebrow: "Study planner",
      title: "Set your exam date",
      cta: "Open planner",
      route: "planner",
      params: courseParams(who),
      tone: "plain",
    };
  }

  return {
    eyebrow: "First step",
    title: "Save your course",
    cta: "Set up",
    route: "settings.profile",
    tone: "plain",
  };
}

/**
 * The focus card: one action, and the two facts a student checks next.
 *
 * The break and exam countdowns live in the same card as the action instead of
 * two tinted tiles of their own — three facts, one surface, one border.
 */
function NextAction(props: { nav: Nav }) {
  return (
    <View class="gap-2.5">
      {() => {
        if (!ready()) {
          return (
            <View class={`gap-2 rounded-3xl border p-4 ${TONE.plain}`}>
              <Skeleton h={11} w={70} />
              <Skeleton h={20} w={210} />
              <Skeleton h={12} w={160} />
            </View>
          );
        }
        const now = new Date();
        const action = pick(now);
        const holiday = nextHoliday(isoDate(now));
        const breakDays = holiday ? Math.max(0, daysUntil(holiday.start, now)) : -1;
        const exam = planExam();
        const examDays = exam !== "" && parseIso(exam) ? daysUntil(exam, now) : -1;
        const facts: { label: string; value: string }[] = [];
        if (holiday) facts.push({ label: "Next break", value: `${inDays(breakDays)} · ${holiday.label}` });
        if (examDays >= 0) facts.push({ label: "Next exam", value: `${inDays(examDays)} · ${formatDate(exam)}` });

        return (
          <View
            class={`gap-3 rounded-3xl border p-4 active:scale-[0.99] ${TONE[action.tone]}`}
            onPress={() => props.nav.push(action.route, action.params ?? {})}
            role="button"
            accessibilityLabel={`${action.eyebrow}: ${action.title}. ${action.cta}`}
          >
            <Row class="justify-between gap-2">
              <Label>{action.eyebrow}</Label>
              <Row class="gap-1">
                <Text class="text-[12px] font-semibold text-primary-ink">{action.cta}</Text>
                <Icon name="chevron-right" size={15} class="text-primary-ink" />
              </Row>
            </Row>
            <Row class="items-end justify-between gap-3">
              <View class="flex-1 gap-1">
                <Text class="text-[19px] font-semibold leading-6 tracking-tight text-foreground" numberOfLines={2}>
                  {action.title}
                </Text>
                {action.hint ? (
                  <Text class="text-[12px] leading-4 tabular-nums text-muted-foreground" numberOfLines={2}>
                    {action.hint}
                  </Text>
                ) : null}
              </View>
              {action.stat ? (
                <View class="items-end justify-center">
                  <Text class="text-[26px] font-bold leading-8 tabular-nums tracking-tight text-foreground">
                    {action.stat}
                  </Text>
                  <Label class="text-[10px]">{action.statLabel ?? ""}</Label>
                </View>
              ) : null}
            </Row>
            {facts.length > 0 ? (
              <View class="gap-1.5 border-t border-border/70 pt-2.5">
                {facts.map((fact) => (
                  <Row class="justify-between gap-3">
                    <Text class="text-[11px] text-muted-foreground">{fact.label}</Text>
                    <Text class="text-[11px] font-semibold tabular-nums text-foreground" numberOfLines={1}>
                      {fact.value}
                    </Text>
                  </Row>
                ))}
              </View>
            ) : null}
          </View>
        );
      }}
    </View>
  );
}

/* ------------------------------------------------------------------ screen */

function Today(props: { nav: Nav }) {
  return (
    <View class="gap-2.5">
      <SectionHeader title="Today" />
      <NextAction nav={props.nav} />
    </View>
  );
}

function HomeScreen(props: { nav: Nav }) {
  const refreshing = signal(false);

  effect(() => {
    untracked(() => {
      void refreshHome();
      void ensureBoard();
    });
  });

  const refresh = (): void => {
    if (refreshing()) return;
    refreshing.set(true);
    void Promise.allSettled([refreshHome(), ensureBoard(true)]).then(() => refreshing.set(false));
  };

  return (
    <Screen>
      <Body
        testID="home-scroll"
        contentClass="p-4 pb-12 items-center"
        refreshing={refreshing()}
        onRefresh={refresh}
      >
        <View class="w-full max-w-[560px] gap-5">
          {() => <Hero who={profile()} whoIs={identity()} />}
          <SearchDoor nav={props.nav} />
          <Today nav={props.nav} />
          <StudySection nav={props.nav} />
          <ResultsSection nav={props.nav} />
          <CampusSection nav={props.nav} onRefresh={refresh} />
        </View>
      </Body>
    </Screen>
  );
}

export const homeRoutes: RouteDef[] = [
  { name: "home", title: () => "BEUConnect", render: (nav) => <HomeScreen nav={nav} /> },
];
