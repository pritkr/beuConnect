/**
 * SGPA and CGPA. Both are credit-weighted averages (see `engine.ts` for the
 * formula and the worked examples), so this screen only edits the rows and
 * shows the one division the engine already did — it never re-does the maths
 * inline, and it rounds once, at display.
 */

import { Clipboard, Text, View, signal } from "nsh";
import { Body, Btn, Card, Chip, Col, Divider, EmptyState, Field, Label, Muted, Row, Screen, SectionHeader } from "../../ui";
import { GRADE_POINTS, cgpa as cgpaOf, countedPapers, countedSemesters, fixed, num, roundHalfUp, sgpa as sgpaOf } from "./engine";
import { BigResult, GradePills, IconButton, ModeChips, Stepper } from "./kit";
import type { ModeOption } from "./kit";
import { Percent, Predict } from "./predict";
import { PRESET_BRANCHES, PRESET_SEMESTERS, presetLabel, presetPapers } from "./presets";
import type { PresetPaper } from "./presets";
import { askDestructive } from "./shared";
import { EVENTS, track } from "../../lib/analytics";
import type { CalcMode, CalcSemester, CalcSubject } from "./state";
import { blankSubject, newId } from "./state";
import { calc, extras, freshCalculator, freshExtras, persistCalculator, persistExtras } from "./store";

const copied = signal("");

/** Copies a result and shows the outcome on the button itself. */
async function copyText(key: string, text: string): Promise<void> {
  try {
    await Clipboard.writeText(text);
    copied.set(key);
  } catch {
    copied.set(`error:${key}`);
  }
  setTimeout(() => {
    if (copied() === key || copied() === `error:${key}`) copied.set("");
  }, 2200);
}

function copyLabel(key: string, fallback: string): string {
  if (copied() === key) return "Copied";
  if (copied() === `error:${key}`) return "Could not copy";
  return fallback;
}

const CALC_MODES: readonly ModeOption<CalcMode>[] = [
  { value: "sgpa", label: "SGPA" },
  { value: "cgpa", label: "CGPA" },
  { value: "predict", label: "Predict" },
  { value: "percent", label: "Percent" },
];

export function setCalcMode(mode: CalcMode): void {
  calc.update((state) => ({ ...state, mode }));
  track(EVENTS.calculatorUse, { mode });
}

function patchSubject(id: string, patch: Partial<CalcSubject>): void {
  calc.update((state) => ({
    ...state,
    subjects: state.subjects.map((subject) => (subject.id === id ? { ...subject, ...patch } : subject)),
  }));
}

function addSubject(): void {
  calc.update((state) => ({
    ...state,
    subjects: [...state.subjects, { ...blankSubject(state.subjects.length), name: nextSubjectName(state.subjects) }],
  }));
}

/** The first number not already used — deleting Subject 2 of 4 must not clone Subject 4. */
function nextSubjectName(subjects: readonly CalcSubject[]): string {
  const used = new Set(subjects.map((subject) => subject.name.trim().toLowerCase()));
  let number = subjects.length + 1;
  while (used.has(`subject ${number}`)) number += 1;
  return `Subject ${number}`;
}

function removeSubject(id: string): void {
  calc.update((state) => ({ ...state, subjects: state.subjects.filter((subject) => subject.id !== id) }));
}

function patchSemester(id: string, patch: Partial<CalcSemester>): void {
  calc.update((state) => ({
    ...state,
    semesters: state.semesters.map((semester) => (semester.id === id ? { ...semester, ...patch } : semester)),
  }));
}

/**
 * The first number not already used by a saved semester. Counting rows is not
 * enough: delete Semester 2 of 3 and the next row would be called "Semester 3"
 * a second time.
 */
function nextSemesterName(semesters: readonly CalcSemester[]): string {
  const used = new Set(semesters.map((semester) => semester.name.trim().toLowerCase()));
  let number = semesters.length + 1;
  while (used.has(`semester ${number}`)) number += 1;
  return `Semester ${number}`;
}

function addSemester(): void {
  calc.update((state) => ({
    ...state,
    semesters: [...state.semesters, { id: newId("sem"), name: nextSemesterName(state.semesters), sgpa: "", credits: "" }],
  }));
}

function removeSemester(id: string): void {
  calc.update((state) => ({ ...state, semesters: state.semesters.filter((semester) => semester.id !== id) }));
}

