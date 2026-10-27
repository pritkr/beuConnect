/**
 * Results area — one result, rendered natively.
 *
 * Everything BEU's server hands back becomes a card: where the copy came from,
 * who, which semester, SGPA/CGPA, the paper rows, the semester trend and a
 * shareable text form.
 *
 * A copy that did not come from the live server says so *before* the marks, not
 * after them: a saved copy is trustworthy, but the student deserves to know
 * they are reading yesterday's.
 *
 * The marks are a five-column table (paper, code, credits, grade, total) that
 * fits 320 pt, and the trend is built from every SGPA this device can prove —
 * the result on screen, the copies saved for other semesters, and BEU's own
 * history. Nothing is interpolated.
 */

import { Text, View, cleanup, computed, effect, signal } from "nsh";
import { Badge, Btn, Card, Divider, Label, Muted, Panel, Row, SectionHeader, Title } from "../../ui";
import { formatDate } from "../../lib/net";
import { Line, SgpaTrend, SourceNote, SubjectRows } from "./components";
import type { ResultData } from "./data";
import { branchName, fixed } from "./data";
import { resolveIdentity } from "./identity";
import { collegeName, shortCollegeName } from "./colleges";
import { CopyButton, Fresh } from "./shared";
import type { Trend } from "./trend";
import { buildTrend, readSavedTrend, trendIsDrawn } from "./trend";

function statusTone(status: ResultData["status"]): "mint" | "ember" | "neutral" {
  if (status === "PASS") return "mint";
  if (status === "FAIL") return "ember";
  return "neutral";
}

/** Pass or fail in words, with the backlog count. Never colour alone. */
function statusLabel(data: ResultData): string {
  if (data.status === "PASS") return "Pass";
  if (data.status === "FAIL") {
    return data.failed.length > 0
      ? `Fail · ${data.failed.length} ${data.failed.length === 1 ? "backlog" : "backlogs"}`
      : "Fail";
  }
  return "Status not published";
}

/** What the trend needs before it can draw: two known semesters. */
function trendNote(trend: Trend): string {
  if (trend.known === 0) {
    return "No SGPA is known yet. The trend appears once BEU publishes a semester or you save a second result on this phone.";
  }
  return "Only one semester is known. Save or fetch a second semester and the trend appears here.";
}

/** The clipboard-ready form of a result, with its papers. `name` fills in a name the copy lacked. */
export function resultSummary(data: ResultData, name = ""): string {
  const lines: string[] = [
    `${name || data.name || "BEU student"} — semester ${data.semester}${data.examYear ? ` (${data.examYear})` : ""}`,
    `Reg ${data.reg} · ${data.branchName || branchName(data.branchCode)}`,
    data.collegeName || collegeName(data.collegeCode),
    `SGPA ${fixed(data.sgpa)} · CGPA ${fixed(data.cgpa)}${data.status ? ` · ${data.status}` : ""}`,
  ];
  if (data.credits !== null) lines.push(`${data.credits} credits · ${data.subjects.length} papers`);
  for (const subject of data.subjects.slice(0, 15)) {
    const mark = subject.total || subject.grade || "—";
    lines.push(
      `${subject.code || "Paper"} ${subject.name ? `${subject.name} ` : ""}— ${mark}${
        subject.grade ? ` (${subject.grade})` : ""
      }`,
    );
  }
  if (data.savedAt) lines.push(`Saved ${formatDate(data.savedAt)}`);
  lines.push("beu.prit.eu.org");
  return lines.join("\n");
}

