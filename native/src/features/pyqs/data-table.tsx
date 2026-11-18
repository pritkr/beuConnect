/**
 * One published result table, parsed from its wide CSV.
 *
 * The CSV arrives as one string; `parseCsvInChunks` turns it into rows in
 * small slices so the list stays responsive, and the list itself is
 * virtualized. Search matches precomputed per-row text, sort parses each key
 * once, and one tap expands a student to every column in the file.
 *
 * The header carries the table's three best students, ranked by CGPA when the
 * file has it and SGPA otherwise. That is a reading of this table, not a claim
 * about the university: the strip names the column it used, and disappears
 * when no row carries a mark.
 */

import { List, Text, View, computed, effect, signal, cleanup, type ViewRef } from "nsh";
import type { RouteDef, RouteParams } from "../../app/router";
import {
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  Label,
  Loading,
  Muted,
  Progress,
  Row,
  Screen,
  Search,
  SectionHeader,
  scrollAnimated,
} from "../../ui";
import { Icon, type IconName } from "../../ui/icons";
import { LAYOUT_SPRING } from "../../lib/motion";
import { motionOn } from "../../ui/motion";
import { useProfile } from "../settings/profile";
import { Cell, ChipRail, Head, type RailOption } from "./components";
import {
  collegeName,
  datasetUrl,
  errorMessage,
  isNotFound,
  loadDatasetCsv,
  shortCollegeName,
  shortBranchLabel,
} from "./api";
import {
  columnIndex,
  detailColumns,
  filterRows,
  parseCsvInChunks,
  preferredColumns,
  sortRows,
  sortableColumns,
  topScored,
  toRows,
  type CsvTable,
  type ScoredRow,
  type TableRow,
} from "./csv";

type Phase = "loading" | "parsing" | "ready" | "empty" | "error";

interface Target {
  batch: string;
  branch: string;
  sem: number;
  college: string;
}

function targetFromParams(params: RouteParams): Target | null {
  const batch = String(params.batch ?? "");
  const branch = String(params.branch ?? "");
  const sem = Number(params.sem ?? 0);
  const college = String(params.college ?? "");
  if (!batch || !branch || !Number.isFinite(sem) || sem <= 0 || !college) return null;
  return { batch, branch, sem, college };
}

function cell(row: TableRow, columns: string[], name: string): string {
  const index = columnIndex(columns, name);
  return index >= 0 ? row.cells[index] ?? "" : "";
}

function niceLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** The rank a row actually carries — and, when it carries none, nothing. */
function rankOf(item: TableRow, names: string[]): { value: string; caption: string } {
  const college = cell(item, names, "CollegeRank");
  if (college) return { value: college, caption: "College" };
  const state = cell(item, names, "StateRank");
  if (state) return { value: state, caption: "State" };
  return { value: "", caption: "" };
}

/**
 * One student's row: rank gutter, name, registration and the headline number.
 *
 * Two lines instead of a card, because the table can hold thousands of rows and
 * the reader is scanning for a name or a mark, not reading each student. The
 * full report stays one tap away.
 *
 * It takes plain values rather than reading the signals, because `Cell`
 * rebuilds it for the row its list cell currently holds — a recycled cell that
 * read `row()` once would keep showing the first student it ever had.
 */