/** `null` for a half-typed field, which the CGPA then ignores. */
function semesterInputs(semesters: readonly CalcSemester[]): { sgpa: number; credits: number }[] {
  return semesters.map((semester) => ({
    sgpa: num(semester.sgpa) ?? Number.NaN,
    credits: num(semester.credits) ?? Number.NaN,
  }));
}

/* ----------------------------------------------------------------- presets */

function pickBranch(branch: string): void {
  calc.update((state) => ({ ...state, branch }));
  persistCalculator();
}

function pickSemester(semester: number): void {
  calc.update((state) => ({ ...state, semester }));
  persistCalculator();
}

/** A row the student has touched: a grade, or a name that is not the default. */
function started(subject: CalcSubject): boolean {
  return subject.grade !== null || !/^Subject \d+$/.test(subject.name.trim());
}

async function loadPreset(): Promise<void> {
  const state = calc();
  const papers = presetPapers(state.branch, state.semester);
  if (papers.length === 0) return;

  if (state.subjects.some(started)) {
    const keep = await askDestructive(
      "Replace these papers?",
      `${presetLabel(state.branch, state.semester)} has ${papers.length} papers. The rows here are replaced; saved semesters stay.`,
      "Replace",
    );
    if (!keep) return;
  }

  calc.update((current) => ({
    ...current,
    subjects: papers.map((paper) => ({
      id: newId("sub"),
      name: paper.name,
      credits: paper.credits,
      grade: null,
    })),
  }));
  persistCalculator();
  track(EVENTS.calculatorPreset, { branch: state.branch, sem: state.semester, papers: papers.length });
}

/** The summary a student pastes into a group chat. */
function sgpaSummary(): string {
  const state = calc();
  const result = sgpaOf(state.subjects);
  const where = state.branch && state.semester > 0 ? presetLabel(state.branch, state.semester) : "";
  const lines = [`SGPA ${fixed(result.value)}${where ? ` · ${where}` : ""}`, `${result.credits} credits`];
  for (const subject of state.subjects) {
    if (!subject.grade || subject.credits <= 0) continue;
    lines.push(`• ${subject.name} — ${subject.credits} cr — ${subject.grade}`);
  }
  return lines.join("\n");
}

function cgpaSummary(): string {
  const state = calc();
  const average = cgpaOf(semesterInputs(state.semesters));
  const lines = [`CGPA ${fixed(average.value)} · ${average.credits} credits`];
  for (const semester of state.semesters) {
    if (!semester.sgpa && !semester.credits) continue;
    lines.push(`• ${semester.name} — SGPA ${semester.sgpa || "—"} — ${semester.credits || "0"} cr`);
  }
  return lines.join("\n");
}

function saveCurrentSemester(): void {
  const state = calc();
  const result = sgpaOf(state.subjects);
  const value = result.value;
  if (value === null || result.credits <= 0) return;
  calc.update((current) => ({
    ...current,
    semesters: [
      ...current.semesters,
      {
        id: newId("sem"),
        name: nextSemesterName(current.semesters),
        // Four decimals, not the two `fixed()` shows: the CGPA weights this
        // number, and saving "7.72" for 7.7222… moves it by up to 0.005 —
        // exactly the last digit the CGPA prints.
        sgpa: String(roundHalfUp(value, 4)),
        credits: String(result.credits),
      },
    ],
  }));
  persistCalculator();
  track(EVENTS.calculatorSave, { mode: state.mode, credits: result.credits, papers: state.subjects.length });
}

async function resetCalculator(): Promise<void> {
  if (!(await askDestructive("Clear the calculator?", "Every paper, grade, saved semester and prediction is removed.", "Clear"))) {
    return;
  }
  calc.set(freshCalculator());
  extras.set(freshExtras());
  persistCalculator();
  persistExtras();
}

export function CalculatorScreen() {
  return (
    <Screen>
      <Body contentClass="p-4 gap-4 pb-10">
        {() => <ModeChips value={calc().mode} options={CALC_MODES} onChange={setCalcMode} />}
        <If when={calc().mode === "sgpa"}>
          <SgpaPanel />
        </If>
        <If when={calc().mode === "cgpa"}>
          <CgpaPanel />
        </If>
        <If when={calc().mode === "predict"}>
          <Predict />
        </If>
        <If when={calc().mode === "percent"}>
          <Percent />
        </If>
        <Row class="justify-end px-1 pt-2">
          <View class="min-h-11 justify-center rounded-full px-3 active:bg-muted" onPress={() => void resetCalculator()} role="button">
            <Text class="text-[12px] font-semibold text-destructive">Clear all</Text>
          </View>
        </Row>
      </Body>
    </Screen>
  );
}

