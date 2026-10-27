/**
 * GATE papers and the only WebView in this feature.
 *
 * GATE publishes PDFs, not structured questions, so the viewer is a native
 * screen around a WebView. The same route shows the GATE index (`code`
 * absent), one paper's years (`code` set), or the PDF itself (`url` set),
 * which keeps the route surface small.
 *
 * The WebView is restricted to the hosts `nsh.json` allows. A link on any
 * other host is not silently loaded and blanked: the screen says which host it
 * is on and offers the link on the clipboard instead.
 */

import { List, Text, View, WebView, computed, platform, signal, type YNode } from "nsh";

import type { Nav, RouteDef } from "../../app/router";
import { param } from "../../app/router";
import {
  Badge,
  Btn,
  EmptyState,
  ErrorState,
  Label,
  Loading,
  Muted,
  Row,
  Screen,
  Search,
  SectionHeader,
  ListBar,
} from "../../ui";
import { SITE, debounce } from "../../lib/net";
import { needsRemotePdf, pdfViewSource } from "../../lib/pdf";
import { openExternal } from "../../lib/link";
import {
  findGateSubject,
  gatePaperLabel,
  gatePdfPath,
  gateSubjects,
  searchGateSubjects,
  type GatePaper,
  type GateSubject,
} from "./gate-index";
import { Cell, ChipRail, CopyButton, Head, Hero, InfoRow } from "./components";
import { rememberPaper } from "./state";

/** The hosts `nsh.json` lets the WebView open. */
const PDF_HOSTS = ["beu.prit.eu.org", "beu-bih.ac.in", "beu.ac.in"];

type PdfCheck =
  | { ok: true; host: string; url: string }
  | { ok: false; why: "empty" | "scheme" | "host"; host: string; scheme: string };

/** Reads `url` without the whole URL parser: scheme, host, and whether the
 *  WebView may open it. Subdomains of an allowed host are allowed. */
function inspectPdf(raw: string): PdfCheck {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, why: "empty", host: "", scheme: "" };
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(text);
  if (!match) return { ok: false, why: "empty", host: "", scheme: "" };
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase().replace(/^[^@]*@/, "").replace(/:\d+$/, "");
  if (scheme !== "https" && scheme !== "http") return { ok: false, why: "scheme", host, scheme };
  const allowed = PDF_HOSTS.some((root) => host === root || host.endsWith(`.${root}`));
  if (!allowed) return { ok: false, why: "host", host, scheme };
  return { ok: true, host, url: text };
}

/* ------------------------------------------------------------------- viewer */

function PdfProblem(props: { nav: Nav; check: Extract<PdfCheck, { ok: false }>; raw: string }) {
  const host = props.check.host;
  const title =
    props.check.why === "host"
      ? "This PDF is on another site"
      : props.check.why === "scheme"
        ? "That is not a web link"
        : "No file was attached";
  const hint =
    props.check.why === "host"
      ? `The file lives on ${host}. The app's reader opens BEU hosts only: ${PDF_HOSTS.join(", ")}.`
      : props.check.why === "scheme"
        ? `The app opens http and https pages only; this link is ${props.check.scheme}://.`
        : "This screen was opened without a PDF address. Pick a paper from the GATE list.";

  return (
    <Screen>
      <View class="gap-4 p-4">
        <Head label="PDF" title={title} hint={hint} />
        <View class="gap-2 rounded-3xl border border-border bg-muted p-3.5">
          <Label>Link</Label>
          <Text class="text-[11px] leading-4 text-muted-foreground" selectable>
            {props.raw || "(empty)"}
          </Text>
        </View>
        <Row class="flex-wrap gap-2">
          {props.raw ? <CopyButton text={props.raw} label="Copy link" /> : null}
          <Btn variant="ghost" onPress={() => props.nav.pop()} label="Go back">
            Go back
          </Btn>
        </Row>
        <Btn variant="secondary" onPress={() => props.nav.replace("pyqs.gate", {})} label="GATE library">
          GATE library
        </Btn>
      </View>
    </Screen>
  );
}

