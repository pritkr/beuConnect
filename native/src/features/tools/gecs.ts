/**
 * The college register at gecsattendance.netlify.app, read through Supabase.
 *
 * The site signs a student in with two calls and no session: the guardian
 * mobile is checked against the registration number, then the same number
 * fetches the student's papers and attendance. Both accept the publishable
 * key, which is public by design — it is the same key the web app ships.
 *
 * The response is Postgres camel-free JSON: `attendance_entries` carry the
 * classes held per paper, `attendance_records` carry one student's present
 * count per entry, and `papers` carries the names. None of that is guaranteed
 * by a schema this app controls, so every read is defensive: a missing array
 * is empty, a numeric string is a number, a malformed row is skipped. A
 * response that is not a student payload is a typed error, never a throw, so
 * the screen can print what Supabase said and the HTTP status beside it.
 *
 * No guardian mobile is ever stored, logged or put in an error message. The
 * only thing this module persists is the last good paper list, keyed by
 * registration number, so Attendance still has numbers with no network.
 */

import { httpMessage, readStore, removeStore, writeStore } from "../../lib/net";
import { KEYS } from "./state";

const SUPABASE_URL = "https://rptbalyjcevtxoxyvzli.supabase.co";
/** The publishable (anon) key: safe in a client, and the only key these RPCs need. */
const PUBLISHABLE_KEY = "sb_publishable_-gWx-Vzr4y9bP3Ui94y31w_SR4W-_fZ";

const REQUEST_TIMEOUT = 15000;

export interface GecsPaper {
  code: string;
  name: string;
  attended: number;
  total: number;
}

export interface GecsSnapshot {
  regNo: string;
  /** Epoch milliseconds: when the register last answered with this list. */
  fetchedAt: number;
  studentName: string;
  papers: GecsPaper[];
}

export type GecsErrorKind = "offline" | "http" | "shape" | "empty";

export interface GecsError {
  ok: false;
  kind: GecsErrorKind;
  /** 0 when the request never reached Supabase. */
  status: number;
  message: string;
}

export interface GecsOk<T> {
  ok: true;
  value: T;
}

export type GecsResult<T> = GecsOk<T> | GecsError;

/** One RPC answer: the status as sent, and the body already parsed. */
export interface GecsReply {
  status: number;
  body: unknown;
  /** Set only when the request never completed (status 0). */
  message?: string;
}

export type GecsSend = (fn: string, params: Record<string, unknown>) => Promise<GecsReply>;

export interface GecsOptions {
  /** Tests pass a transport here; the app never does. */
  send?: GecsSend;
  /** Fixed clock for a deterministic `fetchedAt` in a test. */
  now?: number;
}

/* ------------------------------------------------------------- validation */

/**
 * The registration number the register knows: exactly 11 digits.
 *
 *   "24105157001" → ""
 *   "2410515700"  → "Enter the 11-digit registration number."
 *   "2410515700a" → "Enter the 11-digit registration number."
 */
export function registrationError(value: string): string {
  return /^\d{11}$/.test(value.trim()) ? "" : "Enter the 11-digit registration number.";
}

/**
 * The guardian mobile is the student's password: exactly 10 digits.
 *
 *   "9876543210" → ""
 *   "987654321"  → "Enter the 10-digit guardian mobile."
 *   "+91 98765"  → "Enter the 10-digit guardian mobile."
 */
export function guardianMobileError(value: string): string {
  return /^\d{10}$/.test(value.trim()) ? "" : "Enter the 10-digit guardian mobile.";
}

/* ------------------------------------------------------------------ errors */

/** Ten or more digits in a server message could be a phone number; never echo it. */
function scrub(message: string): string {
  return message.replace(/\b\d{10,}\b/g, "…");
}

function serverMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const row = body as Record<string, unknown>;
  for (const key of ["message", "error_description", "error"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return scrub(value.trim());
  }
  return "";
}

/**
 * A non-2xx answer, keeping the status and Supabase's own sentence. A plain
 * HTML error body has no sentence worth showing, so the status wording wins.
 *
 *   (401, { message: "JWT expired" }) → "JWT expired", status 401
 *   (404, "<html>…")                  → "That information isn't available."
 */
export function httpError(status: number, body: unknown, transport = ""): GecsError {
  const message = transport || serverMessage(body) || httpMessage(status);
  return {
    ok: false,
    kind: status === 0 ? "offline" : "http",
    status,
    message: scrub(message),
  };
}

function shapeError(message: string, status = 200): GecsError {
  return { ok: false, kind: "shape", status, message };
}

