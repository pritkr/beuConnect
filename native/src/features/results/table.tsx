/**
 * Results — the branch result table.
 *
 * Batch, branch and semester pick one of BEU's published rosters; the rows are
 * ranked by CGPA (ties share a rank) and virtualized, so a 2,000 student table
 * stays smooth on a phone.
 *
 * Three rules keep it readable on a 320 pt screen:
 *
 *  - The column header is fixed above the scrolling rows — a table that loses
 *    its labels after one swipe is unreadable. Row and header use the same
 *    gutters, so no line ever scrolls sideways.
 *  - Sorting is a plain choice (rank, SGPA, name), not a hidden tap on a header
 *    that a phone cannot reach.
 *  - The list reads 50 rows at a time and the pager below says exactly how many
 *    are showing. A branch with 2,000 students still opens instantly.
 *
 * A number that is present is "your row", highlighted and one tap from the top
 * of the list. Search is local and debounced: a name, or the digits of a
 * registration number.
 *
 * Framework note: this component body runs once. Built-in props (`each`,
 * `when`) follow their signals; a value read inside a custom component's body
 * does not, so every changing chunk is rebuilt through `Fresh` or `Each`.
 */

import { List, Text, View, cleanup, computed, effect, signal, type YNode } from "nsh";

import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { debounce } from "../../lib/net";
import { Btn, Chip, Divider, EmptyState, ErrorState, Label, Muted, Panel, Row, Screen, Search, Subtitle } from "../../ui";
import { RowsSkeleton, StudentRowView, TableCaption } from "./components";
import type { RankRow } from "./data";
import { branchShort, digits, hasCoverage, loadRoster, parseReg, readRecent, semsFor } from "./data";
import { tieSize } from "./ranking";
import type { Async } from "./shared";
import { Fresh, SelectionChips, cleanReg, idle, isValidReg, rosterError, useTableSelection } from "./shared";

/** Typing a letter should not re-filter 2,000 rows on every keystroke. */
const SEARCH_DEBOUNCE = 220;
/** One page of rows. A phone should never be asked to paint a whole branch. */
const PAGE = 50;

type SortMode = "rank" | "sgpa" | "name";

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "rank", label: "By rank" },
  { mode: "sgpa", label: "By SGPA" },
  { mode: "name", label: "A–Z" },
];

/**
 * The fixed column labels. The widths are the contract `StudentRowView` keeps:
 * a 9-unit rank gutter, a flex name, an 11-unit SGPA and a 12-unit CGPA, both
 * right-aligned and tabular. Change one there and the header must follow.
 */
function ColumnHeader() {
  return (
    <View class="flex-row items-center gap-3 border-b border-border bg-card px-4 py-2">
      <Text class="w-9 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        #
      </Text>
      <Text class="flex-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Student
      </Text>
      <Text class="w-11 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        SGPA
      </Text>
      <Text class="w-12 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        CGPA
      </Text>
    </View>
  );
}

