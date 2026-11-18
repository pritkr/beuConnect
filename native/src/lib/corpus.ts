/**
 * Result corpus — the shared copy of a result a student already looked up.
 *
 * Every successful lookup is posted to `POST /api/corpus` on our own worker,
 * and a lookup that the live server cannot answer reads the same row back from
 * `GET /api/corpus`. The contract — endpoint, row shape, policy — is
 * `docs/RESULT_CORPUS.md`; this file is only the client.
 *
 * Both calls are silent by design. A contribution never shows a toast, a badge
 * or an error: the result is already on screen, and the local save already
 * happened. A read that misses is `null`, exactly like an empty cache, so the
 * caller's fallback chain never learns which source answered.
 */

import { NetError, SITE, fetchJson, postJson } from "./net";

/** Which path captured the payload: the captcha portal, or the live JSON API. */
export type CorpusVia = "portal" | "api";

/** One stored row, as `GET /api/corpus` returns it. */
export interface CorpusRecord {
  /** The BEU `result/get-result` payload as captured (`{status,data}` or bare). */
  payload: unknown;
  /** When the worker stored it (ms), not when this phone read it. */
  capturedAt: number;
  via: CorpusVia;
}

/** The cached read never expires within the student's degree: a published result cannot change. */
const READ_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/** Both calls are off the screen's critical path; neither may hang a launch. */
const TIMEOUT = 8000;

/** Registration numbers travel as digits only, exactly as every other path normalises them. */
function numeric(reg: string): string {
  return String(reg).replace(/[^0-9]/g, "");
}

function readUrl(reg: string, sem: number): string {
  return `${SITE}/api/corpus?reg=${encodeURIComponent(reg)}&sem=${sem}`;
}

/**
 * Offers one captured result to the corpus. Resolves when the request settles,
 * whatever it settled to: the caller is a `void` fire-and-forget and a failure
 * is silent by design.
 *
 * One retry, and only on a transport failure (`status 0`): a 400 means the row
 * was rejected, and a 429 means the write guard said no; retrying either only
 * adds requests.
 */
export async function contributeCorpus(
  reg: string,
  sem: number,
  payload: unknown,
  via: CorpusVia = "portal",
): Promise<void> {
  const body = { reg: numeric(reg), sem: Math.floor(Number(sem)), payload, via };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await postJson(`${SITE}/api/corpus`, body, TIMEOUT);
      return;
    } catch (error) {
      if (!(error instanceof NetError) || error.status !== 0) return;
    }
  }
}

/**
 * The stored result for one registration number and semester, or `null`.
 *
 * A 404 is a miss, not a failure: the caller falls through to the published
 * CSV exactly as it would with an empty cache. Any other failure is a miss too,
 * so a dead corpus can never make a result screen fail on its own.
 */
export async function readCorpus(reg: string, sem: number): Promise<CorpusRecord | null> {
  const numericReg = numeric(reg);
  const numericSem = Math.floor(Number(sem));
  if (!numericReg || !Number.isFinite(numericSem) || numericSem < 1 || numericSem > 8) return null;

  try {
    const row = await fetchJson<{ status?: string; payload?: unknown; capturedAt?: unknown; via?: unknown }>(
      readUrl(numericReg, numericSem),
      {
        cacheKey: `corpus:${numericReg}:${numericSem}`,
        cacheMaxAge: READ_MAX_AGE,
        timeout: TIMEOUT,
      },
    );
    if (!row || typeof row !== "object") return null;
    if (!row.payload || typeof row.payload !== "object") return null;
    const capturedAt = Number(row.capturedAt);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0) return null;
    return {
      payload: row.payload,
      capturedAt,
      via: row.via === "api" ? "api" : "portal",
    };
  } catch {
    return null;
  }
}
