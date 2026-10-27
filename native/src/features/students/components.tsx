/**
 * Small pieces shared by the five student screens.
 *
 * `Fresh` is the rebuild-on-key block the kit needs: a `List` captures its
 * `each` array and its slots once, and `Chip` reads `active` in its body, so a
 * query or a chip change rebuilds the list through here instead of leaving the
 * first paint frozen.
 */

import { Text, View, type JSX } from "nsh";
import { Muted, Row } from "../../ui";
import type { Student } from "./data";
import { formatCount } from "./data";

export function Fresh(props: { when: string; build: () => JSX.Element }) {
  return (
    <Each of={[props.when]} key={(value) => value}>
      {() => props.build()}
    </Each>
  );
}

/** The bar above one batch's rows: the session on the left, its count on the right. */
export function SessionHeader(props: { session: string; count: number }) {
  return (
    <View class="flex-row items-baseline justify-between gap-2 border-b border-t border-border bg-muted/70 px-4 py-2">
      <Text class="text-[13px] font-bold tracking-tight text-foreground">{props.session}</Text>
      <Text class="text-[11px] tabular-nums text-muted-foreground">{formatCount(props.count)}</Text>
    </View>
  );
}

/**
 * One student: name over registration number. `meta` is the branch or batch
 * that is not already in the section header.
 */
export function StudentRow(props: { student: Student; meta?: string; onPress: () => void }) {
  const student = props.student;
  return (
    <Row
      class="min-h-14 gap-3 bg-card px-4 py-2.5 active:bg-muted"
      onPress={props.onPress}
      label={`${student.name}, ${student.reg}`}
    >
      <View class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground" numberOfLines={1}>
          {student.name}
        </Text>
        <Text class="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>
          {student.reg}
        </Text>
      </View>
      {props.meta ? (
        <Text class="text-[11px] font-medium text-muted-foreground" numberOfLines={1}>
          {props.meta}
        </Text>
      ) : null}
    </Row>
  );
}

/** One label/value line in the student profile card. */
export function Fact(props: { label: string; value: string; first?: boolean }) {
  return (
    <View class={`flex-row items-start justify-between gap-4 py-3 ${props.first ? "" : "border-t border-border"}`}>
      <Muted class="text-[13px]">{props.label}</Muted>
      <Text class="max-w-[68%] text-right text-[14px] font-semibold leading-5 text-foreground">{props.value}</Text>
    </View>
  );
}

/** A small text action that still owns a 44 pt target. */
export function TextAction(props: { label: string; onPress: () => void }) {
  return (
    <View
      class="min-h-11 justify-center rounded-full px-2.5 active:bg-muted focus:ring-2 focus:ring-ring"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
    >
      <Text class="text-[13px] font-semibold text-primary-ink" numberOfLines={1}>
        {props.label}
      </Text>
    </View>
  );
}
