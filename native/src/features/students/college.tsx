/**
 * One college, categorised by batch: each batch is an accordion that opens onto
 * its branches, and the branch pills above it narrow every batch at once.
 *
 * The screen answers the two questions a student actually asks — "who is in my
 * batch?" and "who is in my branch?" — without leaving the college: the batch
 * accordion is the first, the pill filter is the second, and a branch row opens
 * the full, virtualised branch list already scoped to that batch. Typing a name
 * or a registration number replaces the accordion with one ranked list, scoped
 * by the same filter.
 *
 * The register in this build is GEC Sheikhpura's, so `college` defaults to 157.
 * A route that names another college is not an error the student caused, and it
 * is not an empty register either: it says plainly that this build carries one
 * college, and offers the one it has.
 */

import { List, Scroll, Text, View, computed, signal, type ViewRef } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { Chip, Divider, EmptyState, Muted, Row, Screen, Search } from "../../ui";
import { Icon } from "../../ui/icons";
import { motionOn } from "../../ui/motion";
import { EVENTS, track } from "../../lib/analytics";
import { LAYOUT_SPRING_PANEL } from "../../lib/motion";
import { branchIcon } from "../../ui/branch-icon";
import { Fresh, StudentRow } from "./components";
import type { Student } from "./data";
import {
  BRANCHES,
  BRANCH_COUNTS,
  BRANCH_COUNTS_BY_SESSION,
  COLLEGE_CODE,
  COLLEGE_NAME,
  SESSIONS,
  TOTAL,
  batchLabel,
  branchShort,
  formatCount,
  searchStudents,
} from "./data";
import { normaliseSearch } from "./rank";

interface SearchItem {
  key: string;
  student: Student;
  meta: string;
}

function SearchRow(props: { item: SearchItem; nav: Nav }) {
  return (
    <StudentRow
      student={props.item.student}
      meta={props.item.meta}
      onPress={() => props.nav.push("students.student", { reg: props.item.student.reg })}
    />
  );
}