function PdfViewer(props: { nav: Nav; url: string; host: string }) {
  const title = param(props.nav, "title") || "PDF";
  const subtitle = param(props.nav, "subtitle");
  const file = param(props.nav, "file");
  const loading = signal(true);
  const failed = signal("");
  const remote = needsRemotePdf(platform.os);
  // Android's WebView cannot paint a PDF; the file is handed to Google's
  // viewer, which renders it server-side and returns HTML.
  const source = pdfViewSource(props.url, platform.os);
  let view: YNode | null = null;

  const retry = () => {
    failed.set("");
    loading.set(true);
    view?.reload();
  };

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-card px-4 pb-3 pt-4">
        <Head label={`PDF · ${props.host}`} title={title} hint={file || subtitle || props.url} />
        <Row class="flex-wrap gap-2">
          <CopyButton text={props.url} label="Copy link" />
          {remote ? (
            <Btn variant="secondary" onPress={() => void openExternal(props.url)} label="Open this PDF in the browser">
              Browser
            </Btn>
          ) : null}
          <Btn variant="ghost" onPress={() => props.nav.push("pyqs.gate", {})} label="GATE library">
            GATE library
          </Btn>
        </Row>
      </View>

      <If when={loading() && failed() === ""}>
        <View class="gap-1.5 px-4 py-3">
          <View class="h-1 w-full overflow-hidden rounded-full bg-muted">
            <View class="h-1 w-1/3 rounded-full bg-primary animate-pulse" />
          </View>
          <Muted>{`Opening the file from ${props.host}…`}</Muted>
        </View>
      </If>

      <If when={failed() !== ""}>
        <View class="gap-2 px-4 py-3">
          <ErrorState title="The PDF did not open" message={failed()} onRetry={retry} />
          <Muted>If the device has no PDF viewer, copy the link and open it on a computer.</Muted>
        </View>
      </If>

      {/* Keep the WebView mounted so Retry can reload it, but take it out of
          the layout while the error state is up. */}
      <View class={failed() !== "" ? "h-0" : "flex-1"}>
        <WebView
          src={source}
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
            failed.set(event?.message || "The file could not be loaded.");
          }}
        />
      </View>
    </Screen>
  );
}

export function PdfScreen(props: { nav: Nav; url: string }) {
  const check = inspectPdf(props.url);
  if (!check.ok) return <PdfProblem nav={props.nav} check={check} raw={props.url} />;
  return <PdfViewer nav={props.nav} url={check.url} host={check.host} />;
}

/* ------------------------------------------------------------------- papers */

function gateRemember(nav: Nav, subject: GateSubject, paper: GatePaper): void {
  rememberPaper({
    key: `gate|${subject.code}|${paper.year}|${paper.variant}`,
    kind: "gate",
    name: subject.name,
    label: gatePaperLabel(paper),
    code: subject.code,
    year: paper.year,
    variant: paper.variant,
    id: "",
    title: "",
    slug: `gate-pyqs/${subject.code}`,
    branch: "",
    sem: 0,
    file: gatePdfPath(paper),
  });
}

function openGatePaper(nav: Nav, subject: GateSubject, paper: GatePaper): void {
  gateRemember(nav, subject, paper);
  nav.push("pyqs.gate", {
    url: `${SITE}${gatePdfPath(paper)}`,
    title: `${subject.code} · ${gatePaperLabel(paper)}`,
    subtitle: subject.name,
    label: gatePaperLabel(paper),
    code: subject.code,
    year: paper.year,
    variant: paper.variant,
    file: gatePdfPath(paper),
  });
}

function GateSubjectScreen(props: { nav: Nav; subject: GateSubject }) {
  const subject = props.subject;
  const year = signal<number | null>(null);
  const papers = computed(() =>
    subject.papers
      .slice()
      .sort((left, right) => right.year - left.year || right.variant.localeCompare(left.variant))
      .filter((paper) => year() === null || paper.year === year()),
  );
  const years = [...new Set(subject.papers.map((paper) => paper.year))].sort((left, right) => right - left);
  const newest = years[0] ?? 0;
  const oldest = years[years.length - 1] ?? 0;

  return (
    <Screen>
      {() => (
        <List
          class="flex-1"
        each={papers()}
        keyExtractor={(paper) => `${paper.year}|${paper.variant}|${paper.file}`}
        estimatedItemSize={80}
        contentClass="gap-2 px-4 pb-10"
        empty={
          <EmptyState
            icon="calendar-x"
            title="No paper in this year"
            hint="Show every year instead."
            action="All years"
            onAction={() => year.set(null)}
          />
        }
        header={
          <View class="gap-4 pb-2 pt-4">
            <Head
              label={`GATE · ${subject.code}`}
              title={subject.name}
              hint={`${subject.papers.length} PDF${subject.papers.length === 1 ? "" : "s"} · ${oldest}–${newest} · hosted on beu.prit.eu.org`}
            />
            <ChipRail
              label="Year"
              note={year() === null ? "All years" : String(year())}
              value={year() === null ? "all" : String(year())}
              options={[
                { key: "all", label: "All" },
                ...years.map((value) => ({ key: String(value), label: String(value) })),
              ]}
              onSelect={(key) => year.set(key === "all" ? null : Number(key))}
            />
            <SectionHeader title="Papers" trailing={<Badge tone="mint">{`${papers().length} shown`}</Badge>} />
          </View>
        }
        footer={<View class="h-4" />}
      >
        {(paper: () => GatePaper) => (
          <Cell
            row={paper}
            id={(item) => `${item.year}|${item.variant}|${item.file}`}
            build={(item) => (
              <InfoRow
                lead={String(item.year)}
                leadHint={item.variant || undefined}
                tone="mint"
                title={`${item.year} question paper${item.variant ? ` · ${item.variant.toUpperCase()}` : ""}`}
                subtitle={item.file}
                trailing="PDF"
                onPress={() => openGatePaper(props.nav, subject, item)}
                label={`${gatePaperLabel(item)} PDF`}
              />
            )}
          />
        )}
      </List>
      )}
    </Screen>
  );
}

