/**
 * The one search — `search`.
 *
 * A student types what they remember — a subject name, a paper code, a word
 * from a unit heading, a college, a circular, "attendance" — and lands on the
 * screen that owns it. Everything here is local: the syllabus packs and the
 * GATE catalog are bundled, and the notice board and dataset manifest are the
 * app's own caches, so a query keeps working offline once either has loaded.
 *
 * Five rules shape this file:
 *
 *  1. The index is built once per module load, lazily. `baseEntries()` parses
 *     the packs on the first keystroke that needs it and never again; the
 *     notice and dataset blocks arrive when their stores do. No JSX expression
 *     builds an index, and an empty query never touches one — browse mode is
 *     the destination table, which is already in memory.
 *  2. A search pass is pure (`./rank.ts`) and capped at `HIT_LIMIT`, so a
 *     one-letter query cannot cost more than 60 rows however big the manifest.
 *  3. Opening a hit is one function: remember it in `beu.search.recent`, then
 *     push its route with its own params — never a hardcoded name, so the push
 *     scan in `qa/` cannot drift.
 *  4. An empty query is a browse screen, not an empty result: the last few
 *     things opened, then every screen grouped by the errand it belongs to
 *     (Study, Results, Daily, App). Nothing is listed twice and nothing is
 *     invented.
 *  5. The chip row narrows by kind before the cap (see `searchAll`), and a
 *     filter that finds nothing says which one is on and offers to clear it.
 *
 * Route params, both optional: `q` prefills the field (a "search for this"
 * deep link) and `kind` preselects a filter (one of `FILTERS`); anything else
 * falls back to an empty, unfiltered screen.
 */

import { View, cleanup, computed, effect, signal, untracked, Keyboard } from "nsh";

import type { Nav, RouteDef } from "../../app/router";
import { param } from "../../app/router";
import { Body, EmptyState, Muted, Screen } from "../../ui";
import { formatDate, readStore, relativeTime, writeStore } from "../../lib/net";
import { BRANCH_META, branchPack, gatePack } from "../syllabus/active";
import { dataVersion } from "../data-feed/pyqs";
import { parseGate, parseSyllabus, type BranchPack, type GatePack, type Subject } from "../syllabus/parse";
import { branchLabel, collegeName, loadDatasets, shortBranchLabel, shortCollegeName, type Dataset } from "../pyqs/api";
import { gateSubjects } from "../pyqs/gate-index";
import { loadNotices, notices, type Notice } from "../notices/api";
import {
  DESTINATIONS,
  HIT_LIMIT,
  INTENT_TITLE,
  KIND_ORDER,
  KIND_PLURAL,
  browseDestinations,
  datasetEntry,
  destinationEntries,
  filterById,
  gateEntry,
  isFilterId,
  noticeEntry,
  searchAll,
  subjectEntry,
  type Destination,
  type FilterId,
  type Hit,
  type HitKind,
  type SearchEntry,
  type SubjectInput,
} from "./rank";
import { FilterBar, HeadingRow, ResultRow, SearchField } from "./parts";

/* ------------------------------------------------------------------- state */

const PACK_CACHE = new Map<string, BranchPack>();

