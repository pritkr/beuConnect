/**
 * Notifications: the screen and the wire to the Android host.
 *
 * The host owns delivery — a `FirebaseMessagingService` in the app's own
 * process, with the app closed — so this file cannot subscribe to anything
 * itself. It is the same split as `WifiAuto`: a `nativeComponent` with one
 * `state` event, commands for the changes, and a module signal the screen
 * reads.
 *
 * Two rules shape the screen:
 *
 * - The switch is the truth. Turning it on asks Android for permission; a
 *   refusal is shown as a reason, not as an error, and the topics stay visible
 *   so a student can fix it in system settings without losing the screen.
 * - A local test notification is the only proof. There is no "sent" flag to
 *   show and no server round trip to fake, so "Send a test" posts one through
 *   the same channel a real notice uses.
 */

import { Text, View, effect, nativeComponent, platform, signal, type NativeComponentRef } from "nsh";

import { Body, Muted, Screen, SectionHeader } from "../../ui";
import { SettingsGroup, SettingsRow, SettingsToggle } from "./ui";

/* ------------------------------------------------------------------- model */

export type NotifyTopic = "important" | "results" | "notices";

export interface NotifyState {
  supported: boolean;
  enabled: boolean;
  permission: boolean;
  topics: Record<NotifyTopic, boolean>;
  lastAt: number;
}

const TOPICS: { key: NotifyTopic; title: string; hint: string }[] = [
  { key: "important", title: "Important", hint: "Circulars the university pins." },
  { key: "results", title: "Results", hint: "Semester results, revaluation and marks." },
  { key: "notices", title: "All notices", hint: "Everything else on the board." },
];

const EMPTY: NotifyState = {
  supported: false,
  enabled: true,
  permission: false,
  topics: { important: true, results: true, notices: false },
  lastAt: 0,
};

export const notifyState = signal<NotifyState>(EMPTY);

interface NotifyEvents {
  state: Record<string, unknown>;
}

const Notify = nativeComponent<object, NotifyEvents>("Notify", {
  props: [],
  events: ["state"],
});

/** Whether this platform has the host component at all. */
export function notificationsSupported(): boolean {
  return platform.os === "android";
}

let host: NativeComponentRef | null = null;
let askedThisRun = false;
let askRequested = false;

/* ------------------------------------------------------------------ bridge */

/**
 * Mounted once by the shell. Zero-sized: it is a command target, not a view.
 *
 * `enable` is also the permission prompt, so the notices screen can ask at the
 * one moment the value is obvious and never again in that run.
 */
export function NotificationBridge() {
  if (!notificationsSupported()) return null;

  return (
    <Notify
      style={{ width: 0, height: 0 }}
      ref={(element: NativeComponentRef) => {
        host = element;
        element.command("status");
      }}
      onState={(event) => applyState(event)}
    />
  );
}

function applyState(event: Record<string, unknown>): void {
  const topics = (event.topics ?? {}) as Record<string, unknown>;
  notifyState.set({
    supported: event.supported === true,
    enabled: event.enabled !== false,
    permission: event.permission === true,
    topics: {
      important: topics.important !== false,
      results: topics.results !== false,
      notices: topics.notices === true,
    },
    lastAt: typeof event.lastAt === "number" ? event.lastAt : 0,
  });
  // The board may mount before the host's first `state`; the ask waits for it
  // here instead of reading an empty signal and giving up for the run.
  attemptAsk();
}

function command(name: string, value?: unknown): void {
  host?.command(name, value);
}

/* ----------------------------------------------------------------- actions */

export function setNotificationsEnabled(on: boolean): void {
  command(on ? "enable" : "disable");
}

export function setNotifyTopic(topic: NotifyTopic, on: boolean): void {
  command("topics", { [topic]: on });
}

export function sendTestNotification(): void {
  command("test");
}

/**
 * The one contextual ask: the first time the notices board opens.
 *
 * It is a no-op when the host is unsupported, the switch is off, permission is
 * already granted, or Android already refused — the host remembers the refusal,
 * so a student is asked once, not every launch.
 */
export function maybeAskForNotifications(): void {
  askRequested = true;
  attemptAsk();
}

function attemptAsk(): void {
  if (askedThisRun || !askRequested || !notificationsSupported()) return;
  const state = notifyState();
  if (!state.supported || !state.enabled || state.permission) return;
  askedThisRun = true;
  command("enable");
}

/* ------------------------------------------------------------------ screen */

function ago(at: number): string {
  if (!at) return "No notification yet";
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 2) return "Last notification just now";
  if (minutes < 60) return `Last notification ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last notification ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Last notification ${days} day${days === 1 ? "" : "s"} ago`;
}

function reason(state: NotifyState): string | null {
  if (!state.supported) return "This build has no notification service. Notices still arrive on the board.";
  if (!state.enabled) return "Off. Nothing arrives while the app is closed.";
  if (!state.permission) return "Android is blocking notifications. Allow them for BEUConnect in system settings.";
  return null;
}

export function NotificationsScreen() {
  const state = notifyState;

  // Re-read on mount: another process (a reboot, a system settings change)
  // may have moved the switches since this screen was last open.
  effect(() => {
    command("status");
  });

  return (
    <Screen>
      <Body>
        <SettingsGroup>
          <SettingsToggle
            title="Notifications"
            hint="Important notices and results, with the app closed."
            checked={state().enabled}
            onChange={(on) => setNotificationsEnabled(on)}
            last
          />
        </SettingsGroup>

        {() => {
          const current = state();
          const why = reason(current);
          return why ? (
            <View class="gap-1 px-1">
              <Muted>{why}</Muted>
            </View>
          ) : (
            <View class="gap-1 px-1">
              <Text class="text-[12px] leading-4 text-muted-foreground">{ago(current.lastAt)}</Text>
            </View>
          );
        }}

        <SectionHeader title="Send me" />
        <SettingsGroup>
          {TOPICS.map((topic, index) => (
            <SettingsToggle
              title={topic.title}
              hint={topic.hint}
              checked={state().topics[topic.key]}
              onChange={(on) => setNotifyTopic(topic.key, on)}
              last={index === TOPICS.length - 1}
            />
          ))}
        </SettingsGroup>

        <SectionHeader title="Check" />
        <SettingsGroup>
          <SettingsRow
            title="Send a test"
            hint="Posts one through the same channel a real notice uses."
            onPress={() => sendTestNotification()}
            last
          />
        </SettingsGroup>
      </Body>
    </Screen>
  );
}
