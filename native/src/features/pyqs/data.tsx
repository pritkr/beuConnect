/**
 * Data browser — every dataset the site publishes.
 *
 * The manifest is fetched once (cached for six hours) and flattened into one
 * row per batch/branch/semester/college. Rows open the virtualized table.
 */

import { List, Scroll, Text, View, computed, effect, signal, cleanup } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { param } from "../../app/router";
import {
  Badge,
  Btn,
  Chip,
  EmptyState,
  ErrorState,
  Label,
  Loading,
  Muted,
  Screen,
  Search,
  SectionHeader,
  Stat,
  ListBar,
} from "../../ui";
import { Icon } from "../../ui/icons";
import type { Dataset } from "./api";
import {
  branchLabel,
  collegeName,
  errorMessage,
  loadDatasets,
  searchDatasets,
  shortBranchLabel,
  shortCollegeName,
} from "./api";
import { Cell, Hero } from "./components";

interface DataState {
  phase: "loading" | "ready" | "error";
  items: Dataset[];
  error: string;
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function DataScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const query = signal(param(nav, "q"));
  const filters = signal(false);
  const batch = signal<string | null>(null);
  const branch = signal<string | null>(null);
  const sem = signal<number | null>(null);
  const attempt = signal(0);
  const state = signal<DataState>({ phase: "loading", items: [], error: "" });

  effect(() => {
    void attempt();
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    state.set({ phase: "loading", items: [], error: "" });
    void loadDatasets().then(
      (items) => {
        if (alive) state.set({ phase: "ready", items, error: "" });
      },
      (error) => {
        if (alive) state.set({ phase: "error", items: [], error: errorMessage(error) });
      },
    );
  });

  const batches = computed(() =>
    uniq(state().items.map((dataset) => dataset.batch)).sort(
      (left, right) => Number(right) - Number(left),
    ),
  );

  const branchCodes = computed(() => {
    const chosen = batch();
    return uniq(
      state()
        .items.filter((dataset) => chosen === null || dataset.batch === chosen)
        .map((dataset) => dataset.branch),
    ).sort((left, right) => branchLabel(left).localeCompare(branchLabel(right)));
  });

  const sems = computed(() => {
    const chosenBatch = batch();
    const chosenBranch = branch();
    return uniq(
      state()
        .items.filter(
          (dataset) =>
            (chosenBatch === null || dataset.batch === chosenBatch) &&
            (chosenBranch === null || dataset.branch === chosenBranch),
        )
        .map((dataset) => String(dataset.sem)),
    )
      .map(Number)
      .sort((left, right) => left - right);
  });

  const filtered = computed(() => {
    const chosenBatch = batch();
    const chosenBranch = branch();
    const chosenSem = sem();
    const rows = state().items.filter(
      (dataset) =>
        (chosenBatch === null || dataset.batch === chosenBatch) &&
        (chosenBranch === null || dataset.branch === chosenBranch) &&
        (chosenSem === null || dataset.sem === chosenSem),
    );
    return searchDatasets(rows, query());
  });

  const collegeCount = computed(() => uniq(state().items.map((dataset) => dataset.college)).length);
  const filterCount = computed(
    () => (batch() === null ? 0 : 1) + (branch() === null ? 0 : 1) + (sem() === null ? 0 : 1),
  );

  const pickBatch = (value: string | null) => {
    batch.set(value);
    const branches = uniq(
      state()
        .items.filter((dataset) => value === null || dataset.batch === value)
        .map((dataset) => dataset.branch),
    );
    if (branch() !== null && !branches.includes(branch() as string)) branch.set(null);
    const semesters = uniq(
      state()
        .items.filter(
          (dataset) =>
            (value === null || dataset.batch === value) &&
            (branch() === null || dataset.branch === branch()),
        )
        .map((dataset) => dataset.sem),
    );
    if (sem() !== null && !semesters.includes(sem() as number)) sem.set(null);
  };

  const pickBranch = (value: string | null) => {
    branch.set(value);
    const semesters = uniq(
      state()
        .items.filter(
          (dataset) =>
            (batch() === null || dataset.batch === batch()) &&
            (value === null || dataset.branch === value),
        )
        .map((dataset) => dataset.sem),
    );
    if (sem() !== null && !semesters.includes(sem() as number)) sem.set(null);
  };

  const clear = () => {
    batch.set(null);
    branch.set(null);
    sem.set(null);
    query.set("");
  };

  const retry = () => attempt.update((value) => value + 1);

  const empty = () => {
    if (state().phase === "loading") return <Loading label="Loading the dataset index…" />;
    if (state().phase === "error") {
      return <ErrorState title="The dataset index did not load" message={state().error} onRetry={retry} />;
    }
    if (state().items.length === 0) {
      return (
        <EmptyState
          icon="grid-alt"
          title="No datasets are published yet"
          hint="The site has not published a manifest entry for this release. Check again later."
          action="Reload"
          onAction={retry}
        />
      );
    }
    return (
      <EmptyState
        icon="search"
        title="No dataset matches"
        hint="Try another college, batch, branch or semester."
        action="Clear filters"
        onAction={clear}
      />
    );
  };

