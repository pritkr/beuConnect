/**
 * Results area — shared pieces. Everything here is composed from the app's
 * design system so the five screens read as one product.
 *
 * Three rules shape this file:
 *
 * 1. Colour is never the only cue. A winner is bold *and* labelled; a delta
 *    carries its sign and its side ("A +10").
 * 2. Numbers are tabular and right-aligned; names get two lines; a reg number
 *    never wraps mid-digit.
 * 3. Copy stays short. A sentence that needs more than one line on a 320 pt
 *    phone is split into two sentences.
 */

import { Text, View } from "nsh";
import type { Children } from "../../ui";
import { Badge, Card, Chip, Divider, Label, Mono, Muted, Panel, Progress, Row, Skeleton, Subtitle } from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import { NetError, formatDate } from "../../lib/net";
import type { BranchDef, ResultSource, ResultSubject, RankRow } from "./data";
import { branchShort, fixed } from "./data";
import { shortCollegeName } from "./colleges";
import { rankNumeral } from "./ranking";
import type { Trend } from "./trend";
import { trendProvenance, trendSpoken, trendSummary } from "./trend";

/* ------------------------------------------------------------------ failure */

export type FailureKind = "offline" | "server" | "missing" | "unknown";

/**
 * Why a result load failed, in the four shapes a screen can answer for.
 * BEU's server is the usual suspect: it answers 502/530 for a live lookup and
 * gates the rest behind a captcha.
 */
export function failureKind(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const status = error instanceof NetError ? error.status : 0;
  if (/captcha|recaptcha|token|blocked|forbidden/i.test(message)) return "server";
  if (status >= 500 || status === 403 || status === 429) return "server";
  if (status === 404 || status === 400) return "missing";
  if (status === 0) return /server|busy|unexpected/i.test(message) ? "server" : "offline";
  return "unknown";
}

/* -------------------------------------------------------------------- maths */

/** % of ranked students this student is ahead of: 0 (last) to 100 (first). */
export function aheadOf(rank: number | null, total: number): number {
  if (rank === null || rank <= 0 || total <= 0) return 0;
  if (total <= 1) return 100;
  return Math.round(((total - rank) / (total - 1)) * 1000) / 10;
}

/** The share of the list at or above this rank, e.g. 3 for rank 3 of 100. */
export function topShare(rank: number | null, total: number | null): number | null {
  if (rank === null || rank <= 0 || total === null || total <= 0) return null;
  return Math.max(1, Math.round((rank / total) * 100));
}

/** `97.5` → `"97.5"`, `100` → `"100"`. */
export function percentText(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/* ---------------------------------------------------------------- pickers */

function Chips(props: { label?: string; hint?: string; children?: Children; class?: string }) {
  return (
    <View class={`gap-2 ${props.class ?? ""}`}>
      {props.label ? <Label>{props.label}</Label> : null}
      <View class="flex-row flex-wrap gap-2">{props.children}</View>
      {props.hint ? <Muted class="text-[11px] leading-4">{props.hint}</Muted> : null}
    </View>
  );
}

export function SemChips(props: {
  value: number;
  onChange: (sem: number) => void;
  available?: number[];
  label?: string;
  hint?: string;
}) {
  const available = props.available ?? [];
  return (
    <Chips label={props.label ?? "Semester"} hint={props.hint}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => {
        const off = available.length > 0 && available.indexOf(sem) < 0;
        return (
          <Chip
            active={props.value === sem}
            onPress={off ? undefined : () => props.onChange(sem)}
            class={off ? "opacity-30" : ""}
          >
            {String(sem)}
          </Chip>
        );
      })}
    </Chips>
  );
}

export function BranchChips(props: {
  value: string;
  branches: BranchDef[];
  onChange: (code: string) => void;
  label?: string;
}) {
  return (
    <Chips label={props.label ?? "Branch"}>
      {props.branches.map((branch) => (
        <Chip active={props.value === branch.code} onPress={() => props.onChange(branch.code)}>
          {branch.short}
        </Chip>
      ))}
    </Chips>
  );
}