function StudentRow(props: {
  item: TableRow;
  names: string[];
  summary: string[];
  detail: string[];
  /** Position in the current order, used only when the file has no rank. */
  position: number;
  /** This row carries the saved registration number. */
  mine?: boolean;
  /** Read in the tree, so the row survives an expand and its own frame can spring. */
  open: () => boolean;
  onToggle: () => void;
}) {
  const item = props.item;
  const names = props.names;
  const name = cell(item, names, "Name");
  const reg = cell(item, names, "RegNo");
  const sgpa = cell(item, names, "SGPA");
  const cgpa = cell(item, names, "CGPA");
  const fail = cell(item, names, "FailAny");
  const rank = rankOf(item, names);
  const headline = sgpa || cgpa;
  const failLabel =
    fail && !/^(no|0|pass)$/i.test(fail)
      ? fail.toUpperCase().startsWith("FAIL")
        ? fail.toUpperCase()
        : `Fail ${fail}`
      : "";
  const open = props.open;
  // This row's own frames: the report it opens and the rows it pushes below.
  let row: ViewRef | null = null;
  const fallback = props.summary
    .map((column) => `${niceLabel(column)} ${cell(item, names, column)}`.trim())
    .filter((line) => line.length > 0);
  const secondary =
    name || reg
      ? [reg ? `Reg ${reg}` : "", cgpa && headline !== cgpa ? `CGPA ${cgpa}` : "", failLabel]
          .filter((part) => part.length > 0)
          .join(" · ")
      : fallback.join(" · ");
  // Spoken exactly as the gutter shows it: a college rank, a state rank, or
  // this row's place in the list the reader is looking at — never a rank the
  // file did not publish.
  const spokenRank =
    rank.caption !== ""
      ? `${rank.caption} rank ${rank.value}`
      : props.position > 0
        ? `row ${props.position} in this list`
        : "no rank";

  return (
    <View
      class="min-h-14 gap-1.5 overflow-hidden rounded-2xl border border-border bg-card px-3 py-2 active:bg-muted"
      onPress={() => {
        // Spring this row's frame and the rows it pushes; commit the open in the
        // same turn. Insertions are not animated, and the clip above is what
        // reveals the report as the frame grows.
        if (motionOn()) row?.animateLayout(LAYOUT_SPRING);
        props.onToggle();
      }}
      ref={(node: ViewRef) => {
        row = node;
      }}
      role="button"
      accessibilityLabel={`${name || reg || "Student"}, ${spokenRank}, ${
        headline ? `${sgpa ? "SGPA" : "CGPA"} ${headline}` : "no published score"
      }, tap for details`}
      accessibilityState={{ expanded: open() }}
    >
      <Row class="items-center gap-2.5">
        <View class="w-14 items-end">
          <Text class="text-[13px] font-bold leading-4 tabular-nums text-foreground" style={{ numberOfLines: 1 }}>
            {rank.value || (props.position > 0 ? String(props.position) : "—")}
          </Text>
          <Text class="text-[8px] font-semibold uppercase leading-3 tracking-[0.02em] text-muted-foreground" style={{ numberOfLines: 1 }}>
            {rank.caption || "Order"}
          </Text>
        </View>

        <View class="flex-1 gap-0.5">
          <Row class="items-center gap-2">
            <Text class="flex-1 text-[14px] font-semibold leading-5 text-foreground" style={{ numberOfLines: 2 }}>
              {name || "Unnamed student"}
            </Text>
            {props.mine ? <Badge tone="ember">You</Badge> : null}
          </Row>
          <Text class="text-[11px] leading-4 text-muted-foreground" style={{ numberOfLines: 1 }}>
            {secondary || item.key}
          </Text>
        </View>

        {headline ? (
          <View class="items-end">
            <Text class="text-[17px] font-bold leading-5 tabular-nums text-primary-ink">{headline}</Text>
            <Text class="text-[9px] font-semibold uppercase leading-3 tracking-[0.08em] text-muted-foreground">
              {sgpa ? "SGPA" : "CGPA"}
            </Text>
          </View>
        ) : null}

        <Icon name={open() ? "chevron-up" : "chevron-down"} size={14} class="text-muted-foreground" />
      </Row>

      <If when={open()}>
        <View class="gap-1.5 border-t border-border pt-2">
          {props.detail.map((column) => (
            <Row class="items-start justify-between gap-3">
              <Muted class="flex-1">{niceLabel(column)}</Muted>
              <Text class="flex-1 text-right text-[12px] font-medium text-foreground" style={{ userSelect: "text" }}>
                {cell(item, names, column) || "—"}
              </Text>
            </Row>
          ))}
        </View>
      </If>
    </View>
  );
}

