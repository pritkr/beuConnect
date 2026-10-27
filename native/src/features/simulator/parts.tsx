/**
 * Results — the simulator's visible pieces.
 *
 * The framework runs a component body once, so every prop here that can change
 * is a getter called *inside* JSX (where the binding re-reads the signal), and
 * nothing that changes is destructured on the way in. The row's grade chip and
 * points, the header's SGPA and delta, and the target card's plan all live that
 * way; only the paper's name, credit and maximum are read once, because the
 * result they come from never changes on this screen.
 *
 * Sizes follow Ink & Ember: 16 pt gutters, 44 pt targets, 68–72 pt rows at
 * 320 pt, tabular numerals everywhere a number can move.
 */

import { Text, View, type JSX } from "nsh";
import { Input } from "nsh/base";
import { Btn, Card, Col, Divider, Label, Row, Skeleton } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import type { ResultSubject } from "../results/data";
import { fixed, num, roundHalfUp } from "../tools/engine";
import type { NeededPaper, Simulation, TargetPlan } from "./model";
import { creditOf, pointsFor } from "./model";

/* -------------------------------------------------------------------- state */

/** `+0.2`, `−0.2`, `±0.0`, or `—` when the SGPA itself is unknown. */
export function deltaText(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "—";
  const value = roundHalfUp(delta, 1);
  if (value > 0) return `+${value.toFixed(1)}`;
  if (value < 0) return `−${Math.abs(value).toFixed(1)}`;
  return "±0.0";
}

/** Up is ember, down and level are muted: the sign says it, colour agrees. */
function deltaTone(delta: number | null): string {
  if (delta === null) return "text-muted-foreground";
  return roundHalfUp(delta, 1) > 0 ? "text-primary-ink" : "text-muted-foreground";
}

function gradeTone(grade: string): "mint" | "plain" | "amber" | "ember" {
  const value = grade.toUpperCase();
  if (value === "F" || value === "FAIL") return "ember";
  if (value === "A+" || value === "A" || value === "O") return "mint";
  if (value === "B+" || value === "B") return "plain";
  return "amber";
}

const CHIP_SURFACE: Record<string, string> = {
  mint: "border-accent/25 bg-accent/10",
  plain: "border-border-strong bg-muted",
  amber: "border-chart-3/30 bg-chart-3/15",
  ember: "border-primary/25 bg-primary/10",
};

const CHIP_INK: Record<string, string> = {
  mint: "text-accent-ink",
  plain: "text-foreground",
  amber: "text-foreground",
  ember: "text-primary-ink",
};

/* ------------------------------------------------------------------- header */

/**
 * The one number the screen exists for, its move, and the way back.
 *
 * `Reset` is always live: pressing it with the marks untouched is a no-op, and
 * a disabled button would have to be rebuilt to look disabled again.
 */
export function SimHeader(props: { sim: () => Simulation; onReset: () => void }) {
  return (
    <Card class="gap-3 p-4">
      <Row class="items-start justify-between gap-3">
        <Col class="flex-1 gap-1">
          <Label>Simulated SGPA</Label>
          <Row class="items-baseline gap-2">
            <Text class="text-[32px] font-bold leading-9 tabular-nums text-foreground">
              {fixed(props.sim().value, 2)}
            </Text>
            <Text class={`text-[15px] font-semibold leading-6 tabular-nums ${deltaTone(props.sim().delta)}`}>
              {deltaText(props.sim().delta)}
            </Text>
          </Row>
          <Text class="text-[12px] leading-5 tabular-nums text-muted-foreground">
            {`Real ${fixed(props.sim().real, 2)} · ${props.sim().credits} credits counted`}
          </Text>
        </Col>
        <Btn variant="secondary" onPress={props.onReset} label="Reset every paper to its real ESE marks">
          Reset
        </Btn>
      </Row>
    </Card>
  );
}

/* --------------------------------------------------------------------- rows */

/**
 * One paper. The name may take two lines; the credit/IA/points line and the
 * ESE field share the next, so a row is 72 pt at its tallest — the field still
 * gets its full 44 pt target.
 */
