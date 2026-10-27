/**
 * Shared state, helpers and row components for the notices area.
 *
 * Data comes from ./api (cached, memoised, retried) so every screen opens from
 * the last board it saw. Read state is persisted ids; recent searches are
 * persisted strings. External links go to the device opener when the runtime
 * exposes one, else they are copied for the browser.
 *
 * Board rows are grouped by when the university published them — today and
 * yesterday first, then the last week, then one section per month — or by the
 * board's own category ("Important" / "General") when the student asks for it.
 * The section header carries the label, so a board that reaches back a year
 * still reads in order at 320 pt.
 *
 * The board's filter (query, course, semester, unread-only, grouping) lives at
 * module level: a notice opens over the list, and coming back finds the same
 * board, the same filter and the row the student left.
 */

import { Clipboard, Scroll, Text, View, effect, signal, untracked } from "nsh";
import type { Nav } from "../../app/router";
import { formatDate, relativeTime, readStore, writeStore } from "../../lib/net";
import { Badge, Btn, Chip, Label, Muted, Panel, Row, Skeleton } from "../../ui";
import { Icon } from "../../ui/icons";
import {
  announcements, bodyOf, hydrateReadState, isPostRead, isRead, loadAnnouncements, loadNotices, notices, noticesFetchedAt,
  readAnnouncementStamp, refreshAnnouncements, refreshNotices, restoreRead, type Announcement, type Notice,
} from "./api";
import { pdfUrl } from "./pdf-url";

const DAY = 86_400_000;
const RECENT_KEY = "notices.searches.v1";
const COURSES = ["B.Tech", "B.Arch", "M.Tech", "MBA", "MCA", "BCA", "Other"];
const SEMESTERS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "Other"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const busy = signal(false);
export const failure = signal("");
export const annBusy = signal(false);
export const annFailure = signal("");
export const recent = signal<string[]>([]);
/** True once a board fetch has settled; skeletons are for before that line. */
export const noticesLoaded = signal(false);

/* ------------------------------------------------------------ board filter */

/** What the board is narrowed to: everything, the unread stack, or pinned. */
export type BoardScope = "all" | "unread" | "pinned";
/** How the board is sectioned. */
export type GroupMode = "date" | "category";

export const boardQuery = signal("");
export const boardCourse = signal("All");
export const boardSemester = signal("All");
export const boardScope = signal<BoardScope>("all");
export const boardGroup = signal<GroupMode>("date");

/** The row the student was last looking at, restored when the board remounts. */
let boardTopKey = "";

export function resetBoardFilters(): void {
  boardQuery.set("");
  boardCourse.set("All");
  boardSemester.set("All");
  boardScope.set("all");
}

/* ------------------------------------------------------------------- helpers */

export function reason(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Check your connection and try again.";
}

/** "1 notice" / "4 notices" — counts in copy are always spoken correctly. */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Runs a mount effect once; writes inside it are untracked, so it cannot loop. */
export function once(run: () => void): void {
  effect(() => {
    untracked(run);
  });
}