/**
 * The table's three best students, above the list.
 *
 * It ranks the whole published table, not the filtered view, and it names the
 * column it used. No row carries a mark? Then there is no strip — a podium of
 * zeroes would be a claim the file never made.
 */
function TopThree(props: {
  items: ScoredRow[];
  names: string[];
  table: string;
  onPress: (row: TableRow) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <View class="gap-1.5 rounded-2xl border border-border bg-card p-3">
      <View class="flex-row items-center justify-between gap-2">
        <Label>Top 3</Label>
        <Badge tone="mint">{props.items[0].column}</Badge>
      </View>
      <Muted class="text-[11px] leading-4" numberOfLines={1}>
        {props.table}
      </Muted>
      <View class="gap-0.5">
        {props.items.map((entry) => {
          const name = cell(entry.row, props.names, "Name");
          const reg = cell(entry.row, props.names, "RegNo");
          return (
            <View
              class="min-h-11 flex-row items-center gap-2.5 rounded-xl px-1 active:bg-muted"
              onPress={() => props.onPress(entry.row)}
              role="button"
              accessibilityLabel={`Top ${entry.place}, ${name || reg || "student"}, ${entry.column} ${entry.value}. Show in the list`}
            >
              <View
                class={`h-6 w-6 items-center justify-center rounded-full ${
                  entry.place === 1 ? "bg-primary/12" : "bg-muted"
                }`}
              >
                <Text
                  class={`text-[11px] font-bold tabular-nums ${
                    entry.place === 1 ? "text-primary-ink" : "text-foreground"
                  }`}
                >
                  {entry.place}
                </Text>
              </View>
              <Text class="flex-1 text-[13px] font-semibold leading-4 text-foreground" style={{ numberOfLines: 1 }}>
                {name || reg || "Unnamed student"}
              </Text>
              <Text class="text-[13px] font-bold tabular-nums text-primary-ink">{entry.value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The part of a `List` ref this screen uses: bring a row into view. */
interface ListScroller {
  scrollToIndex(options: { index: number; animated?: boolean; viewPosition?: number }): void;
}

function TableScreen(props: { nav: import("../../app/router").Nav; target: Target }) {
  const nav = props.nav;
  const target = props.target;
  const dataset = {
    id: `${target.batch}|${target.branch}|${target.sem}|${target.college}`,
    batch: target.batch,
    branch: target.branch,
    sem: target.sem,
    college: target.college,
    url: datasetUrl(target.batch, target.college, target.branch, target.sem),
  };

  const phase = signal<Phase>("loading");
  const table = signal<CsvTable | null>(null);
  const progress = signal(0);
  const error = signal("");
  const attempt = signal(0);
  const query = signal("");
  const sortKey = signal("");
  const direction = signal<"asc" | "desc">("asc");
  const expanded = signal<string | null>(null);

  effect(() => {
    void attempt();
    let cancelled = false;
    cleanup(() => {
      cancelled = true;
    });

    phase.set("loading");
    progress.set(0);
    error.set("");
    table.set(null);

    void loadDatasetCsv(dataset)
      .then((text) => {
        if (cancelled) return;
        phase.set("parsing");
        return parseCsvInChunks(
          text,
          (state) => {
            if (!cancelled) progress.set(state.fraction);
          },
          () => cancelled,
        ).then((parsed) => {
          if (cancelled) return;
          table.set(parsed);
          phase.set(parsed.columns.length === 0 || parsed.rows.length === 0 ? "empty" : "ready");
        });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        if (isNotFound(failure)) {
          phase.set("empty");
          return;
        }
        error.set(errorMessage(failure));
        phase.set("error");
      });
  });

  const columns = computed(() => table()?.columns ?? []);
  const defaultSort = computed(() => {
    const names = columns();
    for (const name of ["CollegeRank", "StateRank", "CGPA", "SGPA", "Name"]) {
      if (names.includes(name)) return name;
    }
    return names[0] ?? "";
  });
  const activeSort = computed(() => sortKey() || defaultSort());
  const sortOptions = computed(() => sortableColumns(columns()));
  /**
   * The parsed file as rows, built once per table.
   *
   * `toRows` now derives a per-row search blob; doing that inside the filtered
   * computed would redo it for every keystroke.
   */
  const baseRows = computed(() => {
    const parsed = table();
    return parsed ? toRows(parsed) : [];
  });
  const rows = computed(() => {
    const parsed = table();
    if (!parsed) return [];
    const filtered = filterRows(baseRows(), parsed.columns, query());
    const key = activeSort();
    return key ? sortRows(filtered, parsed.columns, key, direction()) : filtered;
  });
  /** Row key → 1-based position in the current order, for files with no rank. */
  const positions = computed(() => {
    const map = new Map<string, number>();
    rows().forEach((row, index) => map.set(row.key, index + 1));
    return map;
  });
  const topThree = computed(() => {
    const parsed = table();
    if (!parsed || phase() !== "ready") return [];
    return topScored(baseRows(), parsed.columns, 3);
  });
  const detail = computed(() => detailColumns(columns()));

  /**
   * The saved registration number's row in this table, if it has one. The row
   * is marked, and the chip above the list brings it into view — the table is
   * never re-ordered, so a published rank stays a published rank.
   */
  const person = useProfile();
  const myReg = computed(() => person().reg.replace(/\D/g, ""));
  const myRow = computed(() => {
    const reg = myReg();
    if (reg === "") return null;
    const names = columns();
    return rows().find((row) => cell(row, names, "RegNo").replace(/\D/g, "") === reg) ?? null;
  });
  const myRowLabel = computed(() => {
    const row = myRow();
    if (!row) return "";
    const rank = rankOf(row, columns());
    return rank.value !== "" ? `Your row · ${rank.caption} ${rank.value}` : "Your row";
  });

  /** The table the top three belong to, for the strip's context line. */
  const tableLabel = computed(
    () =>
      `${shortCollegeName(target.college)} · ${shortBranchLabel(target.branch)} · Sem ${target.sem}`,
  );

  let list: ListScroller | null = null;

  /** Open a row from the top-three strip, clearing a search that hides it. */
  const reveal = (row: TableRow) => {
    expanded.set(row.key);
    if (query() !== "") query.set("");
    const index = rows().findIndex((candidate) => candidate.key === row.key);
    if (index < 0) return;
    setTimeout(() => list?.scrollToIndex({ index, animated: scrollAnimated(), viewPosition: 0.3 }), 80);
  };

  /** The sort rail: the same options the chips had, with the arrow on the live one. */
  const sortRail = computed<RailOption[]>(() => {
    const current = activeSort();
    const asc = direction() === "asc";
    const options: RailOption[] = [{ key: "default", label: "Default" }];
    for (const name of sortOptions()) {
      const icon: IconName | undefined =
        current === name ? (asc ? "up-arrow-alt" : "down-arrow-alt") : undefined;
      options.push({ key: name, label: niceLabel(name), icon });
    }
    return options;
  });

  const toggleSort = (key: string) => {
    if (activeSort() === key) {
      direction.set(direction() === "asc" ? "desc" : "asc");
      return;
    }
    sortKey.set(key);
    direction.set("asc");
  };

  const retry = () => attempt.update((value) => value + 1);
  const clear = () => {
    query.set("");
    sortKey.set("");
    direction.set("asc");
    expanded.set(null);
  };

  const empty = () => {
    if (phase() === "loading") return <Loading label="Downloading the result table…" />;
    if (phase() === "parsing") {
      return (
        <View class="gap-3 rounded-3xl border border-border bg-card p-4">
          <Label>Parsing</Label>
          <Text class="text-[15px] font-semibold text-foreground">
            {`${Math.round(progress() * 100)}% of the file`}
          </Text>
          <Progress value={progress() * 100} />
        </View>
      );
    }
    if (phase() === "error") {
      return <ErrorState title="This table did not load" message={error()} onRetry={retry} />;
    }
    if (phase() === "empty") {
      return (
        <EmptyState
          icon="grid-alt"
          title="This dataset is not published"
          hint="The manifest lists this combination, but the CSV is missing. It may be added later."
          action="Back to datasets"
          onAction={() => nav.replace("data", {})}
        />
      );
    }
    return (
      <EmptyState
        icon="search"
        title="No student matched"
        hint="Search by name or registration number, or clear the sort and search."
        action="Clear"
        onAction={clear}
      />
    );
  };

  const summary = computed(() => preferredColumns(columns()).slice(0, 4));

  return (
    <Screen>
      {() => (
        <List
          class="flex-1"
          each={rows()}
          keyExtractor={(row: TableRow) => row.key}
          estimatedItemSize={64}
          contentClass="gap-1.5 px-4 pb-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ref={(node: unknown) => {
            list = node as ListScroller | null;
          }}
          empty={<View>{empty()}</View>}
          header={
            <View class="gap-1 pb-1">
              <Label>{`Data · ${shortBranchLabel(target.branch)} · Batch ${target.batch} · Sem ${target.sem}`}</Label>
              <Text class="text-[15px] leading-6 text-muted-foreground" style={{ numberOfLines: 2 }}>
                {collegeName(target.college)}
              </Text>

              <If when={topThree().length > 0}>
                <TopThree items={topThree()} names={columns()} table={tableLabel()} onPress={reveal} />
              </If>

              <Search
                value={query()}
                onChange={(value) => query.set(value)}
                placeholder="Name or registration number"
              />

              <If when={myRow() !== null}>
                <Row class="flex-wrap items-center gap-2">
                  <Chip
                    tone="mint"
                    onPress={() => {
                      const row = myRow();
                      if (row) reveal(row);
                    }}
                  >
                    {myRowLabel()}
                  </Chip>
                </Row>
              </If>

              <If when={phase() === "ready"}>
                <ChipRail
                  label="Sort by"
                  value={sortKey() === "" ? "default" : activeSort()}
                  options={sortRail()}
                  onSelect={(key) => {
                    if (key === "default") {
                      sortKey.set("");
                      return;
                    }
                    toggleSort(key);
                  }}
                />
              </If>

              <SectionHeader
                title="Students"
                trailing={<Badge tone="mint">{`${rows().length} of ${table()?.rows.length ?? 0}`}</Badge>}
              />
            </View>
          }
          footer={<View class="h-4" />}
        >
          {(row: () => TableRow) => (
            <Cell
              row={row}
              id={(item) => item.key}
              fresh={() => `${positions().get(row().key) ?? 0}|${myRow()?.key ?? ""}`}
              build={(item) => (
                <StudentRow
                  item={item}
                  names={columns()}
                  summary={summary()}
                  detail={detail()}
                  position={positions().get(item.key) ?? 0}
                  mine={item.key === myRow()?.key}
                  // A getter, not a value: the row must survive its own expand
                  // for its frame to spring. Keying `fresh` on `expanded` used to
                  // rebuild every visible row on every tap.
                  open={() => expanded() === item.key}
                  onToggle={() => expanded.set(expanded() === item.key ? null : item.key)}
                />
              )}
            />
          )}
        </List>
      )}
    </Screen>
  );
}

function MissingTable(props: { nav: import("../../app/router").Nav }) {
  return (
    <View class="flex-1 justify-center gap-4 px-4">
      <EmptyState
        icon="grid-alt"
        title="No table was selected"
        hint="Open the data browser and pick a batch, branch, semester and college."
        action="Data browser"
        onAction={() => props.nav.replace("data", {})}
      />
    </View>
  );
}

export const dataTableRoutes: RouteDef[] = [
  {
    name: "data.table",
    title: (params) => {
      const target = targetFromParams(params);
      if (!target) return "Result table";
      return `${shortCollegeName(target.college)} · Sem ${target.sem}`;
    },
    render: (nav) => {
      const target = targetFromParams(nav.route.params);
      if (!target) return <MissingTable nav={nav} />;
      return <TableScreen nav={nav} target={target} />;
    },
  },
];