/* ------------------------------------------------------------------- SGPA */

function SgpaPanel() {
  const subjects = (): CalcSubject[] => calc().subjects;
  const result = () => sgpaOf(subjects());
  const counted = (): number => countedPapers(subjects());

  return (
    <View class="gap-4">
      <BigResult
        label="Semester SGPA"
        value={result().credits > 0 ? fixed(result().value) : "—"}
        hint={
          result().credits > 0
            ? `${counted()} of ${subjects().length} papers counted · ${result().credits} credits`
            : undefined
        }
      />

      <Row class="justify-end">
        <Btn
          variant="ghost"
          disabled={result().credits === 0}
          onPress={() => void copyText("sgpa", sgpaSummary())}
        >
          {copyLabel("sgpa", "Copy result")}
        </Btn>
      </Row>

      <Presets />

      <SectionHeader title="Papers" action="Add paper" onAction={addSubject} />

      <If when={subjects().length === 0}>
        <EmptyState title="No papers yet" action="Add a paper" onAction={addSubject} />
      </If>

      <View class="gap-3">
        <Each of={subjects()} key={(subject: CalcSubject) => subject.id}>
          {(subject, index) => <SubjectEditor subject={subject} index={index} />}
        </Each>
      </View>

      <Divider />

      <SavedSemesters />
    </View>
  );
}

/**
 * The branch and semester picker. The paper list comes from the syllabus pack,
 * so "Load CSE · Sem 3" fills in the papers the student actually sits — the
 * credits and names are the site's own, not a guess.
 */
function Presets() {
  const branch = (): string => calc().branch;
  const semester = (): number => calc().semester;
  const papers = (): PresetPaper[] => presetPapers(branch(), semester());
  const picked = (): boolean => branch() !== "" && semester() > 0;

  return (
    <Card class="gap-3 p-3.5">
      <Row class="items-center justify-between gap-2">
        <Label>My semester</Label>
        <Muted class="text-[11px]">
          {picked() ? (papers().length > 0 ? `${papers().length} papers` : "None in the syllabus") : ""}
        </Muted>
      </Row>

      <Row class="flex-wrap gap-1.5">
        {() =>
          PRESET_BRANCHES.map((meta) => (
            <Chip active={branch() === meta.code} onPress={() => pickBranch(meta.code)}>
              {meta.short}
            </Chip>
          ))
        }
      </Row>

      <Row class="flex-wrap gap-1.5">
        {() =>
          PRESET_SEMESTERS.map((value) => (
            <Chip active={semester() === value} onPress={() => pickSemester(value)}>
              {`S${value}`}
            </Chip>
          ))
        }
      </Row>

      <Btn variant="secondary" disabled={!picked() || papers().length === 0} onPress={() => void loadPreset()}>
        {picked() ? `Load ${presetLabel(branch(), semester())}` : "Pick a branch and semester"}
      </Btn>
    </Card>
  );
}

function SubjectEditor(props: { subject: () => CalcSubject; index: () => number }) {  const points = (): string => {
    const grade = props.subject().grade;
    return grade ? String(GRADE_POINTS[grade]) : "—";
  };

  /** Why a row is missing from the total — silence would look like a bug. */
  const note = (): string => {
    const subject = props.subject();
    if (subject.credits <= 0) return "0 credits — left out";
    if (!subject.grade) return "No grade — left out";
    return `Counted: ${subject.credits} × ${GRADE_POINTS[subject.grade ?? "F"]} = ${subject.credits * GRADE_POINTS[subject.grade ?? "F"]}`;
  };

  return (
    <Card class="gap-3 p-3.5">
      <Row class="justify-between gap-2">
        <Label>{`Paper ${props.index() + 1}`}</Label>
        <IconButton icon="x" label="Remove paper" danger onPress={() => removeSubject(props.subject().id)} />
      </Row>
      <Field
        value={props.subject().name}
        onChange={(name) => patchSubject(props.subject().id, { name })}
        placeholder="Paper name"
      />
      <Row class="items-end justify-between gap-2">
        <Col class="flex-1 gap-1.5">
          <Label>Credits</Label>
          <Stepper
            value={props.subject().credits}
            onChange={(credits) => patchSubject(props.subject().id, { credits })}
            step={0.5}
            min={0}
            max={10}
            suffix="credits"
            label="credits"
          />
        </Col>
        <Col class="items-end gap-1 pb-1">
          <Label>Points</Label>
          <Text class="text-[16px] font-bold tabular-nums text-foreground">{points()}</Text>
        </Col>
      </Row>
      {() => (
        <GradePills value={props.subject().grade} onChange={(grade) => patchSubject(props.subject().id, { grade })} />
      )}
      <Muted class="text-[11px]">{note()}</Muted>
    </Card>
  );
}