export function PaperRow(props: {
  subject: ResultSubject;
  max: number;
  first: boolean;
  mark: () => string;
  applied: () => ResultSubject;
  onMark: (text: string) => void;
  onBlur: () => void;
}) {
  const credit = creditOf(props.subject);
  const ia = num(props.subject.ia);
  const points = (): number => pointsFor(props.applied());
  const meta = (): string => {
    const parts = [credit === null ? "credits not published" : `${credit} cr`];
    if (ia !== null) parts.push(`IA ${ia}`);
    parts.push(`${points()} pts`);
    return parts.join(" · ");
  };
  const name = props.subject.name || (props.subject.code ? `Paper ${props.subject.code}` : "Paper");
  const tone = (): string => gradeTone(props.applied().grade);

  return (
    <View
      class={props.first ? "" : "border-t border-border"}
      accessibilityLabel={`${name}, ${credit === null ? "credits not published" : `${credit} credits`}, grade ${props.applied().grade || "not published"}`}
    >
      <Row class="min-h-[68px] items-center gap-3 px-4 py-2">
        <Col class="flex-1 gap-1">
          <Row class="items-start gap-2">
            <Text class="flex-1 text-[14px] font-semibold leading-[18px] text-foreground" numberOfLines={2}>
              {name}
            </Text>
            <View class={`min-w-7 items-center justify-center rounded-full border px-1.5 py-0.5 ${CHIP_SURFACE[tone()]}`}>
              <Text class={`text-[11px] font-bold leading-4 tabular-nums ${CHIP_INK[tone()]}`}>
                {props.applied().grade || "—"}
              </Text>
            </View>
          </Row>
          <Text class="text-[11px] leading-4 tabular-nums text-muted-foreground" numberOfLines={1}>
            {meta()}
          </Text>
        </Col>

        <Row class="shrink-0 items-center gap-1">
          <View class="h-11 w-12 items-center justify-center rounded-xl border border-border-strong bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
            <Input
              class="min-h-11 w-full bg-transparent text-center text-[16px] font-semibold tabular-nums text-foreground"
              value={props.mark()}
              onChange={props.onMark}
              onBlur={props.onBlur}
              keyboardType="number-pad"
              maxLength={2}
              autoCorrect={false}
              accessibilityLabel={`${name} end-semester marks out of ${props.max}`}
            />
          </View>
          <Text class="w-7 text-[11px] leading-4 tabular-nums text-muted-foreground">{`/${props.max}`}</Text>
        </Row>
      </Row>
    </View>
  );
}

/** The table shell every row lives in: one card, hairline dividers, no gaps. */
export function PaperTable(props: { children: JSX.Element | JSX.Element[] }) {
  return <View class="overflow-hidden rounded-3xl border border-border bg-card">{props.children}</View>;
}

/* ------------------------------------------------------------------- target */

function planHeadline(plan: TargetPlan): string {
  if (plan.current === null) return "This result prints no credits to count.";
  if (plan.reached) return "Target already met.";
  if (!plan.reachable) return "Not reachable with these credits.";
  if (plan.best) return `Needs ${plan.best.need}/${plan.best.max} in ${plan.best.name}`;
  return `No single paper reaches ${fixed(plan.target, 1)}. Move two papers.`;
}

function alternatives(plan: TargetPlan): NeededPaper[] {
  if (plan.reached || !plan.reachable || plan.best === null) return [];
  return plan.options.slice(1, 3);
}

function StepButton(props: { icon: IconName; label: string; off: () => boolean; onPress: () => void }) {
  return (
    <View
      class={`h-11 w-11 items-center justify-center rounded-full border active:bg-muted ${
        props.off() ? "border-border bg-muted opacity-40" : "border-border-strong bg-card"
      }`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.off() }}
    >
      <Icon name={props.icon} size={20} class="text-foreground" />
    </View>
  );
}

/**
 * The target and the cheapest honest way to get there. It says no in three
 * different shapes — already there, impossible at any marks, and possible but
 * not by moving one paper — because those mean different things to a student.
 */
