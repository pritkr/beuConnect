/**
 * The paper list a semester actually has, so the calculator does not open on
 * four blank rows.
 *
 * The names and credits are the syllabus pack's own — the same records the
 * syllabus screen shows for a branch and semester, which are the site's
 * `src/assets/data/branches/*.json` plus this app's documented repairs. There
 * is no second subject list here to drift: a code that changes in the pack
 * changes here on the same build.
 *
 * Decoding a branch is a JSON parse of a wire string, cached for the process, so
 * the chips are instant after the first load and the calculator still works
 * with no network.
 */

import { BRANCH_META, branchPack } from "../syllabus/active";

export interface PresetPaper {
  name: string;
  credits: number;
  code: string;
}

export interface PresetBranch {
  code: string;
  name: string;
  short: string;
}

export const PRESET_BRANCHES: readonly PresetBranch[] = BRANCH_META;

/** Semester 1–8, the range every BEU branch is published in. */
export const PRESET_SEMESTERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Decoded semester lists per branch, index 0 unused so `[sem]` reads plainly. */
const cache = new Map<string, PresetPaper[][]>();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function paper(value: unknown): PresetPaper | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = text(row.name);
  if (!name) return null;
  const credits = Number(row.credits);
  return {
    name,
    // A paper with no credit figure is a data gap, not a 0-credit paper: the
    // calculator still shows it and the student can correct the stepper.
    credits: Number.isFinite(credits) && credits > 0 ? Math.min(10, credits) : 3,
    code: text(row.code),
  };
}

function semestersOf(code: string): PresetPaper[][] | null {
  const hit = cache.get(code);
  if (hit) return hit;

  const wire = branchPack(code);
  if (!wire) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(wire);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const raw = (parsed as Record<string, unknown>).semesters;
  if (!raw || typeof raw !== "object") return null;

  const semesters: PresetPaper[][] = Array.from({ length: 9 }, () => []);
  for (const [key, rows] of Object.entries(raw as Record<string, unknown>)) {
    const semester = Math.round(Number(key));
    if (!Number.isFinite(semester) || semester < 1 || semester > 8) continue;
    if (!Array.isArray(rows)) continue;
    semesters[semester] = rows.map(paper).filter((row): row is PresetPaper => row !== null);
  }
  cache.set(code, semesters);
  return semesters;
}

/** The papers for a branch and semester, or `[]` when the pack has none. */
export function presetPapers(branch: string, semester: number): PresetPaper[] {
  const semesters = semestersOf(branch);
  if (!semesters) return [];
  const key = Math.round(semester);
  if (key < 1 || key > 8) return [];
  return semesters[key];
}

/** "CSE 3" — the chip caption that keeps both halves visible. */
export function presetLabel(branch: string, semester: number): string {
  const meta = PRESET_BRANCHES.find((entry) => entry.code === branch);
  return `${meta?.short ?? branch.toUpperCase()} · Sem ${semester}`;
}
