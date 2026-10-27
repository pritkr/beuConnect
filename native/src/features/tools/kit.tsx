/**
 * Shared, small pieces used by more than one tools screen. They are built from
 * the design system (`src/ui`) and stay deliberately plain: a mode bar, a
 * number stepper, grade pills, a result panel and the hub's tile.
 */

import { Text, View } from "nsh";
import { Chip, Col, Label, Muted, Row } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import type { Grade } from "./engine";
import { GRADES } from "./engine";

export interface ModeOption<T extends string> {
  value: T;
  label: string;
}

/** A wrapping row of chips: the app's tab bar for a single screen. */
export function ModeChips<T extends string>(props: {
  value: T;
  options: readonly ModeOption<T>[];
  onChange: (value: T) => void;
  class?: string;
}) {
  return (
    <Row class={`flex-wrap gap-1.5 ${props.class ?? ""}`} role="tablist">
      {() => props.options.map((option) => (
        <Chip
          active={props.value === option.value}
          onPress={() => props.onChange(option.value)}
          class="px-3"
        >
          {option.label}
        </Chip>
      ))}
    </Row>
  );
}

/** `−  3.0  +`, as used for credits and class counts. */
export function Stepper(props: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  label?: string;
}) {
  const step = props.step ?? 0.5;
  const min = props.min ?? 0;
  const max = props.max ?? 10;
  const next = (delta: number) => {
    const raw = Math.round((props.value + delta) * 10) / 10;
    props.onChange(Math.min(max, Math.max(min, raw)));
  };

  return (
    <Row class="gap-1.5" role="group">
      <View
        class="h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-card active:bg-muted"
        onPress={() => next(-step)}
        role="button"
        accessibilityLabel={`Decrease ${props.label ?? "value"}`}
      >
        <Icon name="minus" size={18} class="text-foreground" />
      </View>
      <Col class="min-w-11 items-center justify-center">
        <Text class="text-[15px] font-bold tabular-nums text-foreground">
          {props.value % 1 === 0 ? String(props.value) : props.value.toFixed(1)}
        </Text>
        {props.suffix ? <Muted class="text-[10px]">{props.suffix}</Muted> : null}
      </Col>
      <View
        class="h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-card active:bg-muted"
        onPress={() => next(step)}
        role="button"
        accessibilityLabel={`Increase ${props.label ?? "value"}`}
      >
        <Icon name="plus" size={18} class="text-foreground" />
      </View>
    </Row>
  );
}

/** One BEU grade per chip; `value` may be null until a grade is chosen. */
export function GradePills(props: {
  value: Grade | null;
  onChange: (grade: Grade) => void;
  /** Grades that cannot be a target — the predict screen hides F. */
  exclude?: readonly Grade[];
  class?: string;
}) {
  const grades = props.exclude ? GRADES.filter((grade) => !props.exclude?.includes(grade)) : GRADES;
  return (
    <Row class={`flex-wrap gap-1.5 ${props.class ?? ""}`} role="radiogroup">
      {() => grades.map((grade) => (
        <Chip
          active={props.value === grade}
          onPress={() => props.onChange(grade)}
          class="min-w-11 justify-center px-2.5"
          tone={props.value === grade ? "default" : grade === "F" ? "amber" : "default"}
        >
          {grade}
        </Chip>
      ))}
    </Row>
  );
}

/** The big tabular number that a calculator screen exists to show. */
export function BigResult(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ember" | "mint" | "plain";
}) {
  const tone = props.tone ?? "ember";
  const surface =
    tone === "mint" ? "border-accent/25 bg-accent/8" : tone === "plain" ? "border-border bg-card" : "border-primary/25 bg-primary/8";
  const ink = tone === "mint" ? "text-accent-ink" : tone === "plain" ? "text-foreground" : "text-primary-ink";

  return (
    <View class={`items-center gap-1 rounded-[26px] border px-4 py-4 ${surface}`}>
      <Label>{props.label}</Label>
      <Text class={`text-[40px] font-bold tabular-nums tracking-tight ${ink}`}>{props.value}</Text>
      {props.hint ? <Muted class="text-center text-[12px]">{props.hint}</Muted> : null}
    </View>
  );
}

/** A 44pt round pressable with a Boxicon — used for delete and info. */
export function IconButton(props: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <View
      class={`h-11 w-11 items-center justify-center rounded-full border active:bg-muted ${
        props.danger ? "border-destructive/30" : "border-border-strong"
      }`}
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
    >
      <Icon name={props.icon} size={17} class={props.danger ? "text-destructive" : "text-muted-foreground"} />
    </View>
  );
}