function GateIndex(props: { nav: Nav; initialQuery: string }) {
  const field = signal(props.initialQuery);
  const query = signal(props.initialQuery.trim());
  const commit = debounce((value: string) => query.set(value.trim()), 180);
  const subjects = computed(() => searchGateSubjects(query()));
  const total = gateSubjects().length;

  const reset = () => {
    field.set("");
    query.set("");
  };

  return (
    <Screen>
      {() => <ListBar title="GATE papers" meta={`${subjects().length} of ${total}`} />}
      {() => (
        <List
          class="flex-1"
        each={subjects()}
        keyExtractor={(subject) => subject.code}
        estimatedItemSize={88}
        contentClass="gap-2 px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        empty={
          <EmptyState
            icon="search"
            title="No GATE paper matched"
            hint="The index searches every paper code and its name."
            action="Clear search"
            onAction={reset}
          />
        }
        header={
          <View class="gap-4 pb-2 pt-4">
            <Hero>
              <View class="gap-2">
                <Label>GATE · Graduate Aptitude Test</Label>
                <Text class="text-[28px] font-bold leading-8 tracking-tight text-foreground">
                  GATE papers,{"\n"}every branch.
                </Text>
              </View>
            </Hero>
            <Search
              value={field()}
              onChange={(value) => {
                field.set(value);
                commit(value);
              }}
              placeholder="Paper code or name"
            />
            <SectionHeader title="Paper codes" trailing={<Badge tone="mint">{`${subjects().length} of ${total}`}</Badge>} />
          </View>
        }
        footer={<View class="h-4" />}
      >
        {(subject: () => GateSubject) => (
          <Cell
            row={subject}
            id={(item) => item.code}
            build={(item) => {
              const newest = item.papers.reduce((max, paper) => Math.max(max, paper.year), 0);
              const oldest = item.papers.reduce(
                (min, paper) => (min === 0 ? paper.year : Math.min(min, paper.year)),
                0,
              );
              return (
                <InfoRow
                  lead={item.code}
                  tone="mint"
                  title={item.name}
                  subtitle={`${item.papers.length} papers · ${oldest}–${newest}`}
                  chips={<Badge tone="mint">PDF</Badge>}
                  onPress={() => props.nav.push("pyqs.gate", { code: item.code })}
                  label={`${item.name}, ${item.papers.length} papers`}
                />
              );
            }}
          />
        )}
      </List>
      )}
    </Screen>
  );
}

function GateUnknown(props: { nav: Nav; code: string }) {
  return (
    <Screen>
      <View class="flex-1 justify-center gap-4 px-4">
        <EmptyState
          icon="file"
          title={`No GATE paper code “${props.code}”`}
          hint={`The library has ${gateSubjects().length} codes. Search the index or pick a code from the list.`}
          action="All GATE papers"
          onAction={() => props.nav.replace("pyqs.gate", {})}
        />
        <Btn variant="ghost" onPress={() => props.nav.pop()} label="Go back">
          Go back
        </Btn>
      </View>
    </Screen>
  );
}

function GateScreen(props: { nav: Nav }) {
  const url = param(props.nav, "url");
  if (url) return <PdfScreen nav={props.nav} url={url} />;
  const code = param(props.nav, "code").trim();
  if (code) {
    const subject = findGateSubject(code);
    if (subject) return <GateSubjectScreen nav={props.nav} subject={subject} />;
    return <GateUnknown nav={props.nav} code={code} />;
  }
  return <GateIndex nav={props.nav} initialQuery={param(props.nav, "q")} />;
}

export const gateRoutes: RouteDef[] = [
  {
    name: "pyqs.gate",
    title: (params) => {
      if (String(params.url ?? "")) return String(params.title ?? "PDF");
      const subject = findGateSubject(String(params.code ?? ""));
      return subject ? subject.name : "GATE papers";
    },
    render: (nav) => <GateScreen nav={nav} />,
  },
];
