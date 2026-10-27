/**
 * The student's profile — the one place the app learns who is using it.
 *
 * Contract (the orchestrator wires Home to `useProfile()`; no other feature
 * should read the raw key):
 *
 *   Storage key   "beu.profile"  (plain JSON; readStore/writeStore add "beu.")
 *   Shape         { name: string; reg: string; college: string; branch: string; sem: number }
 *     name        trimmed, at most 60 characters, "" when unset
 *     reg         digits only, 8–14 digits — BEU's own registration number
 *     college     3-digit BEU college code, or "" when unset
 *     branch      a BRANCH_META code: cse | ece | ee | mech | civil | eee
 *     sem         1–8
 *
 * `loadProfile()` reads and normalizes the stored value and never throws; it
 * returns EMPTY_PROFILE when nothing valid is stored. `saveProfile()` validates
 * and normalizes before writing, returns false when the value is invalid or
 * storage rejects it, and updates the shared signal so every `useProfile()`
 * reader repaints at once. `useProfile()` is the accessor Home should read:
 *
 *   const profile = useProfile();
 *   <Title>Hi, {greetingName(profile())}</Title>
 *
 * `greetingName()` returns the first name, or "there" when unset;
 * `courseLine()` returns "CSE · Semester 3"; `isProfileComplete()` answers
 * "does the app know enough to prefill results, rank and attendance?".
 * `clearProfile()` forgets the student and is what the Profile screen calls
 * behind its confirmation.
 *
 * Only this module writes "beu.profile". The shape is deliberately the same
 * tolerant `{ branch, sem }` object `syllabus.course` and Home already read.
 */

import { signal, type Accessor } from "nsh";

import { readStore, removeStore, writeStore } from "../../lib/net";
import { BRANCH_META } from "../syllabus/data/packs";
import { COLLEGE_NAMES, shortCollegeName } from "../results/colleges";
import { currentSemester, parseReg } from "../results/data";

export interface Profile {
  name: string;
  reg: string;
  college: string;
  branch: string;
  sem: number;
}

/** The full Storage key, for the storage screen and for documentation. */
export const PROFILE_STORAGE_KEY = "beu.profile";

/** The key readStore/writeStore expect (they prepend "beu."). */
export const PROFILE_KEY = "profile";

export const NAME_LIMIT = 60;
export const REG_MIN = 8;
export const REG_MAX = 14;

export const EMPTY_PROFILE: Profile = { name: "", reg: "", college: "", branch: "", sem: 1 };

export const SEMESTERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

export interface BranchChoice {
  code: string;
  name: string;
  short: string;
}

/** The six real BEU branches the app ships data for. */
export const BRANCHES: readonly BranchChoice[] = BRANCH_META;

const BRANCH_BY_CODE = new Map<string, BranchChoice>(BRANCH_META.map((branch) => [branch.code, branch]));

/* -------------------------------------------------------------- validation */

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Digits only, capped at a BEU number's length; safe to call on every keystroke. */
export function normalizeReg(value: string): string {
  return digitsOnly(value).slice(0, REG_MAX);
}

export function isValidReg(value: string): boolean {
  const reg = digitsOnly(value);
  return reg.length >= REG_MIN && reg.length <= REG_MAX;
}

/** Empty is allowed (the code is optional); anything else must be 100–199. */
export function normalizeCollege(value: string): string {
  return digitsOnly(value).slice(0, 3);
}

export function isValidCollege(value: string): boolean {
  const code = normalizeCollege(value);
  return code === "" || /^1\d{2}$/.test(code);
}

export function isBranchCode(value: string): boolean {
  return BRANCH_BY_CODE.has(value);
}

export function isSemester(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

export function normalizeName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_LIMIT);
}

/** Reads anything (a malformed store, a partial edit) into a safe Profile. */
export function normalizeProfile(input: unknown): Profile {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const branchRaw = typeof record.branch === "string" ? record.branch.trim().toLowerCase() : "";
  const semRaw = Number(record.sem);
  return {
    name: typeof record.name === "string" ? normalizeName(record.name) : "",
    reg: typeof record.reg === "string" ? normalizeReg(record.reg) : "",
    college: typeof record.college === "string" ? normalizeCollege(record.college) : "",
    branch: isBranchCode(branchRaw) ? branchRaw : "",
    sem: isSemester(semRaw) ? semRaw : 1,
  };
}