/* ------------------------------------------------------------------ values */

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** A count from a number or a numeric string; anything else is not a count. */
function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const valid = (value as Record<string, unknown>).valid;
    if (typeof valid === "boolean") return valid;
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/* ------------------------------------------------------------- transport */

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("gecs-timeout"));
    }, ms);

    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

async function postRpc(fn: string, params: Record<string, unknown>): Promise<GecsReply> {
  try {
    const response = await withTimeout(
      fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${PUBLISHABLE_KEY}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(params),
      }),
      REQUEST_TIMEOUT,
    );
    const text = await withTimeout(response.text(), REQUEST_TIMEOUT);
    return { status: response.status, body: parseBody(text) };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "gecs-timeout";
    return {
      status: 0,
      body: null,
      message: timedOut
        ? "The request timed out. Check your connection and try again."
        : "You appear to be offline.",
    };
  }
}

/* -------------------------------------------------------------- normalise */

interface PaperTotal {
  code: string;
  name: string;
  /** Summed from attendance_entries, the authoritative class count. */
  entryTotal: number;
  /** `papers` may already carry totals; used only when entries do not. */
  sheetTotal: number;
  sheetPresent: number;
  recorded: number;
  hasEntries: boolean;
  hasRecords: boolean;
}

/**
 * Turns the RPC's `{ student, attendance_entries, attendance_records, papers }`
 * into one row per paper. Entries decide how many classes were held; records
 * decide how many this student attended; `papers` supplies names and is a
 * fallback total when an array is missing.
 *
 *   entry 100608 held 12, entry 100608 held 8, records 10 + 6
 *     → { code: "100608", attended: 16, total: 20 }
 *
 * A record that names a paper but no entry is still counted (total becomes at
 * least the present count), because dropping it would hide a class the
 * student attended.
 */
export function normaliseStudentData(raw: unknown, regNo: string, fetchedAt = Date.now()): GecsResult<GecsSnapshot> {
  if (raw === null || raw === undefined) {
    return { ok: false, kind: "empty", status: 200, message: "No student with that registration number." };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return shapeError("The college server returned an unexpected answer.");
  }

  const data = raw as Record<string, unknown>;
  const hasPayload = ["student", "attendance_entries", "attendance_records", "papers"].some((key) => key in data);
  if (!hasPayload) {
    const message = serverMessage(data);
    return shapeError(message || "The college server returned an unexpected answer.");
  }

  const accumulated = new Map<string, PaperTotal>();
  const entryPapers = new Map<string, { code: string; total: number }>();

  const keyOf = (code: string): string => code.trim().toLowerCase();
  const ensure = (code: string): PaperTotal => {
    const key = keyOf(code);
    const existing = accumulated.get(key);
    if (existing) return existing;
    const created: PaperTotal = {
      code: code.trim(),
      name: "",
      entryTotal: 0,
      sheetTotal: 0,
      sheetPresent: 0,
      recorded: 0,
      hasEntries: false,
      hasRecords: false,
    };
    accumulated.set(key, created);
    return created;
  };

  const list = (key: string): unknown[] => (Array.isArray(data[key]) ? (data[key] as unknown[]) : []);

  for (const item of list("papers")) {
    const row = asObject(item);
    if (!row) continue;
    const code = asText(row.paper_code) || asText(row.code) || asText(row.subject_code);
    if (!code) continue;
    const paper = ensure(code);
    const name = asText(row.paper_name) || asText(row.name) || asText(row.subject_name);
    if (name && !paper.name) paper.name = name;
    const total = asCount(row.total_classes) ?? asCount(row.total);
    const present = asCount(row.present_classes) ?? asCount(row.present) ?? asCount(row.attended);
    if (total !== null) paper.sheetTotal = Math.max(paper.sheetTotal, total);
    if (present !== null) paper.sheetPresent = Math.max(paper.sheetPresent, present);
  }

  let index = 0;
  for (const item of list("attendance_entries")) {
    index += 1;
    const row = asObject(item);
    if (!row) continue;
    const code = asText(row.paper_code) || asText(row.code);
    if (!code) continue;
    const paper = ensure(code);
    const name = asText(row.paper_name) || asText(row.subject_name);
    if (name && !paper.name) paper.name = name;
    const total = asCount(row.total_classes) ?? asCount(row.total) ?? 0;
    paper.entryTotal += total;
    paper.hasEntries = true;
    const id = asText(row.id) || asText(row.entry_id) || String(index);
    entryPapers.set(id, { code, total });
  }

  for (const item of list("attendance_records")) {
    const row = asObject(item);
    if (!row) continue;
    const entryId =
      asText(row.attendance_entry_id) || asText(row.entry_id) || asText(row.attendance_entry);
    const linked = entryId ? entryPapers.get(entryId) : undefined;
    const code = linked?.code ?? (asText(row.paper_code) || asText(row.code));
    if (!code) continue;
    const paper = ensure(code);
    const present = asCount(row.present_classes) ?? asCount(row.present) ?? 0;
    paper.recorded += linked && linked.total > 0 ? Math.min(present, linked.total) : present;
    paper.hasRecords = true;
  }

  const papers: GecsPaper[] = [];
  for (const paper of accumulated.values()) {
    const held = paper.hasEntries ? paper.entryTotal : paper.sheetTotal;
    const present = paper.hasRecords ? paper.recorded : paper.sheetPresent;
    const attended = Math.max(0, Math.round(present));
    const total = Math.max(Math.max(0, Math.round(held)), attended);
    // A paper listed but never taught and never attended has nothing to show.
    if (total === 0 && attended === 0) continue;
    papers.push({
      code: paper.code,
      name: (paper.name || paper.code).slice(0, 60),
      attended,
      total,
    });
  }

  const student = asObject(data.student);
  const studentName = (student ? asText(student.name) || asText(student.student_name) : "").slice(0, 60);

  return {
    ok: true,
    value: {
      regNo: regNo.trim().slice(0, 24),
      fetchedAt: Number.isFinite(fetchedAt) ? Math.round(fetchedAt) : Date.now(),
      studentName,
      papers,
    },
  };
}

