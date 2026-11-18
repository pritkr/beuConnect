/**
 * Every BEU college in one list: GEC Sheikhpura first, because it is the only
 * college whose students ship with the app, then the rest A–Z — with the
 * student's own college lifted above the rest when the saved registration
 * number names one.
 *
 * The search field filters the other colleges by name or code and never the
 * register itself — hiding the one row that always opens is the opposite of what
 * a filter is for. A query that names the register (its short form, its full
 * name, `157`) leaves it standing alone instead of printing "no college matches"
 * beneath the row it just found.
 *
 * A college opens when BEU has published a roster for it: the row carries a
 * "Roster" badge and its batch count, and `students.college` fetches that roster
 * on demand (`docs/DATA_BREADTH.md` §3). A college with no published roster has
 * no number, no chevron and nowhere to go — printing a zero or opening an empty
 * screen would be a claim about data that does not exist. The list is static
 * bundled data, so there is no loading or error state; the ordering and the
 * filter are pure and live in `college-list.ts`.
 */

import { List, Text, View, computed, signal } from "nsh";
import type { Nav } from "../../app/router";
import { Badge, Divider, EmptyState, Row, Screen, Search } from "../../ui";
import { Icon } from "../../ui/icons";
import { BRANCHES, COLLEGE_CODE, TOTAL, formatCount } from "./data";
import { EVENTS, track } from "../../lib/analytics";
import { profileCollege, useProfile } from "../settings/profile";
import type { CollegeEntry } from "./college-list";
import { COLLEGE_ENTRIES, collegesByPriority, filterColleges, matchesCollege } from "./college-list";
import { batchesFor } from "./remote";
import { Fresh } from "./components";

type CollegeItem =
  | { kind: "section"; key: string; title: string; meta: string }
  | { kind: "college"; key: string; entry: CollegeEntry; register: boolean }
  | { kind: "empty"; key: string };

const ORDERED = collegesByPriority(COLLEGE_ENTRIES, [COLLEGE_CODE]);
const REGISTER = ORDERED.find((college) => college.code === COLLEGE_CODE) ?? null;
const OTHERS = ORDERED.filter((college) => college.code !== COLLEGE_CODE);
const OTHER_COUNT = OTHERS.length;

const REGISTER_META = `${formatCount(TOTAL)} students · ${BRANCHES.length} branches`;

function SectionRow(props: { title: string; meta: string }) {
  return (
    <View class="flex-row items-baseline justify-between gap-2 border-b border-t border-border bg-muted/70 px-4 py-2">
      <Text class="text-[13px] font-bold tracking-tight text-foreground">{props.title}</Text>
      <Text class="text-[11px] tabular-nums text-muted-foreground">{props.meta}</Text>
    </View>
  );
}

function CollegeRow(props: { entry: CollegeEntry; register: boolean; onPress?: () => void }) {
  const entry = props.entry;
  const rosterBatches = batchesFor(entry.code).length;
  // The short form is often the whole name (no "Government Engineering
  // College," prefix), so the second line carries the code, and the official
  // name only when it adds something.
  const meta = props.register
    ? REGISTER_META
    : rosterBatches > 0
      ? `${entry.code} · ${rosterBatches} ${rosterBatches === 1 ? "batch" : "batches"}`
      : entry.short === entry.name
        ? entry.code
        : `${entry.code} · ${entry.name}`;
  return (
    <Row
      class={`min-h-14 gap-3 bg-card px-4 py-2.5 ${props.onPress ? "active:bg-muted" : ""}`}
      onPress={props.onPress}
      label={
        props.onPress
          ? `${entry.short}, ${props.register ? "register" : "roster"}, ${rosterBatches} ${rosterBatches === 1 ? "batch" : "batches"}`
          : undefined
      }
    >
      <View class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground" style={{ numberOfLines: 2 }}>
          {entry.short}
        </Text>
        <Text class="text-[11px] text-muted-foreground" style={{ numberOfLines: 1 }}>
          {meta}
        </Text>
      </View>
      {props.register ? (
        <Badge tone="ember">Register</Badge>
      ) : rosterBatches > 0 ? (
        <Badge tone="neutral">Roster</Badge>
      ) : (
        <Text class="text-[11px] font-medium text-muted-foreground">No roster</Text>
      )}
      {props.onPress ? <Icon name="chevron-right" size={14} class="text-muted-foreground" /> : null}
    </Row>
  );
}

export function CollegesScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const query = signal("");
  const person = useProfile();

  const items = computed<CollegeItem[]>(() => {
    const text = query();
    // The student's own college leads the "other" list. The register stays
    // first: it is the only college that opens.
    const own = profileCollege(person());
    const others = own !== "" && own !== COLLEGE_CODE ? collegesByPriority(OTHERS, [own]) : OTHERS;
    const found = filterColleges(others, text);
    const rows: CollegeItem[] = [];
    if (REGISTER) {
      rows.push({ kind: "section", key: "s:register", title: "The register", meta: `college ${COLLEGE_CODE}` });
      rows.push({ kind: "college", key: `c:${REGISTER.code}`, entry: REGISTER, register: true });
    }
    // A query naming the register has found it. The row is on screen either
    // way, so "no college matches" under it would deny the search's own
    // result: when nothing else matches, the register stands alone.
    if (text.trim() !== "" && found.length === 0 && REGISTER && matchesCollege(REGISTER, text)) return rows;

    const meta =
      found.length === OTHER_COUNT
        ? `${formatCount(OTHER_COUNT)} colleges`
        : `${formatCount(found.length)} of ${formatCount(OTHER_COUNT)}`;
    rows.push({ kind: "section", key: "s:others", title: "Other colleges", meta });
    if (found.length === 0) {
      rows.push({ kind: "empty", key: "e:none" });
      return rows;
    }
    rows.push(
      ...found.map((entry) => ({ kind: "college" as const, key: `c:${entry.code}`, entry, register: false })),
    );
    return rows;
  });

  return (
    <Screen>
      <View class="border-b border-border bg-background px-4 pb-2 pt-3">
        <Search value={query()} onChange={(value) => query.set(value)} placeholder="College name or code" />
      </View>

      <Fresh
        when={query()}
        build={() => (
          <List
            class="flex-1"
            contentClass="pb-6"
            testID="students-colleges-list"
            each={items()}
            keyExtractor={(item) => item.key}
            estimatedItemSize={56}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            separator={<Divider />}
          >
            {(item) => (
              <Each of={[item()]} key={(row) => row.key}>
                {() => {
                  const row = item();
                  if (row.kind === "section") return <SectionRow title={row.title} meta={row.meta} />;
                  if (row.kind === "empty") {
                    return (
                      <View class="p-4">
                        <EmptyState
                          icon="building"
                          title={`No college matches “${query().trim()}”`}
                          hint="Try a name, a short form or a college code."
                          action="Clear search"
                          onAction={() => query.set("")}
                        />
                      </View>
                    );
                  }
                  return (
                    <CollegeRow
                      entry={row.entry}
                      register={row.register}
                      onPress={
                        row.register
                          ? () => {
                              track(EVENTS.studentsCollegeOpen, { college: COLLEGE_CODE });
                              nav.push("students.college", { college: COLLEGE_CODE });
                            }
                          : batchesFor(row.entry.code).length > 0
                            ? () => {
                                track(EVENTS.studentsCollegeOpen, { college: row.entry.code });
                                nav.push("students.college", { college: row.entry.code });
                              }
                            : undefined
                      }
                    />
                  );
                }}
              </Each>
            )}
          </List>
        )}
      />
    </Screen>
  );
}