/** A registration number and a real branch are required; college is optional. */
export function isValidProfile(profile: Profile): boolean {
  return isValidReg(profile.reg) && isBranchCode(profile.branch) && isValidCollege(profile.college) && isSemester(profile.sem);
}

export function isProfileComplete(profile: Profile): boolean {
  return isValidReg(profile.reg) && isBranchCode(profile.branch) && isSemester(profile.sem);
}

/* ------------------------------------------------------------------ labels */

export function branchName(code: string): string {
  return BRANCH_BY_CODE.get(code)?.name ?? "No branch picked yet";
}

export function branchShort(code: string): string {
  return BRANCH_BY_CODE.get(code)?.short ?? "";
}

export function collegeLabel(code: string): string {
  return COLLEGE_NAMES[code] ?? "";
}

export function collegeShortLabel(code: string): string {
  return code && COLLEGE_NAMES[code] ? shortCollegeName(code) : "";
}

/** "Aashish", or "there" when the profile has no name yet. */
export function greetingName(profile: Profile): string {
  return profile.name.split(" ")[0] || "there";
}

/** "CSE · Semester 3", or "" when the profile knows nothing about the course. */
export function courseLine(profile: Profile): string {
  return [branchShort(profile.branch), profile.sem ? `Semester ${profile.sem}` : ""].filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------- store */

const profile = signal<Profile>(EMPTY_PROFILE);
const ready = signal(false);
let started = false;

async function read(): Promise<Profile> {
  const stored = await readStore<unknown>(PROFILE_KEY, null);
  const value = normalizeProfile(stored);

  // A semester written last year — or by a build that trusted BEU's roster —
  // is behind the class the registration number implies. Move it forward, never
  // back: a student can repeat a semester, and Settings lets them pick an older
  // one on purpose.
  if (value.reg !== "") {
    const info = parseReg(value.reg);
    if (info) {
      const current = currentSemester(info.batch, info.lateral);
      if (current > value.sem) {
        const corrected: Profile = { ...value, sem: current };
        // Persist it too: PYQs and the syllabus read `beu.profile` straight
        // from Storage, so a correction that only lived in this signal would
        // leave the library opening on last year's semester.
        void writeStore(PROFILE_KEY, corrected);
        return corrected;
      }
    }
  }
  return value;
}

function hydrate(): void {
  if (started) return;
  started = true;
  void read().then((value) => {
    profile.set(value);
    ready.set(true);
  });
}

// The registry imports this module at boot through `settingsRoutes`, so the
// profile is ready before the student can reach a screen that reads it.
hydrate();

/** The live profile. Hydrated once at boot; updated by every save. */
export function useProfile(): Accessor<Profile> {
  return profile;
}

/** False until the first Storage read finishes (a flash guard for Home). */
export function useProfileReady(): Accessor<boolean> {
  return ready;
}

/** Reads Storage again and refreshes the signal. Never throws. */
export async function loadProfile(): Promise<Profile> {
  const value = await read();
  profile.set(value);
  ready.set(true);
  return value;
}

/**
 * The semester a registration number implies, or 0 when it implies nothing.
 *
 * Course pickers use this to correct a saved semester that has fallen behind:
 * `syllabus.course` and `pyqs.prefs` remember a choice forever, and a choice
 * made last year is a semester or two stale. It reads any row — a profile, a
 * saved course — so a caller never needs to know where the number came from.
 * `at` exists so tests can pin the session calendar.
 */
export function classSemester(row: unknown, at: Date = new Date()): number {
  const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const reg = typeof record.reg === "string" ? normalizeReg(record.reg) : "";
  if (reg === "") return 0;
  const info = parseReg(reg);
  return info ? currentSemester(info.batch, info.lateral, at) : 0;
}

/** Validates, normalizes and persists. False when invalid or rejected. */
export async function saveProfile(next: Profile): Promise<boolean> {
  const value = normalizeProfile(next);
  if (!isValidProfile(value)) return false;
  const saved = await writeStore(PROFILE_KEY, value);
  if (saved) profile.set(value);
  return saved;
}

/** Forgets the student. Results, read marks and settings stay. */
export async function clearProfile(): Promise<void> {
  await removeStore(PROFILE_KEY);
  profile.set(EMPTY_PROFILE);
}
