/**
 * The two calculator modes that answer a question rather than an average:
 *
 *  - Predict: "IA is 24, what must the end-sem paper score for a B?" — solved
 *    by walking the real grade function in `engine.ts`, so the answer can never
 *    disagree with the grade it claims to earn, 35% ESE minimum included.
 *  - Percentage: the BEU ×10 conversion and the older AICTE (CGPA − 0.75) ×10,
 *    both shown and labelled instead of one silently picked.
 */

import { Text, View } from "nsh";
import { Btn, Card, Col, Divider, EmptyState, Field, Label, Muted, Panel, Row, Stat } from "../../ui";
import type { PercentageFormula, TargetResult } from "./engine";
import {
  bestGrade,
  cgpa as cgpaOf,
  ceilTo,
  clamp,
  fixed,
  maxEse,
  maxIa,
  num,
  passEse,
  percentage,
  requiredEse,
  requiredSgpa,
} from "./engine";
import { GradePills, IconButton, ModeChips, Stepper } from "./kit";
import { Chip } from "../../ui";
import type { ModeOption } from "./kit";
import type { CalcSemester } from "./state";
import type { PercentDraft, PlannerDraft, PredictRow } from "./store";
import { calc, extras, freshPredictRow } from "./store";

/* ---------------------------------------------------------------- predict */

function patchPredictRow(id: string, patch: Partial<PredictRow>): void {
  extras.update((state) => ({
    ...state,
    predict: {
      ...state.predict,
      rows: state.predict.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    },
  }));
}

function addPredictRow(): void {
  extras.update((state) => ({
    ...state,
    predict: { ...state.predict, rows: [...state.predict.rows, freshPredictRow(state.predict.rows.length)] },
  }));
}

function removePredictRow(id: string): void {
  extras.update((state) => ({
    ...state,
    predict: { ...state.predict, rows: state.predict.rows.filter((row) => row.id !== id) },
  }));
}

function patchPlanner(patch: Partial<PlannerDraft>): void {
  extras.update((state) => ({
    ...state,
    predict: { ...state.predict, planner: { ...state.predict.planner, ...patch } },
  }));
}

function predictHeadline(row: PredictRow): string {
  if (row.target === "F") return "Pick the grade you want on this paper.";
  const needed = requiredEse(row.total, row.ia, row.target);
  if (needed === null) return `No ESE score reaches ${row.target} with ${row.ia} IA.`;
  return `Score ${needed} of ${maxEse(row.total)} in the ESE to land ${row.target}.`;
}

function predictHint(row: PredictRow): string {
  const best = bestGrade(row.total, row.ia);
  return `Best possible now: ${best ?? "—"} · pass mark ${passEse(row.total)}/${maxEse(row.total)} · IA out of ${maxIa(row.total)}`;
}

function planCopy(result: TargetResult | null): { headline: string; hint?: string; tone: "mint" | "amber" | "plain" } {
  if (!result) {
    return {
      headline: "Fill all four values",
      tone: "plain",
    };
  }
  if (result.type === "success") {
    return {
      headline: `You need ${fixed(ceilTo(result.requiredSgpa), 2)} SGPA this semester`,
      tone: "mint",
    };
  }
  if (result.type === "secured") {
    return {
      headline: "Target already secured",
      tone: "mint",
    };
  }
  if (result.type === "impossible_perfect") {
    return {
      headline: "A 10.0 target needs perfect grades",
      tone: "amber",
    };
  }
  return {
    headline: "Not this semester",
    hint:
      result.semsNeeded > 0
        ? `About ${result.semsNeeded} perfect semester${result.semsNeeded === 1 ? "" : "s"} at 10.0 would be needed.`
        : "This semester's credits are zero, so there is nothing to weigh.",
    tone: "amber",
  };
}

