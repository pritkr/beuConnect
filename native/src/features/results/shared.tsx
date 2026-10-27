/**
 * Results area — small shared pieces for the five screens.
 *
 * Two framework facts shape this file:
 *
 * 1. A component body runs once. The kit's `Chip` reads its `active` prop in
 *    the body, so a chip strip has to be rebuilt when the choice changes —
 *    that is `Fresh`.
 * 2. A `List` recycles cells; the row function runs once per cell and its
 *    `item()` accessor changes when the cell is reused. `StudentRowView` reads
 *    `props.row` in its body, so every list row is rebuilt per item through
 *    `<Each>` (also in this file: `Fresh`).
 */

import { View, Clipboard, batch, cleanup, effect, signal, type JSX, type Signal } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { Btn, Field } from "../../ui";
import { BatchChips, BranchChips, SemChips } from "./components";
import {
  BRANCHES,
  batches,
  branchesFor,
  currentSemester,
  parseReg,
  readTablePrefs,
  semsFor,
  writeTablePrefs,
} from "./data";

/* ------------------------------------------------------------------ errors */

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Something went wrong. Check your connection and try again.";
}

/**
 * A failure as plain words: no URLs, no stack traces, never an object. A
 * network error carries its whole request line ("GET https://…: no response
 * is listed for it"); that is not a sentence a student can act on, so anything
 * too long or URL-shaped becomes `fallback`.
 */
export function readableError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length > 120 || text.indexOf("[object") >= 0 || text.indexOf("http") >= 0) return fallback;
  return text;
}

/** The roster/table screens' honest failure line. */
export const ROSTER_FALLBACK = "BEU's published roster could not be read. Check your connection and try again.";

/**
 * A roster load that failed. This is a *failure*, never a claim that the
 * table has no students: the screens pair it with a retry, and any copy
 * already loaded (cached on this phone) stays on screen.
 */
export function rosterError(error: unknown): string {
  return readableError(error, ROSTER_FALLBACK);
}

export interface Async<T> {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  data: T | null;
  error: string;
}

export function idle<T>(): Async<T> {
  return { status: "idle", data: null, error: "" };
}

/* ------------------------------------------------------------ registration */

/** `"beu-23101107001 "` → `"23101107001"`. */
export function cleanReg(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 12);
}

export function isValidReg(value: string): boolean {
  return value.replace(/\D/g, "").length >= 8;
}

/** The newest semester BEU has published for the batch in `reg`, else 1. */
export function suggestedSem(reg: string): number {
  const info = parseReg(reg);
  // The class they are in, not the newest roster BEU has published: a batch-24
  // student was being opened on Sem 2 because that is the last roster with rows.
  if (info) return currentSemester(info.batch, info.lateral);
  return 1;
}

export function clampedSem(raw: number, reg: string): number {
  if (Number.isFinite(raw) && raw >= 1 && raw <= 8) return Math.floor(raw);
  return suggestedSem(reg);
}

/** A registration field with the app's keyboard and limits. */
export function RegField(props: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  hint?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  class?: string;
}) {
  return (
    <Field
      class={props.class}
      label={props.label ?? "Registration number"}
      value={props.value}
      onChange={(next: string) => props.onChange(cleanReg(next))}
      placeholder={props.placeholder ?? "23105157098"}
      hint={props.hint ?? "The 11 digits on your BEU admit card."}
      keyboard="number-pad"
      maxLength={12}
      onSubmit={props.onSubmit}
      autoFocus={props.autoFocus}
    />
  );
}

/* ---------------------------------------------------------------- clipboard */

/** Copies `text`; the label confirms for a couple of seconds. */
export function CopyButton(props: { text: string; label?: string; class?: string }) {
  const copied = signal(false);

  const copy = async () => {
    try {
      await Clipboard.writeText(props.text);
      copied.set(true);
      setTimeout(() => copied.set(false), 2200);
    } catch {
      /* No clipboard on this host: nothing to tell the user. */
    }
  };

  return (
    <Btn variant="secondary" class={props.class} onPress={copy} label={props.label ?? "Copy"}>
      {copied() ? "Copied" : (props.label ?? "Copy")}
    </Btn>
  );
}

