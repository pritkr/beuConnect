/**
 * Results — the simulator route.
 *
 * It opens on the result the student just looked at (the route's `reg`/`sem`,
 * else the newest recent lookup), seeds one ESE field per paper from BEU's
 * published marks, and then never fetches again: moving a mark is local maths.
 *
 * Loading, failure and "nothing to simulate" are three different screens, and
 * each says what actually happened. A failure is a failure — it is never
 * dressed up as a result with no papers.
 */

import { Text, View, batch, cleanup, computed, effect, signal } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { numParam, param } from "../../app/router";
import { Body, Btn, EmptyState, ErrorState, Label, Panel, Row, Screen } from "../../ui";
import type { ResultData, ResultSubject } from "../results/data";
import { loadResult, readRecent } from "../results/data";
import type { Async } from "../results/shared";
import { clampedSem, cleanReg, idle, isValidReg, readableError } from "../results/shared";
import { clamp } from "../tools/engine";
import type { MarksDraft, Simulation, TargetPlan } from "./model";
import {
  applyMarks,
  cleanMark,
  draftFrom,
  isCounted,
  isEditable,
  marksNeeded,
  paperMaxEse,
  readMark,
  simulate,
} from "./model";
import {
  PaperRow,
  PaperTable,
  SimHeader,
  SimulatorSkeleton,
  TargetCard,
  blockedCopy,
  papersLine,
  skippedLine,
} from "./parts";

const LOAD_FALLBACK = "This result could not be opened. Check your connection and try again.";

/**
 * The next tenth above the real SGPA, kept inside the stepper's 5.0–10.0.
 * `Math.ceil` first so 8.26 opens on 8.3, not 8.2; an exact tenth moves up one.
 */
function defaultTarget(real: number | null): number {
  if (real === null || !Number.isFinite(real)) return 80;
  const step = Math.ceil(real * 10 - 1e-9);
  const above = step / 10 > real + 1e-9 ? step : step + 1;
  return clamp(above, 50, 100);
}

function identityLine(data: ResultData | null): string {
  if (data === null) return "";
  const who = data.name.trim() || data.reg;
  return `${who} · semester ${data.semester}`;
}

