/**
 * The result corpus client — the two silent calls and the read-chain order.
 *
 * Runs headless, no app and no network: `POST`/`GET` go through a local `fetch`
 * stub, so nothing here depends on our worker being up. The order `loadResult`
 * walks is asserted through its pure `sourcesFor`, because booting a result
 * screen to watch a fallback that never happens would be a slower, flakier way
 * to say the same thing.
 */

import { afterEach, describe, expect, test } from "nsh/test";

import { sourcesFor } from "../src/features/results/data";
import { SITE } from "../src/lib/net";
import { contributeCorpus, readCorpus } from "../src/lib/corpus";

const REG = "21105157098";
const AT = 1_763_000_000_000;

/* ── a fetch of our own, in the shape `lib/net` reads ──────────────── */

interface StubCall {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}

type Reply = { status?: number; body?: string } | { error: string };

const realFetch = globalThis.fetch;
let calls: StubCall[] = [];

/** Answers every request through `reply`; a call is recorded before it answers. */
function stub(reply: (call: StubCall) => Reply): void {
  calls = [];
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const call: StubCall = {
      url: String(input),
      method: String(init.method ?? "GET").toUpperCase(),
      body: typeof init.body === "string" ? init.body : "",
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const answer = reply(call);
    if ("error" in answer) throw new Error(answer.error);
    const status = answer.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => answer.body ?? "",
    } as unknown as Response;
  }) as typeof fetch;
}

const payload = { status: 200, data: { redg_no: REG, name: "ASHA KUMARI", theorySubjects: [] } };

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("contribution", () => {
  test("posts the registration, semester, payload and path to our own worker", async () => {
    stub(() => ({ status: 200, body: '{"status":"stored"}' }));

    await contributeCorpus(REG, 2, payload, "portal");

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(`${SITE}/api/corpus`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0].body)).toEqual({ reg: REG, sem: 2, payload, via: "portal" });
  });

  test("normalises the registration number to the digits the endpoint validates", async () => {
    stub(() => ({ status: 200, body: "" }));

    await contributeCorpus(" 2110-5157-098 ", 2, payload, "api");

    expect(JSON.parse(calls[0].body).reg).toBe(REG);
    expect(JSON.parse(calls[0].body).via).toBe("api");
  });

  test("resolves when the request is rejected, after one retry", async () => {
    stub(() => ({ error: "offline" }));

    await expect(contributeCorpus(REG, 2, payload, "api")).resolves.toBe(undefined);

    expect(calls.length).toBe(2);
  });

  test("never retries a refusal: a broken row is not a transport failure", async () => {
    stub(() => ({ status: 400, body: '{"status":"invalid","reason":"payload"}' }));

    await expect(contributeCorpus(REG, 2, {}, "api")).resolves.toBe(undefined);

    expect(calls.length).toBe(1);
  });
});

describe("reading a row", () => {
  test("a miss is null, not an error", async () => {
    stub(() => ({ status: 404, body: '{"status":"miss"}' }));

    await expect(readCorpus(REG, 1)).resolves.toBe(null);

    expect(calls[0].url).toBe(`${SITE}/api/corpus?reg=${REG}&sem=1`);
    expect(calls[0].method).toBe("GET");
  });

  test("a stored row comes back with its capture time and path", async () => {
    stub(() => ({
      status: 200,
      body: JSON.stringify({ status: "ok", payload, capturedAt: AT, via: "api" }),
    }));

    const row = await readCorpus(REG, 1);

    expect(row).toEqual({ payload, capturedAt: AT, via: "api" });
  });

  test("a transport failure is a miss too", async () => {
    stub(() => ({ error: "offline" }));

    await expect(readCorpus(REG, 3)).resolves.toBe(null);
  });

  test("a row with no capture time is discarded rather than dated now", async () => {
    stub(() => ({ status: 200, body: JSON.stringify({ status: "ok", payload }) }));

    await expect(readCorpus(REG, 4)).resolves.toBe(null);
  });
});

describe("the read chain", () => {
  test("a warm saved copy answers before the corpus", () => {
    expect(sourcesFor(true, true, true)).toEqual(["cache"]);
    expect(sourcesFor(true, false, false)).toEqual(["cache"]);
  });

  test("a corpus hit never reads a CSV", () => {
    expect(sourcesFor(false, true, true)).toEqual(["corpus"]);
  });

  test("the published table is the last source", () => {
    expect(sourcesFor(false, false, true)).toEqual(["csv"]);
  });

  test("a result nobody holds falls through empty, so the screen says so", () => {
    expect(sourcesFor(false, false, false)).toEqual([]);
  });
});
