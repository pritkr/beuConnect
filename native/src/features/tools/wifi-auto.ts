/**
 * Campus Wi-Fi auto sign-in — the facts, and the decisions this bundle makes.
 *
 * The request itself is not here. The portal has to be signed back in while
 * the app is closed, and this bundle does not run then, so the runner lives in
 * the Android host (`android/java/com/longbridge/nsh/WifiAutoLogin.java`).
 * What stays here is everything the screen decides: the defaults, which
 * registration numbers the runner may try, and what the last check means.
 *
 * The account: BEU's Omada portal takes a registration number and one shared
 * password. The campus creates `24105157xxx` for 001–112, so a session that
 * was logged out can be taken back by the next free suffix.
 */

/** The account the app ships with. The screen shows both fields, editable. */
export const WIFI_DEFAULTS = {
  regNo: "24105157049",
  password: "123456",
} as const;

/** The suffix range the campus keeps accounts in, inclusive. */
export const ROTATION_MIN = 1;
export const ROTATION_MAX = 112;

/**
 * What the runner is doing, as one word.
 *
 * `off` and `unsupported` are the app's own states; the rest come back from
 * Android. `rejected` is the portal answering "no"; `unreachable` is the
 * network not answering at all. They are kept apart because the fix differs:
 * one is a password, the other is a Wi-Fi connection.
 */
export type WifiPhase =
  | "off"
  | "idle"
  | "checking"
  | "online"
  | "signed-in"
  | "rejected"
  | "unreachable"
  | "unsupported";

const PHASES: readonly WifiPhase[] = [
  "off",
  "idle",
  "checking",
  "online",
  "signed-in",
  "rejected",
  "unreachable",
  "unsupported",
];

export interface WifiStatus {
  phase: WifiPhase;
  /** The runner's own sentence when it has one: a portal error, a stale session. */
  message: string;
  /** When the last check finished. 0 until the first one. */
  at: number;
  /** When a sign-in last succeeded. */
  okAt: number;
  /** Consecutive failures; the runner backs off while this climbs. */
  attempts: number;
}

export const EMPTY_WIFI_STATUS: WifiStatus = { phase: "idle", message: "", at: 0, okAt: 0, attempts: 0 };

export function isWifiPhase(value: unknown): value is WifiPhase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

/**
 * The same registration number with its last three digits replaced.
 *
 * A number shorter than four characters has no suffix to replace, so it is
 * returned untouched rather than becoming a different account.
 */
export function rotateRegNo(regNo: string, suffix: number): string {
  const trimmed = regNo.trim();
  if (trimmed.length < 4) return trimmed;
  const bounded = Math.min(ROTATION_MAX, Math.max(ROTATION_MIN, Math.round(suffix)));
  return trimmed.slice(0, -3) + String(bounded).padStart(3, "0");
}

/**
 * The numbers the runner tries, in order: the one the student typed first,
 * then — only when rotation is on — a spread of suffixes.
 *
 * The spread starts from the clock in minutes, so two phones on the same
 * campus rarely race for the same account, and the 37-step offset is coprime
 * with the 112-account range, so three tries land on three different accounts.
 */
export function loginNames(regNo: string, rotate: boolean, attempts = 3, seed = Date.now()): string[] {
  const first = regNo.trim();
  if (first === "") return [];
  const names: string[] = [first];
  if (!rotate) return names;

  const span = ROTATION_MAX - ROTATION_MIN + 1;
  const start = Math.abs(Math.floor(seed / 60_000)) % span;
  for (let index = 0; index < Math.max(0, attempts - 1); index += 1) {
    const name = rotateRegNo(first, ROTATION_MIN + ((start + index * 37) % span));
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** The one-line answer under the switch. */
export function statusLine(status: WifiStatus, now: number): string {
  switch (status.phase) {
    case "off":
      return "Off. The portal asks you to sign in yourself.";
    case "idle":
      return "Armed. It checks when the campus Wi-Fi connects.";
    case "checking":
      return "Checking the portal…";
    case "online":
      return `Online ${ago(status.at, now)}. Nothing to sign in.`;
    case "signed-in":
      return `Signed in ${ago(status.okAt || status.at, now)}.`;
    case "rejected":
      return status.message || "The portal rejected the sign-in.";
    case "unreachable":
      return status.message || "No campus network yet. It keeps trying.";
    case "unsupported":
      return "Automatic sign-in runs on Android. On a laptop, use the snippet below.";
  }
}

/** The panel's accent: mint when signed in, amber when something needs a look. */
export function statusTone(phase: WifiPhase): "mint" | "amber" | "plain" {
  if (phase === "signed-in" || phase === "online") return "mint";
  if (phase === "rejected" || phase === "unreachable") return "amber";
  return "plain";
}

/** The word next to the switch, short enough for a 320 pt phone. */
export const PHASE_LABEL: Record<WifiPhase, string> = {
  off: "Off",
  idle: "Armed",
  checking: "Checking",
  online: "Online",
  "signed-in": "Signed in",
  rejected: "Refused",
  unreachable: "No network",
  unsupported: "Android only",
};

function ago(at: number, now: number): string {
  if (!at) return "just now";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
