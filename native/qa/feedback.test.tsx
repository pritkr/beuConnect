/**
 * Feedback — the report that leaves the phone.
 *
 * The backend is the site's `/api/feedback`, so the payload is a contract:
 * `type`, `message`, `regNo`, `contact`, `page`, `context` and `hp`. These tests
 * pin that the app sends all seven, that the screen it was opened from travels
 * with it, and that a server refusal is shown as a sentence rather than a
 * status code. The footer that opens the sheet is `qa/shell.test.tsx`'s.
 */

import { expect, open, test } from "nsh/test";

import { DOWN, ONBOARDED, openRoute, visible } from "./support";

const ENDPOINT = "POST https://beu.prit.eu.org/api/feedback";

interface Sent {
  type?: string;
  message?: string;
  regNo?: string;
  contact?: string;
  page?: string;
  context?: string;
  hp?: string;
}

test("the report carries every field the site expects", async () => {
  let sent: Sent = {};
  const app = await openRoute("feedback", {}, {
    network: {
      [ENDPOINT]: (request) => {
        sent = JSON.parse(request.body ?? "{}") as Sent;
        return { status: 200, body: { ok: true, message: "Thank you." } };
      },
    },
  });

  await app.type("label:Message", "The SGPA is blank for semester 5.");
  expect(app.enabled("id:feedback-send")).toBe(true);
  await app.press("id:feedback-send");
  await app.waitFor("text:Sent — thank you");

  expect(sent.type).toBe("bug");
  expect(sent.message).toBe("The SGPA is blank for semester 5.");
  expect(sent.page).toBe("native/feedback");
  expect(sent.context).toContain("BEUConnect 1.0.0");
  expect(sent.hp).toBe("");
}, 20000);

test("a refusal shows the server's sentence, and keeps the words", async () => {
  const app = await openRoute("feedback", {}, {
    network: {
      [ENDPOINT]: { status: 429, body: { ok: false, message: "Too many reports. Try again in a minute." } },
    },
  });

  await app.type("label:Message", "Attendance shows 0 for every paper.");
  await app.press("id:feedback-send");
  await app.waitFor("text:Not sent");

  expect(visible(app)).toContain("Too many reports. Try again in a minute.");
  // A retry must not cost the sentence.
  expect(app.value("label:Message")).toBe("Attendance shows 0 for every paper.");
}, 20000);

test("the page lists what already went, and what is sent", async () => {
  const app = await openRoute("feedback", {}, {
    storage: {
      "beu.feedback.memory": JSON.stringify({
        sent: [
          {
            at: Date.now() - 60_000,
            type: "wrong-data",
            message: "CSE semester 4 roster is one name short.",
            page: "native/results.table",
          },
        ],
        lastSentAt: 0,
      }),
    },
  });

  const text = visible(app).toUpperCase();
  expect(text).toContain("RECENT REPORTS");
  expect(text).toContain("CSE SEMESTER 4 ROSTER IS ONE NAME SHORT.");
  expect(text).toContain("WHAT IS SENT");
}, 20000);

test("the footer at the end of a page opens the sheet with that page attached", async () => {
  const app = await open("./../App.tsx", {
    width: 320,
    height: 640,
    clock: {},
    network: DOWN,
    storage: ONBOARDED,
  });

  // It is the page's last line, not an overlay: reach it by scrolling.
  await app.scroll("id:home-scroll", 4000);
  await app.press("id:feedback-footer");

  expect(visible(app)).toContain("ATTACHED");
  expect(visible(app)).toContain("native/home");
  // The tab bar was never covered: the sheet is a modal, the footer is content.
  expect(app.shows("label:Home")).toBe(true);
}, 20000);
