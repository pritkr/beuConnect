/**
 * One search across the board and the feed, with the last few terms the
 * student typed kept on device.
 */

import { List, View, computed, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import { Btn, Chip, EmptyState, Label, Muted, Panel, Row, Search, Screen, Title } from "../../ui";
import { announcements, loadAnnouncementBodies, notices } from "./api";
import {
  annBusy, annFailure, buildSearchRows, busy, clearRecent, failure, hydrateRecent, once, plural, recent,
  rememberSearch, rememberSoon, rowCell, syncAnnouncements, syncNotices, type ListRow,
} from "./parts";

export function SearchScreen(props: { nav: Nav }) {
  once(syncNotices);
  once(syncAnnouncements);
  once(hydrateRecent);
  effect(() => {
    const posts = announcements();
    if (posts.length > 0) void loadAnnouncementBodies(posts);
  });
  const query = signal("");
  const rows = computed<ListRow[]>(() => buildSearchRows(query(), notices(), announcements()));
  const term = (): string => query().trim();
  const problem = (): string => failure() || annFailure();

  return (
    <Screen>
      {() => (
        <List
          class="flex-1"
          testID="notices-search"
          each={rows()}
          keyExtractor={(row: ListRow) => row.key}
          estimatedItemSize={96}
          contentClass="px-4 pb-8 gap-2"
          header={() => (
            <View class="gap-3 pb-2 pt-4">
              <View class="gap-1">
                <Title numberOfLines={1}>Search</Title>
              </View>
              <Search value={query()} onChange={(value) => { query.set(value); rememberSoon(value); }} placeholder="Exam, semester, result" />
              {() => (recent().length > 0 && term().length < 2 ? (
                <View class="gap-2">
                  <Row class="justify-between gap-2">
                    <Label>Recent searches</Label>
                    <Btn variant="link" class="px-2" label="Clear recent searches" onPress={clearRecent}>Clear</Btn>
                  </Row>
                  <View class="flex-row flex-wrap gap-2">
                    {recent().map((item) => (
                      <Chip
                        class="max-w-[240px]"
                        onPress={() => {
                          query.set(item);
                          rememberSearch(item);
                        }}
                      >{item.length > 28 ? `${item.slice(0, 28)}…` : item}</Chip>
                    ))}
                  </View>
                </View>
              ) : null)}
              {() => (problem() ? (
                <Panel tone="amber" class="p-3">
                  <Muted class="text-[12px]" numberOfLines={2}>{problem()}</Muted>
                </Panel>
              ) : null)}
              {() => (rows().length === 0 ? (
                term().length < 2 ? (
                  <EmptyState
                    icon="search"
                    title="Search everything"
                    hint="Type at least two letters. Titles, courses and categories on the board; titles, excerpts and full text on announcements."
                  />
                ) : (
                  <EmptyState
                    title={`Nothing matches “${term()}”`}
                    hint={`Searched ${plural(notices().length, "notice")} and ${plural(announcements().length, "announcement")}, including their excerpts and full text.`}
                    action="Clear search"
                    onAction={() => query.set("")}
                  />
                )
              ) : null)}
            </View>
          )}
          empty={() => null}
        >
          {rowCell(props.nav)}
        </List>
      )}
    </Screen>
  );
}
