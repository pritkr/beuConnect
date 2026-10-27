/**
 * Home's notice pager.
 *
 * The board is read through the same store the notices area uses, so a press
 * opens the full circular with its read state already known. The strip advances
 * itself every five seconds and stops for good once the student touches it; a
 * failed refresh keeps the last copy on screen and says how old it is.
 */

import { Scroll, Text, View, effect, signal } from "nsh";
import type { Nav } from "../../app/router";
import { Btn, Card, Muted, Row, Skeleton } from "../../ui";
import { Icon } from "../../ui/icons";
import { formatDate, relativeTime } from "../../lib/net";
import { isRead, loadNotices, notices, noticesFetchedAt, refreshNotices } from "../notices/api";
import type { Notice } from "../notices/api";

const LIMIT = 8;
const INTERVAL = 5000;
const STALE = 30 * 60 * 1000;

const page = signal(0);
const paused = signal(false);
const width = signal(0);
const loading = signal(true);
const refreshing = signal(false);
const problem = signal("");
let started = false;
let strip: { scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void } | null = null;

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Check your connection and try again.";
}

function ensureBoard(force = false): Promise<void> {
  if (force) {
    if (refreshing()) return Promise.resolve();
    refreshing.set(true);
  } else {
    if (started) {
      // The data layer refreshes a stale board on its own; Home keeps its rows.
      void loadNotices().catch(() => undefined);
      return Promise.resolve();
    }
    started = true;
    loading.set(true);
  }
  problem.set("");
  return (force ? refreshNotices() : loadNotices())
    .then(() => {
      loading.set(false);
      refreshing.set(false);
    })
    .catch((error: unknown) => {
      problem.set(describe(error));
      loading.set(false);
      refreshing.set(false);
      if (!force) started = false;
    });
}

/** The eight rows the strip shows: pinned first, then newest. */
function items(): Notice[] {
  const board = notices();
  const pinned = board.filter((notice) => notice.important);
  return (pinned.length > 0 ? pinned : board).slice(0, LIMIT);
}

/** "" while the board is fresh; the date once it is being read from cache. */
export function boardAsOf(at = noticesFetchedAt()): string {
  if (!at || Date.now() - at < STALE) return "";
  return `As of ${formatDate(at)}`;
}

function go(next: number, animated = true): void {
  page.set(next);
  if (strip && typeof strip.scrollTo === "function") strip.scrollTo({ x: next * width(), animated });
}

