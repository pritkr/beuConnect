/**
 * Results — who a registration number belongs to.
 *
 * Home greets a student by name, and it must do that before the result API has
 * answered (today BEU's gateway answers 502 and asks for a captcha). So identity
 * is resolved in a fixed, cheapest-first order and then remembered:
 *
 *   1. the identity cache — a name does not change, so this is permanent;
 *   2. any result this device has already saved for that number (offline);
 *   3. BEU's published roster CSV for the student's batch + branch, newest
 *      semester first — a 200 KB text file the app already knows how to parse,
 *      which carries the name, CGPA and college with no captcha at all.
 *
 * There is no fourth step on purpose. If the roster is not published, the app
 * says "add your result" instead of guessing a name from a registration number.
 */

import { getCache, putCache } from "../../lib/net";
import { collegeName } from "./colleges";
import type { RankRow } from "./data";
import { branchName, currentSemester, digits, displayName, loadRoster, parseReg, semsFor } from "./data";

/** Storage key for one remembered identity. Shared with `data.ts`, which writes it. */
export function identityKey(rawReg: string): string {
  return `identity:${digits(rawReg)}`;
}

export interface Identity {
  reg: string;
  name: string;
  cgpa: number | null;
  sgpa: number | null;
  branchCode: string;
  branchName: string;
  collegeCode: string;
  collegeName: string;
  /**
   * The class the student is attending, worked out from the batch
   * (`currentSemester`), not the semester whose file was read: BEU publishes a
   * roster one or two semesters behind the class, so a batch-24 student whose
   * newest roster is Sem 2 is still in Sem 4.
   */
  semester: number | null;
  source: "cache" | "roster" | "result";
  at: number;
}

/** "24105157010" → "PRIT KUMAR" is the roster's casing; `displayName` fixes it. */

function fromRosterRow(reg: string, semester: number, row: RankRow): Identity {
  const info = parseReg(reg);
  return {
    reg: digits(reg),
    name: displayName(row.name),
    cgpa: row.cgpa,
    sgpa: row.sgpa,
    branchCode: info?.branch ?? "",
    branchName: branchName(info?.branch ?? ""),
    collegeCode: row.collegeCode || info?.college || "",
    collegeName: row.collegeName || collegeName(row.collegeCode || info?.college || ""),
    semester: info ? currentSemester(info.batch, info.lateral) : semester,
    source: "roster",
    at: Date.now(),
  };
}

async function remember(identity: Identity): Promise<Identity> {
  try {
    await putCache(identityKey(identity.reg), JSON.stringify(identity));
  } catch {
    /* a name that cannot be cached is still a name worth showing */
  }
  return identity;
}

/** The last remembered identity for this number, with no network at all. */
export async function cachedIdentity(rawReg: string): Promise<Identity | null> {
  const info = parseReg(rawReg);
  if (!info) return null;
  const raw = await getCache(identityKey(info.numeric), 0);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed || typeof parsed.name !== "string" || parsed.name === "") return null;
    return {
      ...parsed,
      // Whoever wrote the entry, the reader owns the casing: BEU publishes names
      // in capitals, and a name is read far more often than it is written.
      name: displayName(parsed.name),
      // And the class is derived, never inherited: a cache written last semester
      // (or by an older build that trusted the roster) would otherwise keep the
      // home screen saying Sem 2 for the rest of the year.
      semester: currentSemester(info.batch, info.lateral),
      source: "cache",
      at: typeof parsed.at === "number" ? parsed.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * A result saved by the lookup or captured from the portal already contains the
 * name, branch and CGPA. Reuse it before touching the network.
 */
async function fromSavedResult(rawReg: string): Promise<Identity | null> {
  const info = parseReg(rawReg);
  if (!info) return null;
  for (let sem = 8; sem >= 1; sem -= 1) {
    const raw = await getCache(`result:${info.numeric}:${sem}`, 0);
    if (!raw) continue;
    try {
      const envelope = JSON.parse(raw) as { at?: number; data?: Record<string, unknown> };
      const data = envelope?.data;
      if (!data || typeof data.name !== "string" || data.name.trim() === "") continue;
      const identity: Identity = {
        reg: info.numeric,
        name: displayName(data.name),
        cgpa: typeof data.cgpa === "number" ? data.cgpa : null,
        sgpa: typeof data.sgpa === "number" ? data.sgpa : null,
        branchCode: info.branch,
        branchName: branchName(info.branch),
        collegeCode: typeof data.collegeCode === "string" ? data.collegeCode : info.college,
        collegeName:
          typeof data.collegeName === "string" && data.collegeName !== ""
            ? data.collegeName
            : collegeName(info.college),
        semester: currentSemester(info.batch, info.lateral),
        source: "result",
        at: typeof envelope.at === "number" ? envelope.at : Date.now(),
      };
      return await remember(identity);
    } catch {
      /* corrupt saved result: try the next semester */
    }
  }
  return null;
}

/** Newest roster first, at most three files, stopping at the first hit. */
async function fromRoster(rawReg: string): Promise<Identity | null> {
  const info = parseReg(rawReg);
  if (!info) return null;
  const sems = semsFor(info.batch, info.branch)
    .slice()
    .sort((a, b) => b - a)
    .slice(0, 3);
  for (const sem of sems) {
    try {
      const rows = await loadRoster(info.batch, info.branch, sem);
      const wanted = digits(info.reg);
      const row = rows.find((entry) => digits(entry.reg) === wanted);
      if (row && row.name !== "") return await remember(fromRosterRow(info.numeric, sem, row));
    } catch {
      /* that semester is not published after all: try the next one */
    }
  }
  return null;
}

/**
 * The name and academic identity for a registration number. Resolves from cache
 * when it can, and never throws: Home must render even with no network.
 */
export async function resolveIdentity(rawReg: string, options: { refresh?: boolean } = {}): Promise<Identity | null> {
  const info = parseReg(rawReg);
  if (!info) return null;

  if (!options.refresh) {
    const cached = await cachedIdentity(info.numeric);
    if (cached) return cached;
  }

  const saved = await fromSavedResult(info.numeric);
  if (saved) return saved;

  const roster = await fromRoster(info.numeric);
  if (roster) return roster;

  // Last resort: hand back a stale cached name rather than nothing.
  return options.refresh ? await cachedIdentity(info.numeric) : null;
}

/** One line for a footer: "CSE · Government Engineering College, Sheikhpura". */
export function identityLine(identity: Identity | null): string {
  if (!identity) return "";
  return [identity.branchName, identity.collegeName].filter((part) => part !== "").join(" · ");
}
