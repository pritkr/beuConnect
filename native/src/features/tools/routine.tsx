/**
 * The class routine: load the published week by registration number, or type
 * it in by hand, then read today or the whole week.
 *
 * ## Why the week is a grid of codes plus one day in full
 *
 * A published timetable is a table, and six columns of subject names do not
 * survive 320pt: every cell truncates to one word. So the week is a compact
 * grid — seven day rows, six period columns, a two-to-four letter code per
 * cell — and the day selected in it is printed underneath with the full name,
 * time, room and teacher. The grid answers "which days are heavy"; the list
 * answers "where do I go next".
 *
 * ## Editing
 *
 * Edits are kept as a separate copy (`RoutineState.custom`) so a refresh of the
 * published routine never destroys them, and a student can throw the edits away
 * to fall back to the published week. A hand-typed week is just the same copy
 * seeded from `blankRoutine()`.
 */

import { Clipboard, Text, View, announce, effect, signal } from "nsh";
import { SITE, cacheStamp, fetchText, getCache, putCache, relativeTime } from "../../lib/net";
import {
  Badge,
  Body,
  Btn,
  Card,
  Check,
  Chip,
  Col,
  EmptyState,
  ErrorState,
  Field,
  Label,
  Loading,
  Muted,
  Panel,
  Progress,
  Row,
  Screen,
  SectionHeader,
} from "../../ui";
import { IconButton, ModeChips } from "./kit";
import type { ModeOption } from "./kit";
import type { ClassMoment, ParsedRoutine, RoutineClass, RoutineDay, RoutineGroup, RoutineSlot } from "./routine-parse";
import {
  WEEK_ORDER,
  blankRoutine,
  classMoment,
  clockMinutes,
  cloneRoutine,
  dayName,
  nextSlotIndex,
  parseRoutineHtml,
  slotAt,
  weekAsText,
  weekIndex,
} from "./routine-parse";
import {
  askDestructive,
  classMeta,
  entryDay,
  errorText,
  matchAttendance,
  minutesNow,
  nextClassAhead,
  nextClassInfo,
  overallAttendance,
  shortCode,
  todayIso,
  todayTimetable,
  waitLabel,
} from "./shared";
import { holidaysOn } from "./holidays-data";
import {
  attendance,
  effectiveRoutine,
  nowMs,
  persistRoutine,
  persistRoutineSoon,
  ready,
  recordAttendance,
  routine,
  undoAttendance,
} from "./store";

/* ------------------------------------------------------------------ state */

/** `null` until the student types: then the saved registration number shows. */
const regDraft = signal<string | null>(null);
const busy = signal(false);
/** A read is in flight at all, including the automatic background one. */
const refreshing = signal(false);
const failure = signal("");
/** The last refresh failed: the screen is showing a saved copy. */
const refreshFailed = signal(false);
/** The registration field is open even though a week is loaded. */
const regOpen = signal(false);
const view = signal<"today" | "week">("today");
const sample = signal(false);
/** Monday-first day the week view is showing. */
const selectedDay = signal(dayName());
const editing = signal(false);

/** The published sheet changes rarely; a day-old copy is still the right week. */
const REFRESH_AFTER = 6 * 60 * 60 * 1000;

const VIEWS: readonly ModeOption<"today" | "week">[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
];

/* ------------------------------------------------------------- view model */

function shown(): ParsedRoutine | null {
  return sample() ? SAMPLE_ROUTINE : effectiveRoutine(routine());
}

function regValue(): string {
  return regDraft() ?? routine().regNo;
}

function dayOf(data: ParsedRoutine | null, day: string): RoutineDay | null {
  return data?.days.find((entry) => entry.day === day) ?? null;
}

function classesOf(data: ParsedRoutine | null, day: string): RoutineClass[] {
  return dayOf(data, day)?.classes ?? [];
}

function orderedDays(data: ParsedRoutine | null): RoutineDay[] {
  return WEEK_ORDER.map((day) => ({ day, classes: classesOf(data, day).slice().sort((left, right) => left.slot - right.slot) }));
}

/* ----------------------------------------------------------------- load */

interface PageRead {
  html: string;
  /** When this HTML was fetched; 0 when the device never saw a fresh copy. */
  fetchedAt: number;
  /** True when the network failed and the device's copy answered instead. */
  fromCache: boolean;
}

/**
 * The page's HTML, with the device's copy as the second chance.
 *
 * `fetchText` is called without a cache key on purpose: its own fallback would
 * hand back an old page and call it a success, and the screen would then claim
 * "saved just now" for a copy from last week. Here the age is explicit.
 */