function dayStart(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dateValue(date: string | null): number {
  const parsed = date ? Date.parse(date) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function pinnedFirst(left: Notice, right: Notice): number {
  if (left.important !== right.important) return left.important ? -1 : 1;
  return dateValue(right.date) - dateValue(left.date);
}

function noticeDate(notice: Notice): string {
  return notice.date ? relativeTime(notice.date) : "Undated";
}

export function published(notice: Notice): string {
  return notice.date ? `${formatDate(notice.date)} · ${relativeTime(notice.date)}` : "Date not published";
}

/** Everything a board search reads on a notice, lowercased once. */
function noticeHaystack(notice: Notice): string {
  return `${notice.title} ${notice.category} ${notice.course} ${notice.semester} ${notice.source}`.toLowerCase();
}

/** Title, excerpt, tags, author and — once the body is cached — the body. */
function postHaystack(post: Announcement): string {
  return `${post.title} ${post.excerpt} ${post.tags.join(" ")} ${post.author} ${bodyOf(post.slug).join(" ")}`.toLowerCase();
}

/** Real unread count for a board: ids that are not in the read list. */
export function unreadCount(items: Notice[]): number {
  return items.filter((notice) => !isRead(notice.id)).length;
}

export function pinnedCount(items: Notice[]): number {
  return items.filter((notice) => notice.important).length;
}

export function courseFacets(): string[] {
  const present = new Set(notices().map((notice) => notice.course));
  return ["All", ...COURSES.filter((course) => present.has(course))];
}

export function semesterFacets(): string[] {
  const present = new Set(notices().map((notice) => notice.semester));
  return ["All", ...SEMESTERS.filter((semester) => present.has(semester))];
}

/** When this board was fetched, said plainly. Empty board, honest stamp. */
export function boardFetchedLabel(): string {
  const stamp = noticesFetchedAt();
  if (stamp <= 0) return "Board not fetched yet";
  const day = formatDate(stamp);
  return Date.now() - stamp < 7 * DAY ? `Board fetched ${relativeTime(stamp)} · ${day}` : `Board fetched ${day}`;
}

/** "saved 3h ago", the tail of every offline line. */
export function savedLabel(at: number): string {
  return at > 0 ? `saved ${relativeTime(at)}` : "saved earlier";
}

/* ------------------------------------------------------------------ loading */

export function syncNotices(force = false): void {
  if (busy()) return;
  if (!force && notices().length > 0) {
    hydrateReadState();
    noticesLoaded.set(true);
    // The data layer refreshes a stale board in the background; today's rows
    // stay on screen while the new ones arrive.
    void loadNotices().catch(() => undefined);
    return;
  }
  busy.set(true);
  failure.set("");
  (force ? refreshNotices() : loadNotices())
    .then(() => failure.set(""))
    .catch((error: unknown) => failure.set(reason(error)))
    .finally(() => {
      busy.set(false);
      noticesLoaded.set(true);
    });
}

export function syncAnnouncements(force = false): void {
  if (annBusy()) return;
  if (!force && announcements().length > 0) {
    hydrateReadState();
    // Same rule as the board: an old feed refreshes behind the rows.
    void loadAnnouncements().catch(() => undefined);
    return;
  }
  annBusy.set(true);
  annFailure.set("");
  (force ? refreshAnnouncements() : loadAnnouncements())
    .then(() => annFailure.set(""))
    .catch((error: unknown) => annFailure.set(reason(error)))
    .finally(() => {
      annBusy.set(false);
      readAnnouncementStamp();
    });
}

/* --------------------------------------------------------------- rows model */

export type ListRow =
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "notice"; key: string; notice: Notice }
  | { kind: "post"; key: string; post: Announcement };

/** One section: its header text and how new it is, for ordering. */
interface Section {
  key: string;
  label: string;
  /** Newer sections first; undated last. */
  rank: number;
}

function dateSection(date: string | null): Section {
  const parsed = date ? Date.parse(date) : Number.NaN;
  if (!Number.isFinite(parsed)) return { key: "g:undated", label: "Undated", rank: -1 };
  const today = dayStart(Date.now());
  const day = dayStart(parsed);
  if (day >= today) return { key: "g:today", label: "Today", rank: today + 3 };
  if (day >= dayStart(today - DAY)) return { key: "g:yesterday", label: "Yesterday", rank: today + 2 };
  if (day >= dayStart(today - 6 * DAY)) return { key: "g:week", label: "Past week", rank: today + 1 };
  const stamp = new Date(day);
  return {
    key: `g:${stamp.getFullYear()}-${stamp.getMonth() + 1}`,
    label: `${MONTHS[stamp.getMonth()]} ${stamp.getFullYear()}`,
    rank: day,
  };
}

/** The board's own category, important first, then general, then the rest. */
function categorySection(category: string): Section {
  const label = category.trim() || "Uncategorised";
  const lower = label.toLowerCase();
  const rank = lower === "important" ? 2 : lower === "general" ? 1 : 0;
  return { key: `c:${lower}`, label, rank };
}

function noticeRow(notice: Notice): ListRow {
  return { kind: "notice", key: `n:${notice.id}`, notice };
}

function postRow(post: Announcement): ListRow {
  return { kind: "post", key: `p:${post.slug}`, post };
}

function sectioned(sections: { section: Section; rows: ListRow[] }[]): ListRow[] {
  sections.sort((left, right) => right.section.rank - left.section.rank);
  const rows: ListRow[] = [];
  for (const section of sections) {
    rows.push({ kind: "group", key: section.section.key, label: section.section.label, count: section.rows.length });
    for (const row of section.rows) rows.push(row);
  }
  return rows;
}

function bucketInto(
  items: { row: ListRow; section: Section }[],
): { section: Section; rows: ListRow[] }[] {
  const buckets = new Map<string, { section: Section; rows: ListRow[] }>();
  for (const item of items) {
    const bucket = buckets.get(item.section.key);
    if (bucket) bucket.rows.push(item.row);
    else buckets.set(item.section.key, { section: item.section, rows: [item.row] });
  }
  return [...buckets.values()];
}

export function buildNoticeRows(
  items: Notice[],
  query: string,
  course: string,
  semester: string,
  scope: BoardScope = "all",
  group: GroupMode = "date",
): ListRow[] {
  const needle = query.trim().toLowerCase();
  const filtered = items.filter((notice) => {
    if (scope === "unread" && isRead(notice.id)) return false;
    if (scope === "pinned" && !notice.important) return false;
    if (course !== "All" && notice.course !== course) return false;
    if (semester !== "All" && notice.semester !== semester) return false;
    if (!needle) return true;
    return noticeHaystack(notice).includes(needle);
  });
  if (needle) {
    return filtered.length > 0
      ? [{ kind: "group", key: "g:matches", label: "Matches", count: filtered.length }, ...filtered.sort(pinnedFirst).map(noticeRow)]
      : [];
  }
  return sectioned(
    bucketInto(
      filtered.map((notice) => ({
        row: noticeRow(notice),
        section: group === "category" ? categorySection(notice.category) : dateSection(notice.date),
      })),
    ),
  );
}

/** The announcement feed, newest month first, or one "Matches" section. */
export function buildPostRows(posts: Announcement[], query: string): ListRow[] {
  const needle = query.trim().toLowerCase();
  const filtered = posts.filter((post) => !needle || postHaystack(post).includes(needle));
  if (needle) {
    return filtered.length > 0
      ? [{ kind: "group", key: "g:matches", label: "Matches", count: filtered.length }, ...filtered.map(postRow)]
      : [];
  }
  return sectioned(
    bucketInto(
      filtered.map((post) => {
        const parsed = Date.parse(post.publishedAt);
        const date = Number.isFinite(parsed) ? new Date(parsed) : null;
        const section: Section = date
          ? {
              key: `g:${date.getFullYear()}-${date.getMonth() + 1}`,
              label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
              rank: parsed,
            }
          : { key: "g:undated", label: "Undated", rank: -1 };
        return { row: postRow(post), section };
      }),
    ),
  );
}

export function buildSearchRows(term: string, items: Notice[], posts: Announcement[]): ListRow[] {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];
  const noticeHits = items.filter((notice) => noticeHaystack(notice).includes(needle)).slice(0, 50);
  const postHits = posts.filter((post) => postHaystack(post).includes(needle)).slice(0, 30);
  const rows: ListRow[] = [];
  if (noticeHits.length > 0) {
    rows.push({ kind: "group", key: "g:notices", label: "Notices", count: noticeHits.length });
    for (const notice of noticeHits) rows.push(noticeRow(notice));
  }
  if (postHits.length > 0) {
    rows.push({ kind: "group", key: "g:posts", label: "Announcements", count: postHits.length });
    for (const post of postHits) rows.push(postRow(post));
  }
  return rows;
}

