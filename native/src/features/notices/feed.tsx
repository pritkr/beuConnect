/**
 * The announcement feed: release notes and product updates, with the same
 * unread model as the board (a post is read once it is opened).
 */

import { List, View, computed, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import { Btn, EmptyState, ErrorState, Loading, Muted, Row, Screen, Search, Title } from "../../ui";
import {
  announcements, announcementsFetchedAt, announcementsOffline, isPostRead, loadAnnouncementBodies,
  markAllRead, postReadKey, unreadPosts,
} from "./api";
import {
  OfflinePanel, UndoBar, annBusy, annFailure, buildPostRows, once, plural, readUndo, rowCell, syncAnnouncements,
  type ListRow,
} from "./parts";

/**
 * The feed's zero-row state, kept live the same way `boardEmpty` is. The term
 * and its clear action are passed in: the feed's search field belongs to its
 * screen, not here.
 */
function feedEmpty(term: string, onClear: () => void) {
  if (announcements().length === 0 && annFailure()) {
    return <ErrorState message={annFailure()} onRetry={() => syncAnnouncements(true)} />;
  }
  if (announcements().length === 0 && annBusy()) return <Loading label="Loading announcements…" />;
  if (announcements().length === 0) {
    return (
      <EmptyState
        title="No announcements yet"
        hint="Product updates will land here."
        action="Refresh"
        onAction={() => syncAnnouncements(true)}
      />
    );
  }
  return (
    <EmptyState
      icon="search"
      title={`No post matches “${term}”`}
      hint={`Searched the titles, excerpts and full text of ${plural(announcements().length, "announcement")}.`}
      action="Clear search"
      onAction={onClear}
    />
  );
}

export function AnnouncementsScreen(props: { nav: Nav }) {
  once(syncAnnouncements);
  const query = signal("");
  const undo = readUndo();
  const rows = computed<ListRow[]>(() => buildPostRows(announcements(), query()));
  const fresh = (): number => unreadPosts(announcements());

  effect(() => {
    const posts = announcements();
    if (posts.length > 0) void loadAnnouncementBodies(posts);
  });

  const markAll = (): void => {
    const posts = announcements();
    const before = markAllRead(posts.map((post) => postReadKey(post.slug)));
    const count = posts.filter((post) => !isPostRead(post.slug)).length;
    undo.offer(count === 1 ? "Marked 1 post read" : `Marked ${count} posts read`, before);
  };

  return (
    <Screen>
      {() => (
        <List
          class="flex-1"
          testID="announcements-feed"
          each={rows()}
          keyExtractor={(row: ListRow) => row.key}
          estimatedItemSize={112}
          contentClass="px-4 pb-8 gap-2"
          refreshing={annBusy() && announcements().length > 0}
          onRefresh={() => syncAnnouncements(true)}
          header={() => (
            <View class="gap-2.5 pb-2 pt-4">
              <View class="gap-1">
                <Title>Announcements</Title>
                <Muted class="text-[12px] tabular-nums" numberOfLines={1}>
                  {`${plural(announcements().length, "post")} · ${fresh()} new`}
                </Muted>
              </View>
              <Search value={query()} onChange={(value) => query.set(value)} placeholder="Search announcements" />
              <Row class="gap-2">
                <Btn class="flex-1 px-3" variant="ghost" disabled={annBusy()} onPress={() => syncAnnouncements(true)}>
                  {annBusy() ? "Refreshing…" : "Refresh"}
                </Btn>
                <Btn class="flex-1 px-3" variant="secondary" disabled={fresh() === 0} onPress={markAll}>
                  Mark all read
                </Btn>
              </Row>
              {() => (undo.text() ? <UndoBar text={undo.text()} onUndo={undo.restore} /> : null)}
              {() => (announcementsOffline() || (annFailure() !== "" && announcements().length > 0) ? (
                <OfflinePanel stamp={announcementsFetchedAt()} message={annFailure()} onRetry={() => syncAnnouncements(true)} />
              ) : null)}
            </View>
          )}
          empty={() => <View class="flex-1">{() => feedEmpty(query().trim(), () => query.set(""))}</View>}
        >
          {rowCell(props.nav)}
        </List>
      )}
    </Screen>
  );
}
