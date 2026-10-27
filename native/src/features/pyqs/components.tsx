/**
 * Shared, presentation-only pieces for the PYQ + data screens.
 *
 * Two framework facts shape this file:
 *
 * 1. A component body runs once, and a `List` cell is created once per cell —
 *    so a row that copies `item()` into a variable shows the first item the
 *    cell ever held. `Cell` rebuilds the row from the cell's current item.
 * 2. `Chip` turns `active` into a constant in its body, so a chip strip has to
 *    be rebuilt when the choice changes. `ChipRail` does that by keying the
 *    strip on the selection.
 *
 * Everything a paper renders here is native text and views: this file imports
 * no `WebView`, and `QuestionCard` is the only question renderer in the app.
 */

import { Image, Scroll, Text, View, signal, Clipboard, type JSX } from "nsh";

import type { Nav } from "../../app/router";
import { Badge, Btn, Card, Chip, Label, Muted, Row } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import { AskAi } from "../../ui/ask-ai";
import { paperPrompt } from "../../lib/ask-ai";
import type { Children } from "../../ui";
import { SITE, relativeTime } from "../../lib/net";
import type { CatalogPaper, CatalogSubject } from "./catalog";
import { paperLabel, shortBranchName } from "./catalog";
import type { ParsedOption, ParsedQuestion, ParsedSubQuestion } from "./paper-parse";
import { absoluteImage } from "./paper-parse";
import type { PdfPaper } from "./pdf-index";
import type { RecentPaper } from "./state";

/* ------------------------------------------------------------------ header */

/** The area's hero: warm card, three aurora blobs, no shadows. */
export function Hero(props: { children?: Children; class?: string }) {
  return (
    <View class={`overflow-hidden rounded-[28px] border border-border bg-card p-5 ${props.class ?? ""}`}>
      <View class="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-primary/15" pointerEvents="none" />
      <View class="absolute -right-2 top-6 h-20 w-20 rounded-full bg-accent/15" pointerEvents="none" />
      <View class="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-chart-3/15" pointerEvents="none" />
      {props.children}
    </View>
  );
}

/**
 * The one header every sub-screen wears: micro-label, big title, one line of
 * context, then whatever the screen adds (chips, actions). Everything is read
 * in the bindings below, so a screen can hand it a changing value.
 */
export function Head(props: { label: string; title: string; hint?: string; children?: Children }) {
  return (
    <View class="gap-1.5">
      <Label>{props.label}</Label>
      <Text class="text-[24px] font-bold leading-8 tracking-tight text-foreground" numberOfLines={3}>
        {props.title}
      </Text>
      {props.hint ? (
        <Muted class="text-[12px] leading-5" numberOfLines={3}>
          {props.hint}
        </Muted>
      ) : null}
      {props.children}
    </View>
  );
}

/** A wide, tappable entry point to another part of the area. */
export function JumpCard(props: {
  title: string;
  hint: string;
  icon: IconName;
  tone?: "ember" | "mint";
  onPress: () => void;
}) {
  return (
    <Card class="flex-row items-center gap-3" onPress={props.onPress} label={props.title}>
      <View
        class={`h-11 w-11 items-center justify-center rounded-2xl ${
          props.tone === "mint" ? "bg-accent/12" : "bg-primary/10"
        }`}
      >
        <Icon
          name={props.icon}
          size={22}
          class={props.tone === "mint" ? "text-accent-ink" : "text-primary-ink"}
        />
      </View>
      <View class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground">{props.title}</Text>
        <Text class="text-[12px] leading-4 text-muted-foreground">{props.hint}</Text>
      </View>
      <Icon name="chevron-right" size={18} class="text-muted-foreground" />
    </Card>
  );
}

/**
 * Rebuilds `build()` whenever `when` changes. For the few places that hand a
 * value to a component that reads it once — a card header waiting on a fetch,
 * a row that has to show its open state.
 */
export function Fresh(props: { when: string; build: () => JSX.Element }) {
  return (
    <Each of={[props.when]} key={(value) => value}>
      {() => props.build()}
    </Each>
  );
}

/* ------------------------------------------------------------------ filters */

export interface RailOption {
  key: string;
  label: string;
}

/**
 * A labelled horizontal chip rail — branch, semester, sort. `value` is the
 * selected option's key; the rail is rebuilt when it (or the option list)
 * changes, because `Chip` computes its selected style once.
 */
