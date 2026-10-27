/**
 * The shelf's row pieces: one subject, its offline switch, and the two small
 * cards that sit above the list. Split out of `browse.tsx` so the screen keeps
 * the list and the filters, and a row can be read (and changed) on its own.
 */

import { Text, View, signal } from "nsh";
import { Badge, Btn, Label, Muted } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import {
  latestYearOf,
  shortBranchName,
  type CatalogPaper,
  type CatalogSubject,
} from "./catalog";
import { openPdfPaper, pdfPapersFor, pdfYearLabel, type PdfPaper } from "./pdf-index";
import { prefetchSubject, readPapers } from "./api";
import { PaperRow, PdfYearRow } from "./components";

function codesOf(subject: CatalogSubject): string {
  const codes = subject.codes.filter((code) => code && code !== "---");
  return codes.length > 0 ? codes.join(" · ") : shortBranchName(subject.branch);
}

function courseLine(subject: CatalogSubject): string {
  const parts: string[] = [codesOf(subject)];
  if (subject.type === "lab") parts.push("Lab");
  if (subject.credits > 0) parts.push(`${subject.credits} credits`);
  return parts.join(" · ");
}

/**
 * One syllabus subject. A row with papers expands in place; a row without
 * papers stays a calm neutral row and opens the syllabus, because the code is
 * still the thing the student came for.
 *
 * "Papers" here means both halves of the archive: the structured papers the
 * site published as text, and the downloaded PDFs. A subject can have either
 * one alone, so the row expands when it has any, and the two lists stay
 * visibly separate inside the panel — text first, files after.
 */
export function SubjectRow(props: {
  subject: CatalogSubject;
  showBranch: boolean;
  expanded: boolean;
  saved: boolean;
  onToggle: () => void;
  onSyllabus: () => void;
  onPaper: (paper: CatalogPaper) => void;
  onPdf: (paper: PdfPaper) => void;
  onSavedChange: () => void;
}) {
  const subject = props.subject;
  const count = subject.papers.length;
  const pdfs = pdfPapersFor(subject);
  const latest = Math.max(latestYearOf(subject), pdfs[0]?.year ?? 0);
  const hasPapers = count > 0 || pdfs.length > 0;
  const expanded = props.expanded && hasPapers;
  const code = subject.code || subject.codes[0] || "";
  const parts: string[] = [];
  if (count > 0) parts.push(`${count} paper${count === 1 ? "" : "s"}`);
  if (pdfs.length > 0) parts.push(`${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}`);
  const label = hasPapers
    ? `${subject.name}, code ${code || "unknown"}, ${parts.join(", ")}, latest ${latest}${
        props.saved ? ", saved offline" : ""
      }`
    : `${subject.name}, code ${code || "unknown"}, no papers yet. Open the syllabus.`;

  return (
    <View class="overflow-hidden rounded-3xl border border-border bg-card">
      <View
        class="min-h-11 flex-row items-start gap-3 p-3.5 active:bg-muted"
        onPress={hasPapers ? props.onToggle : props.onSyllabus}
        role="button"
        accessibilityLabel={label}
        accessibilityState={hasPapers ? { expanded } : undefined}
      >
        <View
          class={`w-12 shrink-0 items-center justify-center gap-0.5 rounded-2xl py-2 ${
            hasPapers ? "bg-primary/10" : "bg-muted"
          }`}
        >
          <Text
            class={`text-[17px] font-bold tabular-nums leading-5 ${
              hasPapers ? "text-primary-ink" : "text-foreground"
            }`}
          >
            {subject.sem}
          </Text>
          <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            sem
          </Text>
        </View>

        <View class="flex-1 gap-1">
          <Text
            class="text-[15px] font-semibold leading-5 text-foreground"
            numberOfLines={2}
          >
            {subject.name}
          </Text>
          <Text
            class="text-[12px] leading-4 text-muted-foreground"
            numberOfLines={2}
          >
            {courseLine(subject)}
          </Text>
          <View class="flex-row flex-wrap items-center gap-1.5">
            {count > 0 ? (
              <Badge tone="ember">{`${count} paper${count === 1 ? "" : "s"}`}</Badge>
            ) : null}
            {pdfs.length > 0 ? (
              <Badge tone="mint">{`${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}`}</Badge>
            ) : null}
            {props.saved ? <Badge tone="mint">Offline</Badge> : null}
            {hasPapers ? null : <Badge tone="neutral">No papers yet</Badge>}
            {hasPapers && latest > 0 ? (
              <Muted>{`latest ${latest}`}</Muted>
            ) : null}
            <If when={props.showBranch}>
              <Muted>{shortBranchName(subject.branch)}</Muted>
            </If>
            <If when={subject.legacy}>
              <Badge tone="amber">Older scheme</Badge>
            </If>
          </View>
        </View>

        <Icon
          name={hasPapers ? (expanded ? "chevron-up" : "chevron-down") : "chevron-right"}
          size={18}
          class="text-muted-foreground"
        />
      </View>

      <If when={expanded}>
        <View class="gap-1.5 border-t border-border bg-muted/40 p-2">
          {subject.papers.map((paper) => (
            <PaperRow paper={paper} onPress={() => props.onPaper(paper)} />
          ))}
          <If when={count > 0}>
            <OfflineSave slug={subject.slug} count={count} onSaved={props.onSavedChange} />
          </If>
          <If when={pdfs.length > 0}>
            <View class="gap-1.5 pt-1">
              <View class="flex-row items-center justify-between gap-2 px-1.5">
                <Label>PDFs</Label>
                <Muted class="tabular-nums">{String(pdfs.length)}</Muted>
              </View>
              {pdfs.map((paper) => (
                <PdfYearRow
                  paper={paper}
                  label={pdfYearLabel(paper)}
                  onPress={() => props.onPdf(paper)}
                />
              ))}
            </View>
          </If>
        </View>
      </If>
    </View>
  );
}

