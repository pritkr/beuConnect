/**
 * Results — the semester trend.
 *
 * A student's SGPA journey can come from three places, and the screen must not
 * blend them into one invented line:
 *
 *   current    the result on screen right now (`ResultData.sgpa`)
 *   saved      a copy this phone saved for another semester (`result:<reg>:<sem>`)
 *   published  BEU's own eight-semester history (`ResultData.history`)
 *
 * The current value wins over a saved copy for the same semester; a saved copy
 * wins over BEU's history, because it is the same number the student is looking
 * at and it is on the device. A value outside the 10-point BEU scale is dropped
 * rather than drawn: a trend is only useful if every bar on it is real.
 *
 * Everything here is pure except `readSavedTrend`, which only reads the cache
 * the lookup path already writes.
 */

import { getCache } from "../../lib/net";

export type TrendSource = "current" | "saved" | "published" | "none";

export interface TrendPoint {
  sem: number;
  value: number | null;
  source: TrendSource;
}

export interface TrendInput {
  /** BEU's eight-slot history from the result payload. */
  history?: (number | null)[];
  /** SGPAs this device saved for other semesters. */
  saved?: { sem: number; value: number | null }[];
  /** The semester the screen is showing. */
  current?: { sem: number; value: number | null };
}

export interface Trend {
  /** Always eight slots, semester 1 first. */
  points: TrendPoint[];
  /** How many semesters carry a usable SGPA. */
  known: number;
  /** How many of those came from a copy saved on this phone. */
  saved: number;
  /** How many came from the result currently on screen. */
  current: number;
  best: TrendPoint | null;
  latest: TrendPoint | null;
  /** The semester before `latest` that has a value. */
  previous: TrendPoint | null;
  /** latest minus previous, rounded to two places. */
  delta: number | null;
  direction: "up" | "down" | "level" | "none";
  average: number | null;
}

const SLOTS = 8;
/** BEU grades on a 10-point scale; anything outside it is not an SGPA. */
const FLOOR = 0;
const CEILING = 10;

/** A BEU SGPA, or null when the value is not one. */
export function sgpaValue(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  if (input < FLOOR || input > CEILING) return null;
  return Math.round(input * 100) / 100;
}

/** One slot per semester, newest value winning. */
export function buildTrend(input: TrendInput = {}): Trend {
  const points: TrendPoint[] = [];
  for (let sem = 1; sem <= SLOTS; sem += 1) {
    points.push({ sem, value: sgpaValue(input.history?.[sem - 1] ?? null), source: "published" });
  }

  for (const entry of input.saved ?? []) {
    const sem = Math.floor(entry.sem);
    if (sem < 1 || sem > SLOTS) continue;
    const value = sgpaValue(entry.value);
    if (value === null) continue;
    points[sem - 1] = { sem, value, source: "saved" };
  }

  if (input.current) {
    const sem = Math.floor(input.current.sem);
    const value = sgpaValue(input.current.value);
    if (sem >= 1 && sem <= SLOTS && value !== null) {
      points[sem - 1] = { sem, value, source: "current" };
    }
  }

  const filled = points.filter((point) => point.value !== null);
  let best: TrendPoint | null = null;
  for (const point of filled) {
    if (best === null || (point.value as number) > (best.value as number)) best = point;
  }
  const latest = filled.length > 0 ? filled[filled.length - 1] : null;
  const previous = filled.length > 1 ? filled[filled.length - 2] : null;

  let delta: number | null = null;
  let direction: Trend["direction"] = "none";
  if (latest !== null && previous !== null) {
    delta = Math.round(((latest.value as number) - (previous.value as number)) * 100) / 100;
    direction = delta > 0 ? "up" : delta < 0 ? "down" : "level";
  }

  const total = filled.reduce((sum, point) => sum + (point.value as number), 0);

  return {
    points,
    known: filled.length,
    saved: points.filter((point) => point.source === "saved").length,
    current: points.filter((point) => point.source === "current").length,
    best,
    latest,
    previous,
    delta,
    direction,
    average: filled.length > 0 ? Math.round((total / filled.length) * 100) / 100 : null,
  };
}

/** A trend needs two semesters before it says anything a single result does not. */
export function trendIsDrawn(trend: Trend): boolean {
  return trend.known > 1;
}

/** `8.75` → `"8.75"`. */
function two(value: number): string {
  return value.toFixed(2);
}

/**
 * The trend in one sentence a student can read (and a test can assert):
 * `Best 8.75 in semester 1 · latest 8.20 in semester 2 · down 0.55`.
 */
export function trendSummary(trend: Trend): string {
  const best = trend.best;
  const latest = trend.latest;
  if (best === null || latest === null) return "No semester SGPA is known yet.";
  if (trend.known === 1) {
    return `One semester known: ${two(latest.value as number)} in semester ${latest.sem}.`;
  }
  const move =
    trend.delta === null || trend.previous === null
      ? ""
      : trend.direction === "level"
        ? ` · level with semester ${trend.previous.sem}`
        : trend.direction === "up"
          ? ` · up ${two(Math.abs(trend.delta))} from semester ${trend.previous.sem}`
          : ` · down ${two(Math.abs(trend.delta))} from semester ${trend.previous.sem}`;
  return `Best ${two(best.value as number)} in semester ${best.sem} · latest ${two(latest.value as number)} in semester ${latest.sem}${move}`;
}

/** Where each bar came from, in plain words. Empty when nothing is known. */
export function trendProvenance(trend: Trend): string {
  if (trend.known === 0) return "";
  const bits: string[] = [];
  if (trend.current > 0) {
    const point = trend.points.find((entry) => entry.source === "current");
    if (point) bits.push(`Semester ${point.sem} from this result`);
  }
  if (trend.saved > 0) {
    bits.push(`${trend.saved} ${trend.saved === 1 ? "semester" : "semesters"} saved on this phone`);
  }
  const published = trend.known - trend.saved - trend.current;
  if (published > 0) {
    bits.push(`${published} from BEU's history`);
  }
  return bits.join(" · ");
}

/** The whole trend as a screen reader hears it. */
export function trendSpoken(trend: Trend): string {
  if (trend.known === 0) return "No SGPA trend yet.";
  const parts = trend.points
    .filter((point) => point.value !== null)
    .map((point) => `semester ${point.sem}: ${two(point.value as number)}`);
  return `SGPA trend. ${parts.join(". ")}. ${trendSummary(trend)}`;
}

export interface SavedSgpa {
  sem: number;
  value: number;
}

/**
 * The SGPAs this phone already saved for a number, one entry per semester.
 * Reads the same cache key `data.ts` writes; a corrupt entry is skipped.
 */
export async function readSavedTrend(rawReg: string): Promise<SavedSgpa[]> {
  const numeric = rawReg.replace(/\D/g, "");
  if (numeric === "") return [];
  const found: SavedSgpa[] = [];
  for (let sem = 1; sem <= SLOTS; sem += 1) {
    const raw = await getCache(`result:${numeric}:${sem}`, 0);
    if (!raw) continue;
    try {
      const envelope = JSON.parse(raw) as {
        data?: { sgpa?: number | null; history?: (number | null)[] };
      };
      const data = envelope?.data;
      if (!data) continue;
      const value = sgpaValue(data.sgpa) ?? sgpaValue(data.history?.[sem - 1] ?? null);
      if (value !== null) found.push({ sem, value });
    } catch {
      /* corrupt saved result: it cannot draw a bar */
    }
  }
  return found;
}
