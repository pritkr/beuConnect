/**
 * Reminders & holidays — a local schedule, explained honestly.
 *
 * The runtime has no notification API: no system banner, no alarm, no wake-up
 * when the app is closed. Rather than pretend otherwise, this screen saves the
 * student's class times and holiday choice, shows what the app will surface
 * while it is open, and says plainly what it cannot do.
 *
 * Storage is one object (`beu.reminders.v1`, written through `prefs.ts`):
 *   { classes: boolean, times: ["08:30", …], holidays: boolean }
 */

import { Text, View, signal } from "nsh";
import { Badge, Body, Btn, Card, EmptyState, Field, Label, Muted, Panel, Screen, SectionHeader } from "../../ui";
import { Icon } from "../../ui/icons";
import type { Nav } from "../../app/router";
import { formatDate } from "../../lib/net";
import { countdownLabel, daysUntil, isoDate } from "../tools/engine";
import type { Holiday } from "../tools/holidays-data";
import { HOLIDAYS_2026, categoryLabel } from "../tools/holidays-data";
import type { Reminders } from "./prefs";
import {
  REMINDER_LIMIT,
  nextReminder,
  normalizeTime,
  timeLabel,
  updateReminders,
  useReminders,
  waitLabel,
} from "./prefs";
import { ScreenIntro, SettingsGroup, SettingsToggle } from "./ui";

function upcomingHolidays(): Holiday[] {
  const today = isoDate(new Date());
  return HOLIDAYS_2026.filter((holiday) => (holiday.end ?? holiday.start) >= today).slice(0, 4);
}

function nextLine(reminders: Reminders): string {
  if (!reminders.classes) return "Class reminders are off.";
  if (reminders.times.length === 0) return "No times yet — add one so the app knows when to nudge you.";
  const next = nextReminder(reminders.times, new Date());
  if (next) return `Next today: ${timeLabel(next.time)} · ${waitLabel(next.minutes)}.`;
  const firstTomorrow = [...reminders.times].sort()[0];
  return `Today's times have passed. Tomorrow starts at ${timeLabel(firstTomorrow)}.`;
}

export function RemindersScreen(props: { nav: Nav }) {
  const reminders = useReminders();
  const entry = signal("");
  const problem = signal<string | null>(null);

  const setClasses = (on: boolean): void => {
    void updateReminders({ classes: on });
  };

  const setHolidays = (on: boolean): void => {
    void updateReminders({ holidays: on });
  };

  const addTime = (): void => {
    const current = reminders();
    const time = normalizeTime(entry());
    if (!time) {
      problem.set("Use a 24-hour time like 08:30 or 14:05.");
      return;
    }
    if (current.times.includes(time)) {
      problem.set("That time is already on the list.");
      return;
    }
    if (current.times.length >= REMINDER_LIMIT) {
      problem.set(`Three times is the limit — remove one first.`);
      return;
    }
    problem.set(null);
    entry.set("");
    void updateReminders({ times: [...current.times, time] });
  };

  const removeTime = (time: string): void => {
    problem.set(null);
    void updateReminders({ times: reminders().times.filter((value) => value !== time) });
  };

  const holidays = (): Holiday[] => upcomingHolidays();

  return (
    <Screen>
      <Body>
        <ScreenIntro
          label="Rhythm"
          title="Reminders"
        />

        <Panel tone="amber" class="gap-2">
          <Label>What this can and cannot do</Label>
          <Text class="text-[13px] leading-5 text-foreground">
            This app has no notification permission — the runtime exposes no notification API at all. So nothing rings,
            pops up or wakes your phone while BEUConnect is closed.
          </Text>
          <Text class="text-[12px] leading-5 text-muted-foreground">
            What it does: keeps your class times and holiday choice on this phone, and shows them while the app is open.
            No alarm is scheduled, and nothing is uploaded.
          </Text>
        </Panel>

        <SectionHeader title="Class reminders" />
        <SettingsGroup>
          <SettingsToggle
            title="Class reminders"
            hint="Show the day's start time while the app is open"
            checked={reminders().classes}
            onChange={setClasses}
            last
          />
        </SettingsGroup>

        {reminders().classes ? (
          <View class="gap-3">
            <Panel tone="plain" class="gap-1">
              <Label>Today</Label>
              <Text class="text-[13px] leading-5 text-foreground">{nextLine(reminders())}</Text>
            </Panel>

            <View class="gap-2">
              <Label>Saved times</Label>
              {reminders().times.length === 0 ? (
                <Muted>No times yet. Add the first one below.</Muted>
              ) : (
                reminders().times.map((time) => (
                  <View class="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4">
                    <Text class="flex-1 text-[15px] font-semibold tabular-nums text-foreground">{timeLabel(time)}</Text>
                    <Muted class="text-[11px]">{time}</Muted>
                    <View
                      class="min-h-11 min-w-11 items-center justify-center rounded-full active:bg-muted"
                      onPress={() => removeTime(time)}
                      role="button"
                      accessibilityLabel={`Remove ${timeLabel(time)}`}
                    >
                      <Icon name="x" size={15} class="text-muted-foreground" />
                    </View>
                  </View>
                ))
              )}
            </View>

            <View class="gap-2">
              <Field
                label="Add a time"
                value={entry()}
                onChange={(value: string) => {
                  entry.set(value);
                  if (problem()) problem.set(null);
                }}
                placeholder="e.g. 08:30 or 14:05"
                keyboard="default"
                maxLength={5}
                hint={problem() ?? `24-hour clock. Up to ${REMINDER_LIMIT} times, for morning and afternoon shifts.`}
                onSubmit={addTime}
              />
              <Btn
                variant="secondary"
                onPress={addTime}
                disabled={!normalizeTime(entry()) || reminders().times.length >= REMINDER_LIMIT}
              >
                Add time
              </Btn>
            </View>
          </View>
        ) : (
          <Muted class="px-1">Turn class reminders on to set the times you start class.</Muted>
        )}

        <SectionHeader title="Holidays" />
        <SettingsGroup>
          <SettingsToggle
            title="Holiday countdowns"
            hint="Next holiday on Home and here"
            checked={reminders().holidays}
            onChange={setHolidays}
            last
          />
        </SettingsGroup>

        {reminders().holidays ? (
          holidays().length ? (
            holidays().map((holiday) => (
              <Card class="flex-row items-center gap-3">
                <View class="h-10 w-10 items-center justify-center rounded-2xl bg-accent/12">
                  <Text class="text-[13px] font-bold tabular-nums text-accent">{holiday.start.slice(8, 10)}</Text>
                </View>
                <View class="flex-1 gap-0.5">
                  <Text class="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                    {holiday.label}
                  </Text>
                  <Muted>
                    {formatDate(`${holiday.start}T12:00:00`)} · {categoryLabel(holiday.category)}
                  </Muted>
                </View>
                <Badge tone="mint">{countdownLabel(daysUntil(holiday.start))}</Badge>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No holidays left in the 2026 calendar"
              hint="The next academic calendar will appear here when BEU publishes it."
            />
          )
        ) : (
          <Muted class="px-1">Holiday countdowns are hidden.</Muted>
        )}

        <Btn variant="secondary" onPress={() => props.nav.push("tools.holidays")}>
          Open the full 2026 calendar
        </Btn>

        <Muted class="px-1">
          The calendar is BEU's 2026 list, packed into the app. Lunar dates can move by a day — check the university
          notice.
        </Muted>
      </Body>
    </Screen>
  );
}
