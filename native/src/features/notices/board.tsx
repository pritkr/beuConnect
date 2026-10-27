/**
 * The university notice board: filters, the unread/pinned scopes, and the
 * date- or category-sectioned list.
 *
 * Every list here is built inside a reactive block. The shell's `List` takes its
 * rows by value and does not repaint when that array changes, so a screen that
 * mounts one `List` once would keep its first rows through every later filter,
 * query and read-state change. Wrapping the list in a reactive block rebuilds
 * it when its inputs move, and each cell reads its own row through `rowCell`.
 */

import { List, Text, View, computed, signal } from "nsh";
import type { Nav } from "../../app/router";
import { Btn, EmptyState, ErrorState, Muted, Row, Screen, Search, Title } from "../../ui";
import { boardOffline, isRead, markAllRead, notices, noticesFetchedAt } from "./api";
import {
  ChipRail, NoticesSkeleton, OfflinePanel, UndoBar, boardCourse, boardFetchedLabel, boardGroup, boardQuery,
  boardScope, boardSemester, buildNoticeRows, busy, chipItems, courseFacets, failure, noteTopRow, noticesLoaded,
  once, pinnedCount, plural, readUndo, resetBoardFilters, rowCell, semesterFacets, syncNotices, topRowIndex,
  unreadCount, type BoardScope, type ListRow,
} from "./parts";

/**
 * The board's zero-row state.
 *
 * Called from a reactive expression (`{() => boardEmpty()}`), never mounted as
 * a component: a component body runs once, so an `if` chain inside it would
 * freeze on whatever was true at first paint — the skeleton — and a failed
 * fetch would never become "Try again". Reading the signals through this call
 * keeps every branch live.
 */
function boardEmpty() {
  if (notices().length === 0 && failure()) {
    return <ErrorState message={failure()} onRetry={() => syncNotices(true)} />;
  }
  // Only the very first fetch gets the skeleton; after that an empty list is
  // the truth, not a loading state.
  if (!noticesLoaded()) return <NoticesSkeleton />;
  if (notices().length === 0) {
    return (
      <View class="gap-3">
        <EmptyState
          title="The board is empty"
          hint="BEU has not published a notice yet. The board is fetched again whenever you refresh."
          action="Refresh"
          onAction={() => syncNotices(true)}
        />
        <Muted class="text-center text-[11px] tabular-nums" numberOfLines={1}>{boardFetchedLabel()}</Muted>
      </View>
    );
  }
  if (boardQuery().trim() !== "") {
    return (
      <EmptyState
        icon="search"
        title={`No notice matches “${boardQuery().trim()}”`}
        hint={`Searched the titles, courses, semesters and categories of ${plural(notices().length, "notice")}.`}
        action="Clear search"
        onAction={() => boardQuery.set("")}
      />
    );
  }
  if (boardScope() === "unread") {
    return (
      <EmptyState
        icon="check-circle"
        title="You are all caught up"
        hint="Every notice on the board has been read. New circulars arrive unread."
        action="Show all notices"
        onAction={() => boardScope.set("all")}
      />
    );
  }
  if (boardScope() === "pinned") {
    return (
      <EmptyState
        title="Nothing pinned right now"
        hint="Important circulars are pinned here when BEU marks one."
        action="Show all notices"
        onAction={() => boardScope.set("all")}
      />
    );
  }
  return (
    <EmptyState
      icon="search"
      title="No notices match these filters"
      hint="Try another course, semester or keyword."
      action="Clear filters"
      onAction={resetBoardFilters}
    />
  );
}

