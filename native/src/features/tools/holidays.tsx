/**
 * The 2026 university calendar, offline: the official sheet first, then the next
 * long break counted down, the month grid, and every festival, national day and
 * vacation grouped by month.
 *
 * The sheet is the university's own page (`calendar-sheet.tsx`, bundled with the
 * app); a press opens it full screen. Everything below it comes from
 * `holidays-data.ts` — the same sheet, typed. Nothing here invents an exam, a
 * result date or a holiday; a category with no entries simply has no rows.
 */

import { Text, View, signal } from "nsh";
import { Body, Card, Chip, Col, Divider, Label, Muted, Panel, Row, Screen, SectionHeader } from "../../ui";
import { Icon } from "../../ui/icons";
import { CalendarReader, CalendarSheet } from "./calendar-sheet";
import type { GridCell } from "./calendar";
import { WEEKDAYS, monthCells, monthLabel, openingMonth } from "./calendar";
import { clamp, daysUntil, isoDate, parseIso } from "./engine";
import type { Holiday } from "./holidays-data";
import {
  HOLIDAYS_2026,
  HOLIDAY_SOURCE,
  HOLIDAY_YEAR,
  categoryDot,
  categoryLabel,
  holidayDays,
  holidaysOn,
  nextHoliday,
} from "./holidays-data";
import {
  holidayCountdown,
  holidayDaysLabel,
  ongoingHoliday,
  shortParts,
  spanOf,
} from "./shared";
import { nowMs } from "./store";

const month = signal(openingMonth(HOLIDAY_YEAR));
const selected = signal("");
const showTeacherDays = signal(false);

/* ----------------------------------------------------------------- helpers */

function todayIso(): string {
  return isoDate(new Date(nowMs()));
}

/** The next vacation still ahead — the break a student actually counts down. */
function nextVacation(today: string, teacher: boolean): Holiday | null {
  let best: Holiday | null = null;
  for (const holiday of HOLIDAYS_2026) {
    if (holiday.category !== "vacation") continue;
    if (holiday.teacherOnly && !teacher) continue;
    if ((holiday.end ?? holiday.start) < today) continue;
    if (!best || holiday.start < best.start) best = holiday;
  }
  return best;
}

function weekRows(year: number, monthIndex: number): GridCell[][] {
  const cells = monthCells(year, monthIndex);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: GridCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
  return rows;
}

