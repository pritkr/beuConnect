/**
 * Results — the BEU result page, in a WebView, read back natively.
 *
 * BEU now publishes results only behind a captcha (reCAPTCHA on the JSON API,
 * Cloudflare Turnstile on the page). The app cannot and will not solve one, so
 * the honest route is this screen: the university's own page, at a phone size,
 * with the student's registration number already filled in and the exam for
 * their semester already open. The student solves the captcha; the page BEU
 * renders is read on this phone and saved under the same cache key the live
 * path uses, so rank, battle and the next cold start all see it.
 *
 * The WebView is a means to an end, not the result screen: `ResultView` draws
 * the marks natively, exactly as it does for a live or published result.
 *
 * What the page actually is (August 2026):
 *
 *   /result-one                 the published exam list, one row per exam
 *   /result-two/:exam?d=<b64>   that exam's form: `#reg`, a Turnstile widget,
 *                               and a "Show Result" button
 *   /result-three?d=<b64>       the result, handed over in router state
 *
 * The three are Angular routes in one document, so the injected script is
 * installed once and watches the DOM as the student moves between them: it
 * clicks the row for their semester, fills the number, and captures the result
 * table the moment it appears.
 */

import { Clipboard, Scroll, Text, View, WebView, signal } from "nsh";

import type { Nav } from "../../app/router";
import { numParam, param } from "../../app/router";
import { Badge, Btn, Label, Muted, Panel, Row, Screen, Subtitle } from "../../ui";
import { FeedbackFooter } from "../feedback/footer";
import type { ResultData } from "./data";
import { saveParsedResult } from "./data";
import { parseResultHtml } from "./parse-html";
import { ResultView } from "./result-view";
import { Fresh, cleanReg, clampedSem, errorMessage } from "./shared";

/** The published exam list. The exam for the student's semester is one tap in. */
const PORTAL = "https://beu-bih.ac.in/result-one";

/**
 * The page's own watcher. Installed after each load, it stays for the whole
 * visit because the three result routes are one Angular document:
 *
 *  - on the exam list it opens the row for the student's semester,
 *  - on that exam's form it fills the registration number (once, so a student
 *    correcting it is never overwritten),
 *  - on every route it watches for BEU's own error box and for the result
 *    table, and posts the result's markup exactly once.
 *
 * ES5 and defensive throughout: a throw here would break the university's page.
 */
function injected(reg: string, sem: number): string {
  const safeReg = reg.replace(/[^0-9A-Za-z]/g, "");
  const safeSem = Math.max(1, Math.min(8, Math.floor(sem) || 1));
  const ordinal = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"][safeSem - 1];
  return `(function () {
  if (window.__beuWatch) return;
  window.__beuWatch = true;
  var REG = ${JSON.stringify(safeReg)};
  var ORDINAL = ${JSON.stringify(ordinal)};
  var POSTED = false;
  var CLICKED = false;
  var FILLED = false;
  var LAST_PROBLEM = "";
  var SLOW_SAID = false;
  var BLANK_SAID = false;
  var THREE_SINCE = 0;
  var DEADLINE = Date.now() + 120000;
  var TIMER = null;
  var LAST_TICK = 0;

  function post(value) {
    try {
      if (window.nsh && window.nsh.postMessage) window.nsh.postMessage(JSON.stringify(value));
    } catch (error) {}
  }
  function flat(text) {
    return String(text === null || text === undefined ? "" : text).replace(/\\s+/g, " ").trim();
  }
  function path() {
    return String(window.location.pathname || "");
  }
  function setValue(field, value) {
    try {
      var descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (descriptor && descriptor.set) descriptor.set.call(field, value);
      else field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (error) {}
  }
  function chooseExam() {
    if (CLICKED || !REG) return;
    var rows = document.querySelectorAll("tr.clickable-row");
    if (!rows || rows.length === 0) return;
    var wanted = ORDINAL + " Semester Examination";
    var batch = REG.length >= 2 ? "20" + REG.slice(0, 2) : "";
    var exact = null;
    var program = null;
    var any = null;
    for (var index = 0; index < rows.length; index += 1) {
      var label = flat(rows[index].innerText || rows[index].textContent);
      if (label.indexOf(wanted) < 0) continue;
      if (/supplementary|backlog|\\(old\\)/i.test(label)) continue;
      var isBtech = /^B\\.?\\s*Tech/i.test(label);
      if (isBtech && batch && label.indexOf(batch) >= 0) {
        if (!exact) exact = rows[index];
      } else if (isBtech) {
        if (!program) program = rows[index];
      } else if (!any) {
        any = rows[index];
      }
    }
    var target = exact || program || any;
    if (!target) return;
    CLICKED = true;
    try {
      target.click();
    } catch (error) {
      try { target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } catch (inner) {}
    }
  }
  function fillRegistration() {
    if (FILLED || !REG) return;
    var field = document.getElementById("reg");
    if (!field) field = document.querySelector("input[placeholder*='Reg'], input[name='reg']");
    if (!field) return;
    if (flat(field.value) !== "") { FILLED = true; return; }
    setValue(field, REG);
    FILLED = true;
  }
  function reportProblem() {
    var box = document.querySelector(".alert-danger");
    if (!box) return;
    var text = flat(box.innerText || box.textContent);
    if (!text || text === LAST_PROBLEM) return;
    LAST_PROBLEM = text;
    post({ kind: "problem", message: text.slice(0, 200) });
  }
  function hasResult() {
    if (document.querySelector(".cutumtableBasicDetails")) return true;
    var host = document.querySelector("app-result-three");
    if (host && flat(host.innerText || host.textContent).toUpperCase().indexOf("SGPA") >= 0) return true;
    return false;
  }
  function capture() {
    if (POSTED) return;
    var host = document.querySelector("app-result-three");
    var html = host ? host.innerHTML : (document.body ? document.body.innerHTML : "");
    if (!html || html.length < 300) return;
    POSTED = true;
    stop();
    post({ kind: "result", html: html });
  }
  function stop() {
    if (TIMER) { window.clearInterval(TIMER); TIMER = null; }
  }
  function tick() {
    if (POSTED) { stop(); return; }
    var here = path();
    var onResultPage = here.indexOf("/result-three") === 0;
    if (onResultPage && !THREE_SINCE) THREE_SINCE = Date.now();
    else if (!onResultPage) THREE_SINCE = 0;
    if (here.indexOf("/result-one") === 0) chooseExam();
    else if (here.indexOf("/result-two") === 0) { fillRegistration(); }
    if (hasResult()) { capture(); return; }
    if (here.indexOf("/result-three") === 0) reportProblem();
    else if (here.indexOf("/result-two") === 0) reportProblem();
    if (onResultPage && !BLANK_SAID && Date.now() - THREE_SINCE > 6000) {
      BLANK_SAID = true;
      post({ kind: "problem", message: "BEU opened the result page without a result. Check the registration number and semester, then try again." });
    }
    if (Date.now() > DEADLINE) {
      DEADLINE = Date.now() + 600000;
      if (!SLOW_SAID) { SLOW_SAID = true; post({ kind: "slow" }); }
    }
  }
  function start() {
    tick();
    TIMER = window.setInterval(tick, 700);
    try {
      if (window.MutationObserver && document.body) {
        new MutationObserver(function () {
          var now = Date.now();
          if (now - LAST_TICK < 250) return;
          LAST_TICK = now;
          tick();
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    } catch (error) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`;
}