async function readPage(url: string, key: string): Promise<PageRead> {
  try {
    const html = await fetchText(url, { timeout: 20000 });
    await putCache(key, html);
    return { html, fetchedAt: Date.now(), fromCache: false };
  } catch (error) {
    const html = await getCache(key, 0);
    if (html === null) throw error;
    const stamp = await cacheStamp(key);
    return { html, fetchedAt: stamp > 0 ? stamp : 0, fromCache: true };
  }
}

/**
 * Which read is allowed to land. A slow background refresh must never overwrite
 * the group the student switched to while it was in flight.
 */
let loadToken = 0;

async function loadRoutine(options: { silent?: boolean; group?: RoutineGroup | null; quiet?: boolean } = {}): Promise<void> {
  // A background refresh re-reads the saved registration, never a half-typed one.
  const reg = (options.silent ? routine().regNo : regValue()).trim();
  if (!reg || busy()) return;
  const token = ++loadToken;

  const group = options.group ?? routine().group;
  const key = `tools.routine.${reg}.${group ?? "auto"}`;
  refreshing.set(true);
  if (!options.silent) {
    busy.set(true);
    failure.set("");
  }

  try {
    const url = `${SITE}/routine?reg=${encodeURIComponent(reg)}${group ? `&group=${group}` : ""}`;
    const page = await readPage(url, key);
    if (token !== loadToken) return;
    const parsed = parseRoutineHtml(page.html, url);
    if (!parsed.ok) {
      if (options.silent || options.quiet) {
        refreshFailed.set(true);
      } else {
        failure.set(parsed.message);
        regOpen.set(true);
      }
      return;
    }

    routine.update((state) => ({
      ...state,
      regNo: reg,
      routine: parsed.routine,
      fetchedAt: page.fetchedAt,
      group: options.group ?? state.group,
    }));
    persistRoutine();
    refreshFailed.set(page.fromCache);
    regOpen.set(false);
    if (!options.silent && !options.quiet) {
      sample.set(false);
      view.set("today");
      selectedDay.set(dayName());
    }
  } catch (error) {
    if (token !== loadToken) return;
    if (options.silent || options.quiet) {
      refreshFailed.set(true);
    } else {
      failure.set(errorText(error));
      regOpen.set(true);
    }
  } finally {
    if (token === loadToken) {
      refreshing.set(false);
      if (!options.silent) busy.set(false);
    }
  }
}

/** Switches lab batch: the site renders that batch's cells server-side. */
function chooseGroup(group: RoutineGroup): void {
  if (routine().group === group && shown()?.labGroup === group) return;
  // The choice is saved by `loadRoutine` once the page for it actually parsed,
  // so a switch that fails offline leaves the saved week exactly as it was.
  void loadRoutine({ group, quiet: true });
}

/**
 * Opens on the saved copy and refreshes it in the background once it is old.
 * No path here blocks the first paint: the persisted week is already on screen.
 */
let autoRefreshed = false;
effect(() => {
  if (!ready() || autoRefreshed) return;
  const state = routine();
  if (!state.routine || !state.regNo) return;
  if (Date.now() - state.fetchedAt < REFRESH_AFTER) return;
  autoRefreshed = true;
  void loadRoutine({ silent: true });
});

/* ----------------------------------------------------------------- edit */

function ensureDay(draft: ParsedRoutine, day: string): RoutineDay {
  const existing = draft.days.find((entry) => entry.day === day);
  if (existing) return existing;
  const created: RoutineDay = { day, classes: [] };
  draft.days.push(created);
  draft.days.sort((left, right) => weekIndex(left.day) - weekIndex(right.day));
  return created;
}

/** Applies an edit to a copy of the week and stores it; typing is debounced. */
function editWeek(mutate: (draft: ParsedRoutine) => void, typing = false): void {
  const state = routine();
  const base = state.custom ?? shown() ?? blankRoutine();
  const draft = cloneRoutine(base);
  mutate(draft);
  sample.set(false);
  routine.update((current) => ({ ...current, custom: draft }));
  if (typing) persistRoutineSoon();
  else persistRoutine();
}

function startEditing(seed?: ParsedRoutine | null): void {
  const state = routine();
  if (!state.custom) {
    // A draft is only needed when there is nothing published to edit *and*
    // when the screen is showing the sample: those must be copied before the
    // sample flag clears. A normal published week is edited in place, so
    // opening the editor changes nothing and the badge stays "Saved" until the
    // student actually types. That is why a no-op "Done editing" leaves no
    // phantom "Edited" copy behind.
    const draft = seed ?? (sample() || shown() === null ? shown() ?? blankRoutine() : null);
    if (draft) {
      routine.update((current) => ({ ...current, custom: cloneRoutine(draft) }));
      persistRoutine();
    }
  }
  sample.set(false);
  editing.set(true);
}

