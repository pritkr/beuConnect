/**
 * Shared helpers for the QA suites.
 *
 * Two jobs:
 *
 *  1. **Mount a registered route** in `qa/harness.tsx` and, when it fails, say
 *     which route broke and what the screen actually rendered.
 *  2. **Read the navigation a screen asked for** — the harness records every
 *     `nav.push` / `nav.replace` into storage, so "this button leads to
 *     `results.web`" is asserted without the harness navigating anywhere.
 *
 * ## Why this is fast
 *
 * `open()` already "resolves once it rendered and is quiet", so there is no
 * settle to wait for. The old `await app.wait(220)` after every mount cost
 * 264 ms per mount (measured: 126 ms without it, 390 ms with) and was the
 * single largest line item in the suite.
 *
 * Every mount gets a **manual clock** (`clock: {}`): animations finish at once
 * and `app.wait(ms)` moves virtual time, so a 2.6 s retry backoff is free.
 * Readiness is `waitUntil` — it re-checks after each render instead of polling
 * on a sleep.
 *
 * Nothing here imports feature internals: routes are addressed by their
 * registered name, screens by the text/testID they render.
 */

import { open, type App, type OpenOptions } from "nsh/test";

import type { RouteParams } from "../src/app/router";

/** The phone every screen test is laid out for (BUILD_SPEC: small phones first). */
export const PHONE = { width: 320, height: 640 };

/** Storage key the harness mirrors its nav log into. */
export const NAV_LOG_KEY = "qa.navlog";

/** A device that has already been through first-run. */
export const ONBOARDED = { "beu.onboarding": JSON.stringify({ done: true, at: 1 }) };

/** Every request fails: only what is on this device can answer. */
export const DOWN = { "*": { status: 502, body: "unavailable" } };

/** One navigation a screen asked for. */
export interface NavEntry {
  kind: string;
  name: string;
  params: RouteParams;
}

/** Everything on screen, one string, ` | ` between the texts. */
export function visible(app: App): string {
  return app.texts().join(" | ");
}

/** The first `chars` of what rendered, for a failure message. */
export function snippet(app: App, chars = 200): string {
  const text = visible(app).replace(/\s+/g, " ").trim();
  if (!text) return "(nothing rendered)";
  return text.length > chars ? `${text.slice(0, chars)}…` : text;
}

/** `{ reg: "2110…", sem: 1 }` as the tail of a failure message. */
export function describeParams(params: RouteParams): string {
  const keys = Object.keys(params);
  if (!keys.length) return "(no params)";
  return `(${keys.map((key) => `${key}=${String(params[key])}`).join(", ")})`;
}

/**
 * Mounts one registered route through the harness.
 *
 * `extra` is passed to `open` — `network` to force a failure, more `storage` to
 * seed a cache. `clock: {}` is the default so retry pauses cost nothing; pass
 * `clock: null` only if a test genuinely needs wall time.
 */
export async function openRoute(
  name: string,
  params: RouteParams = {},
  extra: OpenOptions = {},
): Promise<App> {
  const options: OpenOptions = {
    ...PHONE,
    clock: {},
    ...extra,
    storage: {
      "qa.route": JSON.stringify(name),
      "qa.params": JSON.stringify(params),
      ...(extra.storage ?? {}),
    },
  };

  let app: App | null = null;
  try {
    app = await open("./harness.tsx", options);
    await app.waitFor("id:qa-page", { timeout: 8000 });
    return app;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const shown = app ? snippet(app) : "(the app never rendered)";
    throw new Error(
      `route "${name}" ${describeParams(params)} did not mount.\n  rendered: ${shown}\n  reason: ${reason}`,
    );
  }
}

/**
 * Asserts the route rendered a real page: not the harness's "MISSING ROUTE",
 * not the shell's "No screen for", not an empty body.
 */
export function expectPage(app: App, name: string): void {
  const text = visible(app);
  if (text.includes("MISSING ROUTE")) {
    throw new Error(`route "${name}" is not in the harness's route table.\n  rendered: ${snippet(app)}`);
  }
  if (text.includes("No screen for")) {
    throw new Error(`route "${name}" rendered the shell's fallback.\n  rendered: ${snippet(app)}`);
  }
  if (text.replace(/[\s|]/g, "").length === 0) {
    throw new Error(`route "${name}" rendered no text at all.\n  rendered: ${snippet(app)}`);
  }
}

/** The navigation the screen asked for, in order. */
export function navEntries(app: App): NavEntry[] {
  const raw = app.storage()[NAV_LOG_KEY];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        kind: String(record.kind ?? ""),
        name: String(record.name ?? ""),
        params: (record.params ?? {}) as RouteParams,
      };
    });
  } catch {
    return [];
  }
}

/** The route names the screen asked for, in order. */
export function navTargets(app: App): string[] {
  return navEntries(app).map((entry) => entry.name);
}

/**
 * Waits (a few turns of the app) for the screen to ask for `target`, and
 * returns the entry. Throws with what did render when it never asks.
 */
export async function awaitNav(app: App, target: string, turns = 12): Promise<NavEntry> {
  for (let turn = 0; turn < turns; turn += 1) {
    const found = navEntries(app).find((entry) => entry.name === target);
    if (found) return found;
    await app.wait(60);
  }
  throw new Error(
    `no screen asked for "${target}".\n  asked for: ${navTargets(app).join(", ") || "(nothing)"}\n  rendered: ${snippet(app, 400)}`,
  );
}

/**
 * Presses the first of `labels` that is on screen and returns it. Screens may
 * word a call to action differently; a test that only cares *where it goes*
 * should not pin the one string.
 */
export async function pressFirst(app: App, labels: string[]): Promise<string> {
  for (const label of labels) {
    if (app.shows(`text:${label}`)) {
      await app.press(`text:${label}`);
      return label;
    }
  }
  throw new Error(
    `none of ${labels.map((label) => `"${label}"`).join(", ")} is on screen.\n  rendered: ${snippet(app, 400)}`,
  );
}