function dayHeading(iso: string): string {
  const date = parseIso(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

interface MonthGroup {
  monthIndex: number;
  items: Holiday[];
}

/** Every holiday of the year, grouped by the month it starts in. */
function byMonth(teacher: boolean): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (let index = 0; index < 12; index += 1) {
    const items = HOLIDAYS_2026.filter((holiday) => {
      if (holiday.teacherOnly && !teacher) return false;
      return parseIso(holiday.start)?.getMonth() === index;
    }).sort((left, right) => left.start.localeCompare(right.start));
    if (items.length > 0) groups.push({ monthIndex: index, items });
  }
  return groups;
}

function vacations(teacher: boolean): Holiday[] {
  return HOLIDAYS_2026.filter((holiday) => holiday.category === "vacation" && (!holiday.teacherOnly || teacher)).sort(
    (left, right) => left.start.localeCompare(right.start),
  );
}

/* ------------------------------------------------------------------ page */

export function HolidaysScreen() {
  const readerOpen = signal(false);
  const today = (): string => todayIso();
  const teacher = (): boolean => showTeacherDays();
  const next = (): Holiday | null => nextHoliday(today(), teacher());
  const vacation = (): Holiday | null => nextVacation(today(), teacher());
  const hero = (): Holiday | null => vacation() ?? next();
  const monthHolidays = (): Holiday[] => {
    const monthStart = new Date(HOLIDAY_YEAR, month(), 1, 12).getTime();
    const monthEnd = new Date(HOLIDAY_YEAR, month() + 1, 0, 12).getTime();
    return HOLIDAYS_2026.filter((holiday) => {
      if (holiday.teacherOnly && !teacher()) return false;
      const start = parseIso(holiday.start)?.getTime() ?? 0;
      const end = parseIso(holiday.end ?? holiday.start)?.getTime() ?? start;
      return start <= monthEnd && end >= monthStart;
    });
  };
  const selectedDay = (): Holiday[] => (selected() ? holidaysOn(selected(), teacher()) : []);

  const shiftMonth = (delta: number): void => {
    month.update((value) => clamp(value + delta, 0, 11));
    selected.set("");
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <CalendarSheet onOpen={() => readerOpen.set(true)} />

        <Panel tone="ember" class="gap-2">
          <Row class="justify-between gap-2">
            <Label>{vacation() ? "Next long break" : "Next holiday"}</Label>
            <Text class="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary-ink">{`${HOLIDAY_YEAR}`}</Text>
          </Row>
          <If when={hero() !== null}>
            {() => {
              const item = hero() as Holiday;
              const countdown = holidayCountdown(item, today());
              return (
                <View class="gap-1">
                  <Row class="items-end gap-3">
                    <Text class="text-[40px] font-bold leading-10 tabular-nums tracking-tight text-primary">
                      {countdown.value}
                    </Text>
                    <View class="gap-0.5 pb-1">
                      <Text class="text-[14px] font-semibold text-foreground">{countdown.label}</Text>
                      <Muted class="text-[11px]">{`${holidayDaysLabel(item)} · ${categoryLabel(item.category)}`}</Muted>
                    </View>
                  </Row>
                  <Text class="text-[17px] font-semibold leading-6 text-foreground">{item.label}</Text>
                  <Muted class="text-[12px]">{spanOf(item)}</Muted>
                  <Muted class="text-[12px]">{item.name}</Muted>
                  <If when={item.moonBased === true}>
                    <Muted class="text-[11px]">Moon sighting may move this by a day.</Muted>
                  </If>
                </View>
              );
            }}
          </If>
          <If when={hero() === null}>
            <Text class="text-[15px] font-semibold text-foreground">No holidays left in 2026</Text>
          </If>
          <If when={hero() !== null && next() !== null && hero()?.id !== next()?.id}>
            <Divider />
            {() => {
              const item = next() as Holiday;
              const countdown = holidayCountdown(item, today());
              return (
                <Row class="justify-between gap-2">
                  <Col class="flex-1">
                    <Label>Next holiday</Label>
                    <Text class="text-[13px] font-semibold leading-5 text-foreground">{item.label}</Text>
                    <Muted class="text-[11px]">{spanOf(item)}</Muted>
                  </Col>
                  <Text class="text-[13px] font-semibold tabular-nums text-muted-foreground">
                    {`${countdown.value} ${countdown.label}`}
                  </Text>
                </Row>
              );
            }}
          </If>
        </Panel>

        <Row class="flex-wrap justify-between gap-2">
          <Row class="flex-wrap gap-1.5">
            <Each of={["festival", "national", "vacation"] as const} key={(category: string) => category}>
              {(category) => (
                <Row class="gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5">
                  <View class={`h-1.5 w-1.5 rounded-full ${categoryDot(category() as Holiday["category"])}`} />
                  <Muted class="text-[11px]">{categoryLabel(category() as Holiday["category"])}</Muted>
                </Row>
              )}
            </Each>
          </Row>
          <Chip active={teacher()} onPress={() => showTeacherDays.update((value) => !value)}>
            {teacher() ? "Hide teacher days" : "Show teacher days"}
          </Chip>
        </Row>

        <Card class="gap-3 p-3.5">
          <Row class="justify-between gap-2">
            <View
              class="h-11 w-11 items-center justify-center rounded-full border border-border active:bg-muted"
              onPress={() => shiftMonth(-1)}
              role="button"
              accessibilityLabel="Previous month"
            >
              <Icon name="chevron-left" size={18} class="text-foreground" />
            </View>
            <Col class="items-center gap-0.5">
              <Text class="text-[16px] font-semibold text-foreground">{monthLabel(HOLIDAY_YEAR, month())}</Text>
              <Muted class="text-[11px]">{`${monthHolidays().length} holiday${monthHolidays().length === 1 ? "" : "s"}`}</Muted>
            </Col>
            <View
              class="h-11 w-11 items-center justify-center rounded-full border border-border active:bg-muted"
              onPress={() => shiftMonth(1)}
              role="button"
              accessibilityLabel="Next month"
            >
              <Icon name="chevron-right" size={18} class="text-foreground" />
            </View>
          </Row>

          <Row class="gap-1">
            <Each of={WEEKDAYS} key={(label: string, index: number) => `${label}-${index}`}>
              {(label) => (
                <View class="flex-1 items-center py-1">
                  <Muted class="text-[10px] font-semibold tracking-wide">{label()}</Muted>
                </View>
              )}
            </Each>
          </Row>

          {() => (
            <View class="gap-1">
              {weekRows(HOLIDAY_YEAR, month()).map((week) => (
                <Row class="gap-1">
                  {week.map((cell) => {
                    if (!cell) return <View class="h-11 flex-1" />;
                    const items = holidaysOn(cell.iso, teacher());
                    const active = selected() === cell.iso;
                    const isToday = cell.iso === today();
                    return (
                      <View
                        class={`min-h-11 flex-1 items-center justify-center gap-0.5 rounded-xl ${
                          active ? "bg-foreground" : isToday ? "bg-primary/10" : items.length > 0 ? "bg-muted" : ""
                        }`}
                        onPress={() => selected.set(active ? "" : cell.iso)}
                        role="button"
                        accessibilityLabel={`${cell.day} ${monthLabel(HOLIDAY_YEAR, month())}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text class={`text-[13px] tabular-nums ${active ? "text-background" : "text-foreground"}`}>
                          {String(cell.day)}
                        </Text>
                        <View
                          class={`h-1 w-1 rounded-full ${
                            items.length === 0
                              ? "bg-transparent"
                              : active
                                ? "bg-background"
                                : categoryDot(items[0].category)
                          }`}
                        />
                      </View>
                    );
                  })}
                </Row>
              ))}
            </View>
          )}
        </Card>

        <If when={selected().length > 0}>
          <Card class="gap-2 p-3.5">
            <Label>{dayHeading(selected())}</Label>
            <Each of={selectedDay()} key={(holiday: Holiday) => holiday.id}>
              {(holiday) => (
                <View class="gap-1 rounded-2xl border border-border bg-card px-3 py-2.5">
                  <Row class="justify-between gap-2">
                    <Text class="flex-1 text-[14px] font-semibold leading-5 text-foreground">{holiday().label}</Text>
                    <View class={`mt-1.5 h-2 w-2 rounded-full ${categoryDot(holiday().category)}`} />
                  </Row>
                  <Muted class="text-[11px]">{`${holiday().name} · ${holidayDaysLabel(holiday())}`}</Muted>
                </View>
              )}
            </Each>
          </Card>
        </If>

        <SectionHeader title="Breaks this year" />
        <Card class="gap-0 p-0">
          <Each of={vacations(teacher())} key={(holiday: Holiday) => holiday.id}>
            {(holiday, index) => (
              <View
                class={`flex-row items-center gap-3 px-4 py-3 ${
                  index() < vacations(teacher()).length - 1 ? "border-b border-border" : ""
                }`}
              >
                <Col class="w-[46px]">
                  <Text class="text-[15px] font-bold tabular-nums text-foreground">{shortParts(holiday().start).day}</Text>
                  <Muted class="text-[10px]">{shortParts(holiday().start).month}</Muted>
                </Col>
                <Col class="flex-1">
                  <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                    {holiday().label}
                  </Text>
                  <Muted class="text-[11px]">{`${spanOf(holiday())} · ${holidayDaysLabel(holiday())}`}</Muted>
                </Col>
                <Text class="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {ongoingHoliday(holiday(), today())
                    ? "On now"
                    : holiday().start > today()
                      ? `${Math.max(0, daysUntil(holiday().start))}d`
                      : holidayDaysLabel(holiday())}
                </Text>
              </View>
            )}
          </Each>
        </Card>

        <SectionHeader title="Academic calendar 2026" />
        <View class="gap-3">
          <Each of={byMonth(teacher())} key={(group: MonthGroup) => String(group.monthIndex)}>
            {(group) => (
              <View class="gap-2">
                <Row class="justify-between px-1">
                  <Text class="text-[13px] font-semibold text-foreground">{monthLabel(HOLIDAY_YEAR, group().monthIndex)}</Text>
                  <Muted class="text-[11px]">{`${group().items.length} date${group().items.length === 1 ? "" : "s"}`}</Muted>
                </Row>
                <Card class="gap-0 p-0">
                  <Each of={group().items} key={(holiday: Holiday) => holiday.id}>
                    {(holiday, index) => (
                      <View
                        class={`flex-row items-center gap-3 px-4 py-3 ${
                          index() < group().items.length - 1 ? "border-b border-border" : ""
                        }`}
                      >
                        <View class={`h-2 w-2 shrink-0 rounded-full ${categoryDot(holiday().category)}`} />
                        <Col class="flex-1">
                          <Text class="text-[13px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                            {holiday().label}
                          </Text>
                          <Muted class="text-[11px]">
                            {`${spanOf(holiday())} · ${categoryLabel(holiday().category)}`}
                          </Muted>
                        </Col>
                        <Muted class="text-[10px]">{holidayDays(holiday()) === 1 ? "1 day" : `${holidayDays(holiday())} days`}</Muted>
                      </View>
                    )}
                  </Each>
                </Card>
              </View>
            )}
          </Each>
        </View>

        <Muted class="px-1 text-[11px]">
          {`${HOLIDAY_SOURCE} · ${HOLIDAYS_2026.length} entries · teacher-only days are hidden until you switch them on`}
        </Muted>
      </Body>
      <CalendarReader open={readerOpen()} onChange={(open) => readerOpen.set(open)} />
    </Screen>
  );
}