function SavedSemesters() {
  const semesters = (): CalcSemester[] => calc().semesters;
  const canSave = (): boolean => sgpaOf(calc().subjects).credits > 0;

  return (
    <View class="gap-3">
      <SectionHeader
        title="Saved semesters"
      />

      <If when={semesters().length === 0}>
        <EmptyState title="No semesters saved" />
      </If>

      <View class="gap-2">
        <Each of={semesters()} key={(semester: CalcSemester) => semester.id}>
          {(semester) => (
            <Row class="gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <Col class="flex-1">
                <Text class="text-[14px] font-semibold text-foreground">{semester().name}</Text>
                <Muted class="text-[11px]">{`${semester().credits || "0"} credits`}</Muted>
              </Col>
              <Text class="text-[18px] font-bold tabular-nums text-accent-ink">{semester().sgpa || "—"}</Text>
              <IconButton icon="x" label={`Remove ${semester().name}`} danger onPress={() => removeSemester(semester().id)} />
            </Row>
          )}
        </Each>
      </View>

      <Btn variant="secondary" disabled={!canSave()} onPress={saveCurrentSemester}>
        {canSave() ? `Save this SGPA (${fixed(sgpaOf(calc().subjects).value)})` : "Nothing to save yet"}
      </Btn>
    </View>
  );
}

/* ------------------------------------------------------------------- CGPA */

function CgpaPanel() {
  const semesters = (): CalcSemester[] => calc().semesters;
  const average = () => cgpaOf(semesterInputs(semesters()));
  // The engine's own predicate, so "across N semesters" counts exactly the
  // rows the CGPA weighted — not every row with a credits figure typed in.
  const countedSems = (): number => countedSemesters(semesterInputs(semesters()));

  return (
    <View class="gap-4">
      <BigResult
        label="CGPA"
        value={average().credits > 0 ? fixed(average().value) : "—"}
        hint={
          average().credits > 0
            ? `${average().credits} credits across ${countedSems()} semester${countedSems() === 1 ? "" : "s"}`
            : undefined
        }
        tone="mint"
      />

      <Row class="justify-end">
        <Btn
          variant="ghost"
          disabled={average().credits === 0}
          onPress={() => void copyText("cgpa", cgpaSummary())}
        >
          {copyLabel("cgpa", "Copy result")}
        </Btn>
      </Row>

      <SectionHeader title="Semesters" action="Add semester" onAction={addSemester} />

      <If when={semesters().length === 0}>
        <EmptyState title="No semesters yet" action="Add semester" onAction={addSemester} />
      </If>

      <View class="gap-3">
        <Each of={semesters()} key={(semester: CalcSemester) => semester.id}>
          {(semester, index) => <SemesterEditor semester={semester} index={index} />}
        </Each>
      </View>
    </View>
  );
}

function SemesterEditor(props: { semester: () => CalcSemester; index: () => number }) {
  return (
    <Card class="gap-2.5 p-3.5">
      <Row class="justify-between gap-2">
        <Label>{`Semester ${props.index() + 1}`}</Label>
        <IconButton
          icon="x"
          label={`Remove ${props.semester().name}`}
          danger
          onPress={() => removeSemester(props.semester().id)}
        />
      </Row>
      <Field
        value={props.semester().name}
        onChange={(name) => patchSemester(props.semester().id, { name })}
        placeholder="Semester name"
      />
      <Row class="gap-2">
        <Field
          class="flex-1"
          label="SGPA"
          value={props.semester().sgpa}
          onChange={(sgpa) => patchSemester(props.semester().id, { sgpa })}
          placeholder="8.42"
          keyboard="decimal-pad"
        />
        <Field
          class="flex-1"
          label="Credits"
          value={props.semester().credits}
          onChange={(credits) => patchSemester(props.semester().id, { credits })}
          placeholder="22"
          keyboard="number-pad"
        />
      </Row>
    </Card>
  );
}
