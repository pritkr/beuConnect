/**
 * One published result table, parsed from its wide CSV.
 *
 * The CSV arrives as one string; `parseCsvInChunks` turns it into rows in
 * small slices so the list stays responsive, and the list itself is
 * virtualized. Search is local, sort is by any report column, and one tap
 * expands a student to every column in the file.
 */

import { List, Scroll, Text, View, computed, effect, signal, cleanup } from "nsh";
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
} from "../../ui";
import { Icon } from "../../ui/icons";
import {
  collegeName,
  datasetHint,
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
  toRows,
  type CsvTable,
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
  const rows = computed(() => {
    const parsed = table();
    if (!parsed) return [];
    const filtered = filterRows(toRows(parsed), parsed.columns, query());
    const key = activeSort();
    return key ? sortRows(filtered, parsed.columns, key, direction()) : filtered;
  });
  const detail = computed(() => detailColumns(columns()));

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
        estimatedItemSize={96}
        contentClass="gap-2 px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        empty={<View>{empty()}</View>}
        header={
          <View class="gap-3 pb-2 pt-4">
            <View class="gap-1">
              <Label>{`Data · Batch ${target.batch} · Sem ${target.sem}`}</Label>
              <Text class="text-[24px] font-bold leading-8 tracking-tight text-foreground">
                {shortCollegeName(target.college)}
              </Text>
              <Muted numberOfLines={2}>{collegeName(target.college)}</Muted>
              <Row class="flex-wrap items-center gap-2">
                <Badge tone="ember">{shortBranchLabel(target.branch)}</Badge>
                <Muted>{datasetHint(dataset)}</Muted>
              </Row>
            </View>

            <Search value={query()} onChange={query.set} placeholder="Name or registration number" />

            <Row class="items-center justify-between gap-2">
              <Muted>{`${rows().length} of ${table()?.rows.length ?? 0} students`}</Muted>
              <Muted numberOfLines={1}>{`${activeSort() || "default"} · ${direction()}`}</Muted>
            </Row>

            <If when={phase() === "ready"}>
              <View class="gap-2">
                <Label>Sort by</Label>
                <Scroll horizontal class="flex-1" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
                  <Chip active={sortKey() === ""} onPress={() => sortKey.set("")}>
                    Default
                  </Chip>
                  {sortOptions().map((name) => (
                    <Chip
                      active={activeSort() === name}
                      icon={
                        activeSort() === name
                          ? direction() === "asc"
                            ? "up-arrow-alt"
                            : "down-arrow-alt"
                          : undefined
                      }
                      onPress={() => toggleSort(name)}
                    >
                      {niceLabel(name)}
                    </Chip>
                  ))}
                </Scroll>
              </View>
            </If>

            <SectionHeader title="Students" trailing={<Badge tone="mint">{`${rows().length} shown`}</Badge>} />
          </View>
        }
        footer={<View class="h-4" />}
      >
        {(row: () => TableRow) => {
          const item = row();
          const names = columns();
          const name = cell(item, names, "Name");
          const reg = cell(item, names, "RegNo");
          const sgpa = cell(item, names, "SGPA");
          const cgpa = cell(item, names, "CGPA");
          const collegeRank = cell(item, names, "CollegeRank");
          const stateRank = cell(item, names, "StateRank");
          const fail = cell(item, names, "FailAny");
          const headline = sgpa || cgpa;
          const failLabel =
            fail && !/^(no|0|pass)$/i.test(fail)
              ? fail.toUpperCase().startsWith("FAIL")
                ? fail.toUpperCase()
                : `Fail ${fail}`
              : "";
          const open = expanded() === item.key;
          const fallback = summary()
            .map((column) => `${niceLabel(column)} ${cell(item, names, column)}`.trim())
            .filter((line) => line.length > 0);

          return (
            <View
              class="gap-2 rounded-3xl border border-border bg-card p-3.5 active:bg-muted"
              onPress={() => expanded.set(open ? null : item.key)}
              role="button"
              accessibilityLabel={`${name || reg || "Student"}, tap for details`}
              accessibilityState={{ expanded: open }}
            >
              <Row class="items-start justify-between gap-2">
                <View class="flex-1 gap-0.5">
                  <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                    {name || "Unnamed student"}
                  </Text>
                  <Muted numberOfLines={1}>{reg ? `Reg ${reg}` : item.key}</Muted>
                </View>
                {headline ? (
                  <View class="items-end">
                    <Text class="text-[18px] font-bold tabular-nums text-primary">{headline}</Text>
                    <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {sgpa ? "SGPA" : "CGPA"}
                    </Text>
                  </View>
                ) : null}
              </Row>

              {name || reg ? (
                <View class="flex-row flex-wrap items-center gap-1.5">
                  {cgpa ? <Badge tone="mint">{`CGPA ${cgpa}`}</Badge> : null}
                  {collegeRank ? <Badge tone="amber">{`College #${collegeRank}`}</Badge> : null}
                  {stateRank ? <Badge tone="neutral">{`State #${stateRank}`}</Badge> : null}
                  {failLabel ? <Badge tone="ember">{failLabel}</Badge> : null}
                </View>
              ) : (
                <View class="flex-row flex-wrap gap-x-3 gap-y-1">
                  {fallback.map((line) => (
                    <Muted>{line}</Muted>
                  ))}
                </View>
              )}

              <If when={open}>
                <View class="gap-1.5 border-t border-border pt-2">
                  {detail().map((column) => (
                    <Row class="items-start justify-between gap-3">
                      <Muted class="flex-1">{niceLabel(column)}</Muted>
                      <Text class="flex-1 text-right text-[12px] font-medium text-foreground" selectable>
                        {cell(item, names, column) || "—"}
                      </Text>
                    </Row>
                  ))}
                </View>
              </If>

              <Row class="justify-end gap-1">
                <Text class="text-[11px] text-muted-foreground">{open ? "Hide details" : "Details"}</Text>
                <Icon
                  name={open ? "chevron-up" : "chevron-down"}
                  size={14}
                  class="text-muted-foreground"
                />
              </Row>
            </View>
          );
        }}
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
