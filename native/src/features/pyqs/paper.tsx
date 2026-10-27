/**
 * One paper, rendered as native text.
 *
 * The site publishes structured questions inside a large server-rendered
 * subject page; `loadPaper` fetches that page once per subject and keeps the
 * parsed papers (~9 KB) on the device, so reopening one — online or off — is a
 * single storage read. A paper the parser cannot read
 * is not a dead end: the page itself opens in the WebView (`pyqs.site`), and
 * the subject's syllabus is one tap away.
 *
 * Two framework facts shape the code below:
 *
 * 1. A component body runs once, so anything that can arrive after the first
 *    paint (the parsed paper, the question count, the instructions) is read in
 *    a JSX binding or a `computed`, never into a variable above the JSX.
 * 2. A list cell is reused for other rows, so every row is rebuilt from
 *    `Cell` instead of reading `row()` once into a variable.
 */

import { List, Scroll, Text, View, WebView, computed, effect, signal, cleanup, type YNode } from "nsh";
import type { Nav, RouteDef, RouteParams } from "../../app/router";
import { param } from "../../app/router";
import {
  Badge,
  Body,
  Btn,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Label,
  Loading,
  Muted,
  Screen,
  SectionHeader,
} from "../../ui";
import { openExternal } from "../../lib/link";
import { NetError } from "../../lib/net";
import { type PaperTarget, type ParsedPaper, type ParsedQuestion } from "./paper-parse";
import { errorMessage, loadPaper, paperPageUrl } from "./api";
import {
  findPaper,
  findSubject,
  findSubjectBySlug,
  paperLabel,
  shortBranchName,
  type CatalogPaper,
  type CatalogSubject,
} from "./catalog";
import { Cell, PdfYearRow, QuestionCard, SectionTitle, readableText, sectionLabel } from "./components";
import { PdfScreen } from "./gate";
import { NativePdfScreen, usesNativePdf } from "../notes/native-pdf";
import {
  openPdfPaper,
  pdfForPaper,
  pdfPapersFor,
  pdfYearLabel,
  type PdfPaper,
} from "./pdf-index";
import { rememberPaper } from "./state";

interface Loaded {
  phase: "loading" | "ready" | "error";
  paper: ParsedPaper | null;
  error: string;
  /** HTTP status behind `error`, 0 when the failure was not an HTTP one. */
  status: number;
}


/** One line of the reading list: a section heading, then its questions. */
type PaperRow =
  | { kind: "section"; key: string; section: number; title: string; marks: number | null; count: number }
  | { kind: "question"; key: string; question: ParsedQuestion; number: number };

/** A section heading and the row it starts at — the jump rail's data. */
interface Jump {
  key: string;
  label: string;
  title: string;
  row: number;
}

/** The part of a `List` ref this screen uses: bring a row to the top. */
interface ListScroller {
  scrollToIndex(options: { index: number; animated?: boolean; viewPosition?: number }): void;
}

/**
 * The gap the list keeps between rows (`gap-2` on `contentClass`). A pinned
 * section band is pulled up by exactly that much, so the gap above it cannot
 * show the question sliding underneath; the band's own top padding survives.
 */
const STICKY_GAP = 8;

function targetFromParams(params: RouteParams): PaperTarget {
  const year = Number(params.year ?? 0) || 0;
  const variant = String(params.variant ?? "");
  return {
    id: String(params.id ?? "") || `${year}${variant ? `_${variant}` : ""}`,
    code: String(params.code ?? ""),
    year,
    variant,
    title: String(params.title ?? ""),
  };
}

function subjectFromParams(params: RouteParams): CatalogSubject | undefined {
  const slug = String(params.slug ?? "");
  const branch = String(params.branch ?? "");
  const sem = Number(params.sem ?? 0);
  if (branch && sem > 0) {
    const exact = findSubject(branch, sem, slug);
    if (exact) return exact;
  }
  return findSubjectBySlug(slug)[0];
}

function catalogPaper(subject: CatalogSubject | undefined, target: PaperTarget): CatalogPaper | undefined {
  if (!subject) return undefined;
  return findPaper(subject, target.code, target.year, target.variant, target.id, target.title);
}

