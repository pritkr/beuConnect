/**
 * Attendance, with the only arithmetic students actually want:
 *
 *   "I am at 15 of 20 — how many can I still miss?"
 *   "I am at 10 of 20 — how many must I attend in a row?"
 *
 * Both answers come from `attendanceAdvice` in `engine.ts` (one place, one
 * rounding), are shown overall and per paper, and are stored on the device.
 * Counts can be typed in when a student joins mid-semester; every Present /
 * Absent tap is dated (today by default, or an earlier day) and can be taken
 * back, so the log never skews the maths.
 *
 * The advice can only say "can miss" while the exact percentage is at or above
 * the target — `attendanceStatus` decides that, and this screen never computes
 * a percentage of its own.
 *
 * A paper whose college publishes attendance through GECS can pull its counts
 * from the register instead of being tapped in. That sync only replaces the two
 * numbers the maths reads; a hand-typed paper and the date log are left alone.
 */

import { Text, View, computed, signal } from "nsh";
import { formatDate } from "../../lib/net";
import { Badge, Body, Btn, Card, Chip, Col, Divider, EmptyState, Field, Label, Muted, Progress, Ring, Row, Screen, SectionHeader } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import type { AttendanceAdvice } from "./engine";
import { addDays, attendanceAdvice, dayLabel, parseIso } from "./engine";
import { WEEKDAYS, monthCells, monthLabel } from "./calendar";
import type { GecsError, GecsPaper, GecsSnapshot } from "./gecs";
import {
  clearGecsCache,
  fetchStudent,
  guardianMobileError,
  readGecsCache,
  registrationError,
  validate,
  writeGecsCache,
} from "./gecs";
import { IconButton, Stepper } from "./kit";
import {
  askDestructive,
  entryDay,
  entriesOn,
  logDayLabel,
  overallAttendance,
  todayIso,
} from "./shared";
import type { AttendanceEntry, AttendanceState, AttendanceSubject } from "./state";
import { LOG_LIMIT, newId } from "./state";
import {
  attendance,
  effectiveRoutine,
  persistAttendance,
  recordAttendance,
  routine,
  undoEntry,
} from "./store";

const ATTENDANCE_TARGETS = [75, 80, 85] as const;

/** Draft for the "track a paper" field. */
const subjectDraft = signal("");
/** The day being marked, `YYYY-MM-DD`; never later than today. */
const logDate = signal(todayIso());
/** The month the grid shows, `YYYY-MM`; it follows the day being logged. */
const gridMonth = signal(todayIso().slice(0, 7));
/** Which paper's counts are being typed in, by id ("" = none). */
const editingCounts = signal("");
const showWholeLog = signal(false);

/* ------------------------------------------------------------------ gecs */

type GecsPhase = "idle" | "checking" | "wrong" | "synced" | "offline" | "failed";

const gecsOpen = signal(false);
/** `null` until the student types; then their own number shows over the saved one. */
const gecsRegDraft = signal<string | null>(null);
/** Kept only for the request in front of us — never written anywhere. */
const gecsMobile = signal("");
const gecsPhase = signal<GecsPhase>("idle");
const gecsNote = signal("");
const gecsRegNote = signal("");
const gecsMobileNote = signal("");
const gecsCache = signal<GecsSnapshot | null>(null);

let gecsCacheStarted = false;

async function openGecsCache(): Promise<void> {
  if (gecsCacheStarted) return;
  gecsCacheStarted = true;
  const stored = await readGecsCache();
  // A sync that finished while storage was being read is newer than the copy.
  if (gecsCache() === null) gecsCache.set(stored);
}

void openGecsCache();

/* ---------------------------------------------------------------- actions */

function setAttendanceTarget(target: number): void {
  attendance.update((state) => ({ ...state, target }));
  persistAttendance();
}