export function TargetCard(props: { plan: () => TargetPlan; onStep: (tenths: number) => void }) {
  return (
    <Card class="gap-3 p-4">
      <Row class="items-center justify-between gap-3">
        <Col class="flex-1 gap-1">
          <Label>To reach</Label>
          <Row class="items-baseline gap-1.5">
            <Text class="text-[28px] font-bold leading-8 tabular-nums text-foreground">{fixed(props.plan().target, 1)}</Text>
            <Text class="text-[13px] leading-5 text-muted-foreground">SGPA</Text>
          </Row>
        </Col>
        <Row class="items-center gap-2">
          <StepButton
            icon="minus"
            label="Lower the target by 0.1"
            off={() => props.plan().target <= 5}
            onPress={() => props.onStep(-1)}
          />
          <StepButton
            icon="plus"
            label="Raise the target by 0.1"
            off={() => props.plan().target >= 10}
            onPress={() => props.onStep(1)}
          />
        </Row>
      </Row>

      <Divider />

      <Col class="gap-1">
        <Text class="text-[14px] font-semibold leading-5 text-foreground">{planHeadline(props.plan())}</Text>
        <Each of={alternatives(props.plan())} key={(option) => `${option.index}-${option.need}`}>
          {(option) => (
            <Text class="text-[13px] leading-5 text-muted-foreground" numberOfLines={1}>
              {`or ${option().need}/${option().max} in ${option().name}`}
            </Text>
          )}
        </Each>
        <If when={!props.plan().reached && !props.plan().reachable && props.plan().ceiling !== null}>
          <Text class="text-[13px] leading-5 tabular-nums text-muted-foreground">
            {`All ESE at full marks reaches ${fixed(props.plan().ceiling, 2)}.`}
          </Text>
        </If>
      </Col>
    </Card>
  );
}

/* ------------------------------------------------------------------ loading */

/** The ready layout at rest: same cards, same heights, no invented numbers. */
export function SimulatorSkeleton() {
  return (
    <View class="gap-4">
      <Card class="gap-3 p-4">
        <Skeleton w={90} h={12} />
        <Skeleton w={150} h={34} />
        <Skeleton w={200} h={12} />
      </Card>
      <Card class="gap-3 p-4">
        <Skeleton w={64} h={12} />
        <Row class="items-center justify-between gap-3">
          <Skeleton w={70} h={28} />
          <Row class="gap-2">
            <Skeleton w={44} h={44} />
            <Skeleton w={44} h={44} />
          </Row>
        </Row>
        <Skeleton w={230} h={14} />
      </Card>
      <PaperTable>
        <Each of={[0, 1, 2, 3]} key="index">
          {(index) => (
            <View class={index() === 0 ? "" : "border-t border-border"}>
              <Col class="min-h-[68px] justify-center gap-2 px-4 py-2">
                <Skeleton w={200} h={14} />
                <Skeleton w={150} h={11} />
              </Col>
            </View>
          )}
        </Each>
      </PaperTable>
    </View>
  );
}

/* ------------------------------------------------------------- section copy */

/** "6 papers · 24 credits" — the count line above the rows. */
export function papersLine(subjects: readonly ResultSubject[]): string {
  const credits = subjects.reduce((sum, subject) => {
    const credit = creditOf(subject);
    return credit === null || credit <= 0 ? sum : sum + credit;
  }, 0);
  return `${subjects.length} papers · ${credits} credits`;
}

/** Why a list can be shorter than the result: say it, never hide it. */
export function skippedLine(total: number, shown: number): string {
  const skipped = total - shown;
  if (skipped <= 0) return "";
  return skipped === 1 ? "1 paper not counted" : `${skipped} papers not counted`;
}

/**
 * Why there is nothing to simulate. Missing credits and missing grades are two
 * different holes in a result and must not borrow each other's sentence.
 */
export function blockedCopy(subjects: readonly ResultSubject[]): { title: string; hint: string } {
  const hasCredit = subjects.some((subject) => {
    const credit = creditOf(subject);
    return credit !== null && credit > 0;
  });
  if (!hasCredit) {
    return {
      title: "No credits in this result",
      hint: "SGPA needs a credit value for every paper, and BEU did not print them here.",
    };
  }
  return { title: "No grades in this result", hint: "Nothing is graded yet, so there is no SGPA to move." };
}