function timePlus(start: string, minutes: number): string {
  const from = clockMinutes(start);
  if (from < 0) return "";
  const total = from + minutes;
  const hours = Math.floor(total / 60) % 24;
  const rest = total % 60;
  return `${hours < 10 ? "0" : ""}${hours}:${rest < 10 ? "0" : ""}${rest}`;
}

function addPeriod(day: string): void {
  editWeek((draft) => {
    const target = ensureDay(draft, day);
    const slot = nextSlotIndex(target.classes);
    const known = slotAt(draft.slots, slot);
    const last = target.classes[target.classes.length - 1];
    const start = known.start || last?.end || "10:00";
    const end = known.end || timePlus(start, 60);
    // No invented paper name: the field is blank, and a period left blank is
    // dropped by `sanitiseRoutine` on the next launch instead of saving a lie.
    target.classes.push({ slot, start, end, subject: "", type: null, room: null, teacher: null });
  });
}

function patchPeriod(day: string, slot: number, patch: Partial<RoutineClass>): void {
  editWeek((draft) => {
    const target = ensureDay(draft, day);
    target.classes = target.classes.map((item) => (item.slot === slot ? { ...item, ...patch } : item));
  }, true);
}

function removePeriod(day: string, slot: number): void {
  editWeek((draft) => {
    const target = ensureDay(draft, day);
    target.classes = target.classes.filter((item) => item.slot !== slot);
  });
}

async function discardEdits(): Promise<void> {
  if (!(await askDestructive("Use the published week?", "The periods you typed are removed. The published routine stays.", "Discard"))) {
    return;
  }
  routine.update((state) => ({ ...state, custom: null }));
  persistRoutine();
  editing.set(false);
}

async function copyWeek(): Promise<void> {
  const current = shown();
  if (!current) return;
  try {
    await Clipboard.writeText(weekAsText(current));
    announce("Week copied");
  } catch {
    announce("Could not copy the week");
  }
}

function timeWarning(item: RoutineClass): string {
  const start = clockMinutes(item.start);
  const end = clockMinutes(item.end);
  if (!item.start.trim() || !item.end.trim()) return "Give the period a start and end time (HH:MM).";
  if (start < 0 || end < 0) return "Times must look like 10:00 — 24-hour, HH:MM.";
  if (end <= start) return "The end time must be after the start.";
  return "";
}

/* ------------------------------------------------------------------ page */

