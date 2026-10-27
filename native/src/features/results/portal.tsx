/**
 * Results — the captcha portal.
 *
 * BEU's server-side result API is only as reliable as the university's own
 * backend, and that backend now gates its result token behind a reCAPTCHA. When
 * the fast native path fails there is exactly one honest way through: the
 * official portal, in a WebView, where the student solves the captcha.
 *
 * The WebView is the captcha and nothing else. Before the page's own scripts run
 * we hook `XMLHttpRequest` and `fetch`; when the portal receives its result JSON
 * we pass that JSON to the native side, normalise it with the same code the live
 * path uses, save it under the same cache key, and render it with the same native
 * result view. No DOM scraping, no duplicated parsing, no second source of truth.
 *
 * The captcha is never solved, bypassed or replayed by the app. The student
 * solves it in the page; we only read the result they already earned.
 */

import { Scroll, Text, View, WebView, signal, Clipboard } from "nsh";

import type { Nav } from "../../app/router";
import { numParam, param } from "../../app/router";
import { Badge, Btn, Card, ErrorState, Label, Muted, Panel, Screen } from "../../ui";
import { FeedbackFooter } from "../feedback/footer";
import type { ResultData } from "./data";
import { captureResult, payloadFrom } from "./data";
import { ResultView } from "./result-view";
import { Fresh, cleanReg, clampedSem, errorMessage } from "./shared";

/** The portal's Angular route; it owns the form, the semester list and the captcha. */
const PORTAL = "https://beu-bih.ac.in/result-three";

/**
 * Runs before the page's own scripts. It must stay ES5 and defensive: it runs in
 * an unknown WebView, and a throw here would break the portal itself.
 */
const CAPTURE_HOOK = `(function () {
  if (window.__beuCapture) return;
  window.__beuCapture = true;
  function post(value) {
    try {
      if (window.nsh && window.nsh.postMessage) window.nsh.postMessage(JSON.stringify(value));
    } catch (error) {}
  }
  function send(body, url) {
    post({ url: String(url || ""), body: String(body || "") });
  }
  function interesting(url) {
    return String(url || "").indexOf("result/get-result") >= 0;
  }
  // Angular asks for JSON, and a JSON XHR has no responseText. Reading it would
  // throw inside the listener and the capture would be silently lost.
  function bodyOf(request) {
    try {
      var type = request.responseType;
      if (!type || type === "text") return request.responseText;
      var value = request.response;
      return typeof value === "string" ? value : JSON.stringify(value);
    } catch (error) {
      try { return String(request.responseText || ""); } catch (inner) { return ""; }
    }
  }
  var open = XMLHttpRequest.prototype.open;
  var sendRequest = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__beuUrl = url;
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var request = this;
    request.addEventListener("load", function () {
      if (interesting(request.__beuUrl)) send(bodyOf(request), request.__beuUrl);
    });
    return sendRequest.apply(this, arguments);
  };
  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var pending = originalFetch.apply(this, arguments);
      if (interesting(url)) {
        pending.then(function (response) {
          try {
            response.clone().text().then(function (text) { send(text, url); });
          } catch (error) {}
        }).catch(function () {});
      }
      return pending;
    };
  }
  // A captcha that never renders is the one failure the student cannot see the
  // cause of: the page looks fine, the submit button does nothing. Say so.
  setTimeout(function () {
    try {
      var captcha = document.querySelector(".g-recaptcha, iframe[src*='recaptcha'], #g-recaptcha, [data-sitekey]");
      if (!captcha) post({ probe: "nocaptcha" });
    } catch (error) {}
  }, 10000);
})();`;

/**
 * The page owns its form; we only spare the student from typing their own
 * registration number on a phone keyboard. It runs after each load, waits for
 * the Angular form to render, fills only empty fields, and never touches the
 * captcha. If the page changes its markup this does nothing — it cannot break
 * the portal, because every step is guarded.
 */