/* ------------------------------------------------------------ scroll anchor */

/** Remembers the topmost row the list has shown, for the next mount. */
export function noteTopRow(info: { viewableItems: { key: string; index: number }[] }): void {
  let best: { key: string; index: number } | null = null;
  for (const token of info.viewableItems) {
    if (best === null || token.index < best.index) best = token;
  }
  if (best !== null) boardTopKey = best.key;
}

/** Where a fresh list should start, 0 when the old anchor is gone. */
export function topRowIndex(rows: ListRow[]): number {
  if (!boardTopKey) return 0;
  const found = rows.findIndex((row) => row.key === boardTopKey);
  return found > 0 ? found : 0;
}

/* ------------------------------------------------------------------ browser */

export { openExternal } from "../../lib/link";

export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A short-lived confirmation line under a screen's actions. */
export function flash(): { note: () => string; say: (text: string) => void } {
  const value = signal("");
  return {
    note: () => value(),
    say: (text: string) => {
      value.set(text);
      setTimeout(() => {
        if (value() === text) value.set("");
      }, 3000);
    },
  };
}

/* ------------------------------------------------------------------- recents */

let recentHydrated = false;
let rememberTimer: ReturnType<typeof setTimeout> | undefined;

export function hydrateRecent(): void {
  if (recentHydrated) return;
  recentHydrated = true;
  void readStore<string[]>(RECENT_KEY, []).then((saved) => {
    if (Array.isArray(saved)) recent.set(saved.filter((item) => typeof item === "string").slice(0, 6));
  });
}

