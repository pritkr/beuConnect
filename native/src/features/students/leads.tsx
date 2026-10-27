/**
 * The top CGPA holders of one batch, joined from BEU's published roster.
 *
 * The register says who exists; the roster says how they scored. Only a row
 * that carries a CGPA *and* belongs to GEC Sheikhpura is ranked — a missing
 * CGPA is not a zero and another college's row is not ours. Nothing is
 * estimated: when BEU has published no table for a batch, the screen says so.
 *
 * One batch at a time, because that is the only honest unit: a 2021 batch's
 * eighth-semester CGPA and a 2024 batch's second-semester CGPA are not
 * comparable, and averaging them would invent a ranking.
 */

import { List, Scroll, Text, View, cleanup, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import {
  Btn,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Loading,
  Muted,
  Panel,
  Row,
  Screen,
} from "../../ui";
import type { RankRow } from "../results/data";
import { branchShort, loadRoster, semsFor } from "../results/data";
import { idle, rosterError, type Async } from "../results/shared";
import { Fresh } from "./components";
import { COLLEGE_CODE, SESSIONS, formatCount } from "./data";
import type { Lead, LeadCandidate } from "./leads-data";
import { LEAD_BRANCHES, LEAD_LIMIT, rankByCgpa, sessionBatch } from "./leads-data";

interface SessionLeads {
  /** Every ranked row for the college, best first (the screen slices it). */
  leads: Lead[];
  /** Branch codes BEU has published for this batch. */
  published: number;
  /** Branch codes that could not be read this time. */
  failed: string[];
}

/** The newest published semester for one branch, or 0 when there is none. */
function latestSem(batch: string, branch: string): number {
  const sems = semsFor(batch, branch);
  return sems.length === 0 ? 0 : Math.max(...sems);
}

/**
 * The newest batch whose table carries a CGPA. A batch with one published
 * semester has not finished it, so its CGPA column is empty; starting there
 * would open the screen on a guaranteed empty state.
 */
const DEFAULT_SESSION =
  SESSIONS.find((session) => LEAD_BRANCHES.some((branch) => semsFor(sessionBatch(session), branch).length > 1)) ??
  SESSIONS[0] ??
  "";

async function loadSession(session: string): Promise<SessionLeads> {
  const batch = sessionBatch(session);
  const jobs = LEAD_BRANCHES.map((branch) => ({ branch, sem: latestSem(batch, branch) })).filter(
    (job) => job.sem > 0,
  );
  if (jobs.length === 0) return { leads: [], published: 0, failed: [] };

  const settled = await Promise.all(
    jobs.map((job) =>
      loadRoster(batch, job.branch, job.sem).then(
        (rows): { job: typeof job; rows: RankRow[] | null; error?: unknown } => ({ job, rows }),
        (error): { job: typeof job; rows: RankRow[] | null; error?: unknown } => ({ job, rows: null, error }),
      ),
    ),
  );

  const loaded = settled.filter((entry) => entry.rows !== null);
  if (loaded.length === 0) {
    const first = settled.find((entry) => entry.error !== undefined);
    throw first?.error ?? new Error("No branch table could be read.");
  }

  const candidates: LeadCandidate[] = [];
  for (const entry of loaded) {
    for (const row of entry.rows ?? []) {
      candidates.push({
        reg: row.reg,
        name: row.name,
        cgpa: row.cgpa,
        collegeCode: row.collegeCode,
        branch: entry.job.branch,
        sem: entry.job.sem,
      });
    }
  }

  return {
    leads: rankByCgpa(candidates, COLLEGE_CODE),
    published: jobs.length,
    failed: settled.filter((entry) => entry.rows === null).map((entry) => entry.job.branch),
  };
}

function LeadRowView(props: { lead: Lead; place: number; onPress: () => void }) {
  const lead = props.lead;
  return (
    <Row
      class="min-h-16 gap-3 bg-card px-4 py-2.5 active:bg-muted"
      onPress={props.onPress}
      label={`${props.place}. ${lead.name}, ${branchShort(lead.branch)}, CGPA ${lead.cgpa.toFixed(2)}`}
    >
      <Text class="w-7 text-right text-[13px] font-bold tabular-nums text-muted-foreground">{props.place}</Text>
      <View class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground" numberOfLines={1}>
          {lead.name}
        </Text>
        <Text class="text-[11px] text-muted-foreground" numberOfLines={1}>
          {`${branchShort(lead.branch)} · Sem ${lead.sem}`}
        </Text>
      </View>
      <Text class="text-[17px] font-bold tabular-nums text-foreground">{lead.cgpa.toFixed(2)}</Text>
    </Row>
  );
}

export function LeadsScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const session = signal(DEFAULT_SESSION);
  const attempt = signal(0);
  const state = signal<Async<SessionLeads>>(idle<SessionLeads>());

  effect(() => {
    void attempt();
    const target = session();
    let alive = true;
    cleanup(() => {
      alive = false;
    });

    state.set({ status: "loading", data: null, error: "" });
    void loadSession(target).then(
      (data) => {
        if (!alive) return;
        state.set({ status: "ready", data, error: "" });
      },
      (error) => {
        if (!alive) return;
        state.set({ status: "error", data: null, error: rosterError(error) });
      },
    );
  });

  const retry = () => attempt.update((value) => value + 1);
  const data = () => state().data;
  const leads = () => data()?.leads ?? [];
  const page = () => leads().slice(0, LEAD_LIMIT);

  const summary = () => {
    if (state().status === "loading") return "Reading BEU's table…";
    if (state().status === "error") return "Could not read the table";
    if (!data() || data()?.published === 0) return `No table for ${session()}`;
    if (leads().length === 0) return "No published CGPA";
    return `Top ${page().length} of ${formatCount(leads().length)} · ${session()}`;
  };

  const empty = () => {
    if (state().status === "loading" || state().status === "idle") {
      return (
        <View class="p-4">
          <Loading label={`Reading ${session()}…`} />
        </View>
      );
    }
    if (state().status === "error") {
      return (
        <View class="p-4">
          <ErrorState title="The roster could not be read" message={state().error} onRetry={retry} />
        </View>
      );
    }
    if (!data() || data()?.published === 0) {
      return (
        <View class="p-4">
          <EmptyState
            icon="table"
            title={`BEU has published no table for ${session()}`}
            hint="Leads are read from BEU's roster. A batch with no published result cannot have a CGPA ranking."
            action={session() === DEFAULT_SESSION ? undefined : `Open ${DEFAULT_SESSION}`}
            onAction={session() === DEFAULT_SESSION ? undefined : () => session.set(DEFAULT_SESSION)}
          />
        </View>
      );
    }
    return (
      <View class="p-4">
        <EmptyState
          icon="table"
          title="No CGPA in this table yet"
          hint={`BEU published the ${session()} roster, but none of its rows carries a CGPA. Nothing here is estimated.`}
        />
      </View>
    );
  };

  const emptyKey = () =>
    `${state().status}|${state().error}|${session()}|${data()?.published ?? -1}|${leads().length}|${
      leads()[0]?.reg ?? ""
    }`;

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-background px-4 pb-3 pt-3">
        <Fresh
          when={`chips:${session()}`}
          build={() => (
            <Scroll horizontal class="flex-1" scrollbar={false} bounces={false} contentClass="flex-row gap-2 pr-4">
              {SESSIONS.map((value) => (
                <Chip active={session() === value} onPress={() => session.set(value)}>
                  {value}
                </Chip>
              ))}
            </Scroll>
          )}
        />

        <Fresh
          when={summary()}
          build={() => (
            <Row class="items-baseline justify-between gap-2">
              <Muted class="text-[11px] tabular-nums">{summary()}</Muted>
              <Muted class="text-[11px] uppercase tracking-[0.14em]">CGPA</Muted>
            </Row>
          )}
        />

        <If when={(data()?.failed.length ?? 0) > 0 ? data() : null}>
          {(failed) => (
            <Panel tone="amber" class="gap-2">
              <Muted class="text-[11px] leading-4">
                {`${failed()?.failed.length} of ${failed()?.published} branch tables could not be read. The ranking covers the rest.`}
              </Muted>
              <Btn variant="secondary" onPress={retry}>
                Try again
              </Btn>
            </Panel>
          )}
        </If>
      </View>

      <Fresh
        when={emptyKey()}
        build={() => (
          <List
            class="flex-1"
            contentClass="pb-6"
            testID="students-leads-list"
            each={page()}
            keyExtractor={(lead) => `${lead.reg}|${lead.sem}`}
            estimatedItemSize={64}
            separator={<Divider />}
            empty={empty}
          >
            {(item, index) => (
              <Each of={[item()]} key={(lead) => `${lead.reg}|${lead.sem}`}>
                {() => (
                  <LeadRowView
                    lead={item()}
                    place={index() + 1}
                    onPress={() => nav.push("students.student", { reg: item().reg })}
                  />
                )}
              </Each>
            )}
          </List>
        )}
      />
    </Screen>
  );
}
