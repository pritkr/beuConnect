/**
 * The tools hub: today's three answers, then one door per tool.
 *
 * There is no card per mode. The calculator has four modes and one door; the
 * old grid had three tiles for the same screen and a student had to guess
 * which one to open. A door carries a live number — today's SGPA, the
 * attendance percentage, the next period — and nothing else: a description of
 * a screen is not information, and at 320 pt it is the first thing to go.
 */

import { Text, View } from "nsh";
import type { Nav } from "../../app/router";
import { formatDate } from "../../lib/net";
import { Badge, Body, Card, Col, Divider, Label, Muted, Ring, Row, Screen } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import { fixed, isoDate, sgpa } from "./engine";
import type { Holiday } from "./holidays-data";
import { categoryLabel, nextHoliday } from "./holidays-data";
import { dayName } from "./routine-parse";
import {
  bunkLine,
  holidayCountdown,
  holidaySpan,
  nextClassInfo,
  overallAttendance,
  waitLabel,
} from "./shared";
import { attendance, calc, nowMs, routine } from "./store";
import { effectiveRoutine } from "./store";

type Tone = "ember" | "mint" | "amber";

const INK: Record<Tone, string> = {
  ember: "text-primary-ink",
  mint: "text-accent-ink",
  amber: "text-chart-3",
};

/**
 * One tool: an icon, its name, the one live number that belongs to it, a
 * chevron. The same row shape as Home's directory, so the two launchers read
 * alike.
 */
function ToolDoor(props: {
  title: string;
  value?: string;
  tone: Tone;
  icon: IconName;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <View
      class={`min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-muted ${
        props.last ? "" : "border-b border-border"
      }`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.title}
    >
      <Icon name={props.icon} size={19} class={INK[props.tone]} />
      <Text class="flex-1 text-[15px] font-semibold text-foreground" numberOfLines={1}>
        {props.title}
      </Text>
      {props.value ? (
        <Text class="text-[13px] tabular-nums text-muted-foreground" numberOfLines={1}>
          {props.value}
        </Text>
      ) : null}
      <Icon name="chevron-right" size={17} class="text-muted-foreground" />
    </View>
  );
}

export function ToolsHub(props: { nav: Nav }) {
  const today = (): string => isoDate(new Date(nowMs()));
  const week = () => effectiveRoutine(routine());
  const info = () => nextClassInfo(week(), new Date(nowMs()));
  const holiday = (): Holiday | null => nextHoliday(today());
  const overall = () => overallAttendance(attendance());
  const semester = () => sgpa(calc().subjects);

  const classTitle = (): string => {
    const item = info();
    if (item.moment === "none") return "No routine";
    if (item.moment === "done") return "No classes today";
    if (item.moment === "now") return `${item.subject} · until ${item.end}`;
    return `${item.subject} at ${item.start}`;
  };

  const classHint = (): string => {
    const item = info();
    if (item.moment === "now") return item.room ? `Room ${item.room}` : "";
    if (item.moment === "next") {
      return [waitLabel(item.minutesAway), item.room ? `Room ${item.room}` : ""]
        .filter(Boolean)
        .join(" · ");
    }
    return "";
  };

  const holidayValue = (): string => {
    const item = holiday();
    if (!item) return "";
    const countdown = holidayCountdown(item, today());
    return `${countdown.value} day${countdown.value === "1" ? "" : "s"}`;
  };

  const holidayHint = (): string => {
    const item = holiday();
    return item ? `${holidaySpan(item.start, item.end)} · ${categoryLabel(item.category)}` : "";
  };

  const routineValue = (): string => {
    const item = info();
    if (item.moment === "now") return "Now";
    if (item.moment === "next") return item.start;
    return "";
  };

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <Card class="gap-3 p-4">
          <Row class="justify-between gap-2">
            <Label>Today</Label>
            <Muted class="text-[11px] tabular-nums">{`${dayName()} · ${formatDate(new Date(nowMs()))}`}</Muted>
          </Row>
          <Divider />
          <Row class="items-start gap-3">
            <View class="mt-1 h-2 w-2 rounded-full bg-primary" />
            <Col class="flex-1">
              <Label class="text-[10px]">Next class</Label>
              <Text class="text-[14px] font-semibold leading-5 text-foreground">{classTitle()}</Text>
              {() => (classHint() ? <Muted class="text-[11px] tabular-nums">{classHint()}</Muted> : null)}
            </Col>
            <If when={info().moment === "now"}>
              <Badge tone="ember">Now</Badge>
            </If>
            <If when={info().moment === "next"}>
              <Badge tone="mint">{waitLabel(info().minutesAway)}</Badge>
            </If>
          </Row>
          <Divider />
          <Row class="items-start gap-3">
            <View class="mt-1 h-2 w-2 rounded-full bg-chart-3" />
            <Col class="flex-1">
              <Label class="text-[10px]">Next holiday</Label>
              <Text class="text-[14px] font-semibold leading-5 text-foreground">
                {holiday()?.label ?? "None left in 2026"}
              </Text>
              {() => (holidayHint() ? <Muted class="text-[11px]">{holidayHint()}</Muted> : null)}
            </Col>
            <If when={holiday() !== null}>
              <Badge tone="amber">{holidayValue()}</Badge>
            </If>
          </Row>
          <Divider />
          <Row class="items-center gap-3">
            {() => (
              <Ring
                value={overall().status.percent}
                size={48}
                label={overall().total > 0 ? `${overall().status.percent}%` : "—"}
                tone={overall().status.type === "risk" ? "ember" : "mint"}
              />
            )}
            <Col class="flex-1">
              <Label class="text-[10px]">Attendance</Label>
              <Text class="text-[14px] font-semibold leading-5 text-foreground">
                {bunkLine(overall().attended, overall().total, attendance().target)}
              </Text>
              <Muted class="text-[11px] tabular-nums">
                {overall().total > 0
                  ? `${overall().attended} of ${overall().total} · target ${attendance().target}%`
                  : `Target ${attendance().target}%`}
              </Muted>
            </Col>
          </Row>
        </Card>

        <Card class="p-0">
          <ToolDoor
            title="Calculator"
            value={semester().credits > 0 ? fixed(semester().value) : ""}
            tone="ember"
            icon="calculator"
            onPress={() => props.nav.push("tools.calculator")}
          />
          <ToolDoor
            title="Attendance"
            value={overall().total > 0 ? `${overall().status.percent}%` : ""}
            tone="mint"
            icon="user-check"
            onPress={() => props.nav.push("tools.attendance")}
          />
          <ToolDoor
            title="Routine"
            value={routineValue()}
            tone="amber"
            icon="calendar-week"
            onPress={() => props.nav.push("tools.routine")}
          />
          <ToolDoor
            title="Holidays"
            value={holidayValue()}
            tone="mint"
            icon="calendar-star"
            onPress={() => props.nav.push("tools.holidays")}
          />
          <ToolDoor
            title="Wi-Fi help"
            tone="ember"
            icon="wifi"
            last
            onPress={() => props.nav.push("tools.wifi")}
          />
        </Card>
      </Body>
    </Screen>
  );
}