function autofill(reg: string, sem: number): string {
  const safeReg = reg.replace(/[^0-9]/g, "");
  const safeSem = Math.max(1, Math.min(8, Math.floor(sem)));
  if (!safeReg) return "";
  return `(function () {
  var REG = ${JSON.stringify(safeReg)};
  var SEM = ${JSON.stringify(String(safeSem))};
  function set(el, value) {
    try {
      var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (error) {}
  }
  function labelOf(el) {
    var bits = [el.name, el.id, el.placeholder, el.getAttribute("formcontrolname"), el.getAttribute("aria-label")];
    var wrap = el.closest("label");
    if (wrap) bits.push(wrap.textContent);
    var by = el.getAttribute("aria-labelledby");
    if (by) { var node = document.getElementById(by); if (node) bits.push(node.textContent); }
    return bits.join(" ").toLowerCase();
  }
  function findInput(pattern, skip) {
    var list = document.querySelectorAll("input, textarea");
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (skip && skip(el)) continue;
      var type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox" || type === "radio" || type === "hidden" || type === "submit") continue;
      if (pattern.test(labelOf(el))) return el;
    }
    return null;
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    var regField = findInput(/redg|regist|enrol/, null);
    var semField = findInput(/sem/, null);
    if (regField && !regField.value) set(regField, REG);
    if (semField && !semField.value) set(semField, SEM);
    if ((regField && semField) || tries >= 18) clearInterval(timer);
  }, 400);
})();`;
}

/** The `reg` / `sem` the student came in with, as a usable pair. */
function target(nav: Nav): { reg: string; sem: number } {
  const reg = cleanReg(param(nav, "reg"));
  return { reg, sem: clampedSem(numParam(nav, "sem"), reg) };
}

