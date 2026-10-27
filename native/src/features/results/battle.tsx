/**
 * Results — battle.
 *
 * Two registration numbers, one semester, the same paper list on both sides.
 * `loadBattle` fetches both results (live, saved copy or the published table)
 * and marks who won each paper; the screen turns that into a verdict, a meter,
 * a paper-by-paper table and a text summary a student can paste in a group chat.
 *
 * Offline is the normal case for BEU, so the failure path is designed: if one
 * side has no copy on this phone, the screen says exactly which side, offers its
 * captcha portal and keeps the other side one tap away — it never pretends the
 * battle happened.
 */

import { Text, View, cleanup, effect, signal, announce } from "nsh";

import type { Nav } from "../../app/router";
import { numParam, param } from "../../app/router";
import {
  Badge,
  Body,
  Btn,
  Card,
  Divider,
  ErrorState,
  Label,
  Muted,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Subtitle,
  Title,
} from "../../ui";
import type { FailureKind } from "./components";
import { BattleMeter, ResultSkeleton, SemChips, VersusRow, failureKind } from "./components";
import type { BattleLine, BattleReport, ResultData } from "./data";
import { fixed, loadBattle, savedCopy } from "./data";
import { shortCollegeName } from "./colleges";
import type { Async } from "./shared";
import { CopyButton, Fresh, RegField, clampedSem, cleanReg, errorMessage, idle, isValidReg } from "./shared";
import type { BattleVerdict } from "./verdict";
import { battleVerdict } from "./verdict";

interface BattleValue {
  report: BattleReport | null;
  /** The side with no result on this phone, when the battle could not run. */
  missing: { side: "a" | "b"; reg: string; otherReg: string; otherSavedAt: number | null } | null;
  kind: FailureKind;
}

/** Higher, lower, or level — for the two headline numbers. */
function compare(left: number | null, right: number | null): BattleLine["outcome"] {
  if (left === null || right === null) return "none";
  if (left === right) return "tie";
  return left > right ? "a" : "b";
}

/** A paper counts only when both copies carry a total for it. */
function paperOutcome(line: BattleLine): BattleLine["outcome"] {
  if (line.aValue === null || line.bValue === null) return "none";
  return line.outcome;
}

/** `"+10"`, `"B +7"` or `"Tie"` — always with its side, never colour alone. */
function deltaLabel(line: BattleLine): string {
  if (line.aValue === null || line.bValue === null) return "";
  const diff = Math.round((line.aValue - line.bValue) * 10) / 10;
  if (diff === 0) return "Tie";
  return diff > 0 ? `A +${diff}` : `B +${Math.abs(diff)}`;
}

/** The one line the error state shows: what failed, in a student's words. */
function failureMessage(kind: FailureKind): string {
  if (kind === "offline") return "This phone could not reach BEU, and neither number has a saved copy here.";
  if (kind === "server") return "BEU's result server did not answer, so neither result could be loaded.";
  if (kind === "missing") return "BEU has no result for one of these numbers.";
  return "One of these results could not be read.";
}

/**
 * The clipboard summary, counted by the strict rule: a paper only counts when
 * both copies carry a total, and the verdict line never names a winner the
 * data does not support (`verdict.ts` owns that rule; this mirrors it).
 */
function strictSummary(report: BattleReport, strict: BattleVerdict): string {
  const a = report.a.data;
  const b = report.b.data;
  const rows = report.lines.slice(0, 12).map((line) => {
    const outcome = paperOutcome(line);
    const mark = outcome === "a" ? "→" : outcome === "b" ? "←" : outcome === "tie" ? "=" : "·";
    return `${mark} ${line.label}: ${line.a} vs ${line.b}`;
  });
  return [
    `BEUConnect result battle · Semester ${a.semester}`,
    `${a.name || "Student A"} (${a.reg}) ${fixed(a.sgpa)} / ${fixed(a.cgpa)}`,
    `${b.name || "Student B"} (${b.reg}) ${fixed(b.sgpa)} / ${fixed(b.cgpa)}`,
    `Papers ${strict.winsA}–${strict.winsB} (${strict.ties} tied${
      strict.uncounted > 0 ? `, ${strict.uncounted} not counted` : ""
    })`,
    strict.headline,
    ...rows,
    "beu.prit.eu.org",
  ].join("\n");
}

