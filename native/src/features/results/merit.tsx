/**
 * Results — the merit list.
 *
 * `loadMerit` is the same published roster the result table uses, trimmed to
 * students who have a CGPA and ordered by it. The screen shows the first 100 in
 * a virtualized list so a full branch stays light, but it reads the whole
 * ranked roster: that is what makes the tie counts and the student's own rank
 * exact instead of "within this page".
 *
 * The screen is personal: when it knows your registration number (from the
 * route, or the last lookup on this phone) it shows where you sit, even when
 * your rank is past the first 100. Tapping any row opens that student's result.
 *
 * Honesty rules:
 *  - A tie shares the place, and the medal says `=1` rather than pretending one
 *    student is first and the other is third.
 *  - A student BEU published without a CGPA is not ranked here; the count of
 *    those rows is stated, never turned into rank zero.
 */

import { List, Text, View, cleanup, computed, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import {
  Btn,
  Divider,
  EmptyState,
  ErrorState,
  Label,
  Muted,
  Panel,
  Row,
  Screen,
  Subtitle,
} from "../../ui";
import type { RankScope } from "./components";
import {
  PositionCard,
  RankMedal,
  RowsSkeleton,
  ScopeChips,
  StudentRowView,
  TableCaption,
  aheadOf,
} from "./components";
import type { RankRow } from "./data";
import { branchShort, digits, loadMerit, parseReg, readRecent, semsFor } from "./data";
import { shortCollegeName } from "./colleges";
import { missingSentence, rankLabel, students, tieSentence, tieSize, unrankedCount } from "./ranking";
import type { Async } from "./shared";
import { Fresh, SelectionChips, cleanReg, idle, rosterError, useTableSelection } from "./shared";

/** How many rows the list shows; the screen still counts every ranked row. */
const SHOWN = 100;
/** `loadMerit` trims to a limit; ask for more than any BEU branch has. */
const ALL = 5000;

export function MeritScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const { selection, ready, apply } = useTableSelection(nav);
  const filters = signal(false);
  const scope = signal<RankScope>("branch");
  const attempt = signal(0);
  const state = signal<Async<RankRow[]>>(idle<RankRow[]>());

  const myReg = signal(cleanReg(param(nav, "reg")));
  const routeCollege = cleanReg(param(nav, "college"));
  const myCollege = computed(() => routeCollege || parseReg(myReg())?.college || "");

  let lastRows: RankRow[] | null = null;
  let lastKey = "";

  const published = computed(() => semsFor(selection().batch, selection().branch).length > 0);

  effect(() => {
    if (myReg()) return;
    void readRecent().then((rows) => {
      if (!myReg() && rows.length > 0) myReg.set(rows[0].reg);
    });
  });

  effect(() => {
    if (!ready()) return;
    const sel = selection();
    if (semsFor(sel.batch, sel.branch).length === 0) {
      /* BEU published nothing here: an empty state, not an error and not a
         request that could only 404. */
      state.set({ status: "ready", data: null, error: "" });
      return;
    }
    const within = scope() === "college" ? myCollege() : "";
    const key = `${sel.batch}|${sel.branch}|${sel.sem}|${within}`;
    const keep = key === lastKey ? lastRows : null;
    lastKey = key;
    void attempt();

    let alive = true;
    cleanup(() => {
      alive = false;
    });

    state.set({ status: "loading", data: keep, error: "" });
    void loadMerit({
      batch: sel.batch,
      branch: sel.branch,
      sem: sel.sem,
      college: within || undefined,
      limit: ALL,
    }).then(
      (rows) => {
        if (!alive) return;
        lastRows = rows;
        state.set({ status: "ready", data: rows, error: "" });
      },
      (error) => {
        if (!alive) return;
        /* The roster could not be read. Keep whatever this screen already
           held for the same table — a copy on this phone stays usable — and
           never let a failure read as "no students". */
        lastRows = keep;
        state.set({ status: "error", data: keep, error: rosterError(error) });
      },
    );
  });

  const retry = () => attempt.update((value) => value + 1);
  const rows = () => state().data ?? [];
  const page = () => rows().slice(0, SHOWN);
  const top = () => page().slice(0, 3);
  const allShown = () => rows().length <= SHOWN;
  const scopeLabel = () => (scope() === "college" ? college() || "College" : "University");
  const college = () => shortCollegeName(myCollege());

  /** How many students share this row's place in the standing on screen. */
  const tiedFor = (row: RankRow): number => {
    if (scope() === "college") return Math.max(1, tieSize(rows(), row.collegeRank, "collegeRank"));
    return Math.max(1, tieSize(rows(), row.rank, "rank"));
  };

  const placeOf = (row: RankRow): number | null => (scope() === "college" ? row.collegeRank : row.rank);

  /** A row shown with the place of the standing on screen, never branch rank
     inside a college list. */
  const scoped = (row: RankRow): RankRow =>
    scope() === "college" ? { ...row, rank: row.collegeRank } : row;

  /** The student's own row in the whole ranked roster, not just the page. */
  const mine = computed(() => {
    const numeric = digits(myReg());
    if (!numeric) return null;
    const row = rows().find((entry) => digits(entry.reg) === numeric);
    if (!row) return null;
    return { row, place: placeOf(row) };
  });

  const missing = computed(() => unrankedCount(rows()));

  /**
   * The caption's count: `null` until a roster has actually been read, so a
   * failed or pending load never prints "0 students".
   */
  const captionCount = () => (rows().length > 0 || state().status === "ready" ? rows().length : null);

  /** A refresh failed but rows from an earlier read are still on screen. */
  const stale = () => state().status === "error" && rows().length > 0;

  const empty = () => {
    if (!ready() || (state().status === "loading" && state().data === null)) return <RowsSkeleton count={7} />;
    if (state().status === "error") {
      return (
        <View class="p-4">
          <ErrorState title="The roster could not be read" message={state().error} onRetry={retry} />
        </View>
      );
    }
    if (!published()) {
      return (
        <View class="p-4">
          <EmptyState
            icon="table"
            title="No published table for this batch"
            hint={`BEU has published no ${branchShort(selection().branch)} roster for batch 20${selection().batch}. Merit needs a published table.`}
            action="Pick a published table"
            onAction={() => filters.set(true)}
          />
        </View>
      );
    }
    return (
      <View class="p-4">
        <EmptyState
          icon="table"
          title="No ranked student in this table"
          hint="BEU published this roster, but none of its rows carries a CGPA yet. Nothing here is estimated."
          action="Change filters"
          onAction={() => filters.set(true)}
        />
      </View>
    );
  };

  const emptyKey = computed(
    () =>
      `${ready()}|${state().status}|${state().error}|${published()}|${selection().batch}|${selection().branch}|${selection().sem}`,
  );

  const headerKey = computed(
    () =>
      `${selection().batch}|${selection().branch}|${selection().sem}|${scope()}|${myCollege()}|${rows().length}|${
        mine()?.row.reg ?? ""
      }|${myReg()}|${state().status}`,
  );

  const header = () => (
    <View class="gap-3 px-4 py-3">
      <If when={top().length > 0}>
        <View class="gap-2">
          <Label>Top of the table</Label>
          <Row class="gap-2">
            {top().map((row) => {
              const tied = tiedFor(row);
              const place = placeOf(row);
              return (
                <View
                  class="flex-1 gap-1.5 rounded-2xl border border-border bg-card px-2.5 py-2.5 active:bg-muted"
                  onPress={() => nav.push("results", { reg: row.reg, sem: selection().sem })}
                  role="button"
                  accessibilityLabel={`Rank ${rankLabel(place, tied)}${tied > 1 ? `, shared by ${tied} students` : ""}, ${row.name}, CGPA ${row.cgpaText}`}
                >
                  <Row class="justify-between gap-1">
                    <RankMedal rank={place} tied={tied} />
                    <Muted class="text-[10px]">{tied > 1 ? "tied" : "CGPA"}</Muted>
                  </Row>
                  <Text class="text-[12px] font-semibold leading-4 text-foreground" numberOfLines={2}>
                    {row.name}
                  </Text>
                  <Text class="text-[15px] font-bold tabular-nums text-foreground">{row.cgpaText}</Text>
                </View>
              );
            })}
          </Row>
        </View>
      </If>

      <If when={mine()}>
        {(found) => {
          const spot = found();
          const total = rows().length;
          const tied = tiedFor(spot.row);
          const place = spot.place;
          const shared = tieSentence(place, tied, scopeLabel());
          return (
            <PositionCard
              label={`Your position · Semester ${selection().sem}`}
              name={spot.row.name}
              reg={spot.row.reg}
              collegeCode={spot.row.collegeCode}
              rank={place}
              total={total}
              percentile={place !== null ? aheadOf(place, total) : null}
              tied={tied}
              note={
                shared !== ""
                  ? shared
                  : place !== null
                    ? `CGPA order in ${scopeLabel()}: ${place} of ${students(total)} ranked.`
                    : "This table has no CGPA for you in this scope, so there is no rank."
              }
            >
              <Row class="gap-3">
                <Btn
                  variant="secondary"
                  class="flex-1"
                  onPress={() => nav.push("results.rank", { reg: spot.row.reg, sem: selection().sem })}
                >
                  Full rank
                </Btn>
                <Btn
                  variant="ghost"
                  class="flex-1"
                  onPress={() => nav.push("results", { reg: spot.row.reg, sem: selection().sem })}
                >
                  My result
                </Btn>
              </Row>
            </PositionCard>
          );
        }}
      </If>

      <If when={myReg() !== "" && mine() === null}>
        <Panel tone="plain" class="gap-2">
          <Label>Your position</Label>
          <Subtitle class="text-[12px] leading-5">
            {`${myReg()} is not in this ${scope() === "college" && myCollege() ? college() : "branch"} roster for semester ${selection().sem}.`}
          </Subtitle>
          <Btn
            variant="secondary"
            onPress={() => nav.push("results.rank", { reg: myReg(), sem: selection().sem })}
          >
            Open my rank
          </Btn>
        </Panel>
      </If>

      <If when={myReg() === ""}>
        <Panel tone="plain" class="gap-1">
          <Label>Your position</Label>
          <Subtitle class="text-[12px] leading-5">
            Check your own result first; this page will then show your row.
          </Subtitle>
          <View
            class="min-h-11 justify-center active:bg-muted"
            onPress={() => nav.push("results")}
            role="button"
            accessibilityLabel="Open results to check a number"
          >
            <Text class="text-[13px] font-semibold text-foreground">Open Results</Text>
          </View>
        </Panel>
      </If>

      <If when={missing() > 0}>
        <Muted class="text-[11px] leading-4">{missingSentence(missing())}</Muted>
      </If>
    </View>
  );

  const footerKey = computed(
    () => `${rows().length}|${page().length}|${allShown()}|${selection().sem}|${state().status}`,
  );

  return (
    <Screen>
      <View class="gap-3 px-4 pb-3 pt-3">
        <Row class="items-start justify-between gap-3">
          <View class="flex-1 gap-0.5">
            <Label>BEU · Merit list</Label>
            <Text class="text-[22px] font-bold tracking-tight text-foreground">The toppers.</Text>
          </View>
          <Btn variant="ghost" onPress={() => filters.update((open) => !open)} label="Filters">
            {filters() ? "Done" : "Filters"}
          </Btn>
        </Row>

        <Muted class="text-[12px] leading-5">
          {scope() === "college" && myCollege()
            ? `BEU's published roster, ordered by CGPA. ${scopeLabel()} counts only ${college()}. A tie shares the place.`
            : "BEU's published roster, ordered by CGPA, counting every college. A tie shares the place."}
        </Muted>

        <Row class="flex-wrap items-center justify-between gap-2">
          <Fresh
            when={headerKey()}
            build={() => (
              <TableCaption
                batch={selection().batch}
                branch={selection().branch}
                sem={selection().sem}
                count={captionCount()}
                shown={page().length}
                scope={scope() === "college" && myCollege() ? college() : "all colleges"}
              />
            )}
          />
          <Muted class="tabular-nums text-[11px]">
            {state().status === "error" ? "" : allShown() ? "All ranked" : `Top ${SHOWN} shown`}
          </Muted>
        </Row>

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

        <Fresh
          when={`scope:${scope()}:${myCollege()}`}
          build={() => (
            <ScopeChips
              value={scope()}
              onChange={(next) => {
                if (next === "college" && !myCollege()) return;
                scope.set(next);
              }}
              collegeLabel={myCollege() ? college() : "My college"}
            />
          )}
        />
      </View>

      <View class="mx-4 flex-1 overflow-hidden rounded-3xl border border-border">
        {() => (
          <List
            class="flex-1"
            contentClass="pb-2"
            testID="merit-list"
            each={page()}
            keyExtractor={(row) => row.reg}
            estimatedItemSize={64}
            refreshing={state().status === "loading" && rows().length > 0}
            onRefresh={retry}
            separator={<Divider />}
            empty={() => <Fresh when={emptyKey()} build={empty} />}
            header={() => <Fresh when={headerKey()} build={header} />}
            footer={() => (
              <Fresh
                when={footerKey()}
                build={() =>
                  /* With no rows and a failed load, the count line would read
                     "All 0 students" — a failure is not a finding of nobody. */
                  state().status === "error" && rows().length === 0 ? null : (
                    <View class="px-4 py-3">
                      <Muted class="text-[11px] leading-4">
                        {allShown()
                          ? `All ${students(rows().length)} with a CGPA.`
                          : `Showing the top ${SHOWN} of ${students(rows().length)} with a CGPA. Open Rank for a full standing.`}
                      </Muted>
                    </View>
                  )
                }
              />
            )}
          >
            {(item) => (
              <Each of={[item()]} key={(row) => `${row.reg}|${digits(myReg())}|${tiedFor(row)}|${scope()}`}>
                {() => (
                  <StudentRowView
                    row={scoped(item())}
                    tied={tiedFor(item())}
                    showCollege={scope() === "branch"}
                    highlight={digits(item().reg) === digits(myReg()) && myReg() !== ""}
                    onPress={() => nav.push("results", { reg: item().reg, sem: selection().sem })}
                  />
                )}
              </Each>
            )}
          </List>
        )}
      </View>
    </Screen>
  );
}