export function RoutineScreen() {
  const data = (): ParsedRoutine | null => shown();
  const spot = () => nextClassInfo(data(), new Date(nowMs()));
  const ahead = () => nextClassAhead(data(), new Date(nowMs()));
  // The page is the truth; the saved choice only covers the moment before a load.
  const group = (): RoutineGroup | null => data()?.labGroup ?? routine().group ?? null;
  const split = (): boolean => data()?.splitClass === true;
  const meta = (): string => {
    const current = data();
    if (!current) return "";
    return [
      current.semester ? `Semester ${current.semester}` : "",
      current.batch,
      current.room ? `Room ${current.room}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const provenance = (): string => {
    if (sample() || routine().custom) return "";
    const current = data();
    if (!current) return "";
    return [
      current.effectiveFrom ? `From ${current.effectiveFrom}` : "",
      routine().fetchedAt > 0 ? `saved ${relativeTime(routine().fetchedAt)}` : "",
      current.stale ? "site copy" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const holiday = (): string => holidaysOn(todayIso())[0]?.label ?? "";

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <If when={data() === null || regOpen()}>
          <Card class="gap-3 p-3.5">
            <Field
              label="Registration number"
              value={regValue()}
              onChange={(value) => regDraft.set(value)}
              placeholder="24105157001"
              onSubmit={() => void loadRoutine()}
            />
            <Row class="justify-between gap-2">
              <Muted class="flex-1 text-[11px]">
                {busy()
                  ? "Reading the published routine…"
                  : routine().routine
                    ? `Published copy saved ${relativeTime(routine().fetchedAt)}`
                    : routine().custom
                      ? "A typed week is saved"
                      : "Nothing saved yet"}
              </Muted>
              <Btn onPress={() => void loadRoutine()} disabled={busy() || regValue().trim().length === 0}>
                {busy() ? "Loading…" : routine().routine ? "Refresh" : "Load routine"}
              </Btn>
            </Row>
            <If when={busy()}>
              <Loading label="Looking up the published routine…" />
            </If>
            <If when={failure().length > 0}>
              <ErrorState title="Routine not loaded" message={failure()} onRetry={() => void loadRoutine()} />
            </If>
            <If when={data() !== null && regOpen()}>
              <Btn variant="ghost" onPress={() => regOpen.set(false)}>
                Close
              </Btn>
            </If>
          </Card>
        </If>

        <If when={data() === null}>
          <EmptyState
            title="No routine on this phone"
            action="Type my week"
            onAction={() => {
              startEditing();
              view.set("week");
            }}
          />
        </If>

        <If when={data() === null}>
          <Row class="justify-center">
            <Btn variant="ghost" onPress={() => sample.set(true)}>
              See a sample week instead
            </Btn>
          </Row>
        </If>

        <If when={data() !== null}>
          <View class="gap-4">
            <If when={sample()}>
              <Panel tone="amber" class="gap-1">
                <Label>Sample timetable</Label>
                <Row class="flex-wrap gap-2 pt-1">
                  <Chip onPress={() => sample.set(false)}>Hide sample</Chip>
                  <Chip
                    onPress={() => {
                      startEditing(SAMPLE_ROUTINE);
                      view.set("week");
                      selectedDay.set(dayName());
                    }}
                  >
                    Start from this
                  </Chip>
                </Row>
              </Panel>
            </If>

            <If when={routine().custom !== null && routine().routine !== null && !sample() && !editing()}>
              <Panel tone="mint" class="gap-1">
                <Row class="justify-between gap-2">
                  <Label>Edited copy</Label>
                  <Chip onPress={() => void discardEdits()}>Use published</Chip>
                </Row>
              </Panel>
            </If>

            <Row class="flex-wrap justify-between gap-2">
              <If when={!editing()}>{() => <ModeChips value={view()} options={VIEWS} onChange={(value) => view.set(value)} />}</If>
              <If when={editing()}>
                <View class="flex-1" />
              </If>
              <Chip active={editing()} onPress={() => (editing() ? editing.set(false) : startEditing())}>
                {editing() ? "Done editing" : "Edit week"}
              </Chip>
            </Row>

            <Card class="gap-2.5 p-3.5">
              <Row class="justify-between gap-2">
                <Col class="flex-1">
                  <Label>{data()?.branchLabel || "Published routine"}</Label>
                  <Text class="text-[15px] font-semibold leading-5 text-foreground">{meta() || "Your week"}</Text>
                </Col>
                {() => (
                  <Badge tone={sample() ? "amber" : routine().custom ? "ember" : "mint"}>
                    {sample() ? "Sample" : routine().custom ? "Edited" : "Saved"}
                  </Badge>
                )}
              </Row>
              <Muted class="text-[11px]">{provenance()}</Muted>
              <If when={!editing()}>
                <Row class="flex-wrap items-center justify-between gap-2">
                  <If when={split()}>
                    <Row class="items-center gap-1.5">
                      <Muted class="text-[11px]">Lab</Muted>
                      {() =>
                        (["A", "B"] as const).map((value) => (
                          <Chip
                            active={group() === value}
                            onPress={() => chooseGroup(value)}
                            class="min-w-11 justify-center px-2.5"
                            label={`Lab group ${value}`}
                          >
                            {value}
                          </Chip>
                        ))
                      }
                    </Row>
                  </If>
                  <Row class="gap-1.5">
                    <Chip onPress={() => regOpen.set(true)} class="px-3">
                      Change
                    </Chip>
                    <Chip onPress={() => void loadRoutine()} class="px-3">
                      Refresh
                    </Chip>
                  </Row>
                </Row>
              </If>
              <If when={refreshing()}>
                <Muted class="text-[11px]">Refreshing…</Muted>
              </If>
              <If when={refreshFailed() && !refreshing()}>
                <Muted class="text-[11px] text-primary-ink">
                  Couldn't reach the site just now — this is the copy saved on your phone.
                </Muted>
              </If>
            </Card>

            <If when={holiday().length > 0 && !sample()}>
              <Panel tone="amber" class="gap-1">
                <Label>Holiday</Label>
                <Text class="text-[14px] font-semibold leading-5 text-foreground">{holiday()}</Text>
              </Panel>
            </If>

            <If when={!editing()}>
              {() => <SpotPanel spot={spot()} ahead={ahead()} />}
            </If>

            <If when={view() === "today" && !editing()}>
              <TodayList data={data} ahead={ahead} />
            </If>

            <If when={view() === "week" || editing()}>
              <WeekGrid data={data} />
              <If when={editing()}>
                <PeriodEditor data={data} day={selectedDay()} />
              </If>
              <If when={!editing()}>
                <DayList data={data} day={selectedDay()} />
              </If>
            </If>

            <If when={(data()?.papers.length ?? 0) > 0 && !editing()}>
              <PapersCard data={data} />
            </If>
          </View>
        </If>
      </Body>
    </Screen>
  );
}

/* ------------------------------------------------------------- now / next */

function SpotPanel(props: { spot: ReturnType<typeof nextClassInfo>; ahead: ReturnType<typeof nextClassAhead> }) {
  const tone = (): "ember" | "mint" | "plain" => {
    if (props.spot.moment === "now") return "ember";
    if (props.spot.moment === "next") return "mint";
    return "plain";
  };

  const title = (): string => {
    const spot = props.spot;
    if (spot.moment === "now") return `Now · ${spot.subject}`;
    if (spot.moment === "next") return `Next · ${spot.subject} at ${spot.start}`;
    if (spot.moment === "none") return "No routine loaded";
    return "No more classes today";
  };

  const hint = (): string => {
    const spot = props.spot;
    if (spot.moment === "now") {
      const rest = [spot.room ? `Room ${spot.room}` : "", `ends ${spot.end}`].filter(Boolean).join(" · ");
      return spot.following
        ? `${rest} · then ${spot.following.subject} at ${spot.following.start}`
        : rest;
    }
    if (spot.moment === "next") {
      const rest = [spot.room ? `Room ${spot.room}` : "", `in ${waitLabel(spot.minutesAway)}`].filter(Boolean).join(" · ");
      return spot.following ? `${rest} · then ${spot.following.subject} at ${spot.following.start}` : rest;
    }
    if (spot.moment === "none") return "Load a routine above.";
    if (props.ahead) {
      const days = props.ahead.daysAhead;
      const when = days === 0 ? "later today" : days === 1 ? "tomorrow" : props.ahead.day;
      return `Next is ${props.ahead.item.subject} ${when} at ${props.ahead.item.start}.`;
    }
    return "Nothing left this week.";
  };

  return (
    <Panel tone={tone()} class="gap-1">
      <Row class="justify-between gap-2">
        <Col class="flex-1">
          <Label>{props.spot.moment === "now" ? "In session" : props.spot.moment === "next" ? "Next class" : "Today"}</Label>
          <Text class="text-[16px] font-semibold leading-5 text-foreground">{title()}</Text>
          <Muted class="text-[11px] leading-4">{hint()}</Muted>
        </Col>
        <If when={props.spot.moment === "next"}>
          <Badge tone="mint">{waitLabel(props.spot.minutesAway)}</Badge>
        </If>
        <If when={props.spot.moment === "now"}>
          <Badge tone="ember">Now</Badge>
        </If>
      </Row>
    </Panel>
  );
}

/* --------------------------------------------------------------- today */

function TodayList(props: { data: () => ParsedRoutine | null; ahead: () => ReturnType<typeof nextClassAhead> }) {
  const classes = (): RoutineClass[] => todayTimetable(props.data());
  const nextSlot = (): number | null => {
    const minutes = minutesNow(nowMs());
    let best: RoutineClass | null = null;
    for (const item of classes()) {
      const start = clockMinutes(item.start);
      if (start > minutes && (!best || start < clockMinutes(best.start))) best = item;
    }
    return best ? best.slot : null;
  };
  const done = (): number => {
    const minutes = minutesNow(nowMs());
    return classes().filter((item) => {
      const end = clockMinutes(item.end);
      return end >= 0 && end <= minutes;
    }).length;
  };
  const percent = (): number => (classes().length === 0 ? 0 : Math.round((done() / classes().length) * 100));
  const overall = () => overallAttendance(attendance());
  const attendanceLine = (): string => {
    const total = overall();
    return total.total > 0 ? `Attendance ${total.status.percent}%` : "";
  };

  /**
   * The one-tap mark: only for a class that has started (or starts within the
   * next ten minutes), and only when the ledger already tracks the paper.
   * Tapping again takes the mark back.
   */
  const markFor = (item: RoutineClass): { checked: boolean; onToggle: () => void } | null => {
    // Nothing is written before the ledger has been read from storage.
    if (!ready()) return null;
    const matched = matchAttendance(item, props.data()?.papers ?? [], attendance().subjects);
    if (!matched) return null;
    const start = clockMinutes(item.start);
    if (start < 0 || start > minutesNow(nowMs()) + 10) return null;
    const marked = attendance().log.some(
      (entry) => entry.subjectId === matched.id && entryDay(entry.at) === todayIso(),
    );
    return {
      checked: marked,
      onToggle: () => {
        if (marked) undoAttendance(matched.id, "present");
        else recordAttendance(matched, "present");
        announce(marked ? `${matched.name} · mark removed` : `${matched.name} · present`);
      },
    };
  };

  return (
    <View class="gap-2">
      <SectionHeader
        title="Today"
        trailing={
          <View>
            {() => {
              const line = attendanceLine();
              return line ? <Muted class="text-[11px]">{line}</Muted> : null;
            }}
          </View>
        }
      />
      <If when={classes().length === 0}>
        <EmptyState
          title={`No classes on ${dayName()}`}
          hint={
            props.ahead()
              ? `Next is ${props.ahead()?.item.subject} on ${props.ahead()?.day} at ${props.ahead()?.item.start}. The week view has the rest.`
              : "A free day — the week view may still have labs elsewhere."
          }
        />
      </If>
      <If when={classes().length > 0}>
        <View class="gap-1.5">
          {() => (
            <Progress
              value={percent()}
              tone="mint"
              label={`${done()} of ${classes().length} classes done`}
            />
          )}
          {() => (
            <Muted class="text-[11px]">
              {`${done()} of ${classes().length} classes done${
                done() < classes().length ? ` · ${classes().length - done()} left` : " · done for today"
              }`}
            </Muted>
          )}
        </View>
      </If>
      <View class="gap-2">
        <Each of={classes()} key={(item: RoutineClass, index: number) => `${item.slot}-${index}`}>
          {(item) => (
            <ClassRow
              item={item}
              moment={() => classMoment(item(), minutesNow(nowMs()), nextSlot())}
              mark={() => markFor(item())}
            />
          )}
        </Each>
      </View>
    </View>
  );
}

function ClassRow(props: {
  item: () => RoutineClass;
  moment: () => ClassMoment;
  mark?: () => { checked: boolean; onToggle: () => void } | null;
}) {
  const surface = (): string => {
    const moment = props.moment();
    if (moment === "now") return "border-primary/25 bg-primary/10";
    if (moment === "next") return "border-accent/25 bg-accent/8";
    if (moment === "past") return "border-border bg-card opacity-60";
    return "border-border bg-card";
  };

  return (
    <View class={`flex-row items-center gap-2.5 rounded-[20px] border px-3.5 py-3 ${surface()}`}>
      <Col class="min-w-[52px] shrink-0">
        <Text class="text-[14px] font-bold tabular-nums text-foreground">{props.item().start || "--:--"}</Text>
        <Text class="text-[11px] tabular-nums text-muted-foreground">{props.item().end}</Text>
      </Col>
      <Col class="flex-1">
        <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {props.item().subject}
        </Text>
        <Text class="text-[11px] leading-4 text-muted-foreground" numberOfLines={1}>
          {classMeta(props.item())}
        </Text>
        {() => {
          const other = (props.item().alternatives ?? [])[0];
          return other ? (
            <Text class="text-[11px] leading-4 text-muted-foreground" numberOfLines={1}>
              {`${other.group ? `Group ${other.group}: ` : ""}${other.subject}${other.room ? ` · Room ${other.room}` : ""}`}
            </Text>
          ) : null;
        }}
      </Col>
      {props.moment() === "now" ? <Badge tone="ember">Now</Badge> : null}
      {props.moment() === "next" ? <Badge tone="mint">Next</Badge> : null}
      {() => {
        const mark = props.mark?.() ?? null;
        if (!mark) return null;
        return (
          <Check
            checked={mark.checked}
            onPress={mark.onToggle}
            label={`Mark ${props.item().subject} present`}
          />
        );
      }}
    </View>
  );
}

/* ---------------------------------------------------------------- week */

/**
 * Seven day rows, six period columns. At 320pt: 288pt of content, a 34pt day
 * label and six flex cells of ~40pt — enough for a four-letter code, which is
 * why the selected day is printed in full underneath.
 */
function WeekGrid(props: { data: () => ParsedRoutine | null }) {
  const slots = (): RoutineSlot[] => (props.data()?.slots ?? []).slice(0, 6);
  const days = (): RoutineDay[] => orderedDays(props.data());

  const cell = (day: RoutineDay, slot: RoutineSlot) => {
    const item = day.classes.find((entry) => entry.slot === slot.index) ?? null;
    const active = (): boolean => selectedDay() === day.day;
    const today = (): boolean => day.day === dayName();
    const surface = (): string => {
      if (!item) return active() ? "border-border bg-muted/60" : "border-border/60 bg-transparent";
      if (today()) return "border-primary/30 bg-primary/12";
      return active() ? "border-foreground/30 bg-muted" : "border-border bg-muted/70";
    };
    const code = item ? shortCode(item.subject) : "";
    const lab = item !== null && item.type !== null && /lab|practical/i.test(item.type);
    const label = item ? `${day.day} P${slot.index}, ${item.subject}` : `${day.day} P${slot.index}, free`;
    return (
      <View
        class={`min-h-11 flex-1 items-center justify-center rounded-lg border px-0.5 ${surface()}`}
        onPress={() => selectedDay.set(day.day)}
        role="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active() }}
      >
        <Text class="text-[11px] font-bold tracking-tight text-foreground" numberOfLines={1}>
          {code}
        </Text>
        {lab ? <View class="mt-0.5 h-1 w-1 rounded-full bg-primary" /> : null}
      </View>
    );
  };

  return (
    <View class="gap-2">
      <SectionHeader title="The week" action="Copy" onAction={() => void copyWeek()} />
      <Card class="gap-1 p-2.5">
        <Row class="gap-1">
          <View class="w-[34px]" />
          <Each of={slots()} key={(slot: RoutineSlot) => String(slot.index)}>
            {(slot) => (
              <View class="flex-1 items-center">
                <Muted class="text-[11px] font-semibold">{`P${slot().index}`}</Muted>
              </View>
            )}
          </Each>
        </Row>
        <Each of={days()} key={(day: RoutineDay) => day.day}>
          {(day) => {
            const active = (): boolean => selectedDay() === day().day;
            const today = (): boolean => day().day === dayName();
            return (
              <Row class="items-stretch gap-1">
                <View
                  class={`w-[34px] items-center justify-center rounded-lg ${
                    active() ? "bg-foreground" : today() ? "bg-primary/10" : ""
                  }`}
                  onPress={() => selectedDay.set(day().day)}
                  role="button"
                  accessibilityLabel={day().day}
                  accessibilityState={{ selected: active() }}
                >
                  <Text
                    class={`text-[11px] font-semibold ${
                      active() ? "text-background" : today() ? "text-primary-ink" : "text-muted-foreground"
                    }`}
                  >
                    {day().day.slice(0, 3)}
                  </Text>
                </View>
                <Each of={slots()} key={(slot: RoutineSlot) => `${day().day}-${slot.index}`}>
                  {(slot) => cell(day(), slot())}
                </Each>
              </Row>
            );
          }}
        </Each>
      </Card>
    </View>
  );
}

function DayList(props: { data: () => ParsedRoutine | null; day: string }) {
  const classes = (): RoutineClass[] => classesOf(props.data(), props.day);
  const nextSlot = (): number | null => {
    const minutes = minutesNow(nowMs());
    let best: RoutineClass | null = null;
    for (const item of classes()) {
      const start = clockMinutes(item.start);
      if (start > minutes && (!best || start < clockMinutes(best.start))) best = item;
    }
    return best ? best.slot : null;
  };
  const isToday = (): boolean => props.day === dayName();

  return (
    <View class="gap-2">
      <SectionHeader
        title={props.day}
      />
      <If when={classes().length === 0}>
        <EmptyState title={`Nothing on ${props.day}`} hint="A free day. Edit the week to add a period." />
      </If>
      <View class="gap-2">
        <Each of={classes()} key={(item: RoutineClass) => `${props.day}-${item.slot}`}>
          {(item) => (
            <ClassRow
              item={item}
              moment={() => (isToday() ? classMoment(item(), minutesNow(nowMs()), nextSlot()) : "later")}
            />
          )}
        </Each>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- editor */

function PeriodEditor(props: { data: () => ParsedRoutine | null; day: string }) {
  const classes = (): RoutineClass[] => classesOf(props.data(), props.day);

  return (
    <View class="gap-2">
      <SectionHeader
        title={`Edit ${props.day}`}
        action="Add period"
        onAction={() => addPeriod(props.day)}
      />

      <If when={classes().length === 0}>
        <EmptyState
          title={`${props.day} is empty`}
          hint="Add a period and it appears in the week grid and the today view."
          action="Add a period"
          onAction={() => addPeriod(props.day)}
        />
      </If>

      <View class="gap-3">
        <Each of={classes()} key={(item: RoutineClass) => `${props.day}-${item.slot}`}>
          {(item) => (
            <Card class="gap-2.5 p-3">
              <Row class="justify-between gap-2">
                <Label>{`P${item().slot}`}</Label>
                <IconButton icon="x" label="Remove period" danger onPress={() => removePeriod(props.day, item().slot)} />
              </Row>
              <Field
                value={item().subject}
                onChange={(subject) => patchPeriod(props.day, item().slot, { subject })}
                placeholder="Subject"
              />
              <Row class="gap-2">
                <Field
                  class="flex-1"
                  label="Start"
                  value={item().start}
                  onChange={(start) => patchPeriod(props.day, item().slot, { start })}
                  placeholder="10:00"
                />
                <Field
                  class="flex-1"
                  label="End"
                  value={item().end}
                  onChange={(end) => patchPeriod(props.day, item().slot, { end })}
                  placeholder="11:00"
                />
              </Row>
              <Row class="gap-2">
                <Field
                  class="flex-1"
                  label="Room"
                  value={item().room ?? ""}
                  onChange={(room) => patchPeriod(props.day, item().slot, { room: room || null })}
                  placeholder="B-204"
                />
                <Field
                  class="flex-1"
                  label="Type"
                  value={item().type ?? ""}
                  onChange={(type) => patchPeriod(props.day, item().slot, { type: type || null })}
                  placeholder="Lab"
                />
              </Row>
              <Field
                label="Teacher"
                value={item().teacher ?? ""}
                onChange={(teacher) => patchPeriod(props.day, item().slot, { teacher: teacher || null })}
                placeholder="Optional"
              />
              {() => {
                const warning = timeWarning(item());
                return warning ? <Muted class="text-[11px] text-destructive">{warning}</Muted> : null;
              }}
            </Card>
          )}
        </Each>
      </View>

      <Btn variant="secondary" onPress={() => addPeriod(props.day)}>
        Add a period
      </Btn>
    </View>
  );
}

/* --------------------------------------------------------------- papers */

function PapersCard(props: { data: () => ParsedRoutine | null }) {
  const papers = () => props.data()?.papers ?? [];

  return (
    <View class="gap-2">
      <SectionHeader title="Papers" />
      <Card class="gap-0 p-0">
        <Each of={papers()} key={(paper, index: number) => `${paper.code || paper.abbr}-${index}`}>
          {(paper) => (
            <View class="gap-1 px-4 py-3">
              <Row class="justify-between gap-2">
                <Text class="flex-1 text-[14px] font-semibold leading-5 text-foreground">{paper().name}</Text>
                <Badge>{paper().abbr || paper().code || "Paper"}</Badge>
              </Row>
              {paper().faculty ? <Muted class="text-[11px]">{paper().faculty}</Muted> : null}
              {paper().hours ? <Muted class="text-[11px]">{paper().hours}</Muted> : null}
            </View>
          )}
        </Each>
      </Card>
    </View>
  );
}

/* --------------------------------------------------------------- sample */

const SAMPLE_SLOTS: RoutineSlot[] = [
  { index: 1, start: "10:00", end: "11:00" },
  { index: 2, start: "11:00", end: "12:00" },
  { index: 3, start: "12:00", end: "13:00" },
  { index: 4, start: "14:00", end: "15:00" },
  { index: 5, start: "15:00", end: "16:00" },
  { index: 6, start: "16:00", end: "17:00" },
];

function sampleClass(slot: number, subject: string, type: string | null, room: string | null, teacher: string | null): RoutineClass {
  const found = SAMPLE_SLOTS.find((item) => item.index === slot);
  return { slot, start: found?.start ?? "", end: found?.end ?? "", subject, type, room, teacher };
}

/** A realistic CSE week, only used to show how the views read when empty. */
const SAMPLE_ROUTINE: ParsedRoutine = {
  branchLabel: "Sample · Computer Science",
  semester: "3",
  batch: "2K24",
  effectiveFrom: "01 Aug 2026",
  room: "B-204",
  slots: SAMPLE_SLOTS,
  days: [
    {
      day: "Monday",
      classes: [
        sampleClass(1, "Data Structures", "Theory", "B-204", "R. Kumar"),
        sampleClass(2, "DBMS", "Theory", "B-204", "S. Prasad"),
        sampleClass(4, "OOP Lab", "Lab", "Lab-2", "A. Singh"),
      ],
    },
    {
      day: "Tuesday",
      classes: [
        sampleClass(1, "Discrete Mathematics", "Theory", "B-204", "M. Jha"),
        sampleClass(3, "Digital Logic", "Theory", "B-204", "P. Verma"),
        sampleClass(5, "DBMS Lab", "Lab", "Lab-1", "S. Prasad"),
      ],
    },
    {
      day: "Wednesday",
      classes: [
        sampleClass(1, "DBMS", "Theory", "B-204", "S. Prasad"),
        sampleClass(2, "Data Structures", "Theory", "B-204", "R. Kumar"),
        sampleClass(4, "Mathematics Tutorial", "Tutorial", "B-204", "M. Jha"),
      ],
    },
    {
      day: "Thursday",
      classes: [
        sampleClass(2, "Object Oriented Programming", "Theory", "B-204", "A. Singh"),
        sampleClass(3, "Digital Logic", "Theory", "B-204", "P. Verma"),
        sampleClass(5, "Seminar", "Seminar", "Auditorium", null),
      ],
    },
    {
      day: "Friday",
      classes: [
        sampleClass(1, "Data Structures", "Theory", "B-204", "R. Kumar"),
        sampleClass(2, "DBMS", "Theory", "B-204", "S. Prasad"),
        sampleClass(4, "OOP Lab", "Lab", "Lab-2", "A. Singh"),
      ],
    },
    {
      day: "Saturday",
      classes: [
        sampleClass(1, "Problem Solving", "Tutorial", "B-204", "M. Jha"),
        sampleClass(2, "Project Work", "Project", "Lab-3", null),
      ],
    },
    { day: "Sunday", classes: [] },
  ],
  papers: [],
  sourceUrl: "",
  labGroup: null,
  splitClass: false,
  stale: false,
};
