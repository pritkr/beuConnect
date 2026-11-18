/**
 * One college's published roster, for every college except GEC Sheikhpura.
 *
 * The screen offers only what BEU has published: the batches in the index, the
 * branches inside the chosen batch, the semesters inside that branch. Nothing is
 * guessed — a college with no roster says so, and a combination that was never
 * published cannot be selected at all.
 *
 * A roster is fetched once and cached by `lib/net` for a week, so the second open
 * paints before the network and the screen still answers in airplane mode.
 *
 * Framework note: this body runs once. Chips and rows are rebuilt through
 * `Fresh`/`Each` with the current selection in the key, so a tap is what moves
 * the screen.
 */

import { List, Scroll, Text, View, computed, signal } from "nsh";

import { Chip, Divider, EmptyState, ErrorState, Loading, Muted, Row, Screen, Search } from "../../ui";
import type { Nav } from "../../app/router";
import { Fresh } from "./components";
import { shortCollegeName } from "../results/colleges";
import {
  branchLabel,
  branchesFor,
  cgpaCount,
  filterRoster,
  loadRoster,
  rosterUrl,
  semsFor,
  batchesFor,
  hasRosters,
  type RemoteRow,
} from "./remote";

function mark(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function RosterLine(props: { row: RemoteRow }) {
  const row = props.row;
  return (
    <Row class="min-h-14 gap-3 bg-card px-4 py-2.5" label={`${row.name}, ${row.reg}, CGPA ${mark(row.cgpa)}`}>
      <View class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground" style={{ numberOfLines: 1 }}>
          {row.name}
        </Text>
        <Text class="font-mono text-[11px] text-muted-foreground" style={{ numberOfLines: 1 }}>
          {row.reg}
        </Text>
      </View>
      <View class="items-end gap-0.5">
        <Text class="text-[13px] font-semibold tabular-nums text-foreground">{mark(row.cgpa)}</Text>
        <Text class="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">CGPA</Text>
      </View>
    </Row>
  );
}

export function RemoteCollegeScreen(props: { nav: Nav; college: string }) {
  const college = props.college;
  const batches = batchesFor(college);

  if (batches.length === 0 || !hasRosters(college)) {
    return (
      <Screen>
        <View class="p-4">
          <EmptyState
            icon="building"
            title={`No roster for ${shortCollegeName(college)}`}
            hint="BEU has not published its students for any batch yet."
            action="All colleges"
            onAction={() => props.nav.replace("students.colleges", {})}
          />
        </View>
      </Screen>
    );
  }

  const firstBatch = batches[0];
  const firstBranch = branchesFor(college, firstBatch)[0] ?? "";
  const firstSems = semsFor(college, firstBatch, firstBranch);

  const batch = signal(firstBatch);
  const branch = signal(firstBranch);
  const sem = signal(firstSems[firstSems.length - 1] ?? 0);
  const query = signal("");

  const phase = signal<"loading" | "ready" | "error">("loading");
  const rows = signal<RemoteRow[]>([]);
  const message = signal("");

  async function load(): Promise<void> {
    const wanted = { batch: batch(), branch: branch(), sem: sem() };
    if (!rosterUrl(college, wanted.batch, wanted.branch, wanted.sem)) {
      rows.set([]);
      phase.set("ready");
      return;
    }
    phase.set("loading");
    message.set("");
    try {
      const loaded = await loadRoster(college, wanted.batch, wanted.branch, wanted.sem);
      // A chip tapped while the request was in flight wins; the late answer is
      // dropped rather than painting the wrong branch.
      if (batch() !== wanted.batch || branch() !== wanted.branch || sem() !== wanted.sem) return;
      rows.set(loaded);
      phase.set("ready");
    } catch (error) {
      if (batch() !== wanted.batch || branch() !== wanted.branch || sem() !== wanted.sem) return;
      message.set(error instanceof Error && error.message ? error.message : "The roster did not load.");
      phase.set("error");
    }
  }

  function chooseBatch(next: string): void {
    batch.set(next);
    const nextBranch = branchesFor(college, next)[0] ?? "";
    branch.set(nextBranch);
    const nextSems = semsFor(college, next, nextBranch);
    sem.set(nextSems[nextSems.length - 1] ?? 0);
    void load();
  }

  function chooseBranch(next: string): void {
    branch.set(next);
    const nextSems = semsFor(college, batch(), next);
    sem.set(nextSems[nextSems.length - 1] ?? 0);
    void load();
  }

  function chooseSem(next: number): void {
    sem.set(next);
    void load();
  }

  void load();

  const shown = computed(() => filterRoster(rows(), query()));
  const withCgpa = computed(() => cgpaCount(rows()));
  const countLine = computed(() => {
    const total = rows().length;
    const visible = shown().length;
    const suffix = visible === total ? "" : ` of ${total}`;
    const cgpa = withCgpa() === total ? "" : ` · ${withCgpa()} with CGPA`;
    return `${visible}${suffix}${cgpa}`;
  });

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-background px-4 pb-2 pt-3">
        <Search value={query()} onChange={(value) => query.set(value)} placeholder="Name or registration number" />

        <Fresh
          when={`batch:${batch()}`}
          build={() => (
            <Scroll horizontal scrollbar={false} bounces={false} class="-mx-4" contentClass="flex-row gap-2 px-4">
              {batches.map((value) => (
                <Chip active={batch() === value} onPress={() => chooseBatch(value)}>
                  {`Batch ${value}`}
                </Chip>
              ))}
            </Scroll>
          )}
        />

        <Fresh
          when={`branch:${batch()}|${branch()}`}
          build={() => (
            <Scroll horizontal scrollbar={false} bounces={false} class="-mx-4" contentClass="flex-row gap-2 px-4">
              {branchesFor(college, batch()).map((value) => (
                <Chip active={branch() === value} onPress={() => chooseBranch(value)}>
                  {branchLabel(value)}
                </Chip>
              ))}
            </Scroll>
          )}
        />

        <Fresh
          when={`sem:${batch()}|${branch()}|${sem()}`}
          build={() => (
            <Scroll horizontal scrollbar={false} bounces={false} class="-mx-4" contentClass="flex-row gap-2 px-4">
              {semsFor(college, batch(), branch()).map((value) => (
                <Chip active={sem() === value} onPress={() => chooseSem(value)}>
                  {`Sem ${value}`}
                </Chip>
              ))}
            </Scroll>
          )}
        />

        {phase() === "ready" ? (
          <Fresh when={countLine()} build={() => <Muted class="text-[11px] tabular-nums">{countLine()}</Muted>} />
        ) : null}
      </View>

      {phase() === "loading" ? <Loading label="Reading the roster…" /> : null}

      {phase() === "error" ? (
        <View class="p-4">
          <ErrorState message={message()} onRetry={() => void load()} />
        </View>
      ) : null}

      {phase() === "ready" ? (
        <Fresh
          when={`rows:${batch()}|${branch()}|${sem()}|${query()}`}
          build={() => (
            <List
              class="flex-1"
              contentClass="pb-6"
              each={shown()}
              keyExtractor={(row) => `${row.reg}:${row.session}`}
              estimatedItemSize={60}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              separator={<Divider />}
              empty={() => (
                <View class="p-4">
                  <EmptyState
                    icon="user-x"
                    title={query().trim() ? `No student matches “${query().trim()}”` : "No rows in this roster"}
                    action={query().trim() ? "Clear search" : undefined}
                    onAction={query().trim() ? () => query.set("") : undefined}
                  />
                </View>
              )}
            >
              {(row) => (
                <Each of={[row()]} key={(value) => `${value.reg}:${value.session}`}>
                  {() => <RosterLine row={row()} />}
                </Each>
              )}
            </List>
          )}
        />
      ) : null}

      <View class="border-t border-border px-4 py-2">
        <Muted class="text-[10px]">{`${shortCollegeName(college)} · Sem ${sem()} · BEU's published roster`}</Muted>
      </View>
    </Screen>
  );
}