function packOf(branch: string): BranchPack | null {
  const key = `${branch}@${dataVersion()}`;
  const cached = PACK_CACHE.get(key);
  if (cached !== undefined) return cached;
  const raw = branchPack(branch);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BranchPack;
    PACK_CACHE.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** "Unit 1" and "Course content" are headings, not names a student searches. */
const GENERIC_SECTION = /^(course content|(unit|module|part|section)\s+[\divxlcdm.]+)$/i;

function sectionsOf(subject: Subject): string[] {
  if (typeof subject.content !== "string" || subject.content.length === 0) return [];
  return parseSyllabus(subject.content)
    .map((unit) => unit.title.trim())
    .filter((title) => title.length > 2 && !GENERIC_SECTION.test(title));
}

/**
 * One row per paper, not per branch: the common first-year subjects are taught
 * by all six branches, and six identical rows would be six wasted hits. The
 * row keeps the first branch (its route param) and says how many branches the
 * paper is shared by when there is more than one.
 */
function subjectEntries(): SearchEntry[] {
  const merged = new Map<string, { input: SubjectInput; branches: string[] }>();

  for (const meta of BRANCH_META) {
    const pack = packOf(meta.code);
    if (!pack) continue;
    for (const key of Object.keys(pack.semesters)) {
      const sem = Number(key);
      if (!Number.isFinite(sem) || sem <= 0) continue;
      for (const subject of pack.semesters[key] ?? []) {
        if (!subject || typeof subject.name !== "string" || typeof subject.code !== "string" || !subject.code) continue;
        const id = `${subject.code}|${subject.name}|${sem}`;
        const known = merged.get(id);
        if (known) {
          if (!known.branches.includes(meta.short)) known.branches.push(meta.short);
          continue;
        }
        merged.set(id, {
          branches: [meta.short],
          input: {
            code: subject.code,
            name: subject.name,
            branch: meta.code,
            branchShort: meta.short,
            branches: [meta.short],
            sem,
            sections: sectionsOf(subject),
          },
        });
      }
    }
  }

  return [...merged.values()].map((offer) => subjectEntry({ ...offer.input, branches: offer.branches }));
}

function gateEntries(): SearchEntry[] {
  return gateSubjects().map((subject) => {
    // The XH humanities paper is published as six codes (XH-C1…C6) against one
    // syllabus pack, so the sections come from the parent code.
    const raw = gatePack(subject.code) ?? gatePack(subject.code.split("-")[0] ?? "");
    let sections: string[] = [];
    if (raw) {
      try {
        sections = parseGate(JSON.parse(raw) as GatePack)
          .map((unit) => unit.title.trim())
          .filter((title) => title.length > 2);
      } catch {
        sections = [];
      }
    }
    const years = subject.papers.map((paper) => paper.year).filter((year) => Number.isFinite(year) && year > 0);
    return gateEntry({
      code: subject.code,
      name: subject.name,
      sections,
      papers: subject.papers.length,
      oldest: years.length > 0 ? Math.min(...years) : 0,
      newest: years.length > 0 ? Math.max(...years) : 0,
    });
  });
}

/** The bundled half of the index: built once, on the first search. */
let baseCache: SearchEntry[] | null = null;

function baseEntries(): SearchEntry[] {
  if (baseCache === null) {
    try {
      baseCache = [...subjectEntries(), ...gateEntries(), ...destinationEntries()];
    } catch {
      // A broken pack must not take the whole screen down: destinations alone
      // still make the search useful.
      baseCache = destinationEntries();
    }
  }
  return baseCache;
}

function noticeInputs(board: readonly Notice[]): SearchEntry[] {
  return board.map((notice) =>
    noticeEntry({
      id: notice.id,
      title: notice.title,
      dateLabel: notice.date ? formatDate(notice.date) : "Undated",
      category: notice.category,
      course: notice.course,
      semester: notice.semester,
    }),
  );
}

/** One entry per published table; `cohort` is its size in the batch/branch/sem. */
function datasetEntries(rows: readonly Dataset[]): SearchEntry[] {
  const cohort = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.batch}|${row.branch}|${row.sem}`;
    cohort.set(key, (cohort.get(key) ?? 0) + 1);
  }
  return rows.map((row) =>
    datasetEntry({
      id: row.id,
      batch: row.batch,
      branch: row.branch,
      branchShort: shortBranchLabel(row.branch),
      branchName: branchLabel(row.branch),
      sem: row.sem,
      college: row.college,
      collegeShort: shortCollegeName(row.college),
      collegeName: collegeName(row.college),
      cohort: cohort.get(`${row.batch}|${row.branch}|${row.sem}`) ?? 1,
    }),
  );
}

const datasetIndex = signal<SearchEntry[]>([]);

/* ------------------------------------------------------------------ remote */

type Remote = "loading" | "ready" | "partial" | "failed";

const remote = signal<Remote>("loading");

let remoteStarted = false;
let noticesDone = false;
let noticesOk = false;
let datasetsDone = false;
let datasetsOk = false;

function settle(): void {
  if (!noticesDone || !datasetsDone) {
    remote.set("loading");
    return;
  }
  remote.set(noticesOk && datasetsOk ? "ready" : noticesOk || datasetsOk ? "partial" : "failed");
}

function loadRemote(): void {
  if (remoteStarted) return;
  remoteStarted = true;

  void loadNotices().then(
    () => {
      noticesDone = true;
      noticesOk = true;
      settle();
    },
    () => {
      noticesDone = true;
      noticesOk = false;
      settle();
    },
  );

  void loadDatasets().then(
    (rows) => {
      datasetIndex.set(datasetEntries(rows));
      datasetsDone = true;
      datasetsOk = true;
      settle();
    },
    () => {
      datasetsDone = true;
      datasetsOk = false;
      settle();
    },
  );
}

/** What the network blocks are doing, in the words a student would use. */
function offlineNote(): string {
  const phase = remote();
  if (phase === "failed") return "notices and data offline";
  if (phase === "partial") return "some notices or data missing";
  return "";
}

/* ------------------------------------------------------------------ recent */

interface RecentItem {
  kind: HitKind;
  title: string;
  route: string;
  params: Record<string, string | number>;
  at: number;
}

interface RecentFile {
  items: RecentItem[];
  at: number;
}

/** The store key: `readStore`/`writeStore` add the "beu." prefix. */
const RECENT_KEY = "search.recent";
const RECENT_LIMIT = 8;

const recent = signal<RecentItem[]>([]);
let recentHydrated = false;

function isKind(value: unknown): value is HitKind {
  return typeof value === "string" && (KIND_ORDER as readonly string[]).includes(value);
}

function cleanParams(value: unknown): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return params;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" || (typeof raw === "number" && Number.isFinite(raw))) params[key] = raw;
  }
  return params;
}

function isRecent(value: unknown): value is RecentItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecentItem>;
  return (
    isKind(item.kind) &&
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    typeof item.route === "string" &&
    item.route.trim().length > 0 &&
    typeof item.at === "number" &&
    Number.isFinite(item.at)
  );
}

function hydrateRecent(): void {
  if (recentHydrated) return;
  recentHydrated = true;
  void readStore<RecentFile>(RECENT_KEY, { items: [], at: 0 }).then((file) => {
    const items = Array.isArray(file?.items) ? file.items.filter(isRecent) : [];
    recent.set(items.slice(0, RECENT_LIMIT).map((item) => ({ ...item, params: cleanParams(item.params) })));
  });
}

interface Target {
  kind: HitKind;
  title: string;
  route: string;
  params: Record<string, string | number>;
}

function sameTarget(left: Target, right: Target): boolean {
  return left.route === right.route && JSON.stringify(left.params) === JSON.stringify(right.params);
}

function remember(target: Target): void {
  const at = Date.now();
  const item: RecentItem = { kind: target.kind, title: target.title, route: target.route, params: target.params, at };
  const items = [item, ...recent().filter((old) => !sameTarget(old, item))].slice(0, RECENT_LIMIT);
  recent.set(items);
  void writeStore(RECENT_KEY, { items, at });
}

/**
 * The only way a row navigates. The target's route is read from the index, so
 * `qa/scan-push-targets.mjs` sees no new literal here and the registry cannot
 * fall behind a hardcoded name.
 */
function open(nav: Nav, target: Target): void {
  remember(target);
  nav.push(target.route, target.params);
}

/* -------------------------------------------------------------------- rows */

type Row =
  | { key: string; type: "heading"; label: string; count: string }
  | { key: string; type: "hit"; hit: Hit }
  | { key: string; type: "recent"; item: RecentItem }
  | { key: string; type: "destination"; item: Destination };

interface Group {
  kind: HitKind;
  hits: Hit[];
  best: number;
}

/**
 * Grouped, but ordered by the best hit in each group: `hits` already arrives
 * sorted by score, so the group holding an exact code match leads the page even
 * when another kind sorts first in `KIND_ORDER`. Ties keep kind order, so the
 * same query always draws the same screen.
 */
function resultRows(hits: readonly Hit[]): Row[] {
  const groups: Group[] = [];
  for (const kind of KIND_ORDER) {
    const group = hits.filter((hit) => hit.kind === kind);
    if (group.length === 0) continue;
    groups.push({ kind, hits: group, best: group[0]?.score ?? 0 });
  }
  groups.sort((left, right) => right.best - left.best || KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind));

  const rows: Row[] = [];
  for (const group of groups) {
    rows.push({
      key: `heading:${group.kind}`,
      type: "heading",
      label: KIND_PLURAL[group.kind],
      count: String(group.hits.length),
    });
    for (const hit of group.hits) rows.push({ key: hit.id, type: "hit", hit });
  }
  return rows;
}

/** Browse mode: what was opened last, then every screen by errand. */
function browseRows(items: readonly RecentItem[]): Row[] {
  const rows: Row[] = [];
  if (items.length > 0) {
    rows.push({ key: "heading:recent", type: "heading", label: "Recent", count: String(items.length) });
    for (const item of items) {
      rows.push({ key: `recent:${item.route}:${JSON.stringify(item.params)}`, type: "recent", item });
    }
  }
  for (const group of browseDestinations()) {
    rows.push({
      key: `heading:${group.intent}`,
      type: "heading",
      label: INTENT_TITLE[group.intent],
      count: String(group.items.length),
    });
    for (const item of group.items) rows.push({ key: `destination:${item.route}`, type: "destination", item });
  }
  return rows;
}

function RowView(props: { row: Row; onOpen: (target: Target) => void }) {
  const row = props.row;
  if (row.type === "heading") return <HeadingRow label={row.label} count={row.count} />;
  if (row.type === "recent") {
    return (
      <ResultRow
        kind={row.item.kind}
        title={row.item.title}
        meta={`${row.item.kind === "destination" ? "Screen" : "Opened"} ${relativeTime(row.item.at)}`}
        onPress={() => props.onOpen(row.item)}
      />
    );
  }
  if (row.type === "destination") {
    return (
      <ResultRow
        kind="destination"
        title={row.item.title}
        meta={row.item.hint}
        onPress={() =>
          props.onOpen({
            kind: "destination",
            title: row.item.title,
            route: row.item.route,
            params: row.item.params ?? {},
          })
        }
      />
    );
  }
  return (
    <ResultRow
      kind={row.hit.kind}
      title={row.hit.title}
      meta={row.hit.meta}
      term={row.hit.query}
      onPress={() => props.onOpen(row.hit)}
    />
  );
}

/* -------------------------------------------------------------- empty copy */

interface EmptyCopy {
  title: string;
  hint: string;
  action: string;
}

/* ------------------------------------------------------------------ screen */

/** Runs once when the screen appears; the body's own reads stay untracked. */
function once(run: () => void): void {
  effect(() => {
    untracked(run);
  });
}

/** How long a keystroke waits for the next one before it is searched. */
const TYPE_DELAY = 120;

function SearchScreen(props: { nav: Nav }) {
  const nav = props.nav;
  const typed = signal(param(nav, "q"));
  const query = signal(typed().trim());
  // A filter deep link is only believed alongside a query: a filter with
  // nothing to filter would be an invisible rule the screen never explains.
  const initialKind = param(nav, "kind");
  const filter = signal<FilterId>(query().length > 0 && isFilterId(initialKind) ? initialKind : "all");

  // One timer per screen, cancelled on the next keystroke and on unmount, so a
  // slow typist never sees three stale queries arrive one after another.
  let pending: ReturnType<typeof setTimeout> | undefined;
  const stopPending = (): void => {
    if (pending !== undefined) clearTimeout(pending);
    pending = undefined;
  };
  /** Commit a query. Emptying the field also ends the filter: browse mode has
   * no kinds, and a filter left on behind an empty field would silently narrow
   * the next word the student types. */
  const applyQuery = (value: string): void => {
    const clean = value.trim();
    query.set(clean);
    if (clean.length === 0) filter.set("all");
  };
  const type = (value: string): void => {
    typed.set(value);
    stopPending();
    pending = setTimeout(() => {
      pending = undefined;
      applyQuery(value);
    }, TYPE_DELAY);
  };
  /** Return: commit now and put the keyboard away; the results stay. */
  const submit = (value: string): void => {
    typed.set(value);
    stopPending();
    applyQuery(value);
    Keyboard.dismiss();
  };
  cleanup(stopPending);

  once(() => {
    hydrateRecent();
    // Network work waits one turn: the screens this screen already has are the
    // first paint, and a slow manifest must not delay it.
    setTimeout(loadRemote, 0);
  });

  // Nothing below is built during the first paint: `baseEntries()` runs on the
  // first query, and the notice/dataset blocks arrive through their stores.
  const index = computed(() => [...baseEntries(), ...noticeInputs(notices()), ...datasetIndex()]);
  // One pass per query: the counts are taken over every kind even when a filter
  // is on, which is how the filtered empty state can say what it left out.
  const results = computed(() => searchAll(query(), index(), HIT_LIMIT, filter()));
  const rows = computed(() => (query() ? resultRows(results().hits) : browseRows(recent())));

  const status = computed(() => {
    const offline = offlineNote();
    if (!query()) {
      const recentCount = recent().length;
      const base =
        recentCount > 0 ? `${recentCount} recent · ${DESTINATIONS.length} screens` : `${DESTINATIONS.length} screens`;
      return offline.length > 0 ? `${base} · ${offline}` : base;
    }
    const found = results();
    const active = filterById(filter());
    const shown = found.hits.length;
    const capped = shown >= HIT_LIMIT;
    const count = capped ? `${shown}+` : String(shown);
    const noun = shown === 1 && !capped ? active.one : active.noun;
    const took = found.took < 1 ? "<1" : String(Math.round(found.took));
    return `${count} ${noun} · ${took} ms`;
  });

  /**
   * The one thing a dead end must say: what was searched, which filter is on,
   * what could not be reached, and the single tap that fixes it.
   */
  const emptyCopy = computed<EmptyCopy>(() => {
    const asked = query();
    const active = filterById(filter());
    const filtered = filter() !== "all";
    const found = results();
    const parts: string[] = [];

    if (filtered) {
      const others = KIND_ORDER.reduce((total, kind) => (kind === filter() ? total : total + found.counts[kind]), 0);
      parts.push(
        others > 0
          ? `${others} result${others === 1 ? "" : "s"} in other kinds — the ${active.label} filter is on.`
          : `Nothing in any kind matched “${asked}”. The ${active.label} filter is on.`,
      );
    } else {
      parts.push("Searched subjects, GATE papers, notices, data and screens.");
    }

    const phase = remote();
    if (phase === "failed") parts.push("Notices and datasets need a connection.");
    else if (phase === "partial") parts.push("Some notices or datasets could not load.");
    else if (phase === "loading") parts.push("Notices and datasets are still loading.");
    else if (!filtered) parts.push("Try a subject code (100110) or a GATE code (CS).");

    return {
      title: filtered ? `No ${active.noun} for “${asked}”` : `Nothing matched “${asked}”`,
      hint: parts.join(" "),
      action: filtered ? "Clear filter" : "Clear search",
    };
  });

  const clearAll = (): void => {
    typed.set("");
    stopPending();
    query.set("");
    filter.set("all");
  };

  return (
    <Screen>
      <View class="gap-2 border-b border-border px-4 pb-3 pt-3">
        <SearchField value={typed()} onChange={type} onSubmit={submit} placeholder="Subject, code, notice, dataset…" />
        <Muted class="px-1 text-[11px] tabular-nums" numberOfLines={2}>
          {status()}
        </Muted>
        {typed().trim().length > 0 ? <FilterBar active={filter()} onSelect={(id) => filter.set(id)} /> : null}
      </View>

      <Body class="flex-1" contentClass="gap-2 px-4 pb-10 pt-3">
        {() => {
          const built = rows();
          if (built.length === 0) {
            const copy = emptyCopy();
            return (
              <View class="pt-2">
                <EmptyState
                  title={copy.title}
                  hint={copy.hint}
                  action={copy.action}
                  onAction={() => (filter() === "all" ? clearAll() : filter.set("all"))}
                />
              </View>
            );
          }
          return (
            <Each of={built} key={(row: Row) => row.key}>
              {(row: () => Row) => <RowView row={row()} onOpen={(target) => open(nav, target)} />}
            </Each>
          );
        }}
      </Body>
    </Screen>
  );
}

/* ------------------------------------------------------------------ routes */

export const searchRoutes: RouteDef[] = [
  {
    name: "search",
    title: () => "Search",
    render: (nav) => <SearchScreen nav={nav} />,
  },
];