async function runBattle(a: string, b: string, sem: number): Promise<BattleValue> {
  try {
    return { report: await loadBattle(a, b, sem), missing: null, kind: "unknown" };
  } catch (error) {
    /*
     * `loadBattle` rejects as a whole when either side fails. The saved copies
     * tell us which side that was without a second network attempt: a side with
     * a copy would have resolved from that copy.
     */
    const [aSavedAt, bSavedAt] = await Promise.all([savedCopy(a, sem), savedCopy(b, sem)]);
    const missing =
      aSavedAt === null && bSavedAt !== null
        ? { side: "a" as const, reg: a, otherReg: b, otherSavedAt: bSavedAt }
        : bSavedAt === null && aSavedAt !== null
          ? { side: "b" as const, reg: b, otherReg: a, otherSavedAt: aSavedAt }
          : null;
    return { report: null, missing, kind: failureKind(error) };
  }
}

export function BattleScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const routeA = cleanReg(param(nav, "a"));
  const routeSem = numParam(nav, "sem");

  const a = signal(routeA);
  const b = signal(cleanReg(param(nav, "b")));
  const sem = signal(clampedSem(routeSem, routeA));
  const deepLink =
    isValidReg(routeA) && isValidReg(b()) && routeA !== b() ? { a: routeA, b: b(), sem: sem() } : null;
  const editing = signal(deepLink === null);
  const formError = signal("");
  const attempt = signal(0);
  const state = signal<Async<BattleValue>>(idle<BattleValue>());
  const request = signal<{ a: string; b: string; sem: number } | null>(deepLink);

  const start = (aValue: string, bValue: string, semValue: number) => {
    const left = cleanReg(aValue);
    const right = cleanReg(bValue);
    if (!isValidReg(left) || !isValidReg(right)) {
      formError.set("Both students need at least 8 digits of a registration number.");
      return;
    }
    if (left === right) {
      formError.set("A battle needs two different students.");
      return;
    }
    formError.set("");
    a.set(left);
    b.set(right);
    sem.set(semValue);
    editing.set(false);
    request.set({ a: left, b: right, sem: semValue });
  };

  effect(() => {
    const req = request();
    void attempt(); // retry reads this
    if (!req) return;

    let alive = true;
    cleanup(() => {
      alive = false;
    });

    state.set({ status: "loading", data: null, error: "" });
    void runBattle(req.a, req.b, req.sem).then(
      (value) => {
        if (!alive) return;
        if (value.report) {
          state.set({ status: "ready", data: value, error: "" });
          /* The strict verdict speaks: a paper only counts when both copies
             carry a total, and nothing announces a winner the data cannot
             support. */
          announce(battleVerdict(value.report).headline);
        } else {
          state.set({ status: "error", data: value, error: failureMessage(value.kind) });
        }
      },
      (error: unknown) => {
        if (alive) state.set({ status: "error", data: null, error: errorMessage(error) });
      },
    );
  });

  const retry = () => {
    const req = request();
    if (req) request.set({ ...req });
    else attempt.update((value) => value + 1);
  };

  const swap = () => {
    const left = b();
    const right = a();
    a.set(left);
    b.set(right);
    if (request() !== null) start(left, right, sem());
  };

  const limit = state().data?.missing ?? null;

  return (
    <Screen>
      <Body>
        <View class="gap-1 pt-1">
          <Label>BEU · Result battle</Label>
          <Title>Two results. One winner.</Title>
        </View>

        <If when={editing() || state().data?.report == null}>
          <Card class="gap-4">
            <RegField
              label="Student A"
              value={a()}
              onChange={(next) => {
                a.set(next);
                formError.set("");
              }}
              onSubmit={() => start(a(), b(), sem())}
              autoFocus={routeA === ""}
            />

            <RegField
              label="Student B"
              value={b()}
              onChange={(next) => {
                b.set(next);
                formError.set("");
              }}
              onSubmit={() => start(a(), b(), sem())}
              hint="A friend's registration number."
              placeholder="23105157102"
            />

            <Fresh when={`sem:${sem()}`} build={() => <SemChips value={sem()} onChange={sem.set} />} />

            {formError() ? <Text class="text-[12px] font-medium text-destructive">{formError()}</Text> : null}

            <Fresh
              when={`go:${state().status}:${b()}:${sem()}`}
              build={() => (
                <Btn
                  class="min-h-12"
                  disabled={state().status === "loading"}
                  onPress={() => start(a(), b(), sem())}
                  label="Start battle"
                >
                  {state().status === "loading" ? "Loading both results…" : "Start the battle"}
                </Btn>
              )}
            />

            <Row class="justify-between gap-3">
              <Muted class="flex-1 text-[11px] leading-4">
                Each side loads from BEU, then this phone's saved copy, then the published table.
              </Muted>
              <Btn variant="ghost" onPress={swap} label="Swap A and B">
                Swap
              </Btn>
            </Row>
          </Card>
        </If>

        <If when={state().status === "loading"}>
          <ResultSkeleton label="Loading both results. BEU can take up to a minute." />
        </If>

        <If when={state().status === "error"}>
          <ErrorState title="Battle called off" message={state().error} onRetry={retry} />

          {limit ? (
            <Card class="gap-2">
              <RangeNote missing={limit} kind={state().data?.kind ?? "unknown"} />
              <Btn
                variant={state().data?.kind === "server" ? "primary" : "secondary"}
                class="min-h-11"
                onPress={() => nav.push("results.portal", { reg: limit.reg, sem: sem() })}
              >
                {`Open BEU portal for ${limit.side === "a" ? "A" : "B"}`}
              </Btn>
              {limit.otherSavedAt !== null ? (
                <Btn
                  variant="secondary"
                  class="min-h-11"
                  onPress={() => nav.push("results", { reg: limit.otherReg, sem: sem() })}
                >
                  {`Open ${limit.side === "a" ? "B" : "A"}'s saved result`}
                </Btn>
              ) : null}
              <Btn variant="ghost" onPress={() => editing.set(true)}>
                Change the numbers
              </Btn>
            </Card>
          ) : (
            <Card class="gap-2">
              <Muted class="text-[12px] leading-5">
                {state().data?.kind === "offline"
                  ? "This phone could not reach BEU, and neither number has a saved copy here. The captcha portal is the live path once you are online."
                  : "BEU did not answer for one of these numbers. The captcha portal is the live path."}
              </Muted>
              <Btn
                variant={state().data?.kind === "offline" ? "secondary" : "primary"}
                class="min-h-11"
                onPress={() => nav.push("results.portal", { reg: b(), sem: sem() })}
              >
                Try the BEU portal
              </Btn>
              <Btn variant="ghost" onPress={() => editing.set(true)}>
                Change the numbers
              </Btn>
            </Card>
          )}
        </If>

        <If when={state().data?.report}>
          {(value) => {
            const report = value();
            const left = report.a.data;
            const right = report.b.data;
            const strict = battleVerdict(report);
            const summary = strictSummary(report, strict);
            const leftName = left.name || "Student A";
            const rightName = right.name || "Student B";

            return (
              <View class="gap-4">
                <Panel
                  tone={strict.outcome === "b" ? "mint" : strict.outcome === "a" ? "ember" : "plain"}
                  class="gap-2"
                >
                  <Row class="flex-wrap items-center justify-between gap-2">
                    <Label>Verdict</Label>
                    <Badge tone={strict.outcome === "a" ? "ember" : strict.outcome === "b" ? "mint" : "neutral"}>
                      {strict.label}
                    </Badge>
                  </Row>
                  <Text class="text-[19px] font-bold leading-6 text-foreground">{strict.headline}</Text>
                  <Muted>{strict.explanation}</Muted>
                </Panel>

                <Card class="gap-3">
                  <BattleMeter
                    winsA={strict.winsA}
                    winsB={strict.winsB}
                    ties={strict.ties}
                    nameA={leftName}
                    nameB={rightName}
                  />
                  <Divider />
                  <Muted class="text-[11px] leading-4">
                    A paper only counts when both students have a total for it.
                  </Muted>
                </Card>

                <Row class="gap-3">
                  <SideCard
                    side="a"
                    data={left}
                    sem={sem()}
                    onPress={() => nav.push("results", { reg: left.reg, sem: sem() })}
                  />
                  <SideCard
                    side="b"
                    data={right}
                    sem={sem()}
                    onPress={() => nav.push("results", { reg: right.reg, sem: sem() })}
                  />
                </Row>

                <Card class="gap-0 p-0">
                  <View class="px-4 pt-3">
                    <SectionHeader title="Tale of the tape" />
                  </View>
                  <Divider class="mt-2" />
                  <VersusRow
                    label="SGPA"
                    a={fixed(left.sgpa)}
                    b={fixed(right.sgpa)}
                    outcome={compare(left.sgpa, right.sgpa)}
                  />
                  <Divider class="ml-4" />
                  <VersusRow
                    label="CGPA"
                    a={fixed(left.cgpa)}
                    b={fixed(right.cgpa)}
                    outcome={compare(left.cgpa, right.cgpa)}
                  />
                  <Divider class="ml-4" />
                  <VersusRow
                    label="Credits"
                    a={left.credits === null ? "—" : String(left.credits)}
                    b={right.credits === null ? "—" : String(right.credits)}
                    outcome={compare(left.credits, right.credits)}
                  />
                  <Divider class="ml-4" />
                  <VersusRow
                    label="Papers won"
                    a={String(strict.winsA)}
                    b={String(strict.winsB)}
                    outcome={compare(strict.winsA, strict.winsB)}
                  />
                </Card>

                <View class="gap-2">
                  <SectionHeader title="Paper by paper" />
                  <Card class="gap-0 p-0">
                    <Row class="items-center gap-2 px-4 py-2">
                      <Text class="w-16 text-[11px] font-semibold text-foreground" numberOfLines={1}>
                        {`A · ${left.name || "A"}`}
                      </Text>
                      <Text class="flex-1 text-center text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Paper
                      </Text>
                      <Text class="w-16 text-right text-[11px] font-semibold text-foreground" numberOfLines={1}>
                        {`${right.name || "B"} · B`}
                      </Text>
                    </Row>
                    <Divider />
                    {report.lines.length ? (
                      report.lines.map((line, index) => (
                        <View>
                          <VersusRow
                            label={line.label}
                            hint={line.code}
                            a={line.a}
                            b={line.b}
                            outcome={paperOutcome(line)}
                            delta={deltaLabel(line)}
                          />
                          {index < report.lines.length - 1 ? <Divider class="ml-4" /> : null}
                        </View>
                      ))
                    ) : (
                      <View class="px-4 py-4">
                        <Muted class="text-[12px] leading-5">
                          Neither copy carries paper totals. SGPA, CGPA and credits still decide the battle.
                        </Muted>
                      </View>
                    )}
                  </Card>
                </View>

                <Panel tone="plain" class="gap-1">
                  <Label>Scoreboard</Label>
                  <Subtitle class="text-[12px] leading-5">
                    A paper only counts when both totals exist. A shared total is a tie. Level paper wins fall to
                    CGPA, then SGPA.
                  </Subtitle>
                </Panel>

                <View class="gap-2">
                  <CopyButton text={summary} label="Copy battle summary" />
                  <Row class="gap-3">
                    <Btn variant="secondary" class="flex-1" onPress={swap}>
                      Swap sides
                    </Btn>
                    <Btn variant="ghost" class="flex-1" onPress={() => editing.set(true)}>
                      New battle
                    </Btn>
                  </Row>
                </View>
              </View>
            );
          }}
        </If>

        <If when={state().status === "idle"}>
          <Panel tone="plain" class="gap-1">
            <Label>Before you start</Label>
            <Subtitle class="text-[12px] leading-5">
              Both students must have the same semester result. A copy already on this phone opens instantly.
            </Subtitle>
          </Panel>
        </If>
      </Body>
    </Screen>
  );
}

