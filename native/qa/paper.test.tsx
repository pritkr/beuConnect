/**
 * The native paper path: one page load, then the device's copy.
 *
 * The site publishes a subject's papers inside one server-rendered page of
 * 0.3–4.5 MB. The app fetches that page once, parses every paper into a
 * bundle (~6 KB per paper) and keeps the bundle in Storage, because a student
 * reads the same paper many times and the phone is often offline.
 *
 * This test is the cycle the parser test cannot see:
 *
 *   1. open one paper online → exactly one request, and a bundle is stored;
 *   2. open a *different* paper from that page cold and offline → it renders
 *      from the bundle, so the page cached every paper, not just the one read;
 *   3. open a catalogue row the page does not carry → it says so without a
 *      request, so a dropped row does not re-download megabytes on every tap;
 *   4. remove the bundle and open again → the screen fails honestly, which is
 *      what proves 2–3 read Storage and not the previous app's memory.
 *
 * It deliberately mounts only this route: PYQ screens are large, and the suite
 * does not mount every area on every run. Four mounts, one page.
 */

import { beforeAll, describe, expect, test } from "nsh/test";

import { DOWN, openRoute } from "./support";
import {
  PAPER_2019,
  PAPER_2024_V2,
  PAPER_2025,
  PAPER_PAGE_HTML,
  PAPER_PAGE_URL,
} from "./fixtures/paper-page";

const PAGE_REQUEST = `GET ${PAPER_PAGE_URL}`;
const BUNDLE_KEY = "beu.cache.pyqs.papers.v2.digital-electronics";

/** The phone after one visit to the subject page: its cache rows. */
let phone: Record<string, string> = {};

beforeAll(async () => {
  const app = await openRoute("pyqs.paper", PAPER_2025, {
    network: {
      [PAGE_REQUEST]: {
        body: PAPER_PAGE_HTML,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    },
  });
  await app.waitFor("text:Explain the working of a PN junction diode.");
  expect(app.requests().length).toBe(1);
  phone = app.storage();
});

describe("a paper on the device", () => {
  test("one page load stores the whole subject", () => {
    expect(phone[BUNDLE_KEY]).toBeTruthy();
  });

  test("a paper read before opens cold, with no network", async () => {
    const app = await openRoute("pyqs.paper", PAPER_2025, { network: DOWN, storage: phone });

    await app.waitFor("text:Explain the working of a PN junction diode.");
    expect(app.requests()).toEqual([]);
  });

  test("a different paper on that page opens too, so the bundle is not one paper", async () => {
    const app = await openRoute("pyqs.paper", PAPER_2024_V2, { network: DOWN, storage: phone });

    await app.waitFor("text:State De Morgan's theorem.");
    expect(app.requests()).toEqual([]);
  });

  test("a row the page does not carry says so instead of fetching again", async () => {
    const app = await openRoute("pyqs.paper", PAPER_2019, { network: DOWN, storage: phone });

    await app.waitFor("text:This paper is not on the subject page");
    expect(app.requests()).toEqual([]);
  });

  test("with no copy on the device the screen says so, so the tests above prove Storage", async () => {
    const withoutPapers = { ...phone };
    delete withoutPapers[BUNDLE_KEY];

    const app = await openRoute("pyqs.paper", PAPER_2025, { network: DOWN, storage: withoutPapers });
    await app.waitFor("text:This paper did not load");
  });
});