export function ChipRail(props: {
  label?: string;
  note?: string;
  value: string;
  options: RailOption[];
  onSelect: (key: string) => void;
}) {
  return (
    <View class="gap-2">
      {props.label ? (
        <Row class="items-center justify-between gap-2">
          <Label>{props.label}</Label>
          {props.note ? <Muted>{props.note}</Muted> : null}
        </Row>
      ) : null}
      <Scroll horizontal class="flex-1" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
        <Each
          of={[`${props.value}|${props.options.map((option) => option.key).join(",")}`]}
          key={(signature) => signature}
        >
          {() => (
            <View class="flex-row gap-2">
              {props.options.map((option) => (
                <Chip active={props.value === option.key} onPress={() => props.onSelect(option.key)}>
                  {option.label}
                </Chip>
              ))}
            </View>
          )}
        </Each>
      </Scroll>
    </View>
  );
}

/* --------------------------------------------------------------------- rows */

/**
 * One cell's content, rebuilt when the cell is given another row.
 *
 * Everything but `item()` and `index()` in a list row is created once per
 * cell, and a component reads a copied value once — so a row that hands an
 * item to another component keeps showing the first item it was built with.
 * Reading the accessor inside `Each` (keyed by row identity plus any local
 * state the row shows, `fresh`) makes the cell follow its current row.
 */
export function Cell<T>(props: {
  row: () => T;
  id: (row: T) => string;
  fresh?: () => string;
  build: (row: T) => JSX.Element;
}) {
  return (
    <Each
      of={[`${props.id(props.row())}|${props.fresh ? props.fresh() : ""}`]}
      key={(signature) => signature}
    >
      {() => props.build(props.row())}
    </Each>
  );
}

/**
 * The shelf's row shape: a square leading badge (semester, year, paper code),
 * a title with one supporting line and a chip row, and a trailing chevron.
 * Used by subjects, GATE codes, GATE papers and published datasets.
 */
export function InfoRow(props: {
  lead: string;
  leadHint?: string;
  tone?: "ember" | "mint";
  title: string;
  subtitle?: string;
  chips?: Children;
  trailing?: string;
  expanded?: boolean;
  onPress: () => void;
  label?: string;
}) {
  return (
    <View
      class="min-h-11 flex-row items-center gap-3 rounded-3xl border border-border bg-card p-3.5 active:scale-[0.99] active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
      accessibilityState={props.expanded === undefined ? undefined : { expanded: props.expanded }}
    >
      <View
        class={`w-14 items-center justify-center gap-0.5 rounded-2xl py-2 ${
          props.tone === "mint" ? "bg-accent/10" : "bg-muted"
        }`}
      >
        <Text
          class={`text-[16px] font-bold tabular-nums leading-5 ${
            props.tone === "mint" ? "text-accent" : "text-foreground"
          }`}
          numberOfLines={1}
        >
          {props.lead}
        </Text>
        {props.leadHint ? (
          <Text class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
            {props.leadHint}
          </Text>
        ) : null}
      </View>
      <View class="flex-1 gap-1">
        <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {props.title}
        </Text>
        {props.subtitle ? <Muted numberOfLines={1}>{props.subtitle}</Muted> : null}
        {props.chips ? <Row class="flex-wrap items-center gap-1.5">{props.chips}</Row> : null}
      </View>
      {props.trailing ? (
        <Text class="text-[13px] font-semibold text-muted-foreground">{props.trailing}</Text>
      ) : (
        <Icon
          name={props.expanded === undefined ? "chevron-right" : props.expanded ? "chevron-up" : "chevron-down"}
          size={18}
          class="text-muted-foreground"
        />
      )}
    </View>
  );
}

export function RecentCard(props: { item: RecentPaper; onPress: () => void }) {
  return (
    <View
      class="w-[210px] gap-2 rounded-3xl border border-border bg-card p-4 active:scale-[0.98] active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`Open ${props.item.name}, ${props.item.label}`}
    >
      <Row class="justify-between gap-2">
        <Badge tone={props.item.kind === "gate" ? "mint" : "ember"}>
          {props.item.kind === "gate" ? "GATE" : "BEU"}
        </Badge>
        <Muted>{relativeTime(props.item.at)}</Muted>
      </Row>
      <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
        {props.item.name}
      </Text>
      <Muted numberOfLines={1}>{props.item.label || props.item.code || "Previous year"}</Muted>
    </View>
  );
}

/** One year/variant row in a subject's paper list. */
export function PaperRow(props: { paper: CatalogPaper; onPress: () => void }) {
  const detail = [
    props.paper.questions > 0 ? `${props.paper.questions} questions` : "",
    props.paper.marks > 0 ? `${props.paper.marks} marks` : "",
    props.paper.code && props.paper.code !== "---" ? props.paper.code : "",
  ]
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <InfoRow
      lead={String(props.paper.year)}
      leadHint={props.paper.variant || undefined}
      title={props.paper.title || "Previous year question paper"}
      subtitle={detail || "Open paper"}
      onPress={props.onPress}
      label={`Open ${paperLabel(props.paper)} paper`}
    />
  );
}