export function CollegeScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const requested = param(nav, "college").trim() || COLLEGE_CODE;
  const known = requested === COLLEGE_CODE;

  if (!known) {
    return (
      <Screen>
        <View class="p-4">
          <EmptyState
            icon="building"
            title={`No register for college ${requested}`}
            hint={`This build carries ${COLLEGE_NAME} only.`}
            action="Open GEC Sheikhpura"
            onAction={() => nav.replace("students.college", { college: COLLEGE_CODE })}
          />
        </View>
      </Screen>
    );
  }

  const query = signal("");
  const branch = signal("");
  // The newest batch opens first, so the page shows its shape on arrival.
  const open = signal<string>(SESSIONS[0] ?? "");

  const searching = computed(() => normaliseSearch(query()) !== "");
  const branchDef = computed(() => (branch() ? BRANCHES.find((entry) => entry.slug === branch()) ?? null : null));

  /** Students in one batch under the branch filter — 0 hides the batch. */
  const batchTotal = (session: string): number => {
    const counts = BRANCH_COUNTS_BY_SESSION[session] ?? {};
    const slug = branch();
    if (slug) return counts[slug] ?? 0;
    return BRANCHES.reduce((sum, entry) => sum + (counts[entry.slug] ?? 0), 0);
  };

  const batches = computed(() =>
    SESSIONS.map((session) => ({ session, batch: batchLabel(session), total: batchTotal(session) })).filter(
      (group) => group.total > 0,
    ),
  );

  const scope = computed(() => {
    const def = branchDef();
    return def ? (BRANCH_COUNTS[def.slug] ?? 0) : TOTAL;
  });

  const rows = computed(() =>
    searching() ? searchStudents(query(), { branch: branch() }) : ([] as readonly Student[]),
  );

  const countLine = computed(() => {
    if (searching()) return `${formatCount(rows().length)} of ${formatCount(scope())}`;
    const list = batches();
    return `${formatCount(scope())} students · ${list.length} ${list.length === 1 ? "batch" : "batches"}`;
  });

  const items = computed<SearchItem[]>(() =>
    rows().map((student) => ({
      key: student.reg,
      student,
      meta: `${branchShort(student.branch)} · ${student.session}`,
    })),
  );

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-background px-4 pb-2 pt-3">
        <Search value={query()} onChange={(value) => query.set(value)} placeholder="Name, roll or registration number" />

        <Fresh
          when={`chips:${branch()}`}
          build={() => (
            <Scroll
              horizontal
              scrollbar={false}
              bounces={false}
              class="-mx-4"
              contentClass="flex-row gap-2 px-4"
            >
              <Chip active={branch() === ""} onPress={() => branch.set("")}>
                All
              </Chip>
              {BRANCHES.map((entry) => (
                <Chip active={branch() === entry.slug} onPress={() => branch.set(entry.slug)}>
                  {entry.short}
                </Chip>
              ))}
            </Scroll>
          )}
        />

        <Fresh
          when={countLine()}
          build={() => <Muted class="text-[11px] tabular-nums">{countLine()}</Muted>}
        />
      </View>

      <If when={searching()}>
        <Fresh
          when={`${normaliseSearch(query())}|${branch()}`}
          build={() => (
            <List
              class="flex-1"
              contentClass="pb-6"
              testID="students-college-search"
              each={items()}
              keyExtractor={(item) => item.key}
              estimatedItemSize={60}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              separator={<Divider />}
              empty={() => (
                <View class="p-4">
                  <EmptyState
                    icon="user-x"
                    title={`No student matches “${query().trim()}”`}
                    hint="Try a name, initials, or a registration number."
                    action="Clear search"
                    onAction={() => query.set("")}
                  />
                </View>
              )}
            >
              {(item) => (
                <Each of={[item()]} key={(row) => row.key}>
                  {() => <SearchRow item={item()} nav={nav} />}
                </Each>
              )}
            </List>
          )}
        />
      </If>

      <If when={!searching()}>
        <Fresh
          when={branch()}
          build={() => (
            <Scroll class="flex-1" contentClass="gap-2 px-4 pb-6 pt-2" scrollbar={false}>
              <If when={batches().length === 0}>
                <EmptyState
                  icon="category"
                  title={`No ${branchDef() ? branchDef()!.short : "students"} in this college`}
                  hint="The register has no student of this branch."
                  action="Show all branches"
                  onAction={() => branch.set("")}
                />
              </If>
              {batches().map((group) => {
                // The group clips its own body (`overflow-hidden`), so this
                // card's frame is the reveal: the tap springs the card that
                // grows and the cards it pushes, not the whole screen.
                let card: ViewRef | null = null;
                return (
                  <View
                    class="overflow-hidden rounded-2xl border border-border bg-card"
                    ref={(node: ViewRef) => {
                      card = node;
                    }}
                  >
                    <Row
                      class="min-h-12 gap-3 px-4 active:bg-muted"
                      onPress={() => {
                        // This group alone moves: spring it, then commit the open.
                        if (motionOn()) card?.animateLayout(LAYOUT_SPRING_PANEL);
                        open.set(open() === group.session ? "" : group.session);
                      }}
                      label={`${group.session}, ${formatCount(group.total)} students, ${
                        open() === group.session ? "collapse" : "expand"
                      }`}
                    >
                      <View class="flex-1 flex-row items-baseline gap-2">
                        <Text class="text-[15px] font-semibold tabular-nums text-foreground">{group.session}</Text>
                        <Text class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {group.batch}
                        </Text>
                      </View>
                      <Text class="text-[13px] font-semibold tabular-nums text-foreground">
                        {formatCount(group.total)}
                      </Text>
                      <If when={open() === group.session}>
                        <Icon name="chevron-up" size={14} class="text-muted-foreground" />
                      </If>
                      <If when={open() !== group.session}>
                        <Icon name="chevron-down" size={14} class="text-muted-foreground" />
                      </If>
                    </Row>

                    <If when={open() === group.session}>
                      <Fresh
                        when={branch()}
                        build={() => (
                          <View>
                            {BRANCHES.filter((entry) => !branch() || branch() === entry.slug).map((entry) => {
                              const count = (BRANCH_COUNTS_BY_SESSION[group.session] ?? {})[entry.slug] ?? 0;
                              if (count === 0) return null;
                              return (
                                <Row
                                  class="min-h-12 gap-3 border-t border-border px-4 active:bg-muted"
                                  onPress={() => {
                                    track(EVENTS.studentsBranchOpen, { branch: entry.slug, label: group.session });
                                    nav.push("students.branch", {
                                      branch: entry.slug,
                                      college: COLLEGE_CODE,
                                      session: group.session,
                                    });
                                  }}
                                  label={`${entry.name}, ${group.session}, ${formatCount(count)} students`}
                                >
                                  <Icon
                                    name={branchIcon(entry.slug) ?? "category"}
                                    size={15}
                                    class="text-muted-foreground"
                                  />
                                  <View class="flex-1">
                                    <Text class="text-[13px] font-medium text-foreground" style={{ numberOfLines: 1 }}>
                                      {entry.name}
                                    </Text>
                                  </View>
                                  <Text class="text-[13px] font-semibold tabular-nums text-foreground">
                                    {formatCount(count)}
                                  </Text>
                                  <Icon name="chevron-right" size={12} class="text-muted-foreground" />
                                </Row>
                              );
                            })}
                          </View>
                        )}
                      />
                    </If>
                  </View>
                );
              })}
            </Scroll>
          )}
        />
      </If>
    </Screen>
  );
}