export function NoticePager(props: { nav: Nav; onRefresh: () => void }) {
  effect(() => {
    const timer = setInterval(() => {
      const rows = items();
      if (rows.length < 2 || width() <= 0 || paused() || loading()) return;
      go((page() + 1) % rows.length);
    }, INTERVAL);
    return () => clearInterval(timer);
  });

  return (
    <View class="gap-2.5">
      <Row class="justify-between gap-3">
        <Text class="flex-1 text-[13px] font-semibold text-muted-foreground">Notice board</Text>
        <View class="min-h-11 flex-row items-center gap-1 rounded-full px-3 active:bg-muted" onPress={() => props.nav.push("notices")} role="button" accessibilityLabel="All notices">
          <Text class="text-[13px] font-semibold text-primary-ink">All notices</Text>
          <Icon name="chevron-right" size={15} class="text-primary-ink" />
        </View>
      </Row>

      <Card class="overflow-hidden p-0">
        {() => {
          const rows = items();
          if (rows.length === 0) {
            if (loading()) {
              return (
                <View class="gap-2 p-4">
                  <Skeleton h={12} w={88} />
                  <Skeleton h={16} w={220} />
                  <Skeleton h={16} w={170} />
                  <Skeleton h={11} w={120} />
                </View>
              );
            }
            if (problem()) {
              return (
                <View class="gap-2 p-4">
                  <Text class="text-[14px] font-semibold text-foreground">Notices did not load</Text>
                  <Muted class="text-[12px]" numberOfLines={2}>{problem()}</Muted>
                  <View class="mt-1"><Btn variant="secondary" onPress={() => void ensureBoard(true)}>Try again</Btn></View>
                </View>
              );
            }
            return (
              <View class="gap-1 p-4">
                <Text class="text-[14px] font-semibold text-foreground">The board is quiet</Text>
                <Muted class="text-[12px]">No circular has been published yet. Pull down to check again.</Muted>
              </View>
            );
          }

          return (
            <View>
              <Scroll
                horizontal
                pagingEnabled
                bounces={false}
                scrollbar={false}
                decelerationRate="fast"
                disableIntervalMomentum
                scrollEventThrottle={16}
                contentClass="flex-row"
                onLayout={(bounds) => width.set(bounds.size.width)}
                onScroll={(event) => {
                  const pageWidth = width();
                  if (!pageWidth) return;
                  const next = Math.max(0, Math.min(rows.length - 1, Math.round(event.offset.x / pageWidth)));
                  if (next !== page()) page.set(next);
                }}
                onScrollDragStart={() => paused.set(true)}
                ref={(node: unknown) => {
                  strip = node as typeof strip;
                }}
              >
                {rows.map((notice, index) => (
                  <View
                    class="min-h-[136px] justify-between gap-2 p-4 active:bg-muted"
                    style={{ width: Math.max(1, width()) }}
                    onPress={() => {
                      paused.set(true);
                      props.nav.push("notices.detail", { id: notice.id });
                    }}
                    role="button"
                    accessibilityLabel={`${notice.important ? "Pinned" : "General"} notice: ${notice.title}`}
                  >
                    <Row class="justify-between gap-2">
                      <Row class="gap-2">
                        {notice.important ? <Text class="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">PINNED</Text> : <Text class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">NOTICE</Text>}
                        {isRead(notice.id) ? null : <View class="h-2 w-2 rounded-full bg-primary" />}
                      </Row>
                      <Muted class="text-[11px] tabular-nums">{notice.date ? relativeTime(notice.date) : "Undated"}</Muted>
                    </Row>
                    <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={3}>
                      {notice.title}
                    </Text>
                    <Row class="justify-between">
                      <Row class="gap-1">
                        <Text class="text-[12px] font-semibold text-primary-ink">Read notice</Text>
                        <Icon name="chevron-right" size={14} class="text-primary-ink" />
                      </Row>
                      <Muted class="tabular-nums">{`${index + 1} / ${rows.length}`}</Muted>
                    </Row>
                  </View>
                ))}
              </Scroll>

              <View class="h-px w-full bg-border" />
              <View class="min-h-11 flex-row items-center justify-between gap-2 px-4">
                <Row class="gap-1.5">
                  {rows.map((notice, index) => (
                    <View class={`h-1.5 rounded-full ${index === Math.min(page(), rows.length - 1) ? "w-4 bg-primary" : "w-1.5 bg-border"}`} />
                  ))}
                </Row>
                <Row class="gap-2">
                  {() => (boardAsOf() && !refreshing() ? <Muted class="text-[11px]">{boardAsOf()}</Muted> : null)}
                  <View class="min-h-11 min-w-11 items-center justify-center rounded-full px-2 active:bg-muted" onPress={props.onRefresh} role="button" accessibilityLabel="Reload notices">
                    <Text class="text-[12px] font-semibold text-muted-foreground">{() => (refreshing() ? "Updating…" : problem() ? "Retry" : "Refresh")}</Text>
                  </View>
                </Row>
              </View>
              {() =>
                problem() ? (
                  <View class="border-t border-border px-4 py-2">
                    <Muted class="text-[11px] leading-4" numberOfLines={2}>{`Offline copy · ${problem()}`}</Muted>
                  </View>
                ) : null
              }
            </View>
          );
        }}
      </Card>
    </View>
  );
}

export { ensureBoard };