/** One side of the battle: who they are, and their two headline numbers. */
function SideCard(props: { side: "a" | "b"; data: ResultData; sem: number; onPress: () => void }) {
  const data = props.data;
  const tint =
    props.side === "a" ? "border-primary/25 bg-primary/8 active:bg-primary/12" : "border-accent/25 bg-accent/8 active:bg-accent/12";
  const dot = props.side === "a" ? "bg-primary" : "bg-accent";
  return (
    <View
      class={`flex-1 gap-1 rounded-3xl border p-3 ${tint}`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`Open ${data.name || "student"} semester ${props.sem} result`}
    >
      <Row class="gap-1.5">
        <View class={`h-2 w-2 rounded-full ${dot}`} />
        <Label>{props.side === "a" ? "Student A" : "Student B"}</Label>
      </Row>
      <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
        {data.name || data.reg}
      </Text>
      <Muted class="tabular-nums" numberOfLines={1}>
        {data.reg}
      </Muted>
      <Muted class="text-[11px] leading-4">{`SGPA ${fixed(data.sgpa)} · CGPA ${fixed(data.cgpa)}`}</Muted>
      <Muted class="text-[10px] leading-4" numberOfLines={1}>
        {shortCollegeName(data.collegeCode)}
      </Muted>
    </View>
  );
}

/** The exact missing-side sentence, with the reason kept plain. */
function RangeNote(props: { missing: NonNullable<BattleValue["missing"]>; kind: FailureKind }) {
  const side = props.missing.side === "a" ? "A" : "B";
  const reason =
    props.kind === "offline"
      ? "This phone is offline."
      : props.kind === "server"
        ? "BEU's result server did not answer."
        : props.kind === "missing"
          ? "BEU has no result for it."
          : "BEU could not be reached.";
  return (
    <View class="gap-1">
      <Text class="text-[15px] font-semibold text-foreground">{`Student ${side} is missing`}</Text>
      <Muted class="text-[12px] leading-5">
        {`${props.missing.reg} has no saved copy on this phone. ${reason}`}
      </Muted>
    </View>
  );
}
