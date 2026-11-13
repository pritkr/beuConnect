/**
 * Home's directory, in three blocks.
 *
 * Study, Results and Campus are what the student is trying to do — not a flat
 * list of every screen. Every block is one card of identical rows: an icon, a
 * name, and the one live number that belongs to it (topics studied, SGPA,
 * attendance, classes today). A row never repeats its own name in a subtitle,
 * and each destination appears in exactly one block.
 *
 * Notes & VVI and Previous papers are doors of their own; inside a paper they
 * are one action each, not a chip on every topic.
 */

import { Text, View } from "nsh";
import type { Nav, RouteParams } from "../../app/router";
import { EVENTS, track } from "../../lib/analytics";
import { Card, SectionHeader } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import { parseReg } from "../results/data";
import type { Identity } from "../results/identity";
import { daysUntil, parseIso } from "../tools/engine";
import {
  attendance,
  classesToday,
  identity,
  planExam,
  profile,
  routineAt,
  savedResult,
  studiedDone,
} from "./state";
import type { HomeProfile, SavedResult } from "./state";
import { NoticePager } from "./pager";

type Tone = "ember" | "mint" | "amber";

const INK: Record<Tone, string> = {
  ember: "text-primary-ink",
  mint: "text-accent-ink",
  amber: "text-chart-3",
};

/* ------------------------------------------------------------------- shapes */

/**
 * One line in a block: a door, its name, and the live number worth showing.
 *
 * A single row shape for all twelve doors is the point — the eye learns it on
 * the first block and reads the other two without re-learning anything.
 */
