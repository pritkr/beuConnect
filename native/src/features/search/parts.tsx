/**
 * Presentational pieces for the one search.
 *
 * A result row is three things: the 24 pt kind chip (a word, never a glyph),
 * the title with the matched span in ember ink, and the muted line that says
 * where the thing lives — branch + semester, the notice date, the dataset
 * size, or the fragment that matched. Everything here is a pure function of
 * its props; the screen owns state, storage and navigation.
 */

import { Scroll, Text, View, type JSX } from "nsh";
import { Input } from "nsh/base";

import { Chip, Label, Muted, Row } from "../../ui";
import { Icon } from "../../ui/icons";
import { FILTERS, KIND_CHIP, KIND_TITLE, type FilterId, type HitKind } from "./rank";

/* -------------------------------------------------------------- the field */

/**
 * The search field, pinned above the list and focused the moment the screen
 * opens. It is the `Search` primitive with `autoFocus` and a 48 pt row, so the
 * first tap of the screen lands in the text and the keyboard is already up.
 *
 * Return is `blurAndSubmit`: it commits the query immediately and puts the
 * keyboard away, leaving the results on screen — the field is the way in, not
 * the place a student stays.
 */
export function SearchField(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Row
      class="min-h-12 rounded-full border border-border-strong bg-card px-4 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring"
      role="search"
    >
      <View class="h-3.5 w-3.5 rounded-full border-[1.5px] border-muted-foreground" accessibilityElementsHidden />
      <View class="-ml-2.5 mt-2 h-1.5 w-[6px] rotate-45 rounded-full bg-muted-foreground" accessibilityElementsHidden />
      <Input
        testID="search-input"
        class="min-h-11 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground"
        value={props.value}
        onChange={props.onChange}
        onSubmit={(event) => props.onSubmit(event.text)}
        placeholder={props.placeholder}
        accessibilityLabel="Search everything"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        submitBehavior="blurAndSubmit"
        autoFocus
      />
      {props.value ? (
        <View
          testID="search-clear"
          class="-mr-3 h-11 w-11 items-center justify-center rounded-full active:bg-muted focus:ring-2 focus:ring-ring"
          onPress={() => props.onChange("")}
          role="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="x" size={14} class="text-muted-foreground" />
        </View>
      ) : null}
    </Row>
  );
}

/* -------------------------------------------------------------- the filter */

/**
 * The one-tap kind filters. A horizontal strip that scrolls rather than a menu:
 * every option is a 44 pt chip one tap away, and the active one is filled so
 * the screen always says what it is narrowed to. Labels only — six counts at
 * 320 pt is a spreadsheet, not a search.
 */
export function FilterBar(props: { active: FilterId; onSelect: (id: FilterId) => void }) {
  return (
    <Scroll
      horizontal
      bounces={false}
      scrollbar={false}
      class="-mx-4"
      contentClass="flex-row items-center gap-2 px-4"
      accessibilityLabel="Filter results"
    >
      {FILTERS.map((filter) => (
        <Chip
          active={props.active === filter.id}
          onPress={() => props.onSelect(filter.id)}
          label={`Filter: ${filter.label}`}
        >
          {filter.label}
        </Chip>
      ))}
    </Scroll>
  );
}

/* ---------------------------------------------------------------- the chip */

const TONES: Record<HitKind, string> = {
  subject: "bg-primary/12 text-primary-ink",
  gate: "bg-accent/12 text-accent-ink",
  notice: "bg-chart-3/20 text-foreground",
  dataset: "bg-muted text-muted-foreground",
  destination: "bg-secondary text-secondary-foreground",
};

/** 24 pt tall, one fixed width, so kind chips form a column down the list. */
export function KindChip(props: { kind: HitKind }) {
  return (
    <View
      class={`h-6 w-[42px] shrink-0 items-center justify-center rounded-full ${TONES[props.kind]}`}
      accessibilityElementsHidden
    >
      <Text class="text-[9px] font-bold uppercase tracking-[0.06em]" numberOfLines={1}>
        {KIND_CHIP[props.kind]}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------- the text */

/**
 * One paragraph of text with the matched span in ember ink. Nested `Text` is a
 * span of the same paragraph, so the title still wraps and truncates as one
 * label instead of breaking into a row of separate boxes.
 */
export function Highlight(props: { text: string; term: string; class?: string; numberOfLines?: number }): JSX.Element {
  const term = props.term ?? "";
  const at = term.length > 0 ? props.text.toLowerCase().indexOf(term) : -1;
  if (at < 0) {
    return (
      <Text class={props.class} numberOfLines={props.numberOfLines}>
        {props.text}
      </Text>
    );
  }
  return (
    <Text class={props.class} numberOfLines={props.numberOfLines}>
      {at > 0 ? props.text.slice(0, at) : null}
      <Text class="font-bold text-primary-ink">{props.text.slice(at, at + term.length)}</Text>
      {props.text.slice(at + term.length)}
    </Text>
  );
}

/* ---------------------------------------------------------------- the rows */

/**
 * One result: chip, title, muted line. The whole row is the button, at least
 * 52 pt tall, and its spoken label names the kind before the title.
 */
export function ResultRow(props: {
  kind: HitKind;
  title: string;
  meta: string;
  /** Normalised query; "" means nothing is emphasised (a recent row). */
  term?: string;
  onPress: () => void;
}) {
  return (
    <Row
      class="min-h-[52px] rounded-3xl border border-border bg-card px-3.5 py-2.5 active:scale-[0.99] active:bg-muted focus:ring-2 focus:ring-ring"
      onPress={props.onPress}
      label={`${KIND_TITLE[props.kind]}: ${props.title}. ${props.meta}`}
    >
      <KindChip kind={props.kind} />
      <View class="flex-1 gap-0.5">
        <Highlight
          class="text-[15px] font-semibold leading-5 text-foreground"
          text={props.title}
          term={props.term ?? ""}
          numberOfLines={2}
        />
        <Highlight
          class="text-[12px] leading-4 text-muted-foreground"
          text={props.meta}
          term={props.term ?? ""}
          numberOfLines={1}
        />
      </View>
      <Icon name="chevron-right" size={18} class="text-muted-foreground" />
    </Row>
  );
}

/** The small uppercase heading that opens a kind group. */
export function HeadingRow(props: { label: string; count: string }) {
  return (
    <View class="flex-row items-baseline justify-between gap-2 px-1 pt-2">
      <Label role="header">{props.label}</Label>
      <Muted class="text-[11px] tabular-nums">{props.count}</Muted>
    </View>
  );
}