export function BatchChips(props: { value: string; batches: string[]; onChange: (batch: string) => void }) {
  return (
    <Chips label="Batch">
      {props.batches.map((batch) => (
        <Chip active={props.value === batch} onPress={() => props.onChange(batch)}>
          {`20${batch}–${2000 + Number(batch) + 4}`}
        </Chip>
      ))}
    </Chips>
  );
}

export type RankScope = "branch" | "college";

/**
 * Which standing the screen shows: the whole university branch table, or only
 * the student's college inside it. The caller wraps this in `Fresh`: the kit's
 * `Chip` reads `active` once, when the strip is built.
 */
export function ScopeChips(props: {
  value: RankScope;
  onChange: (scope: RankScope) => void;
  collegeLabel?: string;
}) {
  return (
    <Chips label="Rank within">
      <Chip active={props.value === "branch"} onPress={() => props.onChange("branch")}>
        University
      </Chip>
      <Chip active={props.value === "college"} onPress={() => props.onChange("college")}>
        {props.collegeLabel || "My college"}
      </Chip>
    </Chips>
  );
}

/* ----------------------------------------------------------------- status */

const SOURCE_TEXT: Record<ResultSource, { label: string; tone: "mint" | "amber" | "neutral" }> = {
  live: { label: "Live from BEU", tone: "mint" },
  cache: { label: "Saved copy", tone: "amber" },
  csv: { label: "Published table", tone: "neutral" },
};

/** Where the numbers on this screen came from, in plain language. */
export function SourceNote(props: { source: ResultSource; savedAt: number; class?: string }) {
  const meta = SOURCE_TEXT[props.source];
  const when = props.savedAt ? formatDate(props.savedAt) : "";
  const note =
    props.source === "live"
      ? "Fetched from the BEU result server just now."
      : props.source === "cache"
        ? `BEU could not be reached, so this is the copy saved here on ${when}.`
        : "BEU's published semester table. It has the marks, not the paper names.";
  return (
    <Panel tone={props.source === "live" ? "mint" : props.source === "cache" ? "amber" : "plain"} class={props.class}>
      <Row class="gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {when && props.source !== "cache" ? <Muted class="text-[11px]">{when}</Muted> : null}
      </Row>
      <Subtitle class="mt-1 text-[12px] leading-5">{note}</Subtitle>
    </Panel>
  );
}

/* ---------------------------------------------------------------- subjects */

function gradeTone(grade: string): "mint" | "amber" | "ember" | "neutral" {
  const value = grade.toUpperCase();
  if (value === "F" || value === "FAIL") return "ember";
  if (value === "A+" || value === "A" || value === "O") return "mint";
  if (value === "B+" || value === "B") return "neutral";
  return "amber";
}

/**
 * The marks table. Five fields, fixed columns, no horizontal scroll at 320 pt:
 * the paper name and its code on the left, then credits, grade and total in a
 * 28 / 40 / 36 pt gutter. The header is part of the card because this table
 * lives inside a scrolling page, not inside a virtualized list.
 */