export function PortalScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const start = target(nav);
  const captured = signal<ResultData | null>(null);
  const phase = signal<"waiting" | "saving" | "error">("waiting");
  const message = signal("");
  const hint = signal("");
  const copied = signal(false);
  /** Bumped by "Try again": the WebView remounts and loads the portal afresh. */
  const attempt = signal(0);

  const retryPortal = (): void => {
    phase.set("waiting");
    message.set("");
    attempt.update((value) => value + 1);
  };

  const accept = (raw: string): void => {
    let outer: unknown;
    try {
      outer = JSON.parse(raw);
    } catch {
      return;
    }
    if (outer && typeof outer === "object" && "probe" in (outer as Record<string, unknown>)) {
      if ((outer as { probe?: string }).probe === "nocaptcha") {
        hint.set("The captcha did not load. Check your connection, then pull down to reload the page.");
      }
      return;
    }
    let body: unknown = outer;
    if (outer && typeof outer === "object" && "body" in (outer as Record<string, unknown>)) {
      const inner = (outer as { body?: unknown }).body;
      if (typeof inner === "string") {
        try {
          body = JSON.parse(inner);
        } catch {
          return;
        }
      } else {
        body = inner;
      }
    }

    const payload = payloadFrom(body);
    if (!payload) return;

    const reg = String(payload.redg_no ?? "").replace(/[^0-9]/g, "") || start.reg;
    const semester = Number(String(payload.semester ?? "").replace(/[^0-9]/g, "")) || start.sem;
    if (!reg || semester < 1 || semester > 8) return;

    phase.set("saving");
    message.set("");
    void captureResult(reg, semester, payload)
      .then((data) => {
        captured.set(data);
        phase.set("waiting");
      })
      .catch((error: unknown) => {
        phase.set("error");
        message.set(errorMessage(error));
      });
  };

  const copyNumber = (): void => {
    if (!start.reg) return;
    void Clipboard.writeText(start.reg).then(() => {
      copied.set(true);
      setTimeout(() => copied.set(false), 1600);
    });
  };

  const onRank = (): void => {
    const data = captured();
    if (data) nav.push("results.rank", { reg: data.reg, sem: data.semester });
  };
  const onBattle = (): void => {
    const data = captured();
    if (data) nav.push("results.battle", { a: data.reg, sem: data.semester });
  };

  return (
    <Screen>
      <View class="flex-row items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Btn variant="ghost" onPress={() => nav.pop()} label="Back" icon="chevron-left">
          Back
        </Btn>
        <View class="flex-1 gap-0.5">
          <Text class="text-[14px] font-semibold text-foreground" numberOfLines={1}>
            BEU result portal
          </Text>
          <Muted class="tabular-nums" numberOfLines={1}>
            {start.reg ? `${start.reg} · semester ${start.sem}` : `Semester ${start.sem}`}
          </Muted>
        </View>
        <Badge tone={captured() ? "mint" : phase() === "error" ? "ember" : "amber"}>
          {captured() ? "Captured" : phase() === "error" ? "Problem" : "Waiting"}
        </Badge>
      </View>

      {captured() ? (
        <Scroll class="flex-1" contentClass="p-4 gap-4 pb-10">
          <Panel tone="mint" class="gap-1">
            <Label>Saved on this phone</Label>
            <Muted class="text-[12px] leading-5">
              The result below is the portal's own data, rendered natively. Rank, battle and recents can use it right
              away, online or not.
            </Muted>
          </Panel>
          <ResultView data={captured() as ResultData} onRank={onRank} onBattle={onBattle} />
          <Btn
            onPress={() => nav.replace("results", { reg: captured()?.reg ?? start.reg, sem: captured()?.semester ?? start.sem })}
          >
            Open in Results
          </Btn>
          <FeedbackFooter />
        </Scroll>
      ) : phase() === "error" ? (
        /* A portal that did not load is a *failure*, not a finished screen:
           say which side failed, offer a retry, and never imply the portal
           had nothing to show. */
        <View class="flex-1 items-center justify-center px-4">
          <ErrorState
            title="The portal did not load"
            message={`${message() || "The portal did not load."} Nothing was captured, so nothing was saved.`}
            onRetry={retryPortal}
          />
        </View>
      ) : (
        <Fresh
          when={`portal:${attempt()}`}
          build={() => (
            <WebView
              src={PORTAL}
              class="flex-1 bg-card"
              injectedJavaScriptBeforeContentLoaded={CAPTURE_HOOK}
              injectedJavaScript={autofill(start.reg, start.sem)}
              onMessage={(event) => accept(event?.data ?? "")}
              onLoad={() => {
                if (phase() === "error") return;
                message.set("");
              }}
              onError={(event) => {
                phase.set("error");
                message.set(event?.message || "The portal did not load.");
              }}
            />
          )}
        />
      )}

      {!captured() ? (
        <View class="gap-2 border-t border-border bg-card px-4 py-3">
          {phase() === "error" ? (
            <Muted class="text-[11px] leading-4">
              The portal needs a connection. Retry from the button above when you are back online — your number stays
              filled in.
            </Muted>
          ) : phase() === "saving" ? (
            <Text class="text-[12px] font-medium text-muted-foreground">Saving the captured result…</Text>
          ) : (
            <Muted class="text-[11px] leading-4">
              {start.reg
                ? `Your number and semester ${start.sem} are filled in. Solve the captcha and press submit — the moment BEU answers, this screen switches to the native result and saves it.`
                : "Type your registration number, pick a semester, solve the captcha. The moment BEU answers, this screen switches to the native result and saves it."}
            </Muted>
          )}
          {start.reg ? (
            <Btn variant="secondary" class="min-h-11" onPress={copyNumber}>
              {copied() ? "Number copied" : "Copy my registration number"}
            </Btn>
          ) : (
            <Card class="gap-1">
              <Label>No number yet</Label>
              <Muted class="text-[11px] leading-4">
                Go back and enter your registration number first, so the result can be saved against it.
              </Muted>
            </Card>
          )}
          {hint() !== "" && phase() !== "error" ? (
            <Text class="text-[12px] font-medium text-muted-foreground">{hint()}</Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