/**
 * One PDF of a subject, year first — the row that ends in a file.
 *
 * Deliberately lighter than `InfoRow`: in a subject's panel every row is the
 * same subject, so the only things that change are the year, the paper code
 * and a re-exam variant. The year gets the box, the code gets the line, and
 * the file glyph says what a tap does.
 */
export function PdfYearRow(props: { paper: PdfPaper; label: string; onPress: () => void }) {
  return (
    <View
      class="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`Open the ${props.label} PDF, code ${props.paper.subjectCode}`}
    >
      <View class="w-14 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-accent/10 py-1.5">
        <Text
          class="text-[14px] font-bold tabular-nums leading-4 text-accent-ink"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {props.paper.year}
        </Text>
        <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
          PDF
        </Text>
      </View>

      <Text class="flex-1 text-[13px] font-semibold leading-5 text-foreground" numberOfLines={1}>
        {props.paper.subjectCode}
      </Text>

      {props.paper.variant ? <Badge tone="amber">{props.paper.variant.toUpperCase()}</Badge> : null}
      <Icon name="download" size={17} class="text-muted-foreground" />
    </View>
  );
}

/* ---------------------------------------------------------------- questions */

/**
 * A paper's prose, as it can be read.
 *
 * The site puts a hard break at every block boundary of a question, so a
 * sentence wraps mid-clause as often as a new item starts. A break becomes a
 * space unless the next line opens like a list item (`(a)`, `iv)`, `•`), which
 * keeps enumerated parts enumerated without the ragged half-lines.
 */
export function readableText(text: string): string {
  let out = "";
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const item = /^(\(?[a-z0-9ivx]{1,4}[).]|[-–—•*]|(?:i{1,3}|iv|v|vi{1,3}|ix|x)[).])\s/i.test(line);
    out += (item ? "\n" : " ") + line;
  }
  return out;
}

/**
 * A section's short name for the jump rail: "Q1" for "Q.1 Choose the correct
 * answer…", "A" for "Section A", "Part 3" when the title says neither.
 */
export function sectionLabel(title: string, index: number): string {
  const numbered = /^\s*Q\s*\.?\s*(\d+(?:\s*\.\s*\d+)*)/i.exec(title);
  if (numbered) return `Q${numbered[1].replace(/\s+/g, "")}`;
  const lettered = /^\s*Section\s+([A-Za-z0-9]+)/i.exec(title);
  if (lettered) return lettered[1].toUpperCase();
  return `Part ${index + 1}`;
}

/** Copies `text`; the label confirms for a couple of seconds. */
export function CopyButton(props: { text: string; label?: string; class?: string }) {
  const copied = signal(false);

  const copy = async () => {
    try {
      await Clipboard.writeText(props.text);
      copied.set(true);
      setTimeout(() => copied.set(false), 2200);
    } catch {
      /* No clipboard on this host: leave the label alone. */
    }
  };

  return (
    <Btn variant="secondary" class={props.class} onPress={copy} label={props.label ?? "Copy link"}>
      {copied() ? "Copied" : (props.label ?? "Copy link")}
    </Btn>
  );
}

/**
 * One choice of an MCQ, or one part of a question: the label rides with the
 * text, so a `a)` never takes a column away from the sentence it belongs to.
 */
function OptionLine(props: { option: ParsedOption; selectable: boolean }) {
  return (
    <Text class="text-[13px] leading-6 text-foreground" selectable={props.selectable}>
      {props.option.label ? `${props.option.label} ` : ""}
      {readableText(props.option.text)}
    </Text>
  );
}

/** A part of a question that has its own mark and its own list of choices. */
function SubQuestion(props: { sub: ParsedSubQuestion; selectable: boolean }) {
  return (
    <View class="gap-1.5 rounded-2xl bg-muted p-3">
      <View class="flex-row items-start gap-2">
        {props.sub.label ? (
          <Text
            class="w-6 shrink-0 text-[12px] font-semibold tabular-nums leading-5 text-muted-foreground"
            numberOfLines={1}
          >
            {props.sub.label}
          </Text>
        ) : null}
        <Text class="flex-1 text-[13px] leading-5 text-foreground" selectable={props.selectable}>
          {readableText(props.sub.text)}
        </Text>
        {props.sub.marks ? (
          <Text class="shrink-0 text-[12px] font-semibold tabular-nums leading-5 text-foreground" numberOfLines={1}>
            {`${props.sub.marks} m`}
          </Text>
        ) : null}
      </View>
      <Each of={props.sub.parts} key="index">
        {(part) => <OptionLine option={part()} selectable={props.selectable} />}
      </Each>
      <Each of={props.sub.options} key="index">
        {(option) => <OptionLine option={option()} selectable={props.selectable} />}
      </Each>
      <Each of={props.sub.images} key="index">
        {(src) => (
          <Image
            src={absoluteImage(SITE, src())}
            resizeMode="contain"
            class="w-full rounded-xl border border-border bg-card"
            style={{ height: 180 }}
          />
        )}
      </Each>
    </View>
  );
}

