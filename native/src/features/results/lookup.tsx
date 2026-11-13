/**
 * Results — the lookup screen.
 *
 * One registration number and one semester in; the result is rendered from
 * JSON (live BEU, this device's saved copy, or BEU's published semester
 * table) as native views. The fast path needs no captcha; when BEU's server
 * refuses it, this screen says what happened and sends the student to the
 * captcha portal, which saves its payload under the same key.
 *
 * Two states matter more than the happy path:
 *
 * - A copy already on this phone opens while BEU is down, and the screen says
 *   when that copy was saved.
 * - A refresh never blanks a result the student is reading; if it fails, the
 *   copy stays and a note explains why it did not update.
 */

import { Text, View, announce, cleanup, computed, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import { numParam, param } from "../../app/router";
import {
  Badge,
  Body,
  Btn,
  Card,
  Chip,
  Enter,
  Label,
  Muted,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Subtitle,
  Title,
} from "../../ui";
import { formatDate } from "../../lib/net";
import { EVENTS, track } from "../../lib/analytics";
import type { FailureKind } from "./components";
import { ActionTile, ResultSkeleton, SemChips, failureKind } from "./components";
import type { RecentLookup, ResultData } from "./data";
import { branchShort, forgetRecent, loadResult, parseReg, readRecent, rememberLookup, savedCopy } from "./data";
import { shortCollegeName } from "./colleges";
import { ResultView } from "./result-view";
import type { Async } from "./shared";
import {
  Fresh,
  RegField,
  clampedSem,
  cleanReg,
  errorMessage,
  idle,
  isValidReg,
  suggestedSem,
} from "./shared";

interface LookupRequest {
  reg: string;
  sem: number;
}

const FAILURE: Record<FailureKind, { badge: string; title: string; body: string }> = {
  offline: {
    badge: "Offline",
    title: "No connection",
    body: "The phone could not reach BEU. Try again when you are online.",
  },
  server: {
    badge: "Server",
    title: "BEU did not answer",
    body: "The result server refused the request. The captcha portal is the live path.",
  },
  missing: {
    badge: "No result",
    title: "Nothing for that number",
    body: "BEU has published no result for this number and semester. Check the digits.",
  },
  unknown: {
    badge: "Failed",
    title: "No result this time",
    body: "",
  },
};

/** Why the last attempt failed, and the two ways out of it. */
function FailurePanel(props: {
  kind: FailureKind;
  message: string;
  onRetry: () => void;
  onPortal: () => void;
}) {
  const copy = FAILURE[props.kind];
  const portalFirst = props.kind === "server" || props.kind === "missing";
  const tone = props.kind === "server" || props.kind === "unknown" ? "ember" : "amber";
  return (
    <Panel tone={tone} class="gap-3">
      <Row class="gap-2">
        <Badge tone={tone}>{copy.badge}</Badge>
        <Text class="flex-1 text-[15px] font-semibold leading-5 text-foreground">{copy.title}</Text>
      </Row>
      <Subtitle class="text-[12px] leading-5">{copy.body || props.message}</Subtitle>
      <Btn variant={portalFirst ? "primary" : "secondary"} class="min-h-11" onPress={props.onPortal}>
        Solve captcha on BEU
      </Btn>
      <Btn variant={portalFirst ? "secondary" : "primary"} class="min-h-11" onPress={props.onRetry}>
        Try again
      </Btn>
    </Panel>
  );
}

/** The result whose entrance has played; a refresh of the same one updates in place. */
let enteredResult = "";

export function ResultsScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const routeReg = cleanReg(param(nav, "reg"));
  const routeSem = numParam(nav, "sem");

  const reg = signal(routeReg);
  const sem = signal(clampedSem(routeSem, routeReg));
  const semChosen = signal(routeSem >= 1 && routeSem <= 8);
  const state = signal<Async<ResultData>>(idle<ResultData>());
  const request = signal<LookupRequest | null>(
    isValidReg(routeReg) ? { reg: routeReg, sem: clampedSem(routeSem, routeReg) } : null,
  );
  const recents = signal<RecentLookup[]>([]);
  const savedAt = signal<number | null>(null);
  const formError = signal("");
  const failure = signal<FailureKind | null>(null);
  const failureText = signal("");
  const attempt = signal(0);

  const info = computed(() => (isValidReg(reg()) ? parseReg(reg()) : null));

  /* The copy already on screen for the current reg + semester, so a refresh
     keeps it visible instead of falling back to a skeleton. */
  let lastKey = "";
  let lastData: ResultData | null = null;

  const start = (regValue: string, semValue: number) => {
    const value = cleanReg(regValue);
    if (!isValidReg(value)) {
      formError.set("Enter at least 8 digits of your registration number.");
      return;
    }
    formError.set("");
    reg.set(value);
    sem.set(semValue);
    request.set({ reg: value, sem: semValue });
  };

  const onReg = (next: string) => {
    reg.set(next);
    formError.set("");
    if (!semChosen() && isValidReg(next)) sem.set(suggestedSem(next));
  };

  const onSem = (next: number) => {
    semChosen.set(true);
    sem.set(next);
    if (request() !== null) start(reg(), next);
  };

  /* The one read: every submit, retry, recent tap and pull-to-refresh. */
  effect(() => {
    const req = request();
    if (!req) return;
    const key = `${req.reg}:${req.sem}`;
    const keep = key === lastKey ? lastData : null;
    lastKey = key;
    lastData = keep;
    void attempt(); // read: retry and pull-to-refresh fetch again

    let alive = true;
    cleanup(() => {
      alive = false;
    });

    failure.set(null);
    failureText.set("");
    state.set({ status: "loading", data: keep, error: "" });
    // Semester only: the registration number is a student's identity and never
    // goes into a payload.
    track(EVENTS.resultLookup, { sem: req.sem });

    void loadResult(req.reg, req.sem).then(
      async (data) => {
        if (!alive) return;
        lastData = data;
        state.set({ status: "ready", data, error: "" });
        // The screen swaps a skeleton for a result in place; a screen reader
        // hears nothing unless the change is announced.
        announce(
          data.sgpa === null
            ? "Result loaded."
            : `Result loaded. SGPA ${data.sgpa}${data.status ? `, ${data.status.toLowerCase()}` : ""}.`,
        );
        track(EVENTS.resultOutcome, { outcome: "ok", sem: req.sem });
        await rememberLookup({ reg: data.reg || req.reg, sem: req.sem, name: data.name, at: Date.now() });
        const rows = await readRecent();
        if (alive) recents.set(rows);
      },
      (error) => {
        if (!alive) return;
        track(EVENTS.resultOutcome, { outcome: "error", sem: req.sem, reason: failureKind(error) });
        failure.set(failureKind(error));
        failureText.set(errorMessage(error));
        state.set(
          keep
            ? { status: "ready", data: keep, error: "" }
            : { status: "error", data: null, error: errorMessage(error) },
        );
      },
    );
  });

  /* Recent lookups once, and again after every successful read above. */
  effect(() => {
    void readRecent().then((rows) => recents.set(rows));
  });

  /* Is this reg + semester already saved on the phone? */
  effect(() => {
    const value = reg();
    const target = sem();
    if (!isValidReg(value)) {
      savedAt.set(null);
      return;
    }
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    void savedCopy(value, target).then((at) => {
      if (alive) savedAt.set(at);
    });
  });

  const retry = () => start(reg(), sem());
  const portal = () => nav.push("results.portal", { reg: reg(), sem: sem() });
  const clearRecents = () => {
    void forgetRecent();
    recents.set([]);
  };
  const refresh = () => {
    if (request()) attempt.update((value) => value + 1);
  };

  const data = () => state().data;

  return (
    <Screen>
      <Body
        refreshing={state().status === "loading" && data() !== null}
        onRefresh={refresh}
      >
        <View class="gap-1">
          <Label>BEU · Results</Label>
          <Title>Every mark, in one place.</Title>
          <Subtitle>Papers, credits and SGPA, drawn natively.</Subtitle>
        </View>

        <Card class="gap-4">
          <RegField value={reg()} onChange={onReg} onSubmit={retry} autoFocus={routeReg === ""} />

          <If when={info()}>
            <Fresh
              when={`preview:${info()?.batch}-${info()?.branch}-${info()?.college}`}
              build={() => (
                <Row class="flex-wrap gap-2">
                  <Chip>{`Batch 20${info()?.batch ?? ""}`}</Chip>
                  <Chip tone="mint">{branchShort(info()?.branch ?? "")}</Chip>
                  <Chip>{shortCollegeName(info()?.college ?? "")}</Chip>
                  {info()?.lateral ? <Chip tone="amber">Lateral entry</Chip> : null}
                </Row>
              )}
            />
          </If>

          <Fresh when={`sem:${sem()}`} build={() => <SemChips value={sem()} onChange={onSem} />} />

          {formError() ? <Text class="text-[12px] font-medium text-destructive">{formError()}</Text> : null}

          <Fresh
            when={`go:${state().status}:${sem()}`}
            build={() => (
              <Btn class="min-h-12" disabled={state().status === "loading"} onPress={retry} label="Check result">
                {state().status === "loading" ? "Contacting BEU…" : `Check semester ${sem()} result`}
              </Btn>
            )}
          />

          <Muted class="text-[11px] leading-4">A saved copy opens even when BEU is down.</Muted>
        </Card>

        {savedAt() !== null && data() === null ? (
          <Panel tone="amber" class="gap-1">
            <Row class="gap-2">
              <Badge tone="amber">Saved copy</Badge>
              <Muted>{formatDate(savedAt() ?? 0)}</Muted>
            </Row>
            <Subtitle class="text-[12px] leading-5">
              This semester is already on this phone. It opens if BEU cannot be reached.
            </Subtitle>
          </Panel>
        ) : null}

        <If when={recents().length > 0 && data() === null}>
          <View class="gap-2">
            <SectionHeader title="Recent lookups" action="Clear" onAction={clearRecents} />
            <Fresh
              when={`recents:${recents()
                .map((row) => `${row.reg}:${row.sem}`)
                .join(",")}`}
              build={() => (
                <Row class="flex-wrap gap-2">
                  {recents()
                    .slice(0, 6)
                    .map((row) => (
                      <Chip onPress={() => start(row.reg, row.sem)}>
                        {`Sem ${row.sem} · ${row.name || row.reg}`}
                      </Chip>
                    ))}
                </Row>
              )}
            />
          </View>
        </If>

        <If when={state().status === "loading" && data() === null}>
          <ResultSkeleton label="Contacting BEU. This can take a minute." />
        </If>

        <If when={state().status === "error"}>
          <Fresh
            when={`failed:${failure()}:${failureText()}`}
            build={() => (
              <FailurePanel
                kind={failure() ?? "unknown"}
                message={failureText()}
                onRetry={retry}
                onPortal={portal}
              />
            )}
          />
        </If>

        <Fresh
          when={`stale:${failureText()}:${data() ? "yes" : "no"}`}
          build={() =>
            data() && failureText() ? (
              <Panel tone="amber" class="gap-1">
                <Row class="gap-2">
                  <Badge tone="amber">Not refreshed</Badge>
                  <Muted>{formatDate(data()?.savedAt ?? 0)}</Muted>
                </Row>
                <Subtitle class="text-[12px] leading-5">
                  BEU did not answer just now, so this is the copy saved earlier.
                </Subtitle>
              </Panel>
            ) : (
              <View />
            )
          }
        />

        <If when={data()}>
          {() => (
            <Fresh
              when={`view:${data()?.reg}:${data()?.semester}:${data()?.source}:${data()?.savedAt}`}
              build={() => {
                const result = data();
                if (!result) return <View />;
                // The card arrives when a different result replaces the skeleton. A
                // refresh of the same one updates in place: re-entering content the
                // student pulled down for is motion, not information.
                const id = `${result.reg}:${result.semester}`;
                const first = id !== enteredResult;
                enteredResult = id;
                const body = (
                  <ResultView
                    data={result}
                    onRank={() => nav.push("results.rank", { reg: result.reg, sem: result.semester })}
                    onBattle={() => nav.push("results.battle", { a: result.reg, sem: result.semester })}
                  />
                );
                return first ? <Enter>{body}</Enter> : body;
              }}
            />
          )}
        </If>

        <View class="gap-3">
          <SectionHeader title="More result tools" />
          <Row class="gap-3">
            <ActionTile
              icon="table"
              title="Result table"
              hint="Every student, ranked"
              onPress={() => nav.push("results.table")}
            />
            <ActionTile
              icon="hash"
              title="Rank"
              hint="Where you stand"
              tone="mint"
              onPress={() => nav.push("results.rank", { reg: reg(), sem: sem() })}
            />
          </Row>
          <Row class="gap-3">
            <ActionTile
              icon="trophy"
              title="Merit list"
              hint="Toppers this semester"
              tone="amber"
              onPress={() => nav.push("results.merit")}
            />
            <ActionTile
              icon="git-compare"
              title="Battle"
              hint="Two results, head to head"
              onPress={() => nav.push("results.battle", { a: reg(), sem: sem() })}
            />
          </Row>
        </View>
      </Body>
    </Screen>
  );
}
