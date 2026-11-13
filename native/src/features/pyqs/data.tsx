/**
 * Data browser — every dataset the site publishes.
 *
 * The manifest is fetched once (cached for six hours) and flattened into one
 * row per batch/branch/semester/college. Rows open the virtualized table.
 */

import { List, Text, View, computed, effect, signal, cleanup } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { param } from "../../app/router";
import {
  Btn,
  EmptyState,
  ErrorState,
  Loading,
  Muted,
  Screen,
  Search,
  Stat,
  ListBar,
} from "../../ui";
import { Icon } from "../../ui/icons";
import { branchIcon } from "../../ui/branch-icon";
import { profileCollege, useProfile, useProfileReady } from "../settings/profile";
import type { Dataset } from "./api";
import {
  branchLabel,
  collegeName,
  errorMessage,
  loadDatasets,
  manifestBranch,
  prioritizeCollege,
  searchDatasets,
  shortBranchLabel,
  shortCollegeName,
} from "./api";
import { Cell, ChipRail, Hero } from "./components";

interface DataState {
  phase: "loading" | "ready" | "error";
  items: Dataset[];
  error: string;
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * One published table, as a dense row: semester lead, the college a student
 * recognises, then batch and branch on one muted line.
 *
 * The manifest holds thousands of these; a card with a full college name and
 * two chips spent three lines on data the title already says.
 */
function DatasetRow(props: { item: Dataset; onPress: () => void; label: string }) {
  const item = props.item;
  return (
    <View
      class="min-h-14 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={props.label}
    >
      <View class="w-11 items-center justify-center rounded-xl bg-muted py-1">
        <Text class="text-[15px] font-bold tabular-nums leading-5 text-foreground" style={{ numberOfLines: 1 }}>
          {item.sem}
        </Text>
        <Text class="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Sem
        </Text>
      </View>
      <View class="flex-1 gap-0.5">
        <Text class="text-[14px] font-semibold leading-5 text-foreground" style={{ numberOfLines: 2 }}>
          {shortCollegeName(item.college)}
        </Text>
        <Text class="text-[11px] leading-4 text-muted-foreground" style={{ numberOfLines: 1 }}>
          {`Batch ${item.batch} · ${shortBranchLabel(item.branch)}`}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} class="text-muted-foreground" />
    </View>
  );
}

function DataScreen(props: { nav: Nav }) {
  const nav = props.nav;
  // The field filters immediately: the index is precomputed and the list is
  // virtualised, so a debounce only adds a visible lag.
  const query = signal(param(nav, "q"));
  const filters = signal(false);
  const batch = signal<string | null>(null);
  const branch = signal<string | null>(null);
  const sem = signal<number | null>(null);
  const attempt = signal(0);
  const state = signal<DataState>({ phase: "loading", items: [], error: "" });
  const person = useProfile();
  const personReady = useProfileReady();

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

  /**
   * Open on the student's own tables: their batch, branch and semester come
   * from the saved registration number. Applied once, and only when a filter
   * for it exists — a profile never turns into a filter that matches nothing.
   */
  let defaultsApplied = false;
  effect(() => {
    if (defaultsApplied || !personReady() || state().phase !== "ready") return;
    defaultsApplied = true;
    const student = person();
    const items = state().items;
    const theirBatch = student.reg.slice(0, 2);
    const theirBranch = manifestBranch(student.branch);
    if (theirBatch !== "" && items.some((dataset) => dataset.batch === theirBatch)) batch.set(theirBatch);
    if (
      theirBranch !== "" &&
      items.some(
        (dataset) =>
          dataset.branch === theirBranch && (batch() === null || dataset.batch === batch()),
      )
    ) {
      branch.set(theirBranch);
    }
    const inScope = (dataset: Dataset) =>
      (batch() === null || dataset.batch === batch()) &&
      (branch() === null || dataset.branch === branch());
    if (student.sem >= 1 && items.some((dataset) => inScope(dataset) && dataset.sem === student.sem)) {
      sem.set(student.sem);
    }
  });

  /** The student's college leads every group; Sheikhpura next. */
  const preferredCollege = computed(() => profileCollege(person()));

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
    // The manifest's batch/branch/semester grouping is kept; the student's
    // college (then Sheikhpura) is lifted inside each group.
    return prioritizeCollege(searchDatasets(rows, query()), preferredCollege());
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
          estimatedItemSize={64}
          contentClass="gap-1.5 px-4 pb-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={state().phase === "loading" && state().items.length > 0}
          onRefresh={retry}
          empty={<View>{empty()}</View>}
        header={
          <View class="gap-4 pb-2 pt-4">
            <Hero>
              <View class="flex-row gap-4">
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

            <Search
              value={query()}
              onChange={(value) => query.set(value)}
              placeholder="College, branch or batch"
            />

            <View class="flex-row items-center justify-between gap-2">
              <Btn variant="ghost" onPress={() => filters.update((open) => !open)} label="Filters">
                {filters() ? "Done" : `Filters${filterCount() > 0 ? ` · ${filterCount()}` : ""}`}
              </Btn>
              <Muted>{`${filtered().length} of ${state().items.length}`}</Muted>
            </View>

            <If when={filters()}>
              <View class="gap-3 rounded-3xl border border-border bg-card p-3.5">
                <ChipRail
                  label="Batch"
                  note={batch() ?? "All"}
                  value={batch() ?? "all"}
                  options={[
                    { key: "all", label: "All" },
                    ...batches().map((value) => ({ key: value, label: value })),
                  ]}
                  onSelect={(key) => pickBatch(key === "all" ? null : key)}
                />

                <ChipRail
                  label="Branch"
                  note={branch() === null ? "All" : shortBranchLabel(branch() as string)}
                  value={branch() ?? "all"}
                  options={[
                    { key: "all", label: "All" },
                    ...branchCodes().map((value) => ({
                      key: value,
                      label: shortBranchLabel(value),
                      icon: branchIcon(value),
                    })),
                  ]}
                  onSelect={(key) => pickBranch(key === "all" ? null : key)}
                />

                <ChipRail
                  label="Semester"
                  note={sem() === null ? "All" : `Sem ${sem()}`}
                  value={sem() === null ? "all" : String(sem())}
                  options={[
                    { key: "all", label: "All" },
                    ...sems().map((value) => ({ key: String(value), label: `Sem ${value}` })),
                  ]}
                  onSelect={(key) => sem.set(key === "all" ? null : Number(key))}
                />

                <Btn variant="secondary" onPress={clear} label="Clear filters">
                  Clear all
                </Btn>
              </View>
            </If>
          </View>
        }
        footer={<View class="h-4" />}
      >
        {(row: () => Dataset) => (
          <Cell
            row={row}
            id={(item) => item.id}
            build={(item) => (
              <DatasetRow
                item={item}
                onPress={() =>
                  nav.push("data.table", {
                    batch: item.batch,
                    branch: item.branch,
                    sem: item.sem,
                    college: item.college,
                  })
                }
                label={`Open ${collegeName(item.college)}, semester ${item.sem}, batch ${item.batch}, ${branchLabel(item.branch)}`}
              />
            )}
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