export function rememberSearch(term: string): void {
  const text = term.trim().slice(0, 80);
  if (text.length < 2) return;
  const next = [text, ...recent().filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, 6);
  recent.set(next);
  void writeStore(RECENT_KEY, next);
}

export function rememberSoon(term: string): void {
  if (rememberTimer !== undefined) clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => rememberSearch(term), 1000);
}

export function clearRecent(): void {
  recent.set([]);
  void writeStore(RECENT_KEY, []);
}

/* ------------------------------------------------------------------ pieces */

/** `["All", "B.Tech"]` → the chip rail's `{ value, text }` rows. */
export function chipItems(values: string[]): { value: string; text: string }[] {
  return values.map((value) => ({ value, text: value }));
}

/** A labelled chip rail: what it filters, then the options, scrolling sideways. */
export function ChipRail(props: {
  label: string;
  items: { value: string; text: string }[];
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <Row class="gap-2">
      <View class="w-[62px]">
        <Label>{props.label}</Label>
      </View>
      {/* The rail wraps its own scroll so the spoken label of a chip says
          which rail it belongs to ("Course: MCA"), not just "MCA". The id sits
          on the scroll view itself, so a test can scroll the rail by id. */}
      <View class="flex-1">
        <Scroll horizontal scrollbar={false} bounces={false} class="h-11" contentClass="flex-row gap-2 pr-4" testID={`rail-${props.label}`}>
          {props.items.map((item) => (
            <Chip
              active={props.active === item.value}
              label={`${props.label}: ${item.text}`}
              onPress={() => props.onPick(item.value)}
            >
              {item.text}
            </Chip>
          ))}
        </Scroll>
      </View>
    </Row>
  );
}

/**
 * The undo behind "Mark all read".
 *
 * `markAllRead` hands back the read list as it was; this keeps it just long
 * enough to be useful, shows one line explaining what happened, and restores
 * the list exactly when the student presses Undo. No dialog: marking a board
 * read is reversible, not destructive.
 */