/**
 * One question, rendered as native text — never a WebView.
 *
 * A printed paper's shape, kept at 320pt: the number sits in a fixed gutter,
 * the body keeps one column whatever the text length, and the marks are a
 * fixed column of their own, right-aligned in tabular figures, so scanning
 * down the page lands on the same edges every time.
 */
export function QuestionCard(props: {
  question: ParsedQuestion;
  index: number;
  /** Question text can be selected and copied (default true). */
  selectable?: boolean;
  /** The paper around the question, so "Ask AI" can carry the whole context. */
  context?: { subject: string; code: string; sem: number; branch: string; paper: string; year: string };
}) {
  const selectable = props.selectable !== false;
  return (
    <Card class="gap-2.5">
      <View class="flex-row items-start gap-2">
        <View class="w-9 shrink-0 items-end pt-0.5">
          <Text
            class="text-[12px] font-bold tabular-nums leading-5 text-primary-ink"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {props.question.number || `${props.index + 1}.`}
          </Text>
        </View>

        <View class="flex-1 gap-2">
          <Text class="text-[15px] leading-7 text-foreground" selectable={selectable}>
            {readableText(props.question.text) || "The site published this question without its text."}
          </Text>
          <Each of={props.question.options} key="index">
            {(option) => <OptionLine option={option()} selectable={selectable} />}
          </Each>
          <Each of={props.question.subs} key="index">
            {(sub) => <SubQuestion sub={sub()} selectable={selectable} />}
          </Each>
        </View>

        {props.question.marks === null ? null : (
          <View class="w-9 shrink-0 items-end gap-0.5 pt-0.5">
            <Text class="text-[13px] font-bold tabular-nums leading-5 text-foreground" numberOfLines={1}>
              {props.question.marks}
            </Text>
            <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
              marks
            </Text>
          </View>
        )}
      </View>

      <Each of={props.question.images} key="index">
        {(src) => (
          <Image
            src={absoluteImage(SITE, src())}
            resizeMode="contain"
            class="w-full rounded-xl border border-border bg-card"
            style={{ height: 220 }}
          />
        )}
      </Each>

      {props.context ? (
        <View class="ml-11 border-t border-border pt-2">
          <AskAi
            prompt={paperPrompt({
              ...props.context,
              question: readableText(props.question.text),
              marks: props.question.marks ?? 0,
            })}
          />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * A section break inside the question list — the paper's own heading, its
 * question count, and an ember rule that makes the break visible at arm's
 * length. It is also what the jump rail scrolls to, and the band the list
 * pins under the header (`stickyHeaderIndices`) while its questions scroll
 * past, so the reader never loses the section they are in.
 *
 * The band paints its own opaque background: a sticky row is see-through
 * otherwise, and the questions would read across the heading.
 */
export function SectionTitle(props: { title: string; marks: number | null; index: number; count: number }) {
  return (
    <View class="gap-1.5 border-b border-border bg-background pb-1.5 pt-4">
      <View class="h-0.5 w-9 rounded-full bg-primary" />
      <View class="flex-row items-start justify-between gap-2">
        <Text
          class="flex-1 text-[15px] font-bold leading-6 tracking-tight text-foreground"
          role="header"
          selectable
        >
          {readableText(props.title) || `Section ${props.index + 1}`}
        </Text>
        {props.marks ? (
          <View class="w-9 shrink-0 items-end gap-0.5">
            <Text class="text-[13px] font-bold tabular-nums leading-5 text-foreground" numberOfLines={1}>
              {props.marks}
            </Text>
            <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
              marks
            </Text>
          </View>
        ) : null}
      </View>
      {props.count === 0 ? <Muted class="text-[11px]">No questions listed under this heading</Muted> : null}
    </View>
  );
}

/* ------------------------------------------------------------------- links */

/** Opens a paper from anywhere (recent cards, subject rows). */
export function openPaper(nav: Nav, subject: CatalogSubject, paper: CatalogPaper): void {
  nav.push("pyqs.paper", {
    slug: subject.slug,
    code: paper.code,
    year: paper.year,
    variant: paper.variant,
    id: paper.id,
    title: paper.title,
    name: subject.name,
    branch: subject.branch,
    sem: subject.sem,
  });
}

/** The public page a paper was read from. */
export function paperSource(slug: string): string {
  return `${SITE}/pyqs/${slug}/`;
}

/** "CSE · Sem 3" — the one-line context most screens repeat. */
export function courseHint(branch: string, sem: number): string {
  return sem > 0 ? `${shortBranchName(branch)} · Sem ${sem}` : shortBranchName(branch);
}