/* -------------------------------------------------------------------- api */

/**
 * The guardian-mobile check. `true` means the pair matches; `false` is an
 * answer, not a failure, so the screen can say "no match" without inventing
 * an error.
 */
export async function validate(
  regNo: string,
  guardianMobile: string,
  options: GecsOptions = {},
): Promise<GecsResult<boolean>> {
  const send = options.send ?? postRpc;
  const reply = await send("validate_guardian_mobile", {
    p_registration_no: regNo.trim(),
    p_guardian_mobile: guardianMobile.trim(),
  });
  if (reply.status < 200 || reply.status >= 300) return httpError(reply.status, reply.body, reply.message);

  const valid = asBoolean(reply.body);
  if (valid === null) return shapeError("The college server returned an unexpected answer.");
  return { ok: true, value: valid };
}

/** The full student payload, normalised to papers and counts. */
export async function fetchStudent(regNo: string, options: GecsOptions = {}): Promise<GecsResult<GecsSnapshot>> {
  const send = options.send ?? postRpc;
  const reply = await send("get_complete_student_data", { p_registration_no: regNo.trim() });
  if (reply.status < 200 || reply.status >= 300) return httpError(reply.status, reply.body, reply.message);
  return normaliseStudentData(reply.body, regNo, options.now ?? Date.now());
}

/* ------------------------------------------------------------------ cache */

/** The last good snapshot, or `null` when nothing usable is stored. */
export async function readGecsCache(): Promise<GecsSnapshot | null> {
  const stored = await readStore<unknown>(KEYS.gecs, null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const raw = stored as Record<string, unknown>;

  const regNo = asText(raw.regNo).slice(0, 24);
  const fetchedAt = asCount(raw.fetchedAt) ?? 0;
  if (!regNo || fetchedAt <= 0) return null;

  const papers: GecsPaper[] = [];
  if (Array.isArray(raw.papers)) {
    for (const item of raw.papers) {
      const row = asObject(item);
      if (!row) continue;
      const code = asText(row.code) || asText(row.paper_code);
      if (!code) continue;
      const attended = asCount(row.attended) ?? 0;
      const total = Math.max(asCount(row.total) ?? 0, attended);
      if (total === 0 && attended === 0) continue;
      papers.push({
        code,
        name: (asText(row.name) || asText(row.paper_name) || code).slice(0, 60),
        attended,
        total,
      });
    }
  }

  return {
    regNo,
    fetchedAt,
    studentName: asText(raw.studentName).slice(0, 60),
    papers,
  };
}

/** Persists only papers and their counts — never a mobile number. */
export async function writeGecsCache(snapshot: GecsSnapshot): Promise<void> {
  await writeStore(KEYS.gecs, {
    regNo: snapshot.regNo,
    fetchedAt: snapshot.fetchedAt,
    studentName: snapshot.studentName,
    papers: snapshot.papers.map((paper) => ({
      code: paper.code,
      name: paper.name,
      attended: paper.attended,
      total: paper.total,
    })),
  });
}

export async function clearGecsCache(): Promise<void> {
  await removeStore(KEYS.gecs);
}