export function readUndo(): {
  text: () => string;
  offer: (text: string, before: string[]) => void;
  restore: () => void;
} {
  const label = signal("");
  let before: string[] = [];
  let offered = false;

  const clear = (): void => {
    label.set("");
    before = [];
    offered = false;
  };

  return {
    text: () => label(),
    offer: (text: string, snapshot: string[]) => {
      before = snapshot;
      offered = true;
      label.set(text);
      setTimeout(() => {
        if (label() === text) clear();
      }, 12_000);
    },
    restore: () => {
      if (!offered) return;
      restoreRead(before);
      clear();
    },
  };
}

/** The one-line confirmation under a board's actions, with its undo. */
export function UndoBar(props: { text: string; onUndo: () => void }) {
  return (
    <Panel tone="mint" class="p-3">
      <Row class="gap-2">
        <Text class="flex-1 text-[13px] leading-5 text-foreground">{props.text}</Text>
        <Btn class="px-3" variant="ghost" label="Undo marking all read" onPress={props.onUndo}>Undo</Btn>
      </Row>
    </Panel>
  );
}

/** One month, day or category heading, with how many rows sit under it. */
function GroupRow(props: { label: string; count: number }) {
  return (
    <View class="flex-row items-center justify-between gap-2 px-1 pb-1 pt-3">
      <Row class="gap-2">
        <View class="h-1.5 w-1.5 rounded-full bg-primary" />
        <Label role="header">{props.label}</Label>
      </Row>
      <Muted class="text-[11px] tabular-nums" numberOfLines={1}>{props.count}</Muted>
    </View>
  );
}

/**
 * One notice on the board. Unread is said in words as well as shown in shape:
 * a filled dot and an UNREAD badge, against a hollow dot and no badge once the
 * notice has been opened. Colour is never the only signal.
 */