export function ResultWebScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const reg = cleanReg(param(nav, "reg"));
  const sem = clampedSem(numParam(nav, "sem"), reg);

  const captured = signal<ResultData | null>(null);
  const phase = signal<"waiting" | "saving" | "problem">("waiting");
  const message = signal("");
  const hint = signal("");
  const copied = signal(false);
  const pageHtml = signal("");
  /** Bumped by "Reload page" and "Try again": the WebView loads afresh. */
  const attempt = signal(0);

  const reload = (): void => {
    captured.set(null);
    phase.set("waiting");
    message.set("");
    hint.set("");
    pageHtml.set("");
    copied.set(false);
    attempt.update((value) => value + 1);
  };

  const accept = (raw: string): void => {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || typeof payload !== "object") return;
    const record = payload as { kind?: unknown; html?: unknown; message?: unknown };

    if (record.kind === "problem") {
      if (captured() !== null) return;
      phase.set("problem");
      message.set(String(record.message ?? "").replace(/\s+/g, " ").slice(0, 220) || "BEU refused that request.");
      return;
    }
    if (record.kind === "slow") {
      hint.set("Still watching this page. Solve the captcha and tap Show Result — the result is read the moment it appears.");
      return;
    }
    if (record.kind !== "result" || typeof record.html !== "string") return;
    if (captured() !== null || phase() === "saving") return;

    pageHtml.set(record.html);
    const parsed = parseResultHtml(record.html, { reg, sem });
    if (!parsed) {
      phase.set("problem");
      message.set("The page opened, but no result could be read from it. Nothing was saved.");
      return;
    }

    phase.set("saving");
    void saveParsedResult(parsed, reg)
      .then((data) => {
        captured.set(data);
        phase.set("waiting");
        message.set("");
        hint.set("");
      })
      .catch((error: unknown) => {
        phase.set("problem");
        message.set(errorMessage(error));
      });
  };

  /** The number and semester to name in the header: the saved result wins. */
  const shownReg = (): string => captured()?.reg ?? reg;
  const shownSem = (): number => captured()?.semester ?? sem;

  const copyPage = (): void => {    const html = pageHtml();
    if (!html) return;
    const text = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(?:p|div|tr|li|h[1-6]|table|td|th)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/[\t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 20000);
    void Clipboard.writeText(text).then(() => {
      copied.set(true);
      setTimeout(() => copied.set(false), 2200);
    });
  };

  return (
    <Screen>
      <View class="flex-row items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Btn variant="ghost" class="min-h-11" onPress={() => nav.pop()} label="Back" icon="chevron-left">
          Back
        </Btn>
        <View class="flex-1 gap-0.5">
          <Text class="text-[14px] font-semibold text-foreground" numberOfLines={1}>
            BEU result page
          </Text>
          <Muted class="tabular-nums" numberOfLines={1}>
            {shownReg() ? `${shownReg()} · semester ${shownSem()}` : `Semester ${shownSem()}`}
          </Muted>
        </View>
        <Fresh
          when={`badge:${captured() !== null}:${phase()}`}
          build={() => {
            const tone =
              captured() !== null ? "mint" : phase() === "problem" ? "ember" : phase() === "saving" ? "amber" : "neutral";
            const label =
              captured() !== null ? "Saved" : phase() === "problem" ? "Problem" : phase() === "saving" ? "Reading" : "Waiting";
            return <Badge tone={tone}>{label}</Badge>;
          }}
        />
      </View>

      {captured() ? (
        <Scroll class="flex-1" contentClass="p-4 gap-4 pb-10">
          <Panel tone="mint" class="gap-1">
            <Label>Saved on this phone</Label>
            <Muted class="text-[12px] leading-5">
              Read from BEU's own page, then drawn here natively. Rank, battle and the next cold start can use it
              right away, online or not.
            </Muted>
          </Panel>
          <ResultView
            data={captured() as ResultData}
            onRank={() => nav.push("results.rank", { reg: captured()?.reg ?? reg, sem: captured()?.semester ?? sem })}
            onBattle={() => nav.push("results.battle", { a: captured()?.reg ?? reg, sem: captured()?.semester ?? sem })}
          />
          <Row class="gap-3">
            <Btn
              class="flex-1 min-h-11"
              onPress={() => nav.replace("results", { reg: captured()?.reg ?? reg, sem: captured()?.semester ?? sem })}
            >
              Open in Results
            </Btn>
            <Btn variant="ghost" class="min-h-11" onPress={reload} label="Open the BEU page again">
              Open page again
            </Btn>
          </Row>
          <FeedbackFooter />
        </Scroll>
      ) : (
        <View class="flex-1">
          <View class="gap-1 border-b border-border bg-background px-4 py-3">
            <Row class="flex-wrap items-center gap-2">
              <Badge tone="ember">Captcha</Badge>
              <Muted class="text-[11px]">Solved by you, never by the app</Muted>
            </Row>
            <Subtitle class="text-[12px] leading-5">
              Enter the captcha, then open your result. It is read on this phone and stored natively.
            </Subtitle>
          </View>

          <Fresh
            when={`web:${attempt()}`}
            build={() => (
              <WebView
                src={attempt() === 0 ? PORTAL : `${PORTAL}?reload=${attempt()}`}
                class="flex-1 bg-card"
                javaScriptEnabled
                injectedJavaScript={injected(reg, sem)}
                onMessage={(event) => accept(event?.data ?? "")}
                onLoad={() => {
                  hint.set("");
                }}
                onError={(event) => {
                  if (captured() !== null) return;
                  phase.set("problem");
                  message.set(event?.message || "The BEU page did not load. Check the connection and try again.");
                }}
              />
            )}
          />

          <View class="gap-2 border-t border-border bg-card px-4 py-3">
            {phase() === "saving" ? (
              <Text class="text-[12px] font-medium text-muted-foreground">Reading the result from the page…</Text>
            ) : phase() === "problem" ? (
              <View class="gap-2">
                <Row class="gap-2">
                  <Badge tone="ember">Not saved</Badge>
                  <Muted class="text-[11px]">The page is still open above</Muted>
                </Row>
                <Text class="text-[12px] leading-5 text-foreground">{message()}</Text>
                <Muted class="text-[11px] leading-4">
                  {pageHtml()
                    ? "Copy the page text if you want to keep what BEU showed, or try again."
                    : "Fix what BEU asks for in the page above, then try again."}
                </Muted>
              </View>
            ) : (
              <Muted class="text-[11px] leading-4">
                {hint() ||
                  (reg
                    ? `Your number is filled in. Pick or keep semester ${sem} on the page, solve the captcha, then tap Show Result.`
                    : "Type your registration number on the page, pick a semester, solve the captcha, then tap Show Result.")}
              </Muted>
            )}

            <Row class="gap-3">
              <Btn variant="secondary" class="min-h-11" onPress={reload} label="Reload the BEU page">
                {phase() === "problem" ? "Try again" : "Reload page"}
              </Btn>
              {pageHtml() !== "" ? (
                <Btn variant="ghost" class="min-h-11" onPress={copyPage} label="Copy page text">
                  {copied() ? "Copied" : "Copy page text"}
                </Btn>
              ) : null}
            </Row>
          </View>
        </View>
      )}
    </Screen>
  );
}