function addAttendanceSubject(raw?: string): void {
  const name = (raw ?? subjectDraft()).trim();
  if (!name) return;
  const exists = attendance().subjects.some((subject) => subject.name.toLowerCase() === name.toLowerCase());
  subjectDraft.set("");
  if (exists) return;
  attendance.update((state) => ({
    ...state,
    subjects: [...state.subjects, { id: newId("sub"), name: name.slice(0, 60), attended: 0, total: 0, source: "manual" }],
  }));
  persistAttendance();
}

function patchSubject(subjectId: string, attended: number, total: number): void {
  attendance.update((state) => ({
    ...state,
    subjects: state.subjects.map((subject) =>
      subject.id === subjectId
        ? {
            ...subject,
            attended: Math.max(0, Math.min(attended, total)),
            total: Math.max(0, total),
            // Typed counts are the student's again: the register no longer owns
            // these two numbers, so the GECS marker comes off.
            source: "manual",
            syncedAt: undefined,
          }
        : subject,
    ),
  }));
  persistAttendance();
}

async function removeAttendanceSubject(subject: AttendanceSubject): Promise<void> {
  const ok = await askDestructive(
    `Remove ${subject.name}?`,
    "Its class counts and every log entry for it are deleted too.",
    "Remove",
  );
  if (!ok) return;
  attendance.update((state) => ({
    ...state,
    subjects: state.subjects.filter((item) => item.id !== subject.id),
    log: state.log.filter((entry) => entry.subjectId !== subject.id),
  }));
  if (editingCounts() === subject.id) editingCounts.set("");
  persistAttendance();
}

async function resetAttendance(): Promise<void> {
  const ok = await askDestructive(
    "Reset attendance?",
    "Every paper, count and log entry is cleared. The target percentage stays.",
    "Reset",
  );
  if (!ok) return;
  attendance.set({ subjects: [], log: [], target: attendance().target });
  persistAttendance();
  void clearGecsCache();
  gecsCache.set(null);
  gecsPhase.set("idle");
  gecsNote.set("");
  gecsMobile.set("");
  gecsRegDraft.set(null);
}

/* ------------------------------------------------------------ gecs sync */

function gecsRegValue(): string {
  return gecsRegDraft() ?? gecsCache()?.regNo ?? "";
}

/** The first register paper this subject names, by code then by name. */
function paperIndexFor(subject: AttendanceSubject, papers: readonly GecsPaper[]): number {
  const code = (subject.code ?? "").trim().toLowerCase();
  if (code) {
    const byCode = papers.findIndex((paper) => paper.code.trim().toLowerCase() === code);
    if (byCode >= 0) return byCode;
  }
  const name = subject.name.trim().toLowerCase();
  if (!name) return -1;
  return papers.findIndex((paper) => {
    const paperName = paper.name.trim().toLowerCase();
    return paperName === name || paper.code.trim().toLowerCase() === name;
  });
}

/**
 * Replaces the counts of every paper the register knows and appends the ones
 * it knows that the student does not. A manual paper with no matching code or
 * name is untouched, and the date log is never rewritten — GECS reports totals,
 * not the days behind them.
 */
function applyGecsSnapshot(snapshot: GecsSnapshot): void {
  const state = attendance();
  const remaining = snapshot.papers.slice();

  const subjects = state.subjects.map((subject) => {
    const index = paperIndexFor(subject, remaining);
    if (index < 0) return subject;
    const paper = remaining.splice(index, 1)[0];
    return {
      ...subject,
      name: subject.source === "gecs" && paper.name ? paper.name : subject.name,
      attended: paper.attended,
      total: paper.total,
      code: paper.code,
      source: "gecs" as const,
      syncedAt: snapshot.fetchedAt,
    };
  });

  for (const paper of remaining) {
    subjects.push({
      id: newId("sub"),
      name: paper.name || paper.code,
      attended: paper.attended,
      total: paper.total,
      code: paper.code,
      source: "gecs",
      syncedAt: snapshot.fetchedAt,
    });
  }

  attendance.set({ ...state, subjects });
  persistAttendance();
}

function syncErrorText(error: GecsError): string {
  return error.kind === "http" && error.status > 0 ? `HTTP ${error.status} · ${error.message}` : error.message;
}