function plannerResult(draft: PlannerDraft): TargetResult | null {
  const current = num(draft.current);
  const previous = num(draft.previous);
  const target = num(draft.target);
  const semester = num(draft.semester);
  if (current === null || previous === null || target === null || semester === null) return null;
  if (current < 0 || current > 10 || target <= 0 || target > 10 || previous < 0 || semester <= 0) return null;
  return requiredSgpa(current, previous, target, semester);
}

export function Predict() {
  const rows = (): PredictRow[] => extras().predict.rows;
  const planner = (): PlannerDraft => extras().predict.planner;
  const plan = (): ReturnType<typeof planCopy> => planCopy(plannerResult(planner()));

  return (
    <View class="gap-4">
      <View class="gap-1">
        <Label>End-semester predictor</Label>
        <Muted>Internal marks are fixed. A paper below 35% in the ESE fails whatever the total.</Muted>
      </View>

      <If when={rows().length === 0}>
        <EmptyState title="No papers here" action="Add paper" onAction={addPredictRow} />
      </If>

      <View class="gap-3">
        <Each of={rows()} key={(row: PredictRow) => row.id}>
          {(row) => <PredictEditor row={row} />}
        </Each>
      </View>

      <Btn variant="secondary" onPress={addPredictRow}>
        Add another paper
      </Btn>

      <Divider />

      <View class="gap-1">
        <Label>Target CGPA planner</Label>
      </View>
      <Card class="gap-3 p-3.5">
        <Row class="gap-2">
          <Field
            class="flex-1"
            label="Current CGPA"
            value={planner().current}
            onChange={(current) => patchPlanner({ current })}
            placeholder="7.85"
            keyboard="decimal-pad"
          />
          <Field
            class="flex-1"
            label="Credits so far"
            value={planner().previous}
            onChange={(previous) => patchPlanner({ previous })}
            placeholder="88"
            keyboard="number-pad"
          />
        </Row>
        <Row class="gap-2">
          <Field
            class="flex-1"
            label="Target CGPA"
            value={planner().target}
            onChange={(target) => patchPlanner({ target })}
            placeholder="8.50"
            keyboard="decimal-pad"
          />
          <Field
            class="flex-1"
            label="This semester"
            value={planner().semester}
            onChange={(semester) => patchPlanner({ semester })}
            placeholder="22"
            keyboard="number-pad"
          />
        </Row>
        {() => (
          <Panel tone={plan().tone} class="gap-1">
            <Text class="text-[15px] font-semibold text-foreground">{plan().headline}</Text>
            {plan().hint ? <Muted class="text-[12px] leading-5">{plan().hint}</Muted> : null}
          </Panel>
        )}
      </Card>
    </View>
  );
}

function PredictEditor(props: { row: () => PredictRow }) {
  const tone = (): "mint" | "amber" => {
    const row = props.row();
    return row.target !== "F" && requiredEse(row.total, row.ia, row.target) !== null ? "mint" : "amber";
  };

  return (
    <Card class="gap-3 p-3.5">
      <Row class="justify-between gap-2">
        <Field
          class="flex-1"
          value={props.row().name}
          onChange={(name) => patchPredictRow(props.row().id, { name })}
          placeholder="Paper name"
        />
        <IconButton icon="x" label="Remove paper" danger onPress={() => removePredictRow(props.row().id)} />
      </Row>

      <Row class="items-end justify-between gap-2">
        <Col class="gap-1.5">
          <Label>Paper</Label>
          <Row class="gap-1.5">
            <Chip
              active={props.row().total === 100}
              onPress={() => patchPredictRow(props.row().id, { total: 100, ia: Math.min(props.row().ia, 30) })}
            >
              Theory 100
            </Chip>
            <Chip
              active={props.row().total === 50}
              onPress={() => patchPredictRow(props.row().id, { total: 50, ia: Math.min(props.row().ia, 20) })}
            >
              Practical 50
            </Chip>
          </Row>
        </Col>
        <Col class="items-end gap-1.5">
          <Label>{`IA / ${maxIa(props.row().total)}`}</Label>
          <Stepper
            value={props.row().ia}
            onChange={(ia) => patchPredictRow(props.row().id, { ia })}
            min={0}
            max={maxIa(props.row().total)}
            step={1}
            label="internal marks"
          />
        </Col>
      </Row>

      <Col class="gap-1.5">
        <Label>Target grade</Label>
        {() => (
          <GradePills
            value={props.row().target === "F" ? null : props.row().target}
            exclude={["F"]}
            onChange={(target) => patchPredictRow(props.row().id, { target })}
          />
        )}
      </Col>

      <Panel tone={tone()} class="gap-1 px-3 py-2.5">
        <Text class="text-[13px] font-semibold leading-5 text-foreground">{predictHeadline(props.row())}</Text>
        <Muted class="text-[11px] leading-4">{predictHint(props.row())}</Muted>
      </Panel>
    </Card>
  );
}