export function SubjectRows(props: { subjects: ResultSubject[]; class?: string }) {
  return (
    <View class={`overflow-hidden rounded-3xl border border-border bg-card ${props.class ?? ""}`} testID="marks-table">
      <View class="flex-row items-center gap-2 border-b border-border bg-muted px-4 py-2">
        <Text class="flex-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Paper</Text>
        <Text class="w-7 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cr</Text>
        <Text class="w-10 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Grade
        </Text>
        <Text class="w-9 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Total
        </Text>
      </View>

      {props.subjects.map((subject, index) => {
        const failed = subject.grade.toUpperCase() === "F";
        const label = [
          subject.name || `Paper ${subject.code}`,
          subject.code ? `code ${subject.code}` : "",
          subject.credit ? `${subject.credit} credits` : "credits not published",
          subject.grade ? `grade ${subject.grade}` : "grade not published",
          subject.total ? `total ${subject.total}` : "total not published",
        ]
          .filter((part) => part !== "")
          .join(", ");
        return (
          <View>
            <View
              class={`gap-1 px-4 py-3 ${failed ? "bg-destructive/10" : ""}`}
              accessibilityLabel={label}
            >
              <View class="flex-row items-center gap-2">
                <View class="flex-1 gap-0.5">
                  <Text class="text-[13px] font-semibold leading-4 text-foreground" numberOfLines={2}>
                    {subject.name || (subject.code ? `Paper ${subject.code}` : "Paper")}
                  </Text>
                  {subject.code ? (
                    <Mono class="text-[10px] leading-4 text-muted-foreground">{subject.code}</Mono>
                  ) : null}
                </View>
                <View class="w-7 items-end">
                  <Text class="text-[12px] tabular-nums text-foreground" numberOfLines={1}>
                    {subject.credit || "—"}
                  </Text>
                </View>
                <View class="w-10 items-end">
                  <Badge tone={gradeTone(subject.grade)}>{subject.grade || "—"}</Badge>
                </View>
                <View class="w-9 items-end">
                  <Text
                    class={`text-[14px] tabular-nums ${failed ? "font-bold text-destructive" : "font-semibold text-foreground"}`}
                    numberOfLines={1}
                  >
                    {subject.total || "—"}
                  </Text>
                </View>
              </View>
              <View class="flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
                <Muted class="text-[10px] leading-4 tabular-nums">{`ESE ${subject.ese || "—"}`}</Muted>
                <Muted class="text-[10px] leading-4 tabular-nums">{`IA ${subject.ia || "—"}`}</Muted>
                <Muted class="text-[10px] leading-4">
                  {subject.kind === "practical" ? "Practical" : "Theory"}
                </Muted>
                {failed ? (
                  <Text class="text-[10px] font-semibold leading-4 text-destructive">Backlog</Text>
                ) : null}
              </View>
            </View>
            {index < props.subjects.length - 1 ? <Divider class="ml-4" /> : null}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ trend */

/**
 * The eight-semester SGPA journey, drawn with native views. Every bar carries
 * its number, so the shape is never the only cue; the active semester is ember
 * and bold, a copy saved on this phone is a lighter ember, and BEU's own
 * history is the teal series. Values come from `trend.ts` — nothing is
 * interpolated and an unknown semester stays a hairline.
 *
 * The parent rebuilds this through `Fresh` when the trend changes, so the whole
 * model is passed in as a plain value.
 */
export function SgpaTrend(props: { trend: Trend; active: number; class?: string }) {
  const trend = props.trend;
  return (
    <View
      class={`gap-3 ${props.class ?? ""}`}
      testID="sgpa-trend"
      accessibilityLabel={trendSpoken(trend)}
    >
      <View class="flex-row items-end gap-1" style={{ height: 96 }}>
        {trend.points.map((point) => {
          const active = point.sem === props.active;
          const known = point.value !== null;
          const tall = known ? Math.max(10, Math.round(((point.value as number) / 10) * 58)) : 3;
          const fill = !known
            ? "bg-border"
            : active
              ? "bg-primary"
              : point.source === "saved"
                ? "bg-primary/45"
                : "bg-chart-2";
          return (
            <View class="flex-1 items-center justify-end gap-1">
              <Text
                class={`text-[9px] leading-3 tabular-nums ${
                  active ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                numberOfLines={1}
              >
                {known ? fixed(point.value as number) : "—"}
              </Text>
              <View class={`w-full rounded-t-[4px] ${fill}`} style={{ height: tall }} />
              <Text
                class={`text-[10px] leading-3 tabular-nums ${
                  active ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
                numberOfLines={1}
              >
                {String(point.sem)}
              </Text>
            </View>
          );
        })}
      </View>

      <View class="gap-1">
        <Text class="text-[12px] font-medium leading-4 text-foreground">{trendSummary(trend)}</Text>
        {trendProvenance(trend) ? (
          <Muted class="text-[10px] leading-4">{trendProvenance(trend)}</Muted>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- rows */

/** A rank as a filled badge for the podium, a plain numeral for everyone else. */
export function RankMedal(props: { rank: number | null; tied?: number; class?: string }) {
  const rank = props.rank ?? 0;
  const tone =
    rank === 1
      ? "bg-chart-3/25 border-chart-3/40"
      : rank === 2
        ? "bg-muted border-border"
        : rank === 3
          ? "bg-primary/15 border-primary/30"
          : "bg-muted border-border";
  return (
    <View class={`h-9 w-9 items-center justify-center rounded-full border ${tone} ${props.class ?? ""}`}>
      <Text class="text-[12px] font-bold tabular-nums text-foreground">{rankNumeral(props.rank, props.tied ?? 1)}</Text>
    </View>
  );
}

/** A compact student row for the result table and merit list. */
export function StudentRowView(props: {
  row: RankRow;
  /** How many students share this row's rank; 1 when the place is unique. */
  tied?: number;
  showCollege?: boolean;
  showSgpa?: boolean;
  highlight?: boolean;
  onPress?: () => void;
}) {
  const row = props.row;
  const rank = row.rank;
  const tied = props.tied ?? 1;
  const place =
    rank === null
      ? "not ranked, no CGPA"
      : tied > 1
        ? `rank ${rank}, shared by ${tied} students`
        : `rank ${rank}`;
  const label = `${row.name || row.reg}, ${place}, CGPA ${row.cgpaText}${props.highlight ? ", your row" : ""}`;
  return (
    <View
      class={`flex-row items-center gap-3 px-4 py-3 active:bg-muted ${props.highlight ? "bg-primary/8" : "bg-card"}`}
      onPress={props.onPress}
      role={props.onPress ? "button" : undefined}
      accessibilityLabel={label}
    >
      {rank !== null && rank <= 3 ? (
        <RankMedal rank={rank} tied={tied} />
      ) : (
        <View class="w-9 items-center">
          <Text class="text-[15px] font-bold tabular-nums text-foreground">{rankNumeral(rank, tied)}</Text>
        </View>
      )}

      <View class="flex-1 gap-0.5">
        <Row class="gap-2">
          <Text class="flex-1 text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
            {row.name}
          </Text>
          {props.highlight ? <Badge tone="ember">You</Badge> : null}
        </Row>
        <Row class="gap-2">
          <Mono class="shrink-0 text-[11px] text-muted-foreground" numberOfLines={1}>
            {row.reg}
          </Mono>
          {props.showCollege ? (
            <Text class="flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
              {shortCollegeName(row.collegeCode)}
            </Text>
          ) : null}
          {tied > 1 ? <Muted class="text-[10px]">{`=${rank}`}</Muted> : null}
        </Row>
      </View>

      {props.showSgpa ? (
        <View class="w-11 items-end gap-0.5">
          <Text class="text-[13px] font-semibold tabular-nums text-foreground" numberOfLines={1}>
            {row.sgpaText}
          </Text>
          <Muted class="text-[10px]">SGPA</Muted>
        </View>
      ) : null}

      <View class="w-12 items-end gap-0.5">
        <Text class="text-[15px] font-bold tabular-nums text-foreground" numberOfLines={1}>
          {row.cgpaText}
        </Text>
        <Muted class="text-[10px]">CGPA</Muted>
      </View>
    </View>
  );
}

/**
 * One line of a head-to-head table: A on the left, the topic in the middle,
 * B on the right. The winner is bold *and* named in the delta pill, so the
 * comparison survives without colour.
 */
export function VersusRow(props: {
  label: string;
  hint?: string;
  a: string;
  b: string;
  outcome?: "a" | "b" | "tie" | "none";
  delta?: string;
}) {
  const outcome = props.outcome ?? "none";
  const text = (wins: boolean): string =>
    `w-16 text-[13px] tabular-nums ${wins ? "font-bold text-foreground" : "text-muted-foreground"}`;
  const pill = outcome === "a" ? "bg-primary/12" : outcome === "b" ? "bg-accent/12" : "bg-muted";
  return (
    <View class="gap-1 px-4 py-2.5">
      <Row class="items-center gap-2">
        <Text class={`${text(outcome === "a")} text-left`} numberOfLines={1}>
          {props.a}
        </Text>
        <View class="flex-1 items-center gap-0.5">
          <Text class="text-center text-[11px] leading-4 text-foreground" numberOfLines={2}>
            {props.label}
          </Text>
          {props.hint ? (
            <Muted class="text-[10px]" numberOfLines={1}>
              {props.hint}
            </Muted>
          ) : null}
        </View>
        <Text class={`${text(outcome === "b")} text-right`} numberOfLines={1}>
          {props.b}
        </Text>
      </Row>
      {props.delta ? (
        <View class="items-center">
          <View class={`rounded-full px-2 py-0.5 ${pill}`}>
            <Text class="text-[10px] font-semibold tabular-nums text-foreground">{props.delta}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- headline */

/**
 * "Your position" — the one card a student reads first on Rank and Merit.
 * `total` is null when the list on screen is only a page of the whole roster;
 * the card then says so instead of inventing a percentile.
 */
export function PositionCard(props: {
  label: string;
  name: string;
  reg: string;
  collegeCode?: string;
  rank: number | null;
  total: number | null;
  percentile: number | null;
  /** How many students share this rank; 1 (or undefined) when it is unique. */
  tied?: number;
  note?: string;
  children?: Children;
}) {
  const share = topShare(props.rank, props.total);
  const college = props.collegeCode ? shortCollegeName(props.collegeCode) : "";
  const tied = props.tied ?? 1;
  return (
    <Panel tone="ember" class="gap-3" testID="position-card">
      <Row class="flex-wrap items-center justify-between gap-2">
        <Label>{props.label}</Label>
        <Row class="gap-2">
          {tied > 1 ? <Badge tone="amber">{`${tied} share this place`}</Badge> : null}
          {share !== null ? <Badge tone="ember">{`Top ${share}%`}</Badge> : null}
        </Row>
      </Row>

      <Row class="flex-wrap items-end gap-x-2 gap-y-1">
        <Text class="text-[40px] font-bold leading-tight tabular-nums tracking-tight text-primary">
          {props.rank !== null && props.rank > 0 ? rankNumeral(props.rank, tied) : "—"}
        </Text>
        <Text class="pb-2 text-[13px] text-muted-foreground">
          {props.total !== null ? `of ${props.total} ranked` : "in this page of the list"}
        </Text>
      </Row>

      <View class="gap-0.5">
        <Text class="text-[16px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {props.name || "Semester result"}
        </Text>
        <Muted class="tabular-nums" numberOfLines={1}>
          {college ? `${props.reg} · ${college}` : props.reg}
        </Muted>
      </View>

      {props.percentile !== null ? (
        <View class="gap-1.5">
          <Progress value={props.percentile} />
          <Muted class="text-[11px] leading-4">{`Ahead of ${percentText(props.percentile)}% of the ranked students.`}</Muted>
        </View>
      ) : null}

      {props.note ? <Subtitle class="text-[12px] leading-5">{props.note}</Subtitle> : null}
      {props.children}
    </Panel>
  );
}

export function BattleMeter(props: { winsA: number; winsB: number; ties: number; nameA: string; nameB: string }) {
  /* Ties are counted data: a battle with two level papers is not the same as a
     battle with no shared papers at all, and the bar must not say it is. */
  const counted = props.winsA + props.winsB + props.ties;
  const won = props.winsA + props.winsB;
  const left = won > 0 ? Math.round((props.winsA / won) * 100) : 50;
  const label =
    counted === 0
      ? "No paper has a total on both sides."
      : `${props.nameA} won ${props.winsA} papers, ${props.nameB} won ${props.winsB}, ${props.ties} level.`;
  return (
    <View class="gap-2" accessibilityLabel={label}>
      <Row class="justify-between gap-3">
        <Text class="flex-1 text-[13px] font-semibold text-foreground" numberOfLines={1}>
          {props.nameA}
        </Text>
        <Text class="flex-1 text-right text-[13px] font-semibold text-foreground" numberOfLines={1}>
          {props.nameB}
        </Text>
      </Row>
      <View class={`h-3 flex-row overflow-hidden rounded-full bg-muted ${counted > 0 ? "" : "opacity-40"}`}>
        <View class="h-full bg-primary" style={{ width: `${left}%` }} />
        <View class="h-full bg-accent/70" style={{ width: `${100 - left}%` }} />
      </View>
      <Row class="justify-between gap-2">
        <Muted class="tabular-nums">{`A · ${props.winsA}`}</Muted>
        <Muted class="tabular-nums">{props.ties > 0 ? `${props.ties} tied` : "No ties"}</Muted>
        <Muted class="tabular-nums">{`B · ${props.winsB}`}</Muted>
      </Row>
      {counted === 0 ? (
        <Muted class="text-[11px] leading-4">No paper is on both copies, so the bar has nothing to weigh.</Muted>
      ) : null}
    </View>
  );
}

/** A two-column key/value line used in the identity cards. */
export function Line(props: { label: string; value: string; strong?: boolean }) {
  return (
    <Row class="justify-between gap-4 py-1">
      <Muted class="text-[12px]">{props.label}</Muted>
      <Text
        class={`flex-1 text-right text-[13px] ${props.strong ? "font-semibold text-foreground" : "text-foreground"}`}
        numberOfLines={2}
      >
        {props.value || "—"}
      </Text>
    </Row>
  );
}

/** A quick-action tile: icon, title and one-line hint. */
export function ActionTile(props: {
  icon: IconName;
  title: string;
  hint: string;
  tone?: "ember" | "mint" | "amber";
  onPress: () => void;
}) {
  const tone = props.tone ?? "ember";
  const chip =
    tone === "mint" ? "bg-accent/12 text-accent-ink" : tone === "amber" ? "bg-chart-3/20 text-foreground" : "bg-primary/12 text-primary-ink";
  return (
    <Card class="flex-1 gap-2" onPress={props.onPress} label={props.title}>
      <View class={`h-9 w-9 items-center justify-center rounded-xl ${chip}`}>
        <Icon name={props.icon} size={19} />
      </View>
      <View class="gap-0.5">
        <Text class="text-[14px] font-semibold text-foreground">{props.title}</Text>
        <Muted class="text-[11px] leading-4" numberOfLines={2}>
          {props.hint}
        </Muted>
      </View>
    </Card>
  );
}

/** The tiny line that names the snapshot a table came from. */
export function TableCaption(props: {
  batch: string;
  branch: string;
  sem: number;
  /** Students in the table; `null` while the roster has not been read yet. */
  count: number | null;
  shown?: number;
  /** "all colleges" / "one college": what the rows cover. */
  scope?: string;
}) {
  const total =
    props.count === null ? "students not read" : `${props.count} ${props.count === 1 ? "student" : "students"}`;
  const filtered =
    props.shown !== undefined && props.count !== null && props.shown !== props.count ? ` · ${props.shown} shown` : "";
  const scope = props.scope ? ` · ${props.scope}` : "";
  return (
    <Muted class="text-[11px] leading-4 tabular-nums">
      {`Batch 20${props.batch} · ${branchShort(props.branch)} · Sem ${props.sem} · ${total}${scope}${filtered}`}
    </Muted>
  );
}

/* --------------------------------------------------------------- skeletons */

/** The shape of one result: identity, two stats, papers. */
export function ResultSkeleton(props: { label?: string }) {
  return (
    <View class="gap-3">
      {props.label ? <Muted>{props.label}</Muted> : null}
      <Card class="gap-2">
        <Skeleton h={11} w={120} />
        <Skeleton h={24} w={200} />
        <Skeleton h={13} w={150} />
      </Card>
      <Row class="gap-3">
        <View class="flex-1">
          <Skeleton h={84} />
        </View>
        <View class="flex-1">
          <Skeleton h={84} />
        </View>
      </Row>
      <Card class="gap-2">
        <Skeleton h={13} />
        <Skeleton h={13} w={220} />
        <Skeleton h={13} w={180} />
      </Card>
    </View>
  );
}

/** `count` student rows, for a table that has no data yet. */
export function RowsSkeleton(props: { count?: number }) {
  return (
    <View class="gap-2 px-4 py-3">
      {Array.from({ length: props.count ?? 8 }).map(() => (
        <View class="gap-2 rounded-2xl border border-border bg-card p-3">
          <Row class="justify-between gap-3">
            <Skeleton h={14} w={150} />
            <Skeleton h={16} w={42} />
          </Row>
          <Skeleton h={11} w={110} />
        </View>
      ))}
    </View>
  );
}