function failGecs(error: GecsError): void {
  if (error.kind === "offline" && gecsCache() !== null) {
    gecsPhase.set("offline");
    return;
  }
  const mobile = gecsMobile();
  const message = syncErrorText(error);
  gecsPhase.set("failed");
  // Supabase should not echo the number, but a full mobile never reaches the
  // screen even if a future error message does.
  gecsNote.set(mobile.length === 10 ? message.split(mobile).join("…") : message);
}

function setGecsReg(value: string): void {
  gecsRegDraft.set(value.replace(/\D/g, "").slice(0, 11));
  gecsRegNote.set("");
  if (gecsPhase() === "wrong" || gecsPhase() === "failed" || gecsPhase() === "offline") gecsPhase.set("idle");
}

function setGecsMobile(value: string): void {
  gecsMobile.set(value.replace(/\D/g, "").slice(0, 10));
  gecsMobileNote.set("");
  if (gecsPhase() === "wrong" || gecsPhase() === "failed" || gecsPhase() === "offline") gecsPhase.set("idle");
}

async function syncFromGecs(): Promise<void> {
  if (gecsPhase() === "checking") return;

  const reg = gecsRegValue().trim();
  const mobile = gecsMobile().trim();
  const regProblem = registrationError(reg);
  const mobileProblem = guardianMobileError(mobile);
  gecsRegNote.set(regProblem);
  gecsMobileNote.set(mobileProblem);
  if (regProblem || mobileProblem) return;

  gecsPhase.set("checking");
  gecsNote.set("");

  const checked = await validate(reg, mobile);
  if (!checked.ok) {
    failGecs(checked);
    return;
  }
  if (!checked.value) {
    gecsPhase.set("wrong");
    return;
  }

  const fetched = await fetchStudent(reg);
  if (!fetched.ok) {
    failGecs(fetched);
    return;
  }

  applyGecsSnapshot(fetched.value);
  await writeGecsCache(fetched.value);
  gecsCache.set(fetched.value);
  gecsMobile.set("");
  gecsMobileNote.set("");
  gecsOpen.set(false);
  gecsPhase.set("synced");
}

/** An entry stamped at the chosen day (noon for a past day, now for today). */
function stampFor(iso: string): number {
  if (iso === todayIso()) return Date.now();
  return parseIso(iso)?.getTime() ?? Date.now();
}