function SimulateScreen(props: { nav: Nav }) {
  const nav = props.nav;

  const state = signal<Async<ResultData>>(idle<ResultData>());
  const attempt = signal(0);
  const seed = signal<string[]>([]);
  const marks = signal<string[]>([]);
  const target = signal(80);

  const subjects = computed((): ResultSubject[] => state().data?.subjects ?? []);
  const counted = computed((): ResultSubject[] => subjects().filter((subject) => isCounted(subject)));
  const draft = computed((): MarksDraft => draftFrom(subjects(), marks()));
  const applied = computed((): ResultSubject[] => applyMarks(subjects(), draft()));
  const sim = computed((): Simulation => simulate(subjects(), draft()));
  const plan = computed((): TargetPlan => marksNeeded(subjects(), draft(), target() / 10));
  const rows = computed(() =>
    subjects()
      .map((subject, index) => ({ subject, index }))
      .filter((row) => isCounted(row.subject)),
  );

  /*
   * The one async read. A retry bumps `attempt`, which re-runs this effect and
   * starts a fresh load; a stale load is dropped by `alive`.
   */
  effect(() => {
    attempt();
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    state.set({ status: "loading", data: null, error: "" });

    void (async () => {
      try {
        const routeReg = cleanReg(param(nav, "reg"));
        let reg = "";
        let sem = 1;

        if (isValidReg(routeReg)) {
          reg = routeReg;
          sem = clampedSem(numParam(nav, "sem"), routeReg);
        } else {
          const recents = await readRecent();
          const last = recents[0];
          if (last) {
            reg = last.reg;
            sem = last.sem;
          }
        }
        if (!alive) return;
        if (!reg) {
          state.set({ status: "empty", data: null, error: "" });
          return;
        }

        const data = await loadResult(reg, sem);
        if (!alive) return;

        const texts = data.subjects.map((subject) =>
          isEditable(subject) ? String(Math.round(Number(subject.ese))) : "",
        );
        batch(() => {
          seed.set(texts);
          marks.set(texts.slice());
          target.set(defaultTarget(simulate(data.subjects, []).real));
          state.set({ status: data.subjects.length === 0 ? "empty" : "ready", data, error: "" });
        });
      } catch (error) {
        if (!alive) return;
        state.set({ status: "error", data: null, error: readableError(error, LOAD_FALLBACK) });
      }
    })();
  });

  const setMark = (index: number, text: string) => {
    const subject = subjects()[index];
    if (!subject) return;
    const max = paperMaxEse(subject);
    const cleaned = cleanMark(text);
    marks.update((current) => {
      const next = current.slice();
      next[index] = cleaned === "" ? "" : String(readMark(cleaned, max));
      return next;
    });
  };

  /* Leaving the field always lands on a real mark, never on a blank. */
  const settle = (index: number) => {
    const subject = subjects()[index];
    if (!subject) return;
    const max = paperMaxEse(subject);
    marks.update((current) => {
      const next = current.slice();
      next[index] = String(readMark(next[index] ?? "", max));
      return next;
    });
  };

  const reset = () => {
    marks.set(seed().slice());
  };

  const step = (tenths: number) => {
    target.update((value) => clamp(value + tenths, 50, 100));
  };

  const openResults = () => nav.push("results");

  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        <If when={state().status === "idle" || state().status === "loading"}>
          <SimulatorSkeleton />
        </If>

        <If when={state().status === "error"}>
          {() => (
            <View class="gap-3">
              <ErrorState
                title="Could not open this result"
                message={state().error}
                onRetry={() => attempt.update((value) => value + 1)}
              />
              <Btn variant="secondary" onPress={openResults}>
                Open Results
              </Btn>
            </View>
          )}
        </If>

        <If when={state().status === "empty"}>
          {() => (
            <EmptyState
              title={state().data === null ? "Open a result first" : "No papers in this result"}
              hint={
                state().data === null
                  ? "The simulator reads a result already on this phone."
                  : "BEU has not published papers for this semester yet."
              }
              action="Open Results"
              onAction={openResults}
            />
          )}
        </If>

        <If when={state().status === "ready"}>
          <Text class="text-[13px] leading-5 text-muted-foreground" numberOfLines={1}>
            {identityLine(state().data)}
          </Text>

          <SimHeader sim={sim} onReset={reset} />

          <If when={sim().credits > 0}>
            <TargetCard plan={plan} onStep={step} />

            <Row class="items-end justify-between gap-3">
              <Row class="gap-2">
                <View class="h-2 w-2 rounded-full bg-primary" />
                <Label role="header">Papers</Label>
              </Row>
              <Text class="text-[11px] leading-4 tabular-nums text-muted-foreground">{papersLine(counted())}</Text>
            </Row>

            <PaperTable>
              <Each of={rows()} key={(row) => row.index}>
                {(row, position) => (
                  <PaperRow
                    subject={row().subject}
                    max={paperMaxEse(row().subject)}
                    first={position() === 0}
                    mark={() => marks()[row().index] ?? ""}
                    applied={() => applied()[row().index] ?? row().subject}
                    onMark={(text) => setMark(row().index, text)}
                    onBlur={() => settle(row().index)}
                  />
                )}
              </Each>
            </PaperTable>

            <If when={rows().length < subjects().length}>
              <Text class="px-1 text-[11px] leading-4 text-muted-foreground">
                {skippedLine(subjects().length, rows().length)}
              </Text>
            </If>
          </If>

          <If when={sim().credits === 0}>
            <Panel tone="plain" class="gap-1">
              <Text class="text-[14px] font-semibold leading-5 text-foreground">{blockedCopy(subjects()).title}</Text>
              <Text class="text-[12px] leading-5 text-muted-foreground">{blockedCopy(subjects()).hint}</Text>
            </Panel>
          </If>
        </If>
      </Body>
    </Screen>
  );
}

export const simulateRoutes: RouteDef[] = [
  {
    name: "results.simulate",
    title: (params) => {
      const sem = String(params.sem ?? "").trim();
      return sem ? `Simulate · Sem ${sem}` : "Result simulator";
    },
    render: (nav) => <SimulateScreen nav={nav} />,
  },
];