  return (
    <Screen>
      {() => <ListBar title="Datasets" meta={`${filtered().length} files`} />}
      {() => (
        <List
          class="flex-1"
        each={filtered()}
        keyExtractor={(dataset: Dataset) => dataset.id}
        estimatedItemSize={92}
        contentClass="gap-2 px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={state().phase === "loading" && state().items.length > 0}
        onRefresh={retry}
        empty={<View>{empty()}</View>}
        header={
          <View class="gap-4 pb-2 pt-4">
            <Hero>
              <View class="gap-2">
                <Label>BEU · Data browser</Label>
                <Text class="text-[30px] font-bold leading-8 tracking-tight text-foreground">
                  Every result table.
                </Text>
              </View>
              <View class="mt-4 flex-row gap-4">
                <Stat
                  value={state().phase === "ready" ? String(state().items.length) : "—"}
                  label="Datasets"
                  tone="ember"
                  class="flex-1"
                />
                <Stat
                  value={state().phase === "ready" ? String(collegeCount()) : "—"}
                  label="Colleges"
                  tone="mint"
                  class="flex-1"
                />
              </View>
            </Hero>

            <Search value={query()} onChange={query.set} placeholder="College, branch, batch or semester" />

            <View class="flex-row items-center justify-between gap-2">
              <Btn variant="ghost" onPress={() => filters.update((open) => !open)} label="Filters">
                {filters() ? "Done" : `Filters${filterCount() > 0 ? ` · ${filterCount()}` : ""}`}
              </Btn>
              <Muted>{`${filtered().length} of ${state().items.length}`}</Muted>
            </View>

            <If when={filters()}>
              <View class="gap-3 rounded-3xl border border-border bg-card p-3.5">
                <View class="gap-2">
                  <Label>Batch</Label>
                  <Scroll horizontal class="flex-1" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
                    <Chip active={batch() === null} onPress={() => pickBatch(null)}>
                      All
                    </Chip>
                    {batches().map((value) => (
                      <Chip active={batch() === value} onPress={() => pickBatch(value)}>
                        {value}
                      </Chip>
                    ))}
                  </Scroll>
                </View>

                <View class="gap-2">
                  <Label>Branch</Label>
                  <Scroll horizontal class="flex-1" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
                    <Chip active={branch() === null} onPress={() => pickBranch(null)}>
                      All
                    </Chip>
                    {branchCodes().map((value) => (
                      <Chip active={branch() === value} onPress={() => pickBranch(value)}>
                        {shortBranchLabel(value)}
                      </Chip>
                    ))}
                  </Scroll>
                </View>

                <View class="gap-2">
                  <Label>Semester</Label>
                  <Scroll horizontal class="flex-1" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
                    <Chip active={sem() === null} onPress={() => sem.set(null)}>
                      All
                    </Chip>
                    {sems().map((value) => (
                      <Chip active={sem() === value} onPress={() => sem.set(value)}>
                        {`Sem ${value}`}
                      </Chip>
                    ))}
                  </Scroll>
                </View>

                <Btn variant="secondary" onPress={clear} label="Clear filters">
                  Clear all
                </Btn>
              </View>
            </If>

            <SectionHeader
              title="Datasets"
              trailing={<Badge tone="mint">{`${filtered().length} table${filtered().length === 1 ? "" : "s"}`}</Badge>}
            />
          </View>
        }
        footer={<View class="h-4" />}
      >
        {(row: () => Dataset) => (
          <Cell
            row={row}
            id={(item) => item.id}
            build={(item) => {
              const full = collegeName(item.college);
              const short = shortCollegeName(item.college);
              return (
                <View
                  class="min-h-11 flex-row items-center gap-3 rounded-3xl border border-border bg-card p-3.5 active:scale-[0.99] active:bg-muted"
                  onPress={() =>
                    nav.push("data.table", {
                      batch: item.batch,
                      branch: item.branch,
                      sem: item.sem,
                      college: item.college,
                    })
                  }
                  role="button"
                  accessibilityLabel={`${full}, semester ${item.sem}, batch ${item.batch}`}
                >
                  <View class="w-12 items-center justify-center gap-0.5 rounded-2xl bg-muted py-2">
                    <Text class="text-[17px] font-bold tabular-nums text-foreground">{item.sem}</Text>
                    <Text class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      sem
                    </Text>
                  </View>
                  <View class="flex-1 gap-1">
                    <Text class="text-[14px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                      {short}
                    </Text>
                    {full !== short ? <Muted numberOfLines={1}>{full}</Muted> : null}
                    <View class="flex-row flex-wrap items-center gap-1.5">
                      <Badge tone="ember">{`Batch ${item.batch}`}</Badge>
                      <Muted>{shortBranchLabel(item.branch)}</Muted>
                    </View>
                  </View>
                  <Icon name="chevron-right" size={18} class="text-muted-foreground" />
                </View>
              );
            }}
          />
        )}
      </List>
      )}
    </Screen>
  );
}

export const dataRoutes: RouteDef[] = [
  {
    name: "data",
    title: () => "Data browser",
    render: (nav) => <DataScreen nav={nav} />,
  },
];
