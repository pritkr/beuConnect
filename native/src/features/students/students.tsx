/**
 * Students — search the whole register, with the batch chips above the list.
 *
 * The list is grouped by batch when nothing is typed and becomes one ranked
 * list when a query arrives. The search bar and the chips sit above the
 * virtualized list, so they stay put while the register scrolls under them.
 *
 * Search is synchronous: 1,784 rows is less than a frame of work, so a plain
 * signal plus `computed` is honest here and a debounce would only add lag.
 */

import { List, Scroll, Text, View, computed, signal } from "nsh";
import type { Nav } from "../../app/router";
import { Chip, Divider, EmptyState, Muted, Row, Screen, Search } from "../../ui";
import { Fresh, SessionHeader, StudentRow, TextAction } from "./components";
import type { Student } from "./data";
import {
  SESSIONS,
  SESSION_COUNTS,
  TOTAL,
  branchShort,
  formatCount,
  groupBySession,
  searchStudents,
} from "./data";
import { normaliseSearch } from "./rank";
import { EVENTS, track } from "../../lib/analytics";

type ListItem =
  | { kind: "session"; session: string; count: number }
  | { kind: "student"; student: Student; meta: string };

function ListRow(props: { item: ListItem; nav: Nav }) {
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

export function StudentsScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const query = signal("");
  const session = signal("");
  // The register is other people's data: a search is counted by its length and
  // its result count, never by what was typed.
  let searchedAt = 0;
  const search = (value: string): void => {
    query.set(value);
    const now = Date.now();
    const clean = value.trim();
    if (clean.length >= 2 && now - searchedAt > 2000) {
      searchedAt = now;
      track(EVENTS.studentsSearch, { query_length: clean.length, results: rows().length });
    }
  };

  const searching = computed(() => normaliseSearch(query()) !== "");
  const rows = computed(() => searchStudents(query(), { session: session() || undefined }));
  const scopeTotal = computed(() => (session() ? (SESSION_COUNTS[session()] ?? 0) : TOTAL));
  const countLine = computed(() => {
    const shown = formatCount(rows().length);
    return searching() ? `${shown} of ${formatCount(scopeTotal())}` : `${shown} students`;
  });

  const items = computed<ListItem[]>(() => {
    const found = rows();
    if (searching()) {
      return found.map((student) => ({
        kind: "student",
        student,
        meta: `${branchShort(student.branch)} · ${student.session}`,
      }));
    }
    return groupBySession(found).flatMap((group) => [
      { kind: "session" as const, session: group.session, count: group.count },
      ...group.rows.map((student) => ({
        kind: "student" as const,
        student,
        meta: branchShort(student.branch),
      })),
    ]);
  });

  const listKey = computed(() => `${normaliseSearch(query())}|${session()}`);

  const empty = () => (
    <EmptyState
      icon="user-x"
      title={`No students match “${query().trim()}”`}
      hint="Try a name, initials, or a registration number."
      action="Clear search"
      onAction={() => query.set("")}
    />
  );

  return (
    <Screen>
      <View class="gap-3 border-b border-border bg-background px-4 pb-1 pt-3">
        <Search value={query()} onChange={search} placeholder="Name, roll or registration number" />

        <Fresh
          when={`chips:${session()}`}
          build={() => (
            <Scroll
              horizontal
              scrollbar={false}
              bounces={false}
              class="-mx-4"
              contentClass="flex-row gap-2 px-4"
            >
              <Chip active={session() === ""} onPress={() => session.set("")}>
                All
              </Chip>
              {SESSIONS.map((value) => (
                <Chip active={session() === value} onPress={() => session.set(value)}>
                  {value}
                </Chip>
              ))}
            </Scroll>
          )}
        />

        <Fresh
          when={`${countLine()}|${session()}`}
          build={() => (
            <Row class="justify-between gap-2">
              <Muted class="text-[11px] tabular-nums">{countLine()}</Muted>
              <Row class="-mr-2 gap-0">
                <TextAction label="Colleges" onPress={() => nav.push("students.colleges")} />
                <TextAction label="Top CGPA" onPress={() => nav.push("students.leads")} />
              </Row>
            </Row>
          )}
        />
      </View>

      <Fresh
        when={listKey()}
        build={() => (
          <List
            class="flex-1"
            contentClass="pb-6"
            testID="students-list"
            each={items()}
            keyExtractor={(item) => (item.kind === "session" ? `s:${item.session}` : `r:${item.student.reg}`)}
            estimatedItemSize={64}
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
                {() => <ListRow item={item()} nav={nav} />}
              </Each>
            )}
          </List>
        )}
      />
    </Screen>
  );
}
