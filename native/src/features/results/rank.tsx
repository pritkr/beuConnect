/**
 * Results — where this student stands.
 *
 * One registration number reads BEU's published branch roster and places the
 * student inside it: rank in the university branch, rank in the college, the
 * percentile bar, and the students directly above and below. Every number on
 * the screen comes from that roster — nothing is estimated and nothing shows a
 * zero when the number is simply not in the table.
 *
 * Two honesty rules shape the copy:
 *
 *  - **Ties are shared places.** `data.ts` assigns a competition rank, so two
 *    students with the same CGPA both hold rank 3 and the next student is
 *    rank 5. The screen prints `=3` and says how many share it.
 *  - **A missing CGPA is not rank 0.** A student BEU published without a CGPA
 *    has no rank; the screen counts them separately so a percentile is only
 *    ever computed against students who are actually in the order.
 *
 * The batch / branch / semester filters pick which published table is read.
 * They start on the table implied by the registration number; changing them
 * looks inside another published table, and the screen says plainly when the
 * number is not there.
 *
 * Framework note: this component body runs once. `spot()`, `rivals()` and the
 * tie counts are `computed`, and the block that reads them is rebuilt through
 * `Fresh` when the Branch/College choice changes.
 */

import { Text, View, cleanup, computed, effect, signal, announce } from "nsh";

import type { Nav } from "../../app/router";
import { numParam, param } from "../../app/router";
import {
  Body,
  Btn,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Label,
  Muted,
  Panel,
  Row,
  Screen,
  Stat,
  Subtitle,
} from "../../ui";
import type { RankScope } from "./components";
import { Line, PositionCard, RowsSkeleton, ScopeChips, SemChips, StudentRowView, aheadOf, CgpaSpread } from "./components";
import type { RankRow } from "./data";
import { branchShort, currentSemester, digits, loadRoster, parseReg, publishedSem, semsFor } from "./data";
import { shortCollegeName } from "./colleges";
import { cachedIdentity } from "./identity";
import { rankLabel, tieSentence, tieSize, unrankedCount, cgpaDistribution } from "./ranking";
import type { Async, TableSelection } from "./shared";
import {
  CopyButton,
  Fresh,
  RegField,
  SelectionChips,
  cleanReg,
  idle,
  isValidReg,
  normalizeSelection,
  rosterError,
  suggestedSem,
} from "./shared";

/**
 * What one roster says about one registration number. `student` is null when
 * the number is not in the published table — a real answer, not a failure, and
 * the screen says it in words instead of printing rank 0.
 */
interface Standing {
  /** The whole branch roster: CGPA order, ties sharing a place. */
  rows: RankRow[];
  student: RankRow | null;
  /** Students with a CGPA: the only ones a rank can be counted against. */
  branchTotal: number;
  collegeTotal: number;
}

interface Spot {
  rank: number | null;
  total: number;
  percentile: number | null;
}

interface Rivals {
  above: RankRow | null;
  below: RankRow | null;
}

interface Request {
  reg: string;
  batch: string;
  branch: string;
  sem: number;
}

const NO_SPOT: Spot = { rank: null, total: 0, percentile: null };

function standingFor(rows: RankRow[], numeric: string): Standing {
  const student = rows.find((row) => digits(row.reg) === numeric) ?? null;
  const branchTotal = rows.filter((row) => row.cgpa !== null).length;
  const collegeCode = student ? student.collegeCode : "";
  const collegeTotal = collegeCode
    ? rows.filter((row) => row.collegeCode === collegeCode && row.cgpa !== null).length
    : 0;
  return { rows, student, branchTotal, collegeTotal };
}

/** One clipboard line: a real place, or the honest reason there is none. */
function rankLine(label: string, rank: number | null, tied: number, total: number): string {
  if (rank === null) return total > 0 ? `${label}: not ranked (${total} ranked)` : `${label}: not ranked (no CGPA)`;
  return `${label} ${rankLabel(rank, tied)} of ${total}`;
}

