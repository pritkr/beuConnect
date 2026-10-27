/**
 * One branch, newest batch first, A–Z inside each batch.
 *
 * The search field is above the list, so it stays visible while the branch
 * scrolls. Typing turns the grouped list into one ranked list; the batch is
 * then printed on every row, because the section header is gone.
 */

import { List, View, computed, signal } from "nsh";
import type { Nav } from "../../app/router";
import { param } from "../../app/router";
import { Divider, EmptyState, Muted, Screen, Search } from "../../ui";
import { Fresh, SessionHeader, StudentRow } from "./components";
import type { Student } from "./data";
import { branchBySlug, formatCount, groupBySession, searchStudents, studentsInBranch } from "./data";
import { normaliseSearch } from "./rank";

type ListItem =
  | { kind: "session"; session: string; count: number }
  | { kind: "student"; student: Student; meta: string };

function BranchRow(props: { item: ListItem; nav: Nav }) {
  const item = props.item;
  if (item.kind === "session") return <SessionHeader session={item.session} count={item.count} />;
  return (
    <StudentRow
      student={item.student}
      meta={item.meta}
      onPress={() => props.nav.push("students.student", { reg: item.student.reg })}
    />
  );
}

export function BranchScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const branch = branchBySlug(param(nav, "branch"));
  const query = signal("");

  if (!branch) {
    return (
      <Screen>
        <View class="p-4">
          <EmptyState
            icon="category"
            title="No such branch"
            hint="The register has CSE, ECE, EE, MECH, CIVIL and MET."
            action="All branches"
            onAction={() => nav.replace("students.college", {})}
          />
        </View>
      </Screen>
    );
  }

  const base = studentsInBranch(branch.slug);
  const groups = computed(() => groupBySession(base).length);
  const searching = computed(() => normaliseSearch(query()) !== "");
  const rows = computed(() => searchStudents(query(), { branch: branch.slug }));
  const countLine = computed(() =>
    searching()
      ? `${formatCount(rows().length)} of ${formatCount(base.length)}`
      : `${formatCount(base.length)} students · ${groups()} batches`,
  );

  const items = computed<ListItem[]>(() => {
    const found = rows();
    if (searching()) {
      return found.map((student) => ({ kind: "student", student, meta: student.session }));
    }
    return groupBySession(found).flatMap((group) => [
      { kind: "session" as const, session: group.session, count: group.count },
      ...group.rows.map((student) => ({ kind: "student" as const, student, meta: "" })),
    ]);
  });

  const empty = () => (
    <EmptyState
      icon="group"
      title={base.length === 0 ? "No students in this branch" : `No students match “${query().trim()}”`}
      hint={base.length === 0 ? undefined : "Try a name, initials, or a registration number."}
      action={base.length === 0 ? undefined : "Clear search"}
      onAction={base.length === 0 ? undefined : () => query.set("")}
    />
  );

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-background px-4 pb-2 pt-3">
        <Search value={query()} onChange={query.set} placeholder="Name or registration number" />
        <Fresh
          when={countLine()}
          build={() => <Muted class="text-[11px] tabular-nums">{countLine()}</Muted>}
        />
      </View>

      <Fresh
        when={normaliseSearch(query())}
        build={() => (
          <List
            class="flex-1"
            contentClass="pb-6"
            testID="students-branch-list"
            each={items()}
            keyExtractor={(item) => (item.kind === "session" ? `s:${item.session}` : `r:${item.student.reg}`)}
            estimatedItemSize={60}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            separator={<Divider />}
            empty={() => <View class="p-4">{empty()}</View>}
          >
            {(item) => (
              <Each
                of={[item()]}
                key={(row) => (row.kind === "session" ? `s:${row.session}` : `r:${row.student.reg}`)}
              >
                {() => <BranchRow item={item()} nav={nav} />}
              </Each>
            )}
          </List>
        )}
      />
    </Screen>
  );
}