/* ------------------------------------------------------------- fresh mounts */

/**
 * Rebuilds `build()` whenever `when` changes.
 *
 * The kit's `Chip` computes its selected style once, when it is created, and
 * `StudentRowView` reads its row once. Both are fine for a static screen and
 * stale for a changing one, so a strip or a recycled cell is rebuilt instead.
 */
export function Fresh(props: { when: string; build: () => JSX.Element }) {
  return (
    <Each of={[props.when]} key={(value) => value}>
      {() => props.build()}
    </Each>
  );
}

/* --------------------------------------------------------------- selection */

export interface TableSelection {
  batch: string;
  branch: string;
  sem: number;
}

function branchCode(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  const found = BRANCHES.find(
    (branch) => branch.code === value || branch.short.toLowerCase() === value || branch.name.toLowerCase() === value,
  );
  return found ? found.code : value;
}

/** A batch/branch/semester that BEU has actually published, from anything. */
export function normalizeSelection(input: {
  batch?: string | number;
  branch?: string | number;
  sem?: string | number;
}): TableSelection {
  const all = batches();
  const digits = String(input.batch ?? "").replace(/\D/g, "");
  const wanted = digits.length > 2 ? digits.slice(-2) : digits;
  const batch = all.indexOf(wanted) >= 0 ? wanted : (all[0] ?? "25");

  const available = branchesFor(batch);
  const wantedBranch = branchCode(String(input.branch ?? ""));
  const branch = available.some((item) => item.code === wantedBranch)
    ? wantedBranch
    : (available[0]?.code ?? "105");

  const sems = semsFor(batch, branch);
  const rawSem = Math.floor(Number(input.sem));
  const sem = sems.indexOf(rawSem) >= 0 ? rawSem : Math.max(1, ...(sems.length ? sems : [1]));
  return { batch, branch, sem };
}

/**
 * The selection shared by the table and the merit list: route params win,
 * otherwise the last choice this device saved. `apply` normalizes, persists
 * and lets the screen fetch.
 */
export function useTableSelection(nav: Nav): {
  selection: Signal<TableSelection>;
  ready: Signal<boolean>;
  apply: (next: Partial<TableSelection>) => void;
} {
  const fromParams =
    param(nav, "batch") !== "" || param(nav, "branch") !== "" || param(nav, "sem") !== "";
  const selection = signal<TableSelection>(
    normalizeSelection({
      batch: param(nav, "batch"),
      branch: param(nav, "branch"),
      sem: param(nav, "sem"),
    }),
  );
  const ready = signal(fromParams);

  if (!fromParams) {
    effect(() => {
      let alive = true;
      cleanup(() => {
        alive = false;
      });
      void readTablePrefs().then((prefs) => {
        if (!alive) return;
        batch(() => {
          selection.set(normalizeSelection(prefs));
          ready.set(true);
        });
      });
    });
  }

  const apply = (next: Partial<TableSelection>) => {
    const merged = normalizeSelection({ ...selection(), ...next });
    selection.set(merged);
    void writeTablePrefs({ ...merged, college: "" });
  };

  return { selection, ready, apply };
}

/** The batch / branch / semester chip stacks both data screens share. */
export function SelectionChips(props: {
  selection: () => TableSelection;
  apply: (next: Partial<TableSelection>) => void;
}) {
  const sel = props.selection;
  return (
    <View class="gap-3">
      <Fresh
        when={`batch:${sel().batch}`}
        build={() => (
          <BatchChips
            value={sel().batch}
            batches={batches()}
            onChange={(batch) => props.apply({ batch })}
          />
        )}
      />
      <Fresh
        when={`branch:${sel().batch}:${sel().branch}`}
        build={() => (
          <BranchChips
            value={sel().branch}
            branches={branchesFor(sel().batch)}
            onChange={(branch) => props.apply({ branch })}
          />
        )}
      />
      <Fresh
        when={`sem:${sel().batch}:${sel().branch}:${sel().sem}`}
        build={() => (
          <SemChips
            value={sel().sem}
            available={semsFor(sel().batch, sel().branch)}
            onChange={(sem) => props.apply({ sem })}
          />
        )}
      />
    </View>
  );
}