/** The clipboard-ready standing: the lines a student pastes into a chat. */
function rankSummary(
  standing: Standing,
  branch: string,
  sem: number,
  tiedBranch: number,
  tiedCollege: number,
  name: string,
): string {
  const student = standing.student;
  if (!student) return "";
  return [
    `${name || "BEU student"} — ${branchShort(branch)} semester ${sem}`,
    `Reg ${student.reg}`,
    rankLine("University rank", student.rank, tiedBranch, standing.branchTotal),
    rankLine("College rank", student.collegeRank, tiedCollege, standing.collegeTotal),
    `SGPA ${student.sgpaText} · CGPA ${student.cgpaText}`,
    "beu.prit.eu.org",
  ].join("\n");
}

export function RankScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const routeReg = cleanReg(param(nav, "reg"));
  const routeSem = numParam(nav, "sem");
  const routeInfo = parseReg(routeReg);

  const reg = signal(routeReg);
  const batch = signal(routeInfo?.batch ?? "");
  const branch = signal(routeInfo?.branch ?? "");
  const sem = signal(publishedSem(routeSem, routeInfo?.batch ?? "", routeInfo?.branch ?? ""));
  /* A route that names both the number and its semester is a deliberate table;
     a semester on its own is a hint, and a typed number follows its own table. */
  const semChosen = signal(isValidReg(routeReg) && routeSem >= 1 && routeSem <= 8);
  const editing = signal(!isValidReg(routeReg));
  const filters = signal(false);
  const formError = signal("");
  const scope = signal<RankScope>("branch");

  const firstBatch = routeInfo?.batch ?? "";
  const firstBranch = routeInfo?.branch ?? "";
  const firstSem = publishedSem(routeSem, firstBatch, firstBranch);
  const initialRequest: Request | null =
    isValidReg(routeReg) && semsFor(firstBatch, firstBranch).length > 0
      ? { reg: routeReg, batch: firstBatch, branch: firstBranch, sem: firstSem }
      : null;

  const request = signal<Request | null>(initialRequest);
  const state = signal<Async<Standing>>(
    initialRequest ? { status: "loading", data: null, error: "" } : idle<Standing>(),
  );

  /** The table the screen is reading, and whether BEU published it. */
  const published = computed(() => semsFor(batch(), branch()).length > 0);
  const publishedSems = computed(() => semsFor(batch(), branch()));

  /** The semesters the number being typed actually published, before Find. */
  const draftSems = computed(() => {
    const parsed = parseReg(reg());
    return parsed ? semsFor(parsed.batch, parsed.branch) : publishedSems();
  });

  /** The batch and branch the field is pointing at, before Find is pressed. */
  const draftTable = computed(() => {
    const parsed = parseReg(reg());
    return parsed ? `Batch 20${parsed.batch} · ${branchShort(parsed.branch)}` : "";
  });

  /** Whether the typed number's batch and branch have any roster at all. */
  const draftCovered = computed(() => draftSems().length > 0);

  /** The class the typed number is in today, 0 when there is no number. */
  const classSem = computed(() => {
    const parsed = parseReg(reg());
    return parsed ? currentSemester(parsed.batch, parsed.lateral) : 0;
  });

  /** The typed class is ahead of the newest table BEU has published. */
  const aheadOfTables = computed(
    () => draftSems().length > 0 && classSem() > Math.max(...draftSems()),
  );

  const start = (regValue: string, semValue: number) => {
    const value = cleanReg(regValue);
    if (!isValidReg(value)) {
      formError.set("Enter at least 8 digits of a registration number.");
      return;
    }
    const info = parseReg(value);
    const nextBatch = info?.batch ?? batch();
    const nextBranch = info?.branch ?? branch();
    /* The number implies its table: open the semester its batch is sitting in,
       clamped to the newest roster BEU published for it. Semester 1 carries no
       CGPA, so opening there would print "no rank" for everyone. A semester the
       student picked by hand, or the route named, wins. */
    const nextSem = semChosen()
      ? publishedSem(semValue, nextBatch, nextBranch)
      : publishedSem(suggestedSem(value), nextBatch, nextBranch);
    formError.set("");
    reg.set(value);
    batch.set(nextBatch);
    branch.set(nextBranch);
    sem.set(nextSem);
    editing.set(false);
    request.set({ reg: value, batch: nextBatch, branch: nextBranch, sem: nextSem });
  };

  effect(() => {
    const req = request();
    if (!req) return;

    if (semsFor(req.batch, req.branch).length === 0) {
      /* BEU published nothing for this batch and branch: an empty state, not a
         failed request. Nothing is fetched and nothing is estimated. */
      state.set({ status: "ready", data: null, error: "" });
      return;
    }

    let alive = true;
    cleanup(() => {
      alive = false;
    });

    state.set({ status: "loading", data: null, error: "" });
    void loadRoster(req.batch, req.branch, req.sem).then(
      (rows) => {
        if (!alive) return;
        const standing = standingFor(rows, digits(req.reg));
        state.set({ status: "ready", data: standing, error: "" });
        announce(
          standing.student === null
            ? "That number is not in this table."
            : standing.student.rank === null
              ? "That student has no CGPA in this table."
              : `Rank loaded. ${standing.student.rank} in the branch.`,
        );
      },
      (error) => {
        if (alive) state.set({ status: "error", data: null, error: rosterError(error) });
      },
    );
  });

  /* The field follows what is being typed; the loaded request owns the labels. */

  /** A number typed for a branch that never published the chosen semester
     moves the chips to one that did, instead of a silent 404 later. */
  effect(() => {
    const parsed = parseReg(reg());
    if (!parsed) return;
    const sems = semsFor(parsed.batch, parsed.branch);
    if (sems.length === 0) return;
    /* Follow the number: the class it is in, clamped to the newest table BEU
       published for it. A semester picked by hand, or by the route, wins. */
    const next = semChosen()
      ? sems.indexOf(sem()) < 0
        ? Math.max(...sems)
        : sem()
      : publishedSem(suggestedSem(reg()), parsed.batch, parsed.branch);
    if (next !== sem()) sem.set(next);
  });

  const standing = computed(() => state().data);
  const student = computed(() => standing()?.student ?? null);
  const college = computed(() => shortCollegeName(student()?.collegeCode ?? ""));

  /* A row with no college code has no college standing. Never leave the screen
     stuck in a scope whose chip is not rendered, with no way back. */
  effect(() => {
    if (student() && student()?.collegeCode === "" && scope() === "college") scope.set("branch");
  });

  /* BEU publishes roster names in capitals; an identity already saved on this
     phone has the name the student knows. Cache-only, so the screen stays
     offline and adds no request. */
  const savedName = signal("");
  effect(() => {
    const row = student();
    savedName.set("");
    if (!row) return;
    let alive = true;
    cleanup(() => {
      alive = false;
    });
    void cachedIdentity(row.reg).then((identity) => {
      if (alive && identity !== null && identity.name !== "") savedName.set(identity.name);
    });
  });

  /** Saved name first, published roster second. */
  const studentName = computed(() => savedName() || student()?.name || "");

  /** A roster row renamed to its saved identity when it is the student. */
  const named = (row: RankRow): RankRow => {
    const own = student();
    if (!own || digits(row.reg) !== digits(own.reg)) return row;
    const display = studentName();
    return display === "" ? row : { ...row, name: display };
  };
  const scopeLabel = computed(() => (scope() === "college" ? college() || "College" : "University"));

  /** The roster in the order the chosen standing is counted in. */
  const order = computed(() => {
    const value = standing();
    const row = value ? value.student : null;
    if (!value || !row) return [] as RankRow[];
    if (scope() === "college") return value.rows.filter((entry) => entry.collegeCode === row.collegeCode);
    return value.rows;
  });

  const spot = computed<Spot>(() => {
    const value = standing();
    const row = value ? value.student : null;
    if (!value || !row) return NO_SPOT;
    const collegeScope = scope() === "college";
    const rank = collegeScope ? row.collegeRank : row.rank;
    const total = collegeScope ? value.collegeTotal : value.branchTotal;
    return { rank, total, percentile: rank === null ? null : aheadOf(rank, total) };
  });

  /** Students sharing the university-branch place. */
  const tiedBranch = computed(() => {
    const value = standing();
    const row = value ? value.student : null;
    if (!value || !row) return 1;
    return Math.max(1, tieSize(value.rows, row.rank, "rank"));
  });

  /** Students sharing the college place. */
  const tiedCollege = computed(() => {
    const value = standing();
    const row = value ? value.student : null;
    if (!value || !row) return 1;
    const own = value.rows.filter((entry) => entry.collegeCode === row.collegeCode);
    return Math.max(1, tieSize(own, row.collegeRank, "collegeRank"));
  });

  const tied = computed(() => (scope() === "college" ? tiedCollege() : tiedBranch()));

  /** The CGPA spread of the table being ranked in — branch or college. */
  const spread = computed(() => cgpaDistribution(order(), 10));

  /** Students in the roster BEU published without a CGPA: no rank for them. */
  const missing = computed(() => unrankedCount(standing()?.rows ?? []));

  /** The nearest ranked student on either side, ignoring students tied with you. */
  const rivals = computed<Rivals>(() => {
    const row = student();
    const list = order();
    if (!row || row.cgpa === null) return { above: null, below: null };
    const index = list.findIndex((entry) => digits(entry.reg) === digits(row.reg));
    if (index < 0) return { above: null, below: null };

    let above: RankRow | null = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = list[cursor];
      if (candidate.cgpa !== null && candidate.cgpa > row.cgpa) {
        above = candidate;
        break;
      }
    }

    let below: RankRow | null = null;
    for (let cursor = index + 1; cursor < list.length; cursor += 1) {
      const candidate = list[cursor];
      if (candidate.cgpa !== null && candidate.cgpa < row.cgpa) {
        below = candidate;
        break;
      }
    }

    return { above, below };
  });

  /** A rival shown with the rank of the standing on screen, not always branch. */
  const scopedRow = (row: RankRow): RankRow =>
    scope() === "college" ? { ...row, rank: row.collegeRank } : row;

  /** The tie count for any row in the current scope. */
  const tiedFor = (row: RankRow): number => {
    const value = standing();
    if (!value) return 1;
    if (scope() === "college") {
      const own = value.rows.filter((entry) => entry.collegeCode === row.collegeCode);
      return Math.max(1, tieSize(own, row.collegeRank, "collegeRank"));
    }
    return Math.max(1, tieSize(value.rows, row.rank, "rank"));
  };

  const summary = computed(() =>
    standing()
      ? rankSummary(standing() as Standing, branch(), sem(), tiedBranch(), tiedCollege(), studentName())
      : "",
  );

  /** The one sentence under the big rank. */
  const note = computed(() => {
    const value = standing();
    const row = value ? value.student : null;
    if (!value || !row) return "";
    if (row.cgpa === null) {
      return "No CGPA published, so no rank. That is missing data, not a zero.";
    }
    const place = scope() === "college" ? row.collegeRank : row.rank;
    if (place === null) return "This table has no CGPA for you in this scope, so there is no rank.";
    const shared = tieSentence(place, tied(), scopeLabel());
    if (shared !== "") return shared;
    const total = scope() === "college" ? value.collegeTotal : value.branchTotal;
    return `${scopeLabel()} rank ${place} of ${total} students by CGPA.`;
  });

  /** Everything the found block prints, so `Fresh` rebuilds all of it at once. */
  const rankKey = computed(() => {
    const value = standing();
    const row = value ? value.student : null;
    if (!value || !row) return "none";
    const near = rivals();
    return [
      scope(),
      row.reg,
      studentName(),
      row.rank ?? "-",
      row.collegeRank ?? "-",
      tiedBranch(),
      tiedCollege(),
      value.branchTotal,
      value.collegeTotal,
      near.above?.reg ?? "-",
      near.below?.reg ?? "-",
    ].join("|");
  });

  const loading = () => state().status === "loading" && student() === null;

  /** Is the screen looking at a table other than the number's own? */
  const offOwnTable = (): boolean => {
    const parsed = parseReg(reg());
    if (!parsed) return false;
    return batch() !== parsed.batch || branch() !== parsed.branch;
  };

  /** Pick a published table: normalize first, then read it. */
  const applyFilter = (next: Partial<TableSelection>) => {
    semChosen.set(true);
    const merged = normalizeSelection({
      batch: next.batch ?? batch(),
      branch: next.branch ?? branch(),
      sem: next.sem ?? sem(),
    });
    batch.set(merged.batch);
    branch.set(merged.branch);
    sem.set(merged.sem);
    if (isValidReg(reg())) {
      request.set({ reg: reg(), batch: merged.batch, branch: merged.branch, sem: merged.sem });
    }
  };

  const where = (): string => `Batch 20${batch()} · ${branchShort(branch())} · Sem ${sem()}`;

  return (
    <Screen>
      <Body>
        <Row class="items-start justify-between gap-3 pt-1">
          <View class="flex-1 gap-0.5">
            <Label>BEU · University rank</Label>
            <Text class="text-[22px] font-bold tracking-tight text-foreground">Where you stand.</Text>
          </View>
          <Btn variant="ghost" onPress={() => filters.update((open) => !open)} label="Filters">
            {filters() ? "Done" : "Filters"}
          </Btn>
        </Row>
        <Muted class="text-[13px] leading-5">
          Branch and college rank, read from BEU's published roster.
        </Muted>

        <If when={filters()}>
          <Panel tone="plain" class="gap-3" testID="rank-filters">
            <Row class="justify-between gap-2">
              <Label>Published table</Label>
              <Muted class="tabular-nums text-[11px]">{`Sem ${sem()}`}</Muted>
            </Row>
            <SelectionChips
              selection={() => ({ batch: batch(), branch: branch(), sem: sem() })}
              apply={applyFilter}
            />
            <Muted class="text-[11px] leading-4">
              Rank is counted inside the table you pick.
            </Muted>
            <If when={offOwnTable()}>
              <Btn
                variant="secondary"
                class="min-h-11"
                onPress={() => {
                  semChosen.set(false);
                  start(reg(), suggestedSem(reg()));
                }}
              >
                Use my batch and branch
              </Btn>
            </If>
          </Panel>
        </If>

        <If when={editing() || student() === null}>
          <Card class="gap-4">
            <RegField
              value={reg()}
              onChange={(next) => {
                reg.set(next);
                formError.set("");
              }}
              onSubmit={() => start(reg(), sem())}
              autoFocus={routeReg === ""}
            />

            <View class="gap-1">
              <Row class="flex-wrap items-center justify-between gap-2">
                <Label>{draftTable() || (batch() ? `Batch 20${batch()} · ${branchShort(branch())}` : "From your number")}</Label>
                <Muted class="tabular-nums text-[11px]">{`Sem ${sem()}`}</Muted>
              </Row>
              <Muted class="text-[11px] leading-4">
                {aheadOfTables()
                  ? `Your class is in semester ${classSem()}; BEU's newest published table is semester ${Math.max(...draftSems())}.`
                  : "Read from BEU's published roster, so it works offline."}
              </Muted>
            </View>

            <If when={draftCovered() || !isValidReg(reg())}>
              <Fresh
                when={`sem:${reg()}:${batch()}:${branch()}:${sem()}:${draftCovered()}`}
                build={() => (
                  <SemChips
                    value={sem()}
                    available={draftSems()}
                    onChange={(next) => {
                      semChosen.set(true);
                      sem.set(next);
                      if (request() !== null) start(reg(), next);
                    }}
                  />
                )}
              />
            </If>

            <If when={isValidReg(reg()) && !draftCovered()}>
              <Muted class="text-[11px] leading-4">
                BEU has published no roster for this batch and branch yet.
              </Muted>
            </If>

            {formError() ? <Text class="text-[12px] font-medium text-destructive">{formError()}</Text> : null}

            <Fresh
              when={`go:${state().status}:${sem()}:${published()}:${draftCovered()}`}
              build={() => (
                <Btn
                  class="min-h-12"
                  disabled={state().status === "loading" || (isValidReg(reg()) && !draftCovered())}
                  onPress={() => start(reg(), sem())}
                  label="Find rank"
                >
                  {state().status === "loading"
                    ? "Reading the table…"
                    : isValidReg(reg()) && !draftCovered()
                      ? "No table to read"
                      : `Find semester ${sem()} rank`}
                </Btn>
              )}
            />
          </Card>
        </If>

        <If when={!published() && isValidReg(reg()) && batch() !== ""}>
          <EmptyState
            icon="hash"
            title="No published table for this batch"
            hint={`No ${branchShort(branch())} roster for batch 20${batch()} yet. Nothing here is estimated.`}
            action="Pick a published table"
            onAction={() => filters.set(true)}
          />
        </If>

        <If when={published() && loading()}>
          <RowsSkeleton count={3} />
        </If>

        <If when={published() && state().status === "error"}>
          <View class="gap-2">
            <ErrorState title="This table did not load" message={state().error} onRetry={() => start(reg(), sem())} />
            <Muted class="text-center text-[11px] leading-4">{where()}</Muted>
            <Row class="gap-3">
              <Btn variant="secondary" class="flex-1" onPress={() => editing.set(true)}>
                Use another number
              </Btn>
              <Btn variant="ghost" class="flex-1" onPress={() => filters.set(true)}>
                Change filters
              </Btn>
            </Row>
          </View>
        </If>

        <If when={published() && state().status === "ready" && student() === null}>
          <EmptyState
            icon="hash"
            title="Not in this table"
            hint={`${where()}. No student has that number in this published roster.`}
            action="Open the full table"
            onAction={() => nav.push("results.table", { batch: batch(), branch: branch(), sem: sem(), reg: reg() })}
          />
        </If>

        <If when={student()}>
          <Fresh
            when={rankKey()}
            build={() => {
              const value = standing();
              const row = value ? value.student : null;
              if (!value || !row) return <View />;
              const place = spot();
              const near = rivals();
              const share = scopeLabel();

              /* A table BEU published without a CGPA (semester 1 is always
                 SGPA-only) has nothing to rank: one clear panel, not six
                 dashed stats. Offer the newest table that may carry one. */
              if (value.branchTotal === 0) {
                const newest = publishedSems().length > 0 ? Math.max(...publishedSems()) : 0;
                return (
                  <View class="gap-4">
                    <Panel tone="plain" class="gap-3" testID="rank-no-cgpa">
                      <Label>No CGPA in this table</Label>
                      <Subtitle class="text-[13px] leading-5">
                        {`BEU published ${branchShort(branch())} semester ${sem()} with SGPAs only. Rank is counted by CGPA, so there is nothing to count here — nothing is estimated.`}
                      </Subtitle>
                      <Row class="gap-3">
                        <Btn class="flex-1" onPress={() => nav.push("results", { reg: row.reg, sem: sem() })}>
                          Full result
                        </Btn>
                        {newest > sem() ? (
                          <Btn variant="secondary" class="flex-1" onPress={() => applyFilter({ sem: newest })}>
                            {`Open semester ${newest}`}
                          </Btn>
                        ) : null}
                      </Row>
                    </Panel>
                    <Card class="gap-0">
                      <Line label="Registration" value={row.reg} />
                      <Line label="College" value={shortCollegeName(row.collegeCode)} />
                      <Line label="Branch" value={branchShort(branch())} />
                      <Line label="Batch" value={`20${batch()}`} />
                      <Line label="SGPA" value={row.sgpaText} strong />
                      <Line label="CGPA" value={row.cgpaText} strong />
                    </Card>
                  </View>
                );
              }

              return (
                <View class="gap-4">
                  {row.collegeCode ? (
                    <Fresh
                      when={`scope:${scope()}:${row.collegeCode}`}
                      build={() => (
                        <ScopeChips value={scope()} onChange={(next) => scope.set(next)} collegeLabel={college() || "My college"} />
                      )}
                    />
                  ) : null}

                  <PositionCard
                    label={scope() === "college" ? `Rank in ${share} · Semester ${sem()}` : `University rank · Semester ${sem()}`}
                    name={studentName() || "Semester result"}
                    reg={row.reg}
                    collegeCode={row.collegeCode}
                    rank={place.rank}
                    total={place.total}
                    percentile={place.percentile}
                    tied={tied()}
                    note={note()}
                  >
                    <Row class="gap-3">
                      <CopyButton text={summary()} label="Copy rank" class="flex-1" />
                      <Btn
                        variant="secondary"
                        class="flex-1"
                        onPress={() => nav.push("results", { reg: row.reg, sem: sem() })}
                      >
                        Full result
                      </Btn>
                    </Row>
                  </PositionCard>

                  <Row class="gap-3">
                    <Stat
                      value={rankLabel(row.rank, tiedBranch())}
                      label="University rank"
                      hint={
                        row.rank !== null
                          ? `of ${value.branchTotal} ranked`
                          : value.branchTotal > 0
                            ? "not in this order"
                            : "no CGPA published"
                      }
                    />
                    <Stat
                      value={rankLabel(row.collegeRank, tiedCollege())}
                      label="College rank"
                      hint={
                        row.collegeRank !== null
                          ? `of ${value.collegeTotal} ranked`
                          : value.collegeTotal > 0
                            ? "not in this order"
                            : "no CGPA published"
                      }
                    />
                  </Row>

                  <Card class="gap-3">
                    <CgpaSpread
                      bands={spread()}
                      mine={row.cgpa}
                      scopeLabel={scopeLabel()}
                      unranked={missing()}
                    />
                  </Card>

                  {row.cgpa !== null ? (
                    <Card class="gap-0 p-0">
                      <View class="gap-0.5 px-4 pb-2 pt-3">
                        <Label>Nearest rivals</Label>
                        <Muted class="text-[11px] leading-4">
                          {`Closest CGPA above and below you in ${share}.`}
                        </Muted>
                      </View>
                      <Divider />
                      {near.above ? (
                        <StudentRowView
                          row={scopedRow(near.above)}
                          tied={tiedFor(near.above)}
                          onPress={() => nav.push("results", { reg: near.above?.reg ?? "", sem: sem() })}
                        />
                      ) : (
                        <Muted class="px-4 py-3">Nobody above — you are first.</Muted>
                      )}
                      <Divider />
                      <StudentRowView
                        row={named(scopedRow(row))}
                        tied={tied()}
                        highlight
                        onPress={() => nav.push("results", { reg: row.reg, sem: sem() })}
                      />
                      <Divider />
                      {near.below ? (
                        <StudentRowView
                          row={scopedRow(near.below)}
                          tied={tiedFor(near.below)}
                          onPress={() => nav.push("results", { reg: near.below?.reg ?? "", sem: sem() })}
                        />
                      ) : (
                        <Muted class="px-4 py-3">Nobody below — you are last.</Muted>
                      )}
                    </Card>
                  ) : null}

                  <Card class="gap-0">
                    <Line label="Registration" value={row.reg} />
                    <Line label="College" value={shortCollegeName(row.collegeCode)} />
                    <Line label="Branch" value={branchShort(branch())} />
                    <Line label="Batch" value={`20${batch()}`} />
                    <Line label="SGPA" value={row.sgpaText} strong />
                    <Line label="CGPA" value={row.cgpaText} strong />
                  </Card>

                  <View class="gap-2">
                    <Row class="gap-3">
                      <Btn
                        variant="secondary"
                        class="flex-1"
                        onPress={() =>
                          nav.push("results.merit", {
                            reg: row.reg,
                            college: row.collegeCode,
                            batch: batch(),
                            branch: branch(),
                            sem: sem(),
                          })
                        }
                      >
                        Merit list
                      </Btn>
                      <Btn
                        variant="secondary"
                        class="flex-1"
                        onPress={() => nav.push("results.battle", { a: row.reg, sem: sem() })}
                      >
                        Battle a friend
                      </Btn>
                    </Row>
                    <Btn variant="ghost" onPress={() => editing.set(true)}>
                      Check another student
                    </Btn>
                  </View>
                </View>
              );
            }}
          />
        </If>

      </Body>
    </Screen>
  );
}
