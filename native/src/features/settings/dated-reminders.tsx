/**
 * Dated reminders — exam dates, attendance deadlines and holidays the student
 * adds by hand, with the "due today" list the Reminders screen opens with.
 *
 * Nothing here schedules a system alarm: the runtime has no notification API,
 * so a reminder is a row the app shows while it is open. The screen says that
 * once, plainly, and never implies an alarm that will not ring.
 */

import { Text, View, platform, signal } from "nsh";
import { DateTimePicker, Haptics } from "nsh/mobile";

import { Badge, Btn, Card, Field, Label, Muted, Panel, SectionHeader } from "../../ui";
import { Icon } from "../../ui/icons";
import type { DatedReminder, ReminderKind } from "./dates";
import {
  DATES_LIMIT,
  KIND_LABEL,
  KINDS,
  TITLE_LIMIT,
  addDatedReminder,
  bucketsOf,
  dueLabel,
  formatDateInput,
  isoDay,
  isValidIsoDay,
  normalizeTitle,
  parseIsoDay,
  removeDatedReminder,
  setDatedDone,
  shiftDay,
  useDatedReminders,
} from "./dates";

/**
 * Whether the system draws the date picker.
 *
 * iOS and Android do (`nsh/mobile`); the web and the desktops have none, so
 * they keep the typed `YYYY-MM-DD` field. The platform never changes while the
 * app runs.
 */
const SYSTEM_DATE_PICKER = platform.os === "ios" || platform.os === "android";

function QuickDate(props: { label: string; onPress: () => void }) {
  return (
    <View
      class="min-h-11 justify-center rounded-full border border-border bg-card px-3.5 active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
    >
      <Text class="text-[13px] font-semibold text-foreground">{props.label}</Text>
    </View>
  );
}

function ReminderRow(props: { reminder: DatedReminder; today: string }) {
  const reminder = props.reminder;
  const delta = dueLabel(reminder.date, props.today);
  const late = reminder.date < props.today;

  const toggle = (): void => {
    Haptics.selection();
    void setDatedDone(reminder.id, !reminder.done);
  };

  return (
    <View class="min-h-11 flex-row items-center gap-2 rounded-2xl border border-border bg-card pl-3 pr-1">
      <View
        class="min-h-11 flex-1 flex-row items-center gap-3 py-2.5 active:opacity-70"
        onPress={toggle}
        role="button"
        accessibilityLabel={`${reminder.done ? "Reopen" : "Mark done"}: ${reminder.title}`}
        accessibilityState={{ checked: reminder.done }}
      >
        <View
          class={`h-5 w-5 items-center justify-center rounded-full border ${
            reminder.done ? "border-accent bg-accent" : "border-border bg-card"
          }`}
        >
          {reminder.done ? <Icon name="check" size={12} class="text-accent-foreground" /> : null}
        </View>
        <View class="flex-1 gap-0.5">
          <Text
            class={`text-[14px] font-semibold ${reminder.done ? "text-muted-foreground" : "text-foreground"}`}
            style={{ numberOfLines: 2 }}
          >
            {reminder.title}
          </Text>
          <Muted>
            {KIND_LABEL[reminder.kind]} · {delta}
          </Muted>
        </View>
        {!reminder.done && late ? <Badge tone="amber">Late</Badge> : null}
      </View>
      <View
        class="min-h-11 min-w-11 items-center justify-center rounded-full active:bg-muted"
        onPress={() => {
          void removeDatedReminder(reminder.id);
        }}
        role="button"
        accessibilityLabel={`Delete ${reminder.title}`}
      >
        <Icon name="x" size={14} class="text-muted-foreground" />
      </View>
    </View>
  );
}