/* -------------------------------------------------------------- percentage */

const PERCENT_FORMULAS: readonly ModeOption<PercentageFormula>[] = [
  { value: "beu", label: "BEU ×10" },
  { value: "aicte", label: "AICTE (CGPA − 0.75) ×10" },
];

export function Percent() {
  const draft = (): PercentDraft => extras().percent;
  const raw = (): number | null => num(draft().value);
  const value = (): number | null => (raw() === null ? null : clamp(raw() as number, 0, 10));
  const result = (): number | null => (value() === null ? null : percentage(value() as number, draft().formula));
  const saved = () => cgpaOf(calc().semesters.map(semesterInputOf));
  const hasSaved = (): boolean => saved().credits > 0;

  const useSaved = (): void => {
    extras.update((state) => ({ ...state, percent: { ...state.percent, value: fixed(saved().value) } }));
  };

  return (
    <View class="gap-4">
      <View class="gap-1">
        <Label>Percentage</Label>
      </View>

      <Card class="gap-3 p-3.5">
        <Field
          label="CGPA"
          value={draft().value}
          onChange={(next) => extras.update((state) => ({ ...state, percent: { ...state.percent, value: next } }))}
          placeholder="8.42"
          keyboard="decimal-pad"
        />
        {() => (
          <ModeChips
            value={draft().formula}
            options={PERCENT_FORMULAS}
            onChange={(formula) => extras.update((state) => ({ ...state, percent: { ...state.percent, formula } }))}
          />
        )}
        <Btn variant="ghost" disabled={!hasSaved()} onPress={useSaved}>
          {hasSaved() ? `Use my saved CGPA (${fixed(saved().value)})` : "Save semesters to reuse your CGPA"}
        </Btn>
      </Card>

      {() => (
        <Row class="gap-3">
          <Stat
            value={value() === null ? "—" : `${fixed(percentage(value() as number, "beu"), 1)}%`}
            label="BEU ×10"
            hint="2026 ordinance"
            tone={draft().formula === "beu" ? "ember" : "plain"}
          />
          <Stat
            value={value() === null ? "—" : `${fixed(percentage(value() as number, "aicte"), 1)}%`}
            label="AICTE −0.75"
            hint="Older placement formula"
            tone={draft().formula === "aicte" ? "mint" : "plain"}
          />
        </Row>
      )}

      <Panel tone="plain" class="gap-1">
        <Label>The reading</Label>
        <Text class="text-[15px] font-semibold leading-5 text-foreground">
          {result() === null
            ? "Enter a CGPA"
            : `${fixed(value() as number)} CGPA is ${fixed(result() as number, 1)}% by ${
                draft().formula === "beu" ? "BEU's ×10 rule" : "the AICTE convention"
              }.`}
        </Text>
      </Panel>
    </View>
  );
}

function semesterInputOf(semester: CalcSemester): { sgpa: number; credits: number } {
  return { sgpa: num(semester.sgpa) ?? Number.NaN, credits: num(semester.credits) ?? Number.NaN };
}