/** A PDF is offered only when there is a real one to open. */
function pdfLink(value: string): string {
  return /^https?:\/\//i.test(value) ? value : "";
}

/**
 * The parsed paper as one list: a heading per section, then its numbered
 * questions. Question numbers run through the paper, so a question keeps its
 * place even when the site numbers the sections itself.
 */
function outline(paper: ParsedPaper | null): PaperRow[] {
  const rows: PaperRow[] = [];
  if (!paper) return rows;
  let number = 0;
  paper.sections.forEach((section, index) => {
    if (!section.title && section.questions.length === 0) return;
    rows.push({
      kind: "section",
      key: `s-${index}`,
      section: index,
      title: section.title,
      marks: section.marks,
      count: section.questions.length,
    });
    section.questions.forEach((question, at) => {
      number += 1;
      rows.push({ kind: "question", key: `q-${index}-${at}`, question, number });
    });
  });
  return rows;
}

function jumpList(rows: PaperRow[]): Jump[] {
  const out: Jump[] = [];
  rows.forEach((row, at) => {
    if (row.kind !== "section") return;
    out.push({ key: row.key, label: sectionLabel(row.title, row.section), title: row.title, row: at });
  });
  return out;
}

/**
 * What the site did and did not publish, in the student's words. A paper that
 * is on the page but has no readable questions is not the same as a paper the
 * page does not have, is not the same as a subject with no page at all — and
 * the screen says which one happened, because each one has its own next step.
 */