/**
 * One subject's offline switch.
 *
 * Opening a paper already caches its whole subject, but a student revising on a
 * train should not have to open each paper first. One page fetch saves every
 * paper of the subject — parsed, ~9 KB — and the row says how many are on the
 * phone. Nothing here spends data until the student taps Download.
 */
function OfflineSave(props: { slug: string; count: number; onSaved: () => void }) {
  /** Papers on the device; -1 while the first read is in flight. */
  const saved = signal(-1);
  const busy = signal(false);
  const failed = signal(false);
  let started = false;

  if (!started) {
    started = true;
    void readPapers(props.slug).then((row) => saved.set(row ? Object.keys(row.papers).length : 0));
  }

  const download = (): void => {
    if (busy()) return;
    busy.set(true);
    failed.set(false);
    void prefetchSubject(props.slug).then((papers) => {
      if (papers > 0) {
        saved.set(papers);
        busy.set(false);
        props.onSaved();
        return;
      }
      // The page could not be read — but an older copy on the phone still
      // works, so report what is actually there instead of "nothing".
      void readPapers(props.slug).then((row) => {
        const count = row ? Object.keys(row.papers).length : 0;
        saved.set(count);
        failed.set(count === 0);
        busy.set(false);
      });
    });
  };

  const has = (): boolean => saved() > 0;

  return (
    <View class="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
      <View class="flex-1 flex-row items-center gap-2">
        <Badge tone={has() ? "mint" : failed() ? "amber" : "neutral"}>
          {has() ? "Offline" : failed() ? "Failed" : "Not saved"}
        </Badge>
        <Text class="text-[12px] font-semibold text-foreground" numberOfLines={1}>
          {busy()
            ? `Saving ${props.count} paper${props.count === 1 ? "" : "s"}…`
            : has()
              ? `${saved()} paper${saved() === 1 ? "" : "s"} on this phone`
              : `${props.count} paper${props.count === 1 ? "" : "s"}`}
        </Text>
      </View>
      {has() || busy() ? null : (
        <Btn
          variant="link"
          class="px-2"
          onPress={download}
          label={`Download ${props.count} papers for offline`}
        >
          {failed() ? "Try again" : "Download"}
        </Btn>
      )}
    </View>
  );
}

/** A labelled row header above the wrapped chip rails. */
export function RowLabel(props: { label: string; value: string }) {
  return (
    <View class="flex-row items-center justify-between gap-2">
      <Label>{props.label}</Label>
      <Muted class="shrink text-right" numberOfLines={1}>
        {props.value}
      </Muted>
    </View>
  );
}

/** A compact half-width jump card for a 320pt row. */
export function CardLink(props: {
  title: string;
  hint: string;
  icon: IconName;
  tone?: "mint";
  onPress: () => void;
}) {
  return (
    <View
      class="min-h-11 flex-1 gap-1 rounded-3xl border border-border bg-card p-4 active:scale-[0.98] active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`${props.title}: ${props.hint}`}
    >
      <View
        class={`h-9 w-9 items-center justify-center rounded-xl ${
          props.tone === "mint" ? "bg-accent/12" : "bg-primary/10"
        }`}
      >
        <Icon
          name={props.icon}
          size={20}
          class={props.tone === "mint" ? "text-accent-ink" : "text-primary-ink"}
        />
      </View>
      <Text class="text-[14px] font-semibold text-foreground">
        {props.title}
      </Text>
      <Muted numberOfLines={1}>{props.hint}</Muted>
    </View>
  );
}
