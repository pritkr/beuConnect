/**
 * Who is using this build, in one place.
 *
 * A saved registration number spells the batch, branch and college
 * (`YYBBBCCCXXX`; a lateral serial `9XX` keeps the same layout). Analytics turns
 * that into GA4 dimensions; `net.ts` puts the same facts on every request to our
 * own API as `x-beu-*` headers, so the worker can join a request to a student
 * without parsing a body or trusting a client-supplied query string.
 *
 * The headers never leave our own host. GitHub (the release check), Supabase
 * (feedback) and BEU's result portal are called without them: a third party has
 * no use for a registration number, and BEU's portal rejects unknown headers on
 * its cross-origin form posts.
 *
 * Nothing here throws. A first launch has no number, a device that cleared
 * storage has no saved context, and both answer `null`.
 */

import { Storage } from "nsh";

/** The readable labels a feature can supply; the codes are derived. */
export interface StudentLabels {
  branchName?: string;
  collegeName?: string;
}

export interface StudentContext {
  /** Digits only, e.g. `23157010001`. */
  reg: string;
  /** 10 hex characters; the only id analytics is allowed to keep. */
  hash: string;
  /** Numeric BEU branch code, e.g. `010`. */
  branch: string;
  branchName: string;
  /** Numeric BEU college code, e.g. `157`. */
  college: string;
  collegeName: string;
  /** Admission year, e.g. `2023`. */
  batch: number;
}

/**
 * Kept from the analytics era so an installed build does not forget the
 * student on upgrade. The payload is still `{ reg, branchName, collegeName }`.
 */
const KEY = "beu.analytics.student";

let current: StudentContext | null = null;
let hydrating: Promise<StudentContext | null> | null = null;

/** `YYBBBCCCXXX` and its lateral `9XX` serial both parse the same way. */
export function parseStudent(reg: string, labels: StudentLabels = {}): StudentContext | null {
  const value = (reg ?? "").replace(/\D/g, "");
  if (value.length < 8) return null;
  return {
    reg: value,
    hash: hashReg(value),
    branch: value.slice(2, 5),
    branchName: (labels.branchName ?? "").slice(0, 100),
    college: value.slice(5, 8),
    collegeName: (labels.collegeName ?? "").slice(0, 100),
    batch: 2000 + Number.parseInt(value.slice(0, 2), 10),
  };
}

/** Sets (or clears) the student for this launch and remembers it for the next. */
export function setStudent(reg: string, labels: StudentLabels = {}): StudentContext | null {
  current = parseStudent(reg, labels);
  hydrating = null;
  if (current === null) {
    void remove();
    return null;
  }
  void save(current);
  return current;
}

/** The student noted this launch, or `null` before a number is saved. */
export function currentStudent(): StudentContext | null {
  return current;
}

/**
 * The headers every request to our own API carries. Empty when no number is
 * saved, so an anonymous student sends exactly what they did before.
 */
export function studentHeaders(): Record<string, string> {
  const student = current;
  if (student === null) return {};
  return {
    "x-beu-reg": student.reg,
    "x-beu-student": student.hash,
    "x-beu-branch": student.branch,
    "x-beu-college": student.college,
    "x-beu-batch": String(student.batch),
  };
}

/**
 * Reads the remembered number once per launch. `net.ts` awaits this before the
 * first request, so the very first screen already carries the headers instead
 * of racing the analytics warm-up.
 */
export function ensureStudent(): Promise<StudentContext | null> {
  if (current !== null) return Promise.resolve(current);
  if (hydrating !== null) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await Storage.getItem(KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { reg?: string; branchName?: string; collegeName?: string };
      if (!saved.reg) return null;
      return setStudent(saved.reg, { branchName: saved.branchName, collegeName: saved.collegeName });
    } catch {
      return null;
    }
  })();
  return hydrating;
}

/* --------------------------------------------------------------- internals */

/** FNV-1a with a second mixing pass: stable, short, not reversible in practice. */
function hashReg(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).slice(0, 10);
}

async function save(student: StudentContext): Promise<void> {
  try {
    await Storage.setItem(
      KEY,
      JSON.stringify({
        reg: student.reg,
        branchName: student.branchName,
        collegeName: student.collegeName,
      }),
    );
  } catch {
    /* a device that cannot write storage still gets the headers this launch */
  }
}

async function remove(): Promise<void> {
  try {
    await Storage.removeItem(KEY);
  } catch {
    /* nothing saved is already the desired state */
  }
}