function missingCopy(
  paper: ParsedPaper | null,
  year: number,
  pdf: string,
  hasPage: boolean,
): { title: string; hint: string } {
  if (!hasPage) {
    return {
      title: "This subject has no paper page yet",
      hint: `The site publishes papers one subject at a time. The syllabus is still here.${
        pdf ? " The PDF copy is below." : ""
      }`,
    };
  }
  if (paper && paper.found) {
    const found: string[] = [];
    if (paper.title) found.push(`“${paper.title}”`);
    if (paper.fullMarks) found.push(`${paper.fullMarks} marks`);
    if (paper.instructions.length > 0) {
      found.push(`${paper.instructions.length} instruction${paper.instructions.length === 1 ? "" : "s"}`);
    }
    const seen =
      found.length > 0
        ? `Found ${found.join(", ")} — no question text.`
        : "The paper block is on the page, but it is empty.";
    return {
      title: "No questions could be read on this paper",
      hint: `${seen}${pdf ? " The PDF copy is below." : " The site draws it in a way the app cannot read."}`,
    };
  }
  return {
    title: "This paper is not on the subject page",
    hint: `${
      year > 0
        ? `The site's page for this subject has no ${year} paper`
        : "The site's page for this subject has no such paper"
    }${pdf ? "; the PDF copy is below." : "."}`,
  };
}

/**
 * The paper's identity and its rules: what it is, how long it ran, what it is
 * worth, and what the examiner asked of the student. Read through `state` so
 * the card fills in when the parse lands.
 */
function PaperHeader(props: {
  state: () => Loaded;
  subject: CatalogSubject | undefined;
  meta: CatalogPaper | undefined;
  target: PaperTarget;
  fallbackName: string;
  pdf: string;
  onPdf: () => void;
}) {
  const title = computed(() => {
    const paper = props.state().paper;
    return paper?.title || props.meta?.title || props.fallbackName || props.subject?.name || "Previous year paper";
  });
  const questions = computed(() => props.state().paper?.questionCount ?? props.meta?.questions ?? 0);
  const time = computed(() => props.state().paper?.time || props.meta?.time || "");
  const fullMarks = computed(() => {
    const paper = props.state().paper;
    if (paper?.fullMarks) return paper.fullMarks;
    return props.meta && props.meta.marks > 0 ? String(props.meta.marks) : "";
  });
  const course = computed(() =>
    props.subject ? `${shortBranchName(props.subject.branch)} · Sem ${props.subject.sem}` : "",
  );
  const instructions = computed(() => props.state().paper?.instructions ?? []);

  return (
    <Card class="gap-3">
      <View class="flex-row flex-wrap items-center gap-1.5">
        <Badge tone="ember">{String(props.target.year || "—")}</Badge>
        {props.target.variant ? <Badge tone="amber">{props.target.variant.toUpperCase()}</Badge> : null}
        {props.target.code && props.target.code !== "---" ? <Badge tone="neutral">{props.target.code}</Badge> : null}
        <Badge tone="mint">{`${questions()} question${questions() === 1 ? "" : "s"}`}</Badge>
      </View>

      <Text class="text-[20px] font-bold leading-7 tracking-tight text-foreground">{title()}</Text>

      <View class="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {time() ? <Muted>{`Time ${time()}`}</Muted> : null}
        {fullMarks() ? <Muted>{`Full marks ${fullMarks()}`}</Muted> : null}
        {course() ? <Muted>{course()}</Muted> : null}
      </View>

      <If when={instructions().length > 0}>
        <View class="gap-1.5">
          <Label>Instructions</Label>
          <Each of={instructions()} key="index">
            {(line, index) => (
              <View class="flex-row items-start gap-2">
                <Text class="w-4 shrink-0 text-[11px] font-semibold tabular-nums leading-5 text-muted-foreground">
                  {`${index() + 1}.`}
                </Text>
                <Text class="flex-1 text-[12px] leading-5 text-muted-foreground">{readableText(line())}</Text>
              </View>
            )}
          </Each>
        </View>
      </If>

      {props.pdf ? (
        <View class="flex-row gap-2">
          <Btn variant="secondary" onPress={props.onPdf} label="Open the PDF of this paper">
            Open PDF
          </Btn>
        </View>
      ) : null}
    </Card>
  );
}

/** The screen when there is no question list: loading, failed, or nothing read. */
function Fallback(props: {
  state: () => Loaded;
  subject: CatalogSubject | undefined;
  meta: CatalogPaper | undefined;
  target: PaperTarget;
  fallbackName: string;
  pdf: string;
  pdfs: PdfPaper[];
  onRetry: () => void;
  onPdf: () => void;
  onPdfPaper: (paper: PdfPaper) => void;
  onSite: () => void;
  onSyllabus: () => void;
}) {
  const title = computed(
    () => props.meta?.title || props.fallbackName || props.subject?.name || "Previous year paper",
  );
  const course = computed(() =>
    props.subject ? `${shortBranchName(props.subject.branch)} · Sem ${props.subject.sem}` : "",
  );
  // A 404 means the subject has no page at all, so opening it would only show
  // the site's own "not found". Any other failure is a page that exists but did
  // not arrive (offline, timeout), and the WebView is still worth offering.
  const hasPage = computed(() => props.state().phase === "ready" || props.state().status !== 404);
  const copy = computed(() => missingCopy(props.state().paper, props.target.year, props.pdf, hasPage()));

  /** The ways out of an unreadable paper, in the order most students want them. */
  const ways = () => (
    <View class="gap-2">
      <If when={hasPage()}>
        <Btn variant="secondary" onPress={props.onSite} label="Open this subject's papers on the site">
          Open the subject page
        </Btn>
      </If>
      {props.subject ? (
        <Btn variant="ghost" onPress={props.onSyllabus} label="Read this subject's syllabus">
          Read the syllabus
        </Btn>
      ) : null}
    </View>
  );

  return (
    <Body>
      <Card class="gap-2">
        <View class="flex-row flex-wrap items-center gap-1.5">
          <Badge tone="ember">{String(props.target.year || "—")}</Badge>
          {props.target.variant ? <Badge tone="amber">{props.target.variant.toUpperCase()}</Badge> : null}
          {props.target.code && props.target.code !== "---" ? <Badge tone="neutral">{props.target.code}</Badge> : null}
        </View>
        <Text class="text-[18px] font-bold leading-6 tracking-tight text-foreground">{title()}</Text>
        {course() ? <Muted>{course()}</Muted> : null}
      </Card>

      <If when={props.state().phase === "loading"}>
        <Loading label="Reading the paper from the site…" />
      </If>
      <If when={props.state().phase === "error"}>
        <ErrorState title="This paper did not load" message={props.state().error} onRetry={props.onRetry} />
      </If>
      <If when={props.state().phase === "ready"}>
        <EmptyState icon="file" title={copy().title} hint={copy().hint} />
      </If>

      {/* The PDF is on the device, so it is offered even when the page that
          would parse into text never arrived. */}
      <If when={props.pdfs.length > 0}>
        <View class="gap-1.5">
          <View class="flex-row items-center justify-between gap-2">
            <Label>PDFs</Label>
            <Muted class="tabular-nums">{String(props.pdfs.length)}</Muted>
          </View>
          {props.pdfs.map((paper) => (
            <PdfYearRow
              paper={paper}
              label={pdfYearLabel(paper)}
              onPress={() => props.onPdfPaper(paper)}
            />
          ))}
        </View>
      </If>
      <If when={props.pdfs.length === 0 && props.pdf !== ""}>
        <Btn variant="secondary" onPress={props.onPdf} label="Open the PDF of this paper">
          Open PDF
        </Btn>
      </If>

      {ways()}
    </Body>
  );
}

/** One paper: its heading, the jump rail, and the questions as native text. */
function PaperScreen(props: {
  nav: Nav;
  slug: string;
  target: PaperTarget;
  subject: CatalogSubject | undefined;
  meta: CatalogPaper | undefined;
  fallbackName: string;
  pdf: string;
  pdfs: PdfPaper[];
}) {
  const nav = props.nav;
  const target = props.target;
  const pdf = props.pdf;
  const attempt = signal(0);
  const state = signal<Loaded>({ phase: "loading", paper: null, error: "", status: 0 });

  const rows = computed(() => outline(state().paper));
  const sections = computed(() => jumpList(rows()));
  /** The section-heading rows: the list pins these while their questions scroll. */
  const pinned = computed(() => {
    const out: number[] = [];
    rows().forEach((row, at) => {
      if (row.kind === "section") out.push(at);
    });
    return out;
  });
  const reading = computed(() => {
    const paper = state().paper;
    return paper !== null && paper.found && paper.questionCount > 0;
  });

  let list: ListScroller | null = null;

  // The recents shelf. A body is untracked, so recording the visit here cannot
  // feed back into this screen; the shelf updates the next time it is read.
  rememberPaper({
    key: `beu|${props.slug}|${target.code}|${target.year}|${target.variant}|${target.id}|${target.title}`,
    kind: "beu",
    name: props.subject?.name || props.fallbackName || "Previous paper",
    label: paperLabel({
      code: target.code,
      year: target.year,
      variant: target.variant,
      id: target.id,
      questions: 0,
      title: target.title,
      marks: 0,
      time: "",
    }),
    code: target.code,
    year: target.year,
    variant: target.variant,
    id: target.id,
    title: target.title || props.meta?.title || "",
    slug: props.slug,
    branch: props.subject?.branch ?? "",
    sem: props.subject?.sem ?? 0,
    file: "",
  });

  effect(() => {
    void attempt(); // read: retry fetches again
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    state.set({ phase: "loading", paper: null, error: "", status: 0 });
    void loadPaper(props.slug, target).then(
      (paper) => {
        if (alive) state.set({ phase: "ready", paper, error: "", status: 200 });
      },
      (error) => {
        if (alive) {
          state.set({
            phase: "error",
            paper: null,
            error: errorMessage(error),
            status: error instanceof NetError ? error.status : 0,
          });
        }
      },
    );
  });

  const retry = () => attempt.update((value) => value + 1);
  const openPdf = () => {
    if (pdf) nav.push("pyqs.pdf", { url: pdf, title: props.subject?.name ?? "PDF" });
  };
  const openPdfFile = (paper: PdfPaper) => openPdfPaper(nav, paper, props.subject?.name ?? paper.subjectName);
  // The page the paper was read from, opened at the paper's own block when the
  // site has one. This is the way out of a paper the parser cannot read.
  const openSite = () => {
    nav.push("pyqs.site", {
      slug: props.slug,
      anchor: target.id ? `paper-${target.id}` : "",
      name: props.subject?.name || props.fallbackName || "Subject papers",
    });
  };
  const openSyllabus = () => {
    if (!props.subject) return;
    nav.push("syllabus.subject", {
      code: props.subject.code || target.code,
      branch: props.subject.branch,
      sem: props.subject.sem,
    });
  };
  const jumpTo = (row: number) => list?.scrollToIndex({ index: row, animated: true, viewPosition: 0 });

  return (
    <Screen>
      {() => (reading() ? (
        <List
          class="flex-1"
          each={rows()}
          keyExtractor={(row) => row.key}
          estimatedItemSize={180}
          contentClass="gap-2 px-4 pb-10"
          stickyHeaderIndices={pinned()}
          stickyHeaderOffset={-STICKY_GAP}
          ref={(node: unknown) => {
            list = node as ListScroller | null;
          }}
          header={
            <View class="gap-3 pb-2 pt-4">
              <PaperHeader
                state={state}
                subject={props.subject}
                meta={props.meta}
                target={target}
                fallbackName={props.fallbackName}
                pdf={pdf}
                onPdf={openPdf}
              />

              <If when={sections().length > 3}>
                <View class="gap-2">
                  <Label>Sections</Label>
                  <Scroll horizontal class="h-10" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
                    <Each of={sections()} key={(item) => item.key}>
                      {(item) => (
                        <Chip
                          onPress={() => jumpTo(item().row)}
                          label={`Jump to ${readableText(item().title).replace(/\n/g, " ")}`}
                        >
                          {item().label}
                        </Chip>
                      )}
                    </Each>
                  </Scroll>
                </View>
              </If>

              <SectionHeader title="Questions" />
            </View>
          }
          footer={<View class="h-4" />}
        >
          {(row: () => PaperRow) => (
            <Cell
              row={row}
              id={(item) => item.key}
              build={(item) =>
                item.kind === "section" ? (
                  <SectionTitle title={item.title} marks={item.marks} index={item.section} count={item.count} />
                ) : (
                  <QuestionCard
                    question={item.question}
                    index={item.number - 1}
                    context={{
                      subject: props.subject?.name ?? props.fallbackName ?? "BEU paper",
                      code: props.subject?.code ?? target.code,
                      sem: props.subject?.sem ?? 0,
                      branch: shortBranchName(props.subject?.branch ?? ""),
                      paper: props.meta?.title || props.fallbackName || props.subject?.name || "Previous year paper",
                      year: String(target.year || ""),
                    }}
                  />
                )
              }
            />
          )}
        </List>
      ) : (
        <Fallback
          state={state}
          subject={props.subject}
          meta={props.meta}
          target={target}
          fallbackName={props.fallbackName}
          pdf={pdf}
          pdfs={props.pdfs}
          onRetry={retry}
          onPdf={openPdf}
          onPdfPaper={openPdfFile}
          onSite={openSite}
          onSyllabus={openSyllabus}
        />
      ))}
    </Screen>
  );
}

function MissingPaper(props: { nav: Nav }) {
  return (
    <Screen>
      <View class="flex-1 justify-center gap-4 px-4">
        <EmptyState
          icon="file"
          title="That paper is not in the catalog"
          action="Browse papers"
          onAction={() => props.nav.replace("pyqs", {})}
        />
        <Btn variant="secondary" onPress={() => props.nav.pop()} label="Go back">
          Go back
        </Btn>
      </View>
    </Screen>
  );
}

/**
 * The subject's page on the site, in the app.
 *
 * This is the honest answer for a paper the parser cannot read: the questions
 * live in a server-rendered page, so the page itself is the fallback, opened at
 * the paper's own block (`#paper-2024`). It is the only WebView in this folder
 * besides a PDF, and it opens one host — the site the app already reads from.
 */
function SitePage(props: { nav: Nav }) {
  const slug = param(props.nav, "slug").trim();
  const name = param(props.nav, "name") || "Subject papers";
  const anchor = param(props.nav, "anchor");
  const base = slug ? paperPageUrl(slug) : "";
  const url = base && anchor ? `${base}#${anchor}` : base;
  const loading = signal(true);
  const failed = signal("");
  let view: YNode | null = null;

  const retry = () => {
    failed.set("");
    loading.set(true);
    view?.reload();
  };

  if (!url) {
    return (
      <Screen>
        <View class="flex-1 justify-center gap-4 px-4">
          <EmptyState icon="file" title="No subject to open"/>
          <Btn variant="secondary" onPress={() => props.nav.replace("pyqs", {})} label="Browse papers">
            Browse papers
          </Btn>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-card px-4 py-3">
        <View class="flex-row items-start justify-between gap-2">
          <View class="flex-1">
            <Label>On the site</Label>
            <Text class="text-[15px] font-bold leading-6 tracking-tight text-foreground" numberOfLines={2}>
              {name}
            </Text>
          </View>
          <Btn variant="ghost" onPress={() => void openExternal(url)} label="Open this page in the browser">
            Browser
          </Btn>
        </View>
        <Muted class="text-[11px]">
          The site's own page, with every year it has published for this subject.
        </Muted>
      </View>

      <If when={failed() !== ""}>
        <View class="gap-2 px-4 py-3">
          <ErrorState title="The page did not open" message={failed()} onRetry={retry} />
        </View>
      </If>

      <View class={failed() !== "" ? "h-0" : "flex-1"}>
        <WebView
          src={url}
          class="flex-1 bg-card"
          ref={(node) => {
            view = node;
          }}
          onLoadStart={() => {
            loading.set(true);
            failed.set("");
          }}
          onLoad={() => loading.set(false)}
          onError={(event) => {
            loading.set(false);
            failed.set(event?.message || "The page could not be loaded.");
          }}
        />
        {loading() && failed() === "" ? (
          <View class="absolute bottom-3 left-3 right-3 rounded-full bg-card px-3 py-2">
            <Text class="text-center text-[12px] text-muted-foreground">Loading beu.prit.eu.org…</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

export const paperRoutes: RouteDef[] = [
  {
    name: "pyqs.paper",
    title: (params) => {
      const year = Number(params.year ?? 0);
      const variant = String(params.variant ?? "");
      return year > 0 ? `${year}${variant ? ` · ${variant.toUpperCase()}` : ""}` : "Paper";
    },
    render: (nav) => {
      const slug = param(nav, "slug");
      const target = targetFromParams(nav.route.params);
      const subject = subjectFromParams(nav.route.params);
      if (!slug || !target.year) return <MissingPaper nav={nav} />;
      // The PDF of this exact paper (same year, same variant), when one was
      // downloaded. It is offered next to the text, never instead of it.
      const exact = subject ? pdfForPaper(subject, target.code, target.year, target.variant) : undefined;
      return (
        <PaperScreen
          nav={nav}
          slug={slug}
          target={target}
          subject={subject}
          meta={catalogPaper(subject, target)}
          fallbackName={param(nav, "name")}
          pdf={pdfLink(param(nav, "pdf")) || exact?.url || ""}
          pdfs={subject ? pdfPapersFor(subject) : []}
        />
      );
    },
  },
  {
    name: "pyqs.site",
    title: (params) => String(params.name ?? "Subject papers"),
    render: (nav) => <SitePage nav={nav} />,
  },
  {
    name: "pyqs.pdf",
    title: (params) => String(params.title ?? "PDF"),
    render: (nav) => {
      const url = param(nav, "url");
      if (!/^https?:\/\//i.test(url)) {
        return (
          <Screen>
            <View class="p-4">
              <EmptyState icon="paperclip" title="No file attached"/>
            </View>
          </Screen>
        );
      }
      // Android draws the pages natively and can save the file; every other
      // host keeps the WebView. The platform never changes mid-run.
      if (usesNativePdf()) {
        return (
          <NativePdfScreen
            nav={nav}
            url={url}
            title={param(nav, "title") || "PDF"}
            name={param(nav, "name") || undefined}
          />
        );
      }
      return <PdfScreen nav={nav} url={url} />;
    },
  },
];