function timeOfDay(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${hours < 10 ? "0" : ""}${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * Papers from the saved routine that are not tracked yet — the fast path to
 * "add the six papers I already have", with no typing and no invented names.
 */
function routineSuggestions(): string[] {
  const data = effectiveRoutine(routine());
  if (!data) return [];
  const names: string[] = [];
  for (const paper of data.papers) {
    const name = paper.abbr || paper.name;
    if (name) names.push(name);
  }
  if (names.length === 0) {
    for (const day of data.days) for (const item of day.classes) names.push(item.subject);
  }
  const tracked = new Set(attendance().subjects.map((subject) => subject.name.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || tracked.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
    if (out.length >= 6) break;
  }
  return out;
}

/* ------------------------------------------------------------------ page */

export function AttendanceScreen() {
  const state = (): AttendanceState => attendance();
  const overall = () => overallAttendance(state());
  const advice = (): AttendanceAdvice => attendanceAdvice(overall().attended, overall().total, state().target);
  const log = (): AttendanceEntry[] => state().log;
  const markedOn = (iso: string): AttendanceEntry[] => entriesOn(state(), iso);
  const logDays = (): string[] => {
    const days: string[] = [];
    // A class can be logged for a past day, so insertion order is not date order.
    for (const entry of [...log()].sort((left, right) => right.at - left.at)) {
      const day = entryDay(entry.at);
      if (!days.includes(day)) days.push(day);
    }
    return showWholeLog() ? days : days.slice(0, 6);
  };

  const shiftDay = (delta: number): void => {
    const next = addDays(logDate(), delta);
    if (next > todayIso()) return;
    logDate.set(next);
  };

  /** Step the grid a month, but never into a month that has not happened. */
  const shiftMonth = (delta: number): void => {
    const [year, month] = gridMonth().split("-").map(Number);
    const moved = new Date(year, month - 1 + delta, 1, 12);
    const key = `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}`;
    if (key > todayIso().slice(0, 7)) return;
    gridMonth.set(key);
  };

  /** Picking a day marks it and brings the grid to its month. */
  const pickDay = (iso: string): void => {
    if (iso > todayIso()) return;
    logDate.set(iso);
    gridMonth.set(iso.slice(0, 7));
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <Card class="gap-3 p-4">
          <Row class="items-center gap-4">
            {() => (
              <Ring
                value={overall().status.percent}
                size={84}
                label={overall().total > 0 ? `${overall().status.percent}%` : "—"}
                tone={advice().level === "safe" ? "mint" : "ember"}
              />
            )}
            <Col class="flex-1">
              <Label>Overall</Label>
              <Text class="text-[16px] font-semibold leading-5 text-foreground">{advice().headline}</Text>
              <Muted class="text-[11px]">
                {`${overall().attended} present of ${overall().total} held · ${plural(state().subjects.length, "paper", "papers")}`}
              </Muted>
            </Col>
          </Row>
          <View class={`gap-0.5 rounded-2xl border px-3 py-2.5 ${adviceTone(advice())}`}>
            <Muted class="text-[11px] leading-4">{advice().detail}</Muted>
            <Muted class="text-[11px]">
              {markedOn(todayIso()).length === 0
                ? "No class marked for today yet."
                : `${plural(markedOn(todayIso()).length, "class", "classes")} marked today.`}
            </Muted>
          </View>
          <Divider />
          <Row class="justify-between gap-2">
            <Col class="flex-1">
              <Label>Target</Label>
            </Col>
            {() => (
              <Row class="gap-1.5">
                <Each of={ATTENDANCE_TARGETS as readonly number[]} key={(target: number) => String(target)}>
                  {(target) => (
                    <Chip active={state().target === target()} onPress={() => setAttendanceTarget(target())}>
                      {`${target()}%`}
                    </Chip>
                  )}
                </Each>
              </Row>
            )}
          </Row>
        </Card>

        <GecsSyncCard />

        <Card class="gap-2 p-3.5">
          <Row class="justify-between gap-2">
            <Col class="flex-1">
              <Label>Logging for</Label>
              <Text class="text-[15px] font-semibold leading-5 text-foreground">{dayLabel(logDate(), todayIso())}</Text>
              <Muted class="text-[11px]">
                {markedOn(logDate()).length === 0
                  ? "No classes marked"
                  : `${plural(markedOn(logDate()).length, "class", "classes")} on this day`}
              </Muted>
            </Col>
            <Row class="items-center gap-1.5">
              <StepButton icon="chevron-left" label="Previous day" onPress={() => shiftDay(-1)} />
              <If when={logDate() !== todayIso()}>
                <Chip onPress={() => logDate.set(todayIso())}>Today</Chip>
              </If>
              <StepButton icon="chevron-right" label="Next day" disabled={logDate() >= todayIso()} onPress={() => shiftDay(1)} />
            </Row>
          </Row>
        </Card>

        <MonthGrid
          cursor={gridMonth}
          selected={logDate}
          marks={() => marksByDay(attendance().log)}
          onShift={shiftMonth}
          onPick={pickDay}
        />

        <Card class="gap-2 p-3.5">
          <Label>Track a paper</Label>
          <Row class="items-center gap-2">
            <Field
              class="flex-1"
              value={subjectDraft()}
              onChange={(value) => subjectDraft.set(value)}
              placeholder="e.g. DBMS"
              onSubmit={() => addAttendanceSubject()}
            />
            <Btn variant="secondary" disabled={subjectDraft().trim().length === 0} onPress={() => addAttendanceSubject()}>
              Add
            </Btn>
          </Row>
          <If when={routineSuggestions().length > 0}>
            <Row class="flex-wrap gap-1.5">
              <Each of={routineSuggestions()} key={(name: string) => name}>
                {(name) => <Chip onPress={() => addAttendanceSubject(name())}>{`+ ${name()}`}</Chip>}
              </Each>
            </Row>
          </If>
        </Card>

        <If when={state().subjects.length === 0}>
          <EmptyState title="No papers tracked" />
        </If>

        <View class="gap-3">
          <Each of={state().subjects} key={(subject: AttendanceSubject) => subject.id}>
            {(subject) => (
              <AttendanceCard
                subject={subject}
                target={() => state().target}
                date={() => logDate()}
              />
            )}
          </Each>
        </View>

        <Row class="justify-between gap-2 pt-1">
          <SectionHeader title="Date log" class="flex-1" trailing={<Badge tone="mint">{`${attendance().log.length} of ${LOG_LIMIT}`}</Badge>} />
          <View class="min-h-11 justify-center rounded-full px-3 active:bg-muted" onPress={() => void resetAttendance()} role="button">
            <Text class="text-[12px] font-semibold text-destructive">Reset</Text>
          </View>
        </Row>

        <If when={log().length === 0}>
          <EmptyState title="No classes logged" />
        </If>

        <If when={log().length > 0}>
          <View class="gap-3">
            <Each of={logDays()} key={(day: string) => day}>
              {(day) => <LogDay day={day} state={state} />}
            </Each>
          </View>
          <If when={logDays().length < logDaysAll(state()).length}>
            <Btn variant="ghost" onPress={() => showWholeLog.update((value) => !value)}>
              {showWholeLog() ? "Show fewer days" : `Show all ${logDaysAll(state()).length} days`}
            </Btn>
          </If>
        </If>
      </Body>
    </Screen>
  );
}

/**
 * The register's two numbers, with the last answer still readable when the
 * network is not. Nothing here writes the mobile anywhere: it lives in a
 * signal and is cleared the moment the register accepts it.
 */
function GecsSyncCard() {
  const cache = (): GecsSnapshot | null => gecsCache();
  const classCount = (): number => (cache()?.papers ?? []).reduce((sum, paper) => sum + paper.total, 0);
  const bad = (): boolean => gecsPhase() === "wrong" || gecsPhase() === "failed";

  const headline = (): string => {
    const phase = gecsPhase();
    if (phase === "checking") return "Checking…";
    if (phase === "wrong") return "No match";
    if (phase === "failed") return "Sync failed";
    const last = cache();
    if (phase === "offline") return last ? `Offline · ${formatDate(last.fetchedAt)}` : "Offline";
    return last ? `Synced ${formatDate(last.fetchedAt)}` : "Not synced";
  };

  const detail = (): string => {
    const phase = gecsPhase();
    if (phase === "wrong") return "That registration number and guardian mobile do not match.";
    if (phase === "failed") return gecsNote();
    const last = cache();
    if (!last) return "";
    const counts = `${plural(last.papers.length, "paper", "papers")} · ${plural(classCount(), "class", "classes")}`;
    return last.studentName ? `${last.studentName} · ${counts}` : counts;
  };

  return (
    <Card class="gap-3 p-3.5">
      <Row class="justify-between gap-2">
        <Col class="flex-1">
          <Label>GECS</Label>
          <Text class={`text-[15px] font-semibold leading-5 tabular-nums ${bad() ? "text-destructive" : "text-foreground"}`}>
            {headline()}
          </Text>
          <If when={detail().length > 0}>
            <Muted class={`text-[11px] leading-4 ${bad() ? "text-destructive" : "tabular-nums"}`}>{detail()}</Muted>
          </If>
        </Col>
        <Chip active={gecsOpen()} onPress={() => gecsOpen.update((open) => !open)}>
          {gecsOpen() ? "Close" : "Sync"}
        </Chip>
      </Row>

      <If when={gecsOpen()}>
        <Field
          label="Registration number"
          value={gecsRegValue()}
          onChange={setGecsReg}
          placeholder="24105157001"
          keyboard="number-pad"
          maxLength={11}
          onSubmit={() => void syncFromGecs()}
        />
        <If when={gecsRegNote().length > 0}>
          <Muted class="px-1 text-[11px] text-destructive">{gecsRegNote()}</Muted>
        </If>
        <Field
          label="Guardian mobile"
          value={gecsMobile()}
          onChange={setGecsMobile}
          keyboard="phone-pad"
          masked
          maxLength={10}
          onSubmit={() => void syncFromGecs()}
        />
        <If when={gecsMobileNote().length > 0}>
          <Muted class="px-1 text-[11px] text-destructive">{gecsMobileNote()}</Muted>
        </If>
        <Btn onPress={() => void syncFromGecs()} disabled={gecsPhase() === "checking"}>
          {gecsPhase() === "checking" ? "Checking…" : "Sync"}
        </Btn>
      </If>
    </Card>
  );
}

function logDaysAll(state: AttendanceState): string[] {
  const days: string[] = [];
  for (const entry of state.log) {
    const day = entryDay(entry.at);
    if (!days.includes(day)) days.push(day);
  }
  return days;
}

function adviceTone(advice: AttendanceAdvice): string {
  if (advice.level === "lost") return "border-destructive/25 bg-destructive/8";
  if (advice.level === "risk") return "border-primary/25 bg-primary/8";
  if (advice.level === "safe") return "border-accent/25 bg-accent/8";
  return "border-border bg-muted/40";
}

/** A 44pt chevron control for the day stepper. */
function StepButton(props: { icon: IconName; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <View
      class={`h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-card ${
        props.disabled ? "opacity-40" : "active:bg-muted"
      }`}
      onPress={props.disabled ? undefined : props.onPress}
      disabled={props.disabled}
      role="button"
      accessibilityLabel={props.label}
    >
      <Icon name={props.icon} size={18} class="text-foreground" />
    </View>
  );
}

/* ------------------------------------------------------------ month grid */

/** How one day looks at a glance: what was marked, and how much of it. */
export interface DayMark {
  present: number;
  absent: number;
}

/** `YYYY-MM-DD` for every entry, counted by what was marked. */
export function marksByDay(log: readonly AttendanceEntry[]): Record<string, DayMark> {
  const marks: Record<string, DayMark> = {};
  for (const entry of log) {
    const day = entryDay(entry.at);
    const mark = marks[day] ?? { present: 0, absent: 0 };
    if (entry.action === "present") mark.present += 1;
    else mark.absent += 1;
    marks[day] = mark;
  }
  return marks;
}

/**
 * One month of marks, so "which days did I miss" is answered in one look
 * instead of by scrolling a log. A tap on a past day makes that the day being
 * logged, which is the whole point: find the gap, fill it.
 *
 * Seven columns inside a padded card on a 320 pt screen leave roughly 39 pt
 * per cell, so the cells are 40 pt tall rather than the 44 pt a lone control
 * gets. That is the trade: the month fits on screen, which a 44 pt grid that
 * scrolled sideways would not.
 */
function MonthGrid(props: {
  cursor: () => string;
  selected: () => string;
  marks: () => Record<string, DayMark>;
  onShift: (delta: number) => void;
  onPick: (iso: string) => void;
}) {
  const parts = computed(() => {
    const [year, month] = props.cursor().split("-");
    return { year: Number(year), month: Number(month) - 1 };
  });
  const cells = computed(() => monthCells(parts().year, parts().month));
  const label = computed(() => monthLabel(parts().year, parts().month));
  const thisMonth = todayIso().slice(0, 7);

  /** One cell's tint and the words behind it. */
  const look = (iso: string): { tint: string; spoken: string } => {
    const mark = props.marks()[iso];
    if (!mark) return { tint: "border-border bg-card text-muted-foreground", spoken: "nothing marked" };
    if (mark.absent === 0) return { tint: "border-accent/30 bg-accent/10 text-accent-ink", spoken: `${mark.present} present` };
    if (mark.present === 0) return { tint: "border-destructive/30 bg-destructive/10 text-destructive", spoken: `${mark.absent} absent` };
    return { tint: "border-chart-3/40 bg-chart-3/15 text-foreground", spoken: `${mark.present} present, ${mark.absent} absent` };
  };

  return (
    <Card class="gap-2 p-2.5">
      <Row class="items-center justify-between gap-2">
        <Col class="flex-1">
          <Label>Month</Label>
          <Text class="text-[15px] font-semibold leading-5 text-foreground">{label()}</Text>
        </Col>
        <Row class="items-center gap-1.5">
          <StepButton icon="chevron-left" label="Previous month" onPress={() => props.onShift(-1)} />
          <StepButton icon="chevron-right" label="Next month" disabled={props.cursor() >= thisMonth} onPress={() => props.onShift(1)} />
        </Row>
      </Row>

      <Row class="gap-1">
        <Each of={WEEKDAYS} key="index">
          {(day: () => string) => (
            <View class="h-5 flex-1 items-center justify-center">
              <Text class="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{day()}</Text>
            </View>
          )}
        </Each>
      </Row>

      <View class="flex-row flex-wrap gap-1">
        <Each of={cells()} key={(cell, index) => (cell ? cell.iso : `blank-${index}`)}>
          {(cell) => (
            <View
              class={`h-10 w-[13.2%] items-center justify-center rounded-lg border ${
                cell() === null ? "border-transparent" : look(cell()!.iso).tint
              } ${cell() !== null && cell()!.iso === props.selected() ? "border-primary border-2" : ""}`}
              onPress={cell() === null || cell()!.iso > todayIso() ? undefined : () => props.onPick(cell()!.iso)}
              disabled={cell() === null || cell()!.iso > todayIso()}
              role={cell() === null || cell()!.iso > todayIso() ? undefined : "button"}
              accessibilityLabel={cell() === null ? undefined : `${cell()!.iso}, ${look(cell()!.iso).spoken}`}
              accessibilityState={cell() === null ? undefined : { selected: cell()!.iso === props.selected() }}
            >
              <Text class="text-[12px] font-medium tabular-nums">{cell()?.day ?? ""}</Text>
            </View>
          )}
        </Each>
      </View>

      <Row class="flex-wrap items-center gap-3">
        <Row class="items-center gap-1">
          <View class="h-2 w-2 rounded-full bg-accent" />
          <Muted class="text-[10px]">All present</Muted>
        </Row>
        <Row class="items-center gap-1">
          <View class="h-2 w-2 rounded-full bg-chart-3" />
          <Muted class="text-[10px]">Mixed</Muted>
        </Row>
        <Row class="items-center gap-1">
          <View class="h-2 w-2 rounded-full bg-destructive" />
          <Muted class="text-[10px]">All absent</Muted>
        </Row>
        <Muted class="text-[10px]">Tap a day to log it</Muted>
      </Row>
    </Card>
  );
}

/* ------------------------------------------------------------- one paper */

function AttendanceCard(props: { subject: () => AttendanceSubject; target: () => number; date: () => string }) {
  const advice = (): AttendanceAdvice => {
    const subject = props.subject();
    return attendanceAdvice(subject.attended, subject.total, props.target());
  };
  const editing = (): boolean => editingCounts() === props.subject().id;
  const onDate = (): AttendanceEntry[] =>
    entriesOn(attendance(), props.date()).filter((entry) => entry.subjectId === props.subject().id);

  return (
    <Card class="gap-3 p-3.5">
      <Row class="justify-between gap-2">
        <Col class="flex-1">
          <Row class="gap-2">
            <Text class="flex-1 text-[15px] font-semibold leading-5 text-foreground">{props.subject().name}</Text>
            <If when={props.subject().source === "gecs"}>
              <Badge tone="mint">GECS</Badge>
            </If>
          </Row>
          <Muted class="text-[11px] tabular-nums">
            {props.subject().total > 0
              ? `${props.subject().attended} present of ${props.subject().total} held · ${advice().status.percent}%`
              : "No classes yet"}
          </Muted>
        </Col>
        <IconButton
          icon="x"
          label={`Remove ${props.subject().name}`}
          danger
          onPress={() => void removeAttendanceSubject(props.subject())}
        />
      </Row>

      {() => (
        <Progress
          value={advice().status.percent}
          tone={advice().level === "safe" ? "mint" : "amber"}
          label={`${props.subject().name} attendance`}
        />
      )}

      <Row class="gap-2">
        <Btn
          variant="secondary"
          class="flex-1"
          onPress={() => recordAttendance(props.subject(), "present", stampFor(props.date()))}
        >
          Present
        </Btn>
        <Btn
          variant="secondary"
          class="flex-1"
          onPress={() => recordAttendance(props.subject(), "absent", stampFor(props.date()))}
        >
          Absent
        </Btn>
      </Row>

      {() => (
        <View class={`gap-1 rounded-2xl border px-3 py-2.5 ${adviceTone(advice())}`}>
          <Text
            class={`text-[13px] font-semibold leading-5 ${
              advice().level === "lost" ? "text-destructive" : "text-foreground"
            }`}
          >
            {advice().headline}
          </Text>
          <Muted class="text-[11px] leading-4">{advice().detail}</Muted>
        </View>
      )}

      <Row class="flex-wrap justify-between gap-2">
        <If when={onDate().length > 0}>
          <Chip onPress={() => undoEntry(onDate()[0].id)}>
            {`Undo on ${dayLabel(props.date(), todayIso())}`}
          </Chip>
        </If>
        <Chip active={editing()} onPress={() => editingCounts.set(editing() ? "" : props.subject().id)}>
          {editing() ? "Done" : "Edit counts"}
        </Chip>
      </Row>

      <If when={editing()}>
        <Card class="gap-3 bg-muted/40 p-3">
          <Row class="justify-between gap-2">
            <Col class="flex-1">
              <Label>Classes held</Label>
              <Muted class="text-[11px]">Everything on the register so far, not just what you logged here.</Muted>
            </Col>
            <Stepper
              value={props.subject().total}
              onChange={(total) => patchSubject(props.subject().id, props.subject().attended, total)}
              step={1}
              min={props.subject().attended}
              max={300}
              label="classes held"
            />
          </Row>
          <Row class="justify-between gap-2">
            <Col class="flex-1">
              <Label>You attended</Label>
              <Muted class="text-[11px]">Counts only where you were present.</Muted>
            </Col>
            <Stepper
              value={props.subject().attended}
              onChange={(attended) => patchSubject(props.subject().id, attended, Math.max(attended, props.subject().total))}
              step={1}
              min={0}
              max={props.subject().total}
              label="classes attended"
            />
          </Row>
          <Muted class="text-[11px]">
            {`The log stays as it is; these two numbers are the source of the maths. ${advice().headline}.`}
          </Muted>
        </Card>
      </If>
    </Card>
  );
}

/* -------------------------------------------------------------- date log */

function LogDay(props: { day: () => string; state: () => AttendanceState }) {
  const entries = (): AttendanceEntry[] => entriesOn(props.state(), props.day());

  return (
    <View class="gap-2">
      <SectionHeader title={logDayLabel(props.day())} trailing={<Badge tone="mint">{`${entries().length}`}</Badge>} />
      <Card class="gap-0 p-0">
        <Each of={entries()} key={(entry: AttendanceEntry) => entry.id}>
          {(entry, index) => (
            <View
              class={`flex-row items-center gap-3 px-4 py-3 ${
                index() < entries().length - 1 ? "border-b border-border" : ""
              }`}
            >
              <View class={`h-2 w-2 rounded-full ${entry().action === "present" ? "bg-accent" : "bg-primary"}`} />
              <Col class="flex-1">
                <Text class="text-[13px] font-semibold text-foreground">{entry().subjectName}</Text>
                <Muted class="text-[11px]">
                  {`${entry().action === "present" ? "Present" : "Absent"} · ${timeOfDay(entry().at)}`}
                </Muted>
              </Col>
              <Chip onPress={() => undoEntry(entry().id)}>Undo</Chip>
            </View>
          )}
        </Each>
      </Card>
    </View>
  );
}