export function ResultView(props: { data: ResultData; onRank?: () => void; onBattle?: () => void }) {
  const data = props.data;

  /*
   * A published table row carries marks but not always the name. The identity
   * resolver already knows this number from a saved result or a roster row, so
   * ask it once and fill the gap. The title keeps its neutral line until the
   * answer lands, which is the same height: the card never jumps.
   */
  const filled = signal("");
  effect(() => {
    if (data.name.trim() !== "") return;
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    void resolveIdentity(data.reg).then((identity) => {
      if (alive && identity && identity.name !== "") filled.set(identity.name);
    });
  });
  const name = computed(() => data.name.trim() || filled());

  /*
   * Every semester this phone already holds for the same number. The current
   * result wins for its own semester, a saved copy wins over BEU's history, and
   * `buildTrend` drops anything outside the 10-point scale.
   */
  const saved = signal<{ sem: number; value: number }[]>([]);
  effect(() => {
    const numeric = data.reg;
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    void readSavedTrend(numeric).then((rows) => {
      if (alive) saved.set(rows);
    });
  });

  const trend = computed<Trend>(() =>
    buildTrend({
      history: data.history,
      saved: saved(),
      current: { sem: data.semester, value: data.sgpa },
    }),
  );
  const trendKey = computed(() => `${trend().known}:${trend().saved}:${trend().current}:${data.semester}`);

  const short = shortCollegeName(data.collegeCode);
  const full = data.collegeName || collegeName(data.collegeCode);
  const showFull = full !== "" && full !== short;
  const offLive = data.source !== "live";

  return (
    <View class="gap-4" testID="result-view">
      {offLive ? <SourceNote source={data.source} savedAt={data.savedAt} /> : null}

      <Card class="gap-2">
        <Row class="items-start justify-between gap-3">
          <View class="flex-1 gap-1">
            <Label>{`Semester ${data.semester}${data.examYear ? ` · ${data.examYear}` : ""}`}</Label>
            <Title class="text-[22px] leading-tight" numberOfLines={2}>
              {name() || "Semester result"}
            </Title>
            <Muted class="tabular-nums" numberOfLines={1}>
              {data.reg}
            </Muted>
          </View>
          {data.status ? <Badge tone={statusTone(data.status)}>{data.status}</Badge> : null}
        </Row>

        <Divider class="my-1" />

        <Line label="College" value={short} />
        {showFull ? (
          <Muted class="text-[11px] leading-4" numberOfLines={2}>
            {full}
          </Muted>
        ) : null}
        <Line label="Branch" value={data.branchName || branchName(data.branchCode)} />
        {data.course ? <Line label="Course" value={data.course} /> : null}
        {data.examHeld ? <Line label="Exam held" value={data.examHeld} /> : null}
      </Card>

      <Card class="gap-3">
        <Row class="items-end gap-3">
          <View class="flex-1 gap-0.5">
            <Text
              class="text-[38px] font-bold leading-none tabular-nums tracking-tight text-foreground"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {fixed(data.sgpa)}
            </Text>
            <Label class="text-[10px]">{`SGPA · Semester ${data.semester}`}</Label>
          </View>
          <View class="h-12 w-px bg-border" />
          <View class="flex-1 items-end gap-0.5">
            <Text
              class="text-[38px] font-bold leading-none tabular-nums tracking-tight text-foreground"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {fixed(data.cgpa)}
            </Text>
            <Label class="text-[10px]">CGPA · Cumulative</Label>
          </View>
        </Row>

        <Divider />

        <Row class="flex-wrap gap-2">
          <Badge tone={statusTone(data.status)}>{statusLabel(data)}</Badge>
          {data.credits !== null ? <Badge tone="neutral">{`${data.credits} credits`}</Badge> : null}
          <Badge tone="neutral">{`${data.subjects.length} papers`}</Badge>
          {data.stateRank ? <Badge tone="amber">{`State #${data.stateRank}`}</Badge> : null}
          {data.collegeRank ? <Badge tone="amber">{`College #${data.collegeRank}`}</Badge> : null}
        </Row>
      </Card>

      <View class="gap-2">
        <SectionHeader
          title="Marks"
          trailing={
            <Badge tone="mint">
              {data.credits !== null
                ? `${data.subjects.length} papers · ${data.credits} credits`
                : `${data.subjects.length} papers`}
            </Badge>
          }
        />
        {data.subjects.length ? (
          <SubjectRows subjects={data.subjects} />
        ) : (
          <Panel tone="plain">
            <Muted class="text-[12px] leading-5">
              This copy has no paper rows. The published table carries marks; the live server adds paper names.
            </Muted>
          </Panel>
        )}
      </View>

      {data.status === "FAIL" ? (
        <Panel tone="ember" class="gap-1">
          <Label>Backlog</Label>
          <Text class="text-[13px] leading-5 text-foreground">
            {data.failed.length
              ? data.failed.join(", ")
              : "BEU marked this semester as failed. Check the papers above."}
          </Text>
        </Panel>
      ) : null}

      <View class="gap-2">
        <SectionHeader title="Semester trend" />
        {/* One semester is not a trend: the chart only appears once a second
            semester is known, and until then the card says what would fill it. */}
        <If
          when={trendIsDrawn(trend())}
          else={
            <Panel tone="plain">
              <Muted class="text-[11px] leading-5">{trendNote(trend())}</Muted>
            </Panel>
          }
        >
          <Card class="py-3">
            <Fresh when={trendKey()} build={() => <SgpaTrend trend={trend()} active={data.semester} />} />
          </Card>
        </If>
      </View>

      {offLive ? null : <SourceNote source={data.source} savedAt={data.savedAt} />}

      <View class="gap-2">
        <Fresh
          when={`summary:${name()}`}
          build={() => (
            <CopyButton class="flex-1" text={resultSummary(data, name())} label="Copy result summary" />
          )}
        />
        {props.onRank || props.onBattle ? (
          <Row class="gap-3">
            {props.onRank ? (
              <Btn variant="secondary" class="flex-1" onPress={props.onRank}>
                My rank
              </Btn>
            ) : null}
            {props.onBattle ? (
              <Btn variant="secondary" class="flex-1" onPress={props.onBattle}>
                Battle a friend
              </Btn>
            ) : null}
          </Row>
        ) : null}
      </View>
    </View>
  );
}