export function DatedReminders() {
  const reminders = useDatedReminders();
  const today = (): string => isoDay();
  const buckets = () => bucketsOf(reminders(), today());

  const adding = signal(false);
  const title = signal("");
  const date = signal(isoDay());
  const kind = signal<ReminderKind>("exam");
  const problem = signal("");
  const saved = signal("");
  const showDone = signal(false);

  const openForm = (): void => {
    adding.set(true);
    date.set(isoDay());
    problem.set("");
    saved.set("");
  };

  const closeForm = (): void => {
    adding.set(false);
    title.set("");
    problem.set("");
  };

  const save = (): void => {
    const text = normalizeTitle(title());
    if (text === "") {
      problem.set("Say what this reminder is for.");
      return;
    }
    if (!isValidIsoDay(date())) {
      problem.set("Use a real date, like 2026-11-14.");
      return;
    }
    if (reminders().length >= DATES_LIMIT) {
      problem.set(`${DATES_LIMIT} reminders is the limit — delete one first.`);
      return;
    }
    void addDatedReminder({ title: text, date: date(), kind: kind() }).then((ok) => {
      if (!ok) {
        problem.set("That reminder could not be saved. Try again.");
        Haptics.notification("error");
        return;
      }
      saved.set(`Saved · ${dueLabel(date(), today())}`);
      Haptics.notification("success");
      closeForm();
      title.set("");
    });
  };

  return (
    <View class="gap-3">
      <SectionHeader title="Due today" />

      {buckets().due.length === 0 ? (
        <Card class="gap-1">
          <Text class="text-[14px] font-semibold text-foreground">Nothing due today</Text>
          <Muted>Add an exam date or an attendance deadline.</Muted>
        </Card>
      ) : (
        <View class="gap-2">
          {buckets().due.map((reminder) => (
            <ReminderRow reminder={reminder} today={today()} />
          ))}
        </View>
      )}

      {buckets().later.length === 0 ? null : (
        <View class="gap-2">
          <Label>Upcoming</Label>
          {buckets()
            .later.slice(0, 5)
            .map((reminder) => (
              <ReminderRow reminder={reminder} today={today()} />
            ))}
        </View>
      )}

      {buckets().done.length === 0 ? null : (
        <View class="gap-2">
          <View
            class="min-h-11 flex-row items-center justify-between rounded-2xl px-1 active:opacity-70"
            onPress={() => showDone.set(!showDone())}
            role="button"
            accessibilityLabel={showDone() ? "Hide done reminders" : "Show done reminders"}
          >
            <Muted>
              {buckets().done.length} done
            </Muted>
            <View class="flex-row items-center gap-1">
              <Text class="text-[12px] font-semibold text-primary">{showDone() ? "Hide" : "Show"}</Text>
              <Icon name={showDone() ? "chevron-up" : "chevron-down"} size={14} class="text-primary" />
            </View>
          </View>
          {showDone()
            ? buckets()
                .done.slice(0, 5)
                .map((reminder) => <ReminderRow reminder={reminder} today={today()} />)
            : null}
        </View>
      )}

      {saved() === "" ? null : <Muted class="px-1 text-accent">{saved()}</Muted>}

      {adding() ? (
        <Panel tone="plain" class="gap-3">
          <Label>New reminder</Label>
          <Field
            value={title()}
            onChange={(value: string) => {
              title.set(value);
              if (problem()) problem.set("");
            }}
            placeholder="e.g. Maths end-sem"
            maxLength={TITLE_LIMIT}
            autoFocus
            onSubmit={save}
          />

          <View class="flex-row flex-wrap gap-2">
            {KINDS.map((option) => (
              <Btn
                variant={kind() === option ? "primary" : "secondary"}
                onPress={() => kind.set(option)}
                class="px-4"
                label={KIND_LABEL[option]}
              >
                {KIND_LABEL[option]}
              </Btn>
            ))}
          </View>

          {SYSTEM_DATE_PICKER ? (
            <View class="gap-1">
              <Label>Date</Label>
              <View class="min-h-11 flex-row items-center">
                <DateTimePicker
                  mode="date"
                  value={date()}
                  // A reminder still makes sense a year late ("Late" in the
                  // list); five years out is past any BEU date this app knows.
                  min={shiftDay(-365)}
                  max={shiftDay(1825)}
                  accessibilityLabel="Reminder date"
                  onChange={(event) => {
                    const day = parseIsoDay(event.value);
                    if (!day) return;
                    date.set(isoDay(day));
                    Haptics.selection();
                    if (problem()) problem.set("");
                  }}
                />
              </View>
            </View>
          ) : (
            <Field
              label="Date"
              value={date()}
              onChange={(value: string) => {
                date.set(formatDateInput(value));
                if (problem()) problem.set("");
              }}
              placeholder="2026-11-14"
              keyboard="number-pad"
              maxLength={10}
              onSubmit={save}
            />
          )}

          <View class="flex-row flex-wrap gap-2">
            <QuickDate label="Today" onPress={() => date.set(isoDay())} />
            <QuickDate label="Tomorrow" onPress={() => date.set(shiftDay(1))} />
            <QuickDate label="In a week" onPress={() => date.set(shiftDay(7))} />
          </View>

          {problem() === "" ? null : <Muted class="text-destructive">{problem()}</Muted>}

          <View class="flex-row gap-2">
            <View class="flex-1">
              <Btn onPress={save} disabled={normalizeTitle(title()) === "" || !isValidIsoDay(date())}>
                Save
              </Btn>
            </View>
            <View class="flex-1">
              <Btn variant="ghost" onPress={closeForm}>
                Cancel
              </Btn>
            </View>
          </View>
        </Panel>
      ) : (
        <Btn variant="secondary" onPress={openForm} label="Add a reminder">
          Add a reminder
        </Btn>
      )}
    </View>
  );
}