export function NoticesScreen(props: { nav: Nav }) {
  once(syncNotices);
  const filtersOpen = signal(boardCourse() !== "All" || boardSemester() !== "All");
  const undo = readUndo();
  const rows = computed<ListRow[]>(() =>
    buildNoticeRows(notices(), boardQuery(), boardCourse(), boardSemester(), boardScope(), boardGroup()));
  const unread = (): number => unreadCount(notices());
  const pinned = (): number => pinnedCount(notices());
  const supporting = (): number => (boardCourse() === "All" ? 0 : 1) + (boardSemester() === "All" ? 0 : 1);

  const markAll = (): void => {
    const fresh = notices().filter((notice) => !isRead(notice.id)).length;
    const before = markAllRead(notices().map((notice) => notice.id));
    undo.offer(fresh === 1 ? "Marked 1 notice read" : `Marked ${fresh} notices read`, before);
  };

  return (
    <Screen>
      {() => (
        <List
          class="flex-1"
          testID="notices-board"
          each={rows()}
          keyExtractor={(row: ListRow) => row.key}
          estimatedItemSize={96}
          contentClass="px-4 pb-6 gap-2"
          initialScrollIndex={topRowIndex(rows())}
          onViewableItemsChange={noteTopRow}
          refreshing={busy() && notices().length > 0}
          onRefresh={() => syncNotices(true)}
          header={() => (
            <View class="gap-2.5 pb-2 pt-4">
              <View class="gap-1">
                <Row class="items-center justify-between gap-2">
                  <Title class="flex-1" numberOfLines={1}>Notices</Title>
                  <View
                    class="min-h-11 justify-center rounded-full px-3 active:bg-muted focus:ring-2 focus:ring-ring"
                    onPress={() => props.nav.push("notices.announcements")}
                    role="button"
                    accessibilityLabel="Announcements"
                  >
                    <Text class="text-[13px] font-semibold text-primary-ink" numberOfLines={1}>Announcements ›</Text>
                  </View>
                </Row>
                <Muted class="text-[12px] tabular-nums" numberOfLines={1}>
                  {noticesLoaded() || failure() !== ""
                    ? `${unread()} unread of ${plural(notices().length, "notice")} · ${pinned()} pinned`
                    : "Loading the board…"}
                </Muted>
              </View>

              <Search value={boardQuery()} onChange={(value) => boardQuery.set(value)} placeholder="Search notices" />

              <ChipRail
                label="Show"
                items={[
                  { value: "all", text: `All ${notices().length}` },
                  { value: "unread", text: `Unread ${unread()}` },
                  { value: "pinned", text: `Pinned ${pinned()}` },
                ]}
                active={boardScope()}
                onPick={(value) => boardScope.set(value as BoardScope)}
              />

              <Row class="justify-between gap-2">
                <Btn
                  variant="link"
                  class="px-1"
                  label={filtersOpen() ? "Hide course and semester filters" : "Show course and semester filters"}
                  onPress={() => filtersOpen.set(!filtersOpen())}
                >
                  {filtersOpen() ? "Hide filters" : supporting() === 0 ? "Filters" : `Filters (${supporting()})`}
                </Btn>
                <Btn
                  variant="link"
                  class="px-1"
                  label="Group the board by date or by category"
                  onPress={() => boardGroup.set(boardGroup() === "date" ? "category" : "date")}
                >
                  {boardGroup() === "date" ? "By date" : "By category"}
                </Btn>
              </Row>

              {() => (filtersOpen() ? (
                <View class="gap-2">
                  <ChipRail
                    label="Course"
                    items={chipItems(courseFacets())}
                    active={boardCourse()}
                    onPick={(value) => boardCourse.set(value)}
                  />
                  <ChipRail
                    label="Semester"
                    items={chipItems(semesterFacets())}
                    active={boardSemester()}
                    onPick={(value) => boardSemester.set(value)}
                  />
                </View>
              ) : null)}

              <Row class="gap-2">
                <Btn class="flex-1 px-3" variant="ghost" disabled={busy()} onPress={() => syncNotices(true)}>
                  {busy() ? "Refreshing…" : "Refresh"}
                </Btn>
                <Btn class="flex-1 px-3" variant="secondary" disabled={unread() === 0} onPress={markAll}>
                  Mark all read
                </Btn>
              </Row>

              {() => (undo.text() ? <UndoBar text={undo.text()} onUndo={undo.restore} /> : null)}

              {() => (boardOffline() || (failure() !== "" && notices().length > 0) ? (
                <OfflinePanel stamp={noticesFetchedAt()} message={failure()} onRetry={() => syncNotices(true)} />
              ) : null)}

              <Btn variant="link" class="self-start px-1" label="Search every notice and announcement" onPress={() => props.nav.push("notices.search")}>
                Search everything
              </Btn>
            </View>
          )}
          empty={() => <View class="flex-1">{() => boardEmpty()}</View>}
          footer={() => (
            <View class="px-1 pb-2 pt-3">
              <Muted class="text-center text-[11px] tabular-nums" numberOfLines={1}>{boardFetchedLabel()}</Muted>
            </View>
          )}
        >
          {rowCell(props.nav)}
        </List>
      )}
    </Screen>
  );
}
