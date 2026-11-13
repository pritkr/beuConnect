/**
 * The wire between the Wi-Fi screen and the Android runner.
 *
 * The runner is a `JobService` in BEUConnect's own host: it has to keep
 * signing in while the app is closed, so it cannot live in this bundle. The
 * screen owns the form, the host owns the request, and this file is the one
 * place they meet:
 *
 * - on mount it asks for the host's copy (`status`), which is authoritative —
 *   the password survives a restart there, not in this bundle;
 * - every edit to `wifi()` is pushed down as one `save`, debounced so a
 *   keystroke is not a disk write;
 * - the host answers with `state`, which lands back in the signals the screen
 *   reads.
 *
 * There is no loop: `state` only sets `wifi` when a value actually differs, and
 * `save` never answers. On every platform without the component (macOS while
 * developing, the web) `WifiAutoBridge` renders nothing and the screen falls
 * back to the manual steps.
 */

import { effect, nativeComponent, platform, signal, type NativeComponentRef } from "nsh";

import type { WifiState } from "./state";
import { EMPTY_WIFI_STATUS, isWifiPhase } from "./wifi-auto";
import { wifi, wifiStatus } from "./store";

/** The events the host emits: one snapshot of its config and last result. */
interface WifiAutoEvents {
  state: Record<string, unknown>;
}

const WifiAuto = nativeComponent<object, WifiAutoEvents>("WifiAuto", {
  props: [],
  events: ["state"],
});

/** The mounted host. A module call, so the screen never holds a node. */
let host: NativeComponentRef | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

/** Whether this platform can sign in with the app closed. */
export function wifiAutoSupported(): boolean {
  return platform.os === "android";
}

/** "Check now": the runner ignores it while another check is in flight. */
export function checkWifiNow(): void {
  host?.command("check");
}

/**
 * Mount once, in the shell. Zero-sized: the host is a command target, not a
 * view, and a screen that opens twice must not schedule two runners.
 */
export function WifiAutoBridge() {
  if (!wifiAutoSupported()) return null;
  const live = signal(false);

  effect(() => {
    if (!live()) return;
    const state = wifi();
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      host?.command("save", {
        regNo: state.regNo,
        password: state.password,
        portal: state.portal,
        rotate: state.rotate,
        enabled: state.auto,
      });
    }, 400);
  });

  return (
    <WifiAuto
      style={{ width: 0, height: 0 }}
      ref={(element: NativeComponentRef) => {
        host = element;
        live.set(true);
        // The host's copy is the one that survived the last process death.
        element.command("status");
      }}
      onState={(event) => applyNativeState(event)}
    />
  );
}

/** Folds one host snapshot into the screen's signals. */
function applyNativeState(event: Record<string, unknown>): void {
  const next: WifiState = {
    regNo: text(event.regNo, ""),
    portal: text(event.portal, ""),
    password: text(event.password, ""),
    auto: event.enabled !== false,
    rotate: event.rotate !== false,
  };
  const current = wifi();
  if (
    next.regNo !== current.regNo ||
    next.portal !== current.portal ||
    next.password !== current.password ||
    next.auto !== current.auto ||
    next.rotate !== current.rotate
  ) {
    wifi.set(next);
  }

  wifiStatus.set({
    phase: isWifiPhase(event.phase) ? event.phase : EMPTY_WIFI_STATUS.phase,
    message: text(event.message, ""),
    at: number(event.at, 0),
    okAt: number(event.okAt, 0),
    attempts: number(event.attempts, 0),
  });
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