export function ResultTableScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const { selection, ready, apply } = useTableSelection(nav);
  const filters = signal(false);
  /** What the field shows, and what the list filters by, a beat later. */
  const typed = signal("");
  const applied = signal("");
  const sort = signal<SortMode>("rank");
  const page = signal(1);
  const attempt = signal(0);
  const state = signal<Async<RankRow[]>>(idle<RankRow[]>());

  /* The row to highlight: the number in the search field, else the one this
     screen was opened with, else the last lookup on this phone. Pinning keeps
     the highlight after the search is cleared for the jump. */
  const routeReg = cleanReg(param(nav, "reg"));
  const knownReg = signal(routeReg);
  const pinned = signal("");

  const typedReg = computed(() => {
    const value = cleanReg(applied());
    return isValidReg(value) ? digits(value) : "";
  });

  const myReg = computed(() => typedReg() || pinned() || knownReg());

  let list: YNode | null = null;
  let lastRows: RankRow[] | null = null;
  let lastKey = "";
  let autoScrolled = "";

  const commit = debounce((value: string) => {
    // A cleared field must not be overwritten by a timer from the last key.
    if (value !== typed()) return;
    if (value !== applied()) applied.set(value);
  }, SEARCH_DEBOUNCE);

  const search = (value: string) => {
    typed.set(value);
    commit(value);
  };

  const clearSearch = () => {
    typed.set("");
    applied.set("");
  };

  const filtered = computed(() => {
    const rows = state().data ?? [];
    const raw = applied().trim().toLowerCase();
    if (!raw) return rows;
    const numeric = raw.replace(/\D/g, "");
    const byNumber = numeric.length >= 2;
    return rows.filter((row) => {
      if (row.name.toLowerCase().indexOf(raw) >= 0) return true;
      return byNumber && digits(row.reg).indexOf(numeric) >= 0;
    });
  });

  /**
   * The order the screen is showing. `rank` keeps BEU's CGPA order (ties stay
   * adjacent and share a place); `sgpa` lifts the semester score; `name` is
   * alphabetical. Students with no CGPA sort last in both numeric orders —
   * they are not a zero.
   */
  const sorted = computed(() => {
    const rows = filtered();
    if (sort() === "name") {
      return [...rows].sort((left, right) => left.name.localeCompare(right.name) || left.reg.localeCompare(right.reg));
    }
    if (sort() === "sgpa") {
      return [...rows].sort(
        (left, right) => (right.sgpa ?? -1) - (left.sgpa ?? -1) || (right.cgpa ?? -1) - (left.cgpa ?? -1),
      );
    }
    return rows;
  });

  const total = computed(() => sorted().length);
  const visible = computed(() => sorted().slice(0, page() * PAGE));

  const rows = () => state().data ?? [];

  /**
   * The caption's count: the whole published roster, so a search or a later
   * page still says how many students the table holds. `null` until a roster
   * has actually been read.
   */
  const captionCount = () => (state().data !== null || state().status === "ready" ? rows().length : null);

  /** A refresh failed but rows from an earlier read are still on screen. */
  const stale = () => state().status === "error" && rows().length > 0;

  /** The student's row in the whole roster, search or no search. */
  const myRow = computed(() => {
    const mine = digits(myReg());
    if (!mine) return null;
    return (state().data ?? []).find((row) => digits(row.reg) === mine) ?? null;
  });

  /** How many students share a row's place; 1 when the place is unique. */
  const tiedFor = (row: RankRow): number => Math.max(1, tieSize(rows(), row.rank, "rank"));

  const myChip = (): string => {
    const row = myRow();
    if (!row) return "";
    if (row.rank === null) return "Your row";
    return `Your row · ${tieSize(rows(), row.rank, "rank") > 1 ? "=" : "#"}${row.rank}`;
  };

  const isMine = (row: RankRow): boolean => {
    const mine = digits(myReg());
    return mine !== "" && digits(row.reg) === mine;
  };

  effect(() => {
    if (knownReg()) return;
    void readRecent().then((recent) => {
      if (!knownReg() && recent.length > 0) knownReg.set(recent[0].reg);
    });
  });

  /* A new search, sort or table always starts at the first page. */
  effect(() => {
    void applied();
    void sort();
    void selection();
    page.set(1);
  });

  effect(() => {
    if (!ready()) return;
    const sel = selection();
    const key = `${sel.batch}|${sel.branch}|${sel.sem}`;
    const keep = key === lastKey ? lastRows : null;
    lastKey = key;
    void attempt(); // read: retry and pull-to-refresh fetch again

    let alive = true;
    cleanup(() => {
      alive = false;
    });

    state.set({ status: "loading", data: keep, error: "" });
    void loadRoster(sel.batch, sel.branch, sel.sem).then(
      (loaded) => {
        if (!alive) return;
        lastRows = loaded;
        state.set({ status: "ready", data: loaded, error: "" });
      },
      (error) => {
        if (!alive) return;
        /* The roster could not be read. Keep the rows this screen already
           holds for the same table — a copy on this phone stays usable — and
           never let a failure read as "no students". */
        lastRows = keep;
        state.set({ status: "error", data: keep, error: rosterError(error) });
      },
    );
  });

  /**
   * A full registration number in the field (or the one the screen opened
   * with) turns to the page holding that row and scrolls it into view. A
   * student should not have to swipe past 400 names to find themselves.
   */
  effect(() => {
    const loaded = state().data;
    if (!loaded || state().status !== "ready") return;
    const mine = digits(myReg());
    if (!mine) return;
    const sel = selection();
    const index = sorted().findIndex((row) => digits(row.reg) === mine);
    if (index < 0) return;
    const key = `${sel.batch}|${sel.branch}|${sel.sem}|${mine}|${applied().trim()}|${sort()}`;
    if (autoScrolled === key) return;
    autoScrolled = key;
    const needed = Math.ceil((index + 1) / PAGE);
    if (page() < needed) page.set(needed);
    if (index < 2) return;
    setTimeout(() => list?.scrollToIndex({ index, animated: false, viewPosition: 0.3 }), 140);
  });

  const retry = () => attempt.update((value) => value + 1);
  const loading = () => !ready() || (state().status === "loading" && state().data === null);

  /** Clear the search first: a filtered list cannot scroll to a hidden row. */
  const showMyRow = () => {
    const row = myRow();
    if (!row) return;
    pinned.set(row.reg);
    if (typed() !== "" || applied() !== "") clearSearch();
    const index = sorted().findIndex((candidate) => digits(candidate.reg) === digits(row.reg));
    if (index < 0) return;
    page.set(Math.max(1, Math.ceil((index + 1) / PAGE)));
    setTimeout(() => list?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }), 90);
  };

  /** The student's own batch + branch, when they differ from the open table. */
  const regTable = (): { batch: string; branch: string } | null => {
    const info = parseReg(routeReg);
    if (!info || semsFor(info.batch, info.branch).length === 0) return null;
    const sel = selection();
    if (info.batch === sel.batch && info.branch === sel.branch) return null;
    return { batch: info.batch, branch: info.branch };
  };

  /** What every empty and error state names: the table that was looked for. */
  const where = (): string => {
    const sel = selection();
    return `Batch 20${sel.batch} · ${branchShort(sel.branch)} · Sem ${sel.sem}`;
  };

  const empty = () => {
    if (loading()) return <RowsSkeleton count={8} />;
    if (state().status === "error") {
      const sel = selection();
      return (
        <View class="gap-2 p-4">
          <ErrorState title="This table did not load" message={state().error} onRetry={retry} />
          <Muted class="text-center text-[11px] leading-4">
            {`Batch 20${sel.batch} · ${branchShort(sel.branch)} · Sem ${sel.sem}`}
          </Muted>
        </View>
      );
    }

    const sel = selection();
    if (applied().trim()) {
      return (
        <View class="p-4">
          <EmptyState
            icon="search"
            title="No match in this table"
            hint={`Nothing in Batch 20${sel.batch} · ${branchShort(sel.branch)} · Sem ${sel.sem} matches.`}
            action="Clear search"
            onAction={clearSearch}
          />
        </View>
      );
    }

    return (
      <View class="p-4">
        <EmptyState
          icon="table"
          title="No rows in this table"
          hint={
            hasCoverage(sel.batch, sel.branch, sel.sem)
              ? `Batch 20${sel.batch} · ${branchShort(sel.branch)} · Sem ${sel.sem}. BEU published it with no students.`
              : `Batch 20${sel.batch} · ${branchShort(sel.branch)} · Sem ${sel.sem}. BEU has not published it.`
          }
          action="Change filters"
          onAction={() => filters.set(true)}
        />
      </View>
    );
  };

  /** Everything the `List` would have to be told again when the empty slot changes. */
  const emptyKey = computed(
    () =>
      `${loading()}|${state().status}|${state().error}|${applied()}|${selection().batch}|${selection().branch}|${selection().sem}`,
  );

  const pagerKey = computed(() => `${page()}|${total()}|${visible().length}|${sort()}|${applied()}|${state().status}`);
  const captionKey = computed(
    () =>
      `${selection().batch}|${selection().branch}|${selection().sem}|${rows().length}|${total()}|${visible().length}|${myRow()?.reg ?? ""}|${myChip()}|${state().status}`,
  );

  const pager = () => (
    <View
      class="flex-row items-center justify-between gap-3 border-t border-border bg-card px-4 py-2"
      testID="table-pager"
    >
      <Muted class="flex-1 text-[11px] leading-4 tabular-nums">
        {total() === 0
          ? state().status === "ready"
            ? "No rows"
            : "Rows not read yet"
          : `Showing ${visible().length} of ${total()}${sort() === "rank" ? " · CGPA order" : sort() === "sgpa" ? " · SGPA order" : " · A–Z"}`}
      </Muted>
      <If when={visible().length < total()}>
        <Btn variant="secondary" class="min-h-11 px-3" onPress={() => page.update((value) => value + 1)}>
          Show 50 more
        </Btn>
      </If>
    </View>
  );

  return (
    <Screen>
      <View class="gap-3 px-4 pb-3 pt-3">
        <Row class="items-start justify-between gap-3">
          <View class="flex-1 gap-0.5">
            <Label>BEU · Result table</Label>
            <Text class="text-[22px] font-bold tracking-tight text-foreground">Who is on top?</Text>
          </View>
          <Btn
            variant="ghost"
            onPress={() => filters.update((open) => !open)}
            label={filters() ? "Done" : "Filters"}
          >
            {filters() ? "Done" : "Filters"}
          </Btn>
        </Row>

        <Search value={typed()} onChange={search} placeholder="Name or registration number" />

        <Row class="flex-wrap items-center justify-between gap-2">
          <View
            class="min-h-11 flex-1 justify-center active:bg-muted"
            onPress={() => filters.set(true)}
            role="button"
            accessibilityLabel={`Change filters. ${where()}`}
          >
            <Fresh
              when={captionKey()}
              build={() => (
                <TableCaption
                  batch={selection().batch}
                  branch={selection().branch}
                  sem={selection().sem}
                  count={captionCount()}
                  shown={visible().length}
                  scope="all colleges"
                />
              )}
            />
          </View>
          <If when={myRow()}>
            <Fresh
              when={`mine:${myChip()}`}
              build={() => (
                <Chip onPress={showMyRow} label="Scroll to your row">
                  {myChip()}
                </Chip>
              )}
            />
          </If>
        </Row>

        <View class="gap-1.5">
          <Label class="text-[10px]">Sort</Label>
          <Fresh
            when={`sort:${sort()}`}
            build={() => (
              <Row class="flex-wrap gap-2">
                {SORTS.map((item) => (
                  <Chip active={sort() === item.mode} onPress={() => sort.set(item.mode)}>
                    {item.label}
                  </Chip>
                ))}
              </Row>
            )}
          />
        </View>

        <If when={routeReg !== "" && !loading() && state().status === "ready" && myRow() === null}>
          <Fresh
            when={`absent:${routeReg}:${selection().batch}:${selection().branch}`}
            build={() => {
              const target = regTable();
              return (
                <Row class="flex-wrap items-center justify-between gap-2">
                  <Muted class="flex-1 text-[11px] leading-4">{`${routeReg} is not in this table.`}</Muted>
                  {target ? (
                    <Btn
                      variant="ghost"
                      class="px-3"
                      label="Open my branch table"
                      onPress={() => apply({ batch: target.batch, branch: target.branch })}
                    >
                      My branch
                    </Btn>
                  ) : null}
                </Row>
              );
            }}
          />
        </If>

        <If when={stale()}>
          <Panel tone="amber" class="gap-1">
            <Label>Could not refresh</Label>
            <Subtitle class="text-[12px] leading-5">
              The latest roster could not be read. These rows are the copy already on this phone.
            </Subtitle>
            <Btn variant="secondary" class="min-h-11" onPress={retry}>
              Try again
            </Btn>
          </Panel>
        </If>

        <If when={filters()}>
          <Panel tone="plain">
            <SelectionChips selection={selection} apply={apply} />
          </Panel>
        </If>
      </View>

      <View class="mx-4 flex-1 overflow-hidden rounded-3xl border border-border">
        <ColumnHeader />
        {() => (
          <List
            class="flex-1"
            contentClass="pb-2"
            testID="result-table"
            each={visible()}
            keyExtractor={(row) => row.reg}
            estimatedItemSize={64}
            initialScrollIndex={Math.max(0, (page() - 1) * PAGE)}
            refreshing={state().status === "loading" && rows().length > 0}
            onRefresh={retry}
            ref={(node: YNode) => {
              list = node;
            }}
            separator={<Divider />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            empty={() => <Fresh when={emptyKey()} build={empty} />}
          >
            {/* Rebuilt when the cell is reused or the highlight moves: a
                recycled row reads its props once, so "you" would otherwise
                stay on whichever row was built first. */}
            {(item) => (
              <Fresh
                when={`${item().reg}|${digits(myReg())}`}
                build={() => (
                  <StudentRowView
                    row={item()}
                    tied={tiedFor(item())}
                    showCollege
                    showSgpa
                    highlight={isMine(item())}
                    onPress={() => nav.push("results.rank", { reg: item().reg, sem: selection().sem })}
                  />
                )}
              />
            )}
          </List>
        )}
        <Fresh when={pagerKey()} build={pager} />
      </View>
    </Screen>
  );
}