function NoticeCard(props: { notice: Notice; onPress: () => void }) {
  const unread = (): boolean => !isRead(props.notice.id);
  const attachment = (): boolean => pdfUrl(props.notice.link) !== null;
  return (
    <View
      class="min-h-[76px] flex-row items-start gap-3 rounded-3xl border border-border bg-card p-4 active:scale-[0.99] active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`${unread() ? "Unread. " : ""}${props.notice.important ? "Pinned. " : ""}${props.notice.title}`}
    >
      <View class="mt-1.5 items-center">
        <View class={`h-2.5 w-2.5 rounded-full ${unread() ? "bg-primary" : "border border-border-strong bg-transparent"}`} />
      </View>
      <View class="flex-1 gap-1">
        <Row class="flex-wrap items-center gap-1.5">
          {unread() ? <Badge tone="ember">UNREAD</Badge> : null}
          {props.notice.important ? <Badge tone="amber">PINNED</Badge> : null}
          <Muted class="text-[11px] tabular-nums" numberOfLines={1}>{noticeDate(props.notice)}</Muted>
        </Row>
        <Text
          class={`text-[15px] leading-5 text-foreground ${unread() ? "font-bold" : "font-semibold"}`}
          numberOfLines={2}
        >
          {props.notice.title}
        </Text>
        <View class="flex-row flex-wrap items-center gap-1.5">
          {props.notice.course !== "Other" ? <Badge>{props.notice.course}</Badge> : null}
          {props.notice.semester !== "Other" ? <Badge tone="mint">{`${props.notice.semester} sem`}</Badge> : null}
          {attachment() ? <Badge>PDF</Badge> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={18} class="text-muted-foreground" />
    </View>
  );
}

export function PostCard(props: { post: Announcement; onPress: () => void }) {
  const fresh = (): boolean => !isPostRead(props.post.slug);
  const attachment = (): boolean => {
    const body = bodyOf(props.post.slug);
    return body.some((part) => /\.pdf\b/i.test(part)) || /\.pdf\b/i.test(props.post.excerpt);
  };
  return (
    <View
      class="min-h-[88px] gap-2 rounded-3xl border border-border bg-card p-4 active:scale-[0.99] active:bg-muted"
      onPress={props.onPress}
      role="button"
      accessibilityLabel={`${fresh() ? "New. " : ""}${props.post.title}`}
    >
      <Row class="justify-between gap-2">
        <Row class="flex-wrap items-center gap-1.5">
          {fresh() ? <Badge tone="ember">NEW</Badge> : <Badge tone="mint">UPDATE</Badge>}
          {attachment() ? <Badge>PDF</Badge> : null}
          <Muted class="text-[11px] tabular-nums" numberOfLines={1}>{formatDate(props.post.publishedAt)}</Muted>
        </Row>
        <Icon name="chevron-right" size={18} class="text-muted-foreground" />
      </Row>
      <Text class="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>{props.post.title}</Text>
      {props.post.excerpt ? <Text class="text-[12px] leading-5 text-muted-foreground" numberOfLines={3}>{props.post.excerpt}</Text> : null}
      <Row class="flex-wrap gap-1.5">
        {props.post.tags.map((tag) => <Badge>#{tag}</Badge>)}
        <Muted class="text-[11px]" numberOfLines={1}>{props.post.author}</Muted>
      </Row>
    </View>
  );
}

/**
 * The "this is the phone's copy" line. Shown whenever the loader served the
 * cache (no connection) or a refresh failed, so a board never pretends to be
 * fresh and never goes blank.
 */
export function OfflinePanel(props: { stamp: number; message: string; onRetry: () => void }) {
  return (
    <Panel tone="amber" class="p-3">
      <Row class="gap-2">
        <View class="flex-1 gap-1">
          <Row class="flex-wrap items-center gap-1.5">
            <Badge tone="amber">Offline copy</Badge>
            <Muted class="text-[11px] tabular-nums" numberOfLines={1}>{savedLabel(props.stamp)}</Muted>
          </Row>
          <Muted class="text-[12px] leading-4" numberOfLines={2}>
            {props.message || "The copy this phone kept. Pull to refresh when you have signal."}
          </Muted>
        </View>
        <Btn class="px-2" variant="ghost" onPress={props.onRetry}>Retry</Btn>
      </Row>
    </Panel>
  );
}

/**
 * The board's shape while the first fetch is in flight. Rendered only before
 * `noticesLoaded`: a refresh keeps the rows it already has and never blanks.
 */
export function NoticesSkeleton(props: { count?: number }) {
  const count = props.count === undefined ? 3 : props.count;
  return (
    <View class="gap-2 pb-2" accessible accessibilityLabel="Fetching the notice board" android={{ accessibilityLiveRegion: "polite" }}>
      <View class="flex-row items-center justify-between px-1 pt-3">
        <Skeleton h={12} w={104} />
        <Skeleton h={12} w={16} />
      </View>
      {Array.from({ length: count }, (_, index) => (
        <View class="min-h-[76px] flex-row items-start gap-3 rounded-3xl border border-border bg-card p-4">
          <Skeleton h={10} w={10} />
          <View class="flex-1 gap-2">
            <Skeleton h={13} w={index === count - 1 ? 148 : 196} />
            <Skeleton h={13} w={116} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function RowView(props: { row: ListRow; nav: Nav }) {
  const row = props.row;
  if (row.kind === "group") return <GroupRow label={row.label} count={row.count} />;
  if (row.kind === "notice") {
    const notice = row.notice;
    return <NoticeCard notice={notice} onPress={() => props.nav.push("notices.detail", { id: notice.id })} />;
  }
  const post = row.post;
  return <PostCard post={post} onPress={() => props.nav.push("notices.post", { slug: post.slug })} />;
}

/**
 * The row renderer every notices list hands to `List`.
 *
 * `row()` is the shell's accessor for the cell's current item; reading it inside
 * `Each` means a cell recycled for another notice paints that notice, not the
 * one it was first built with.
 */
export function rowCell(nav: Nav) {
  return (row: () => ListRow) => (
    <Each of={[row()]} key={(item: ListRow) => item.key}>
      {(item) => <RowView row={item()} nav={nav} />}
    </Each>
  );
}