function Door(props: {
  title: string;
  /** A live fact, never a description of the screen. "" hides it. */
  value?: string;
  tone: Tone;
  icon: IconName;
  onPress: () => void;
  label: string;
  last?: boolean;
}) {
  return (
    <View
      class={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-muted ${
        props.last ? "" : "border-b border-border"
      }`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
    >
      <Icon name={props.icon} size={19} class={INK[props.tone]} />
      <Text class="flex-1 text-[15px] font-semibold text-foreground" style={{ numberOfLines: 1 }}>
        {props.title}
      </Text>
      {props.value ? (
        <Text class="text-[13px] tabular-nums text-muted-foreground" style={{ numberOfLines: 1 }}>
          {props.value}
        </Text>
      ) : null}
      <Icon name="chevron-right" size={17} class="text-muted-foreground" />
    </View>
  );
}

/* ----------------------------------------------------------------- helpers */

/**
 * Every door on Home is a feature open, and the route already says which one:
 * `results.rank` is the results feature, `tools.calculator` is tools. Wrapping
 * the nav once is why no Door needs its own tracking prop.
 */
function trackedNav(nav: Nav): Nav {
  return {
    route: nav.route,
    push: (name: string, params?: RouteParams) => {
      track(EVENTS.featureOpen, { feature: name.split(".")[0], source: "home" });
      nav.push(name, params);
    },
    pop: (count?: number) => nav.pop(count),
    popToRoot: () => nav.popToRoot(),
    replace: (name: string, params?: RouteParams) => nav.replace(name, params),
  };
}

function courseParams(who: HomeProfile | null): RouteParams {
  return who ? { branch: who.branch, sem: who.sem } : {};
}

function resultParams(saved: SavedResult | null, who: HomeProfile | null): RouteParams {
  if (saved) return { reg: saved.reg, sem: saved.sem };
  return who ? { sem: who.sem } : {};
}

/**
 * The result table is a whole branch, not one student, so it opens on the
 * roster the student is already in: batch and branch read out of their
 * registration number, the semester they last looked at. Nothing is invented —
 * the screen falls back to the newest published semester for whatever is
 * missing, and highlights their row when a registration number is passed.
 */
function tableParams(
  saved: SavedResult | null,
  who: HomeProfile | null,
  person: Identity | null,
): RouteParams {
  const reg = saved?.reg || who?.reg || person?.reg || "";
  const info = reg ? parseReg(reg) : null;
  const params: RouteParams = {};
  if (info?.batch) params.batch = info.batch;
  const branch = person?.branchCode || who?.branch || info?.branch || "";
  if (branch) params.branch = branch;
  const sem = saved?.sem || person?.semester || who?.sem || 0;
  if (sem) params.sem = sem;
  if (reg) params.reg = reg;
  return params;
}

/** "12 days" from the planner's saved exam date; "" when none is set. */
function plannerValue(now: Date): string {
  const exam = planExam();
  if (exam === "" || !parseIso(exam)) return "";
  const days = daysUntil(exam, now);
  if (days < 0) return "";
  return days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ blocks */

export function StudySection(props: { nav: Nav }) {
  const nav = trackedNav(props.nav);
  return (
    <View class="gap-2.5">
      <SectionHeader title="Study" />
      {() => {
        const done = studiedDone();
        const who = profile();
        const now = new Date();
        return (
          <Card class="p-0">
            <Door
              title="Syllabus"
              value={done > 0 ? `${done} studied` : ""}
              tone="mint"
              icon="book-open"
              onPress={() => nav.push("syllabus")}
              label="Open the syllabus"
            />
            <Door
              title="Notes & VVI"
              tone="ember"
              icon="note"
              onPress={() => nav.push("notes", courseParams(who))}
              label="Open Notes & VVI"
            />
            <Door
              title="Previous papers"
              tone="amber"
              icon="file-blank"
              onPress={() => nav.push("pyqs")}
              label="Open previous year papers"
            />
            <Door
              title="Calculator"
              tone="amber"
              icon="calculator"
              onPress={() => nav.push("tools.calculator")}
              label="Open the SGPA calculator"
            />
            <Door
              title="Study planner"
              value={plannerValue(now)}
              tone="mint"
              icon="calendar-check"
              last
              onPress={() => nav.push("planner", courseParams(who))}
              label="Open the study planner"
            />
          </Card>
        );
      }}
    </View>
  );
}

export function ResultsSection(props: { nav: Nav }) {
  const nav = trackedNav(props.nav);
  return (
    <View class="gap-2.5">
      <SectionHeader title="Results" />
      {() => {
        const saved = savedResult();
        const who = profile();
        const params = resultParams(saved, who);
        return (
          <Card class="p-0">
            <Door
              title="Your result"
              value={saved && saved.sgpa !== null ? saved.sgpa.toFixed(2) : ""}
              tone="ember"
              icon="bar-chart-alt-2"
              onPress={() => nav.push("results", params)}
              label="Open your result"
            />
            <Door
              title="Result table"
              tone="ember"
              icon="table"
              onPress={() => nav.push("results.table", tableParams(saved, who, identity()))}
              label="Open the result table"
            />
            <Door
              title="University rank"
              tone="ember"
              icon="medal"
              onPress={() => nav.push("results.rank", params)}
              label="Open the university rank"
            />
            <Door
              title="Merit list"
              tone="amber"
              icon="trophy"
              onPress={() => nav.push("results.merit", courseParams(who))}
              label="Open the merit list"
            />
            <Door
              title="Result battle"
              tone="mint"
              icon="git-compare"
              last
              onPress={() => nav.push("results.battle")}
              label="Open result battle"
            />
          </Card>
        );
      }}
    </View>
  );
}

export function CampusSection(props: { nav: Nav; onRefresh: () => void }) {
  const nav = trackedNav(props.nav);
  return (
    <View class="gap-2.5">
      <SectionHeader title="Campus" />
      <NoticePager nav={props.nav} onRefresh={props.onRefresh} />
      {() => {
        const sum = attendance();
        const today = classesToday();
        const hasRoutine = routineAt() > 0;
        return (
          <Card class="p-0">
            <Door
              title="Attendance"
              value={sum ? `${sum.percent}%` : ""}
              tone="mint"
              icon="user-check"
              onPress={() => nav.push("tools.attendance")}
              label="Open attendance"
            />
            <Door
              title="Routine"
              value={hasRoutine ? (today.length > 0 ? `${today.length} today` : "None today") : ""}
              tone="ember"
              icon="calendar-week"
              onPress={() => nav.push("tools.routine")}
              label="Open the routine"
            />
            <Door
              title="Holidays"
              tone="amber"
              icon="calendar-star"
              last
              onPress={() => nav.push("tools.holidays")}
              label="Open the holiday list"
            />
          </Card>
        );
      }}
    </View>
  );
}
