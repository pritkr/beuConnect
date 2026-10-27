/**
 * The one matcher: every kind the search screen knows, scored in one pass.
 *
 * What is searchable comes from four shapes below — a subject, a GATE paper, a
 * notice, a published dataset — plus the app's own destination table. The
 * screens build those inputs from the bundled packs and the network stores and
 * hand them here; this file has no framework, no storage and no I/O, so the
 * ranking can be read (and proven) on its own.
 *
 * Scoring, best tier wins, first tier that matches decides:
 *
 *   exact code .................. 1000   the query IS a subject / GATE / college code
 *   exact name ..................  800   the query IS the full title
 *   name prefix .................  500   the title starts with the query
 *   code prefix .................  400   a code starts with the query (1001 → 100110)
 *   word start ..................  300   a word of the title or an alias starts with it
 *   substring ...................  120   the title or an alias contains it
 *   subsequence .................   40   the query's letters appear in order ("dsa")
 *
 * Ties break by kind order — Subject, GATE, Notice, Dataset, Screen — and
 * then by title, so the same query always produces the same screen. The screen
 * lays the groups out in the order of their best hit, so an exact code match
 * still leads the page even when its group is not first in that kind order.
 *
 * A hit's muted line is the entry's own meta (branch + semester, the notice
 * date, the dataset's size). When the match came from somewhere else — a
 * subject's section, a notice's category, a code — that phrase is appended so
 * the row says why it matched, and the row highlights it.
 *
 * Two shapes here are for the screen's own controls, not the matcher:
 *
 *  - `FILTERS` is the one-tap chip row (All / Subjects / Papers / Notices / Data
 *    / Screens). A filter narrows the *entries* before the 60-row cap, so a
 *    full Subjects page can never hide the notices that matched too.
 *  - `browseDestinations()` groups the app's own screens by intent, which is
 *    what an empty query shows instead of one flat list.
 *
 * A one-character query is a special case on purpose: it only looks at what a
 * single letter can usefully narrow (a code or the start of a word), skips the
 * aliases, and never scans the dataset manifest for a letter — that manifest is
 * keyed by college and batch, so "s" would match hundreds of rows and say
 * nothing. A single digit still scans it, because "1" is a batch.
 *
 * WORKED EXAMPLES (real entries from the shipped index)
 *
 *   1. "cs"
 *        GATE · CS (code exact, 1000) — and because that is the best score on
 *        the page, the GATE group is laid out first even though subjects come
 *        first in kind order. After it, the names starting with "cs" (500), and
 *        finally the subsequence tier (40) for names whose letters appear in
 *        order.
 *
 *   2. "digital electronics"
 *        the subject whose full name is exactly that (800) leads; subjects that
 *        only mention it inside a unit heading land at 300 (word start) with
 *        the heading appended to the muted line.
 *
 *   3. "157"
 *        every dataset published by college 157 (code exact, 1000), newest
 *        batch first? No — ties break by title, so the same college's tables
 *        arrive by semester title. A destination or subject never reaches
 *        1000 here, so the dataset block leads its own kind group.
 */

export type HitKind = "subject" | "gate" | "notice" | "dataset" | "destination";

/** Group order on screen, and the tie-break order in `searchAll`. */
export const KIND_ORDER: readonly HitKind[] = ["subject", "gate", "notice", "dataset", "destination"];

export const KIND_TITLE: Record<HitKind, string> = {
  subject: "Subject",
  gate: "GATE",
  notice: "Notice",
  dataset: "Dataset",
  destination: "Destination",
};

/** The 24 pt chip label. Words, not glyphs: no icon font, no emoji. */
export const KIND_CHIP: Record<HitKind, string> = {
  subject: "SUBJ",
  gate: "GATE",
  notice: "NOTE",
  dataset: "DATA",
  destination: "DEST",
};

/** The heading a kind group wears in the result list. */
export const KIND_PLURAL: Record<HitKind, string> = {
  subject: "Subjects",
  gate: "GATE papers",
  notice: "Notices",
  dataset: "Datasets",
  destination: "Screens",
};

/** The screen shows at most this many hits, whatever the caller asks for. */
export const HIT_LIMIT = 60;

/** Every tier, named, so the screen and the examples cannot drift apart. */
export const SCORE = {
  codeExact: 1000,
  nameExact: 800,
  namePrefix: 500,
  codePrefix: 400,
  wordStart: 300,
  substring: 120,
  subsequence: 40,
} as const;

/* ----------------------------------------------------------------- filter */

/** The chip row's active value: one kind, or everything. */
export type FilterId = "all" | HitKind;

export interface Filter {
  readonly id: FilterId;
  /** The chip. One word at 320 pt. */
  readonly label: string;
  /** The empty state's sentence: "No **notices** for “x”". */
  readonly noun: string;
  /** The same word for a single row: "1 **notice** for “x”". */
  readonly one: string;
}

/**
 * The one-tap filters, in the order they sit on screen. They are the same five
 * kinds as `KIND_ORDER`, so a filter can never disagree with a heading: the
 * chip "Papers" selects exactly the group headed "GATE papers".
 */
const ALL_FILTER: Filter = { id: "all", label: "All", noun: "results", one: "result" };

export const FILTERS: readonly Filter[] = [
  ALL_FILTER,
  { id: "subject", label: "Subjects", noun: "subjects", one: "subject" },
  { id: "gate", label: "Papers", noun: "GATE papers", one: "GATE paper" },
  { id: "notice", label: "Notices", noun: "notices", one: "notice" },
  { id: "dataset", label: "Data", noun: "datasets", one: "dataset" },
  { id: "destination", label: "Screens", noun: "screens", one: "screen" },
];

/** The filter for `id`, with "All" for anything that is not a real one. */
export function filterById(id: string): Filter {
  return FILTERS.find((filter) => filter.id === id) ?? ALL_FILTER;
}

/** A `kind` route param is only believed when it names a real filter. */
export function isFilterId(value: string): value is FilterId {
  return FILTERS.some((filter) => filter.id === value);
}

/** Secondary searchable text: a section name, a category, a full college name. */
export interface Alias {
  /** Lowercase, matched as-is. */
  readonly text: string;
  /** Shown at the end of the muted line when this alias is the reason. */
  readonly via?: string;
}

export interface SearchEntry {
  /** Stable and unique across the index; also the list row key. */
  readonly id: string;
  readonly kind: HitKind;
  readonly title: string;
  /** The muted line, before any "why it matched" suffix. */
  readonly meta: string;
  readonly route: string;
  readonly params: Record<string, string | number>;
  /** Lowercase codes: exact 1000, prefix 400. */
  readonly codes: readonly string[];
  /** Lowercase secondary names: word start 300, substring 120, subsequence 40. */
  readonly aliases: readonly Alias[];
}

export interface Hit {
  readonly id: string;
  readonly kind: HitKind;
  readonly title: string;
  /** Branch + semester, the notice date, the dataset size, or what matched. */
  readonly meta: string;
  readonly route: string;
  readonly params: Record<string, string | number>;
  readonly score: number;
  /** The normalised query, so the row can highlight the span it matched. */
  readonly query: string;
}

export interface SearchResult {
  readonly hits: Hit[];
  /** Milliseconds the scan and its sort took; the screen shows it. */
  readonly took: number;
  /**
   * Matched entries per kind, counted before the cap and before the filter.
   * That is what lets a filtered empty state say "5 results in other kinds".
   */
  readonly counts: Record<HitKind, number>;
}

/** A fresh zero for every kind — never share one object between results. */
export function emptyCounts(): Record<HitKind, number> {
  return { subject: 0, gate: 0, notice: 0, dataset: 0, destination: 0 };
}

/* ------------------------------------------------------------- destination */

/** What the student is trying to do. Browse mode groups by this, never flat. */
export type Intent = "study" | "results" | "daily" | "app";

export const INTENT_ORDER: readonly Intent[] = ["study", "results", "daily", "app"];

export const INTENT_TITLE: Record<Intent, string> = {
  study: "Study",
  results: "Results",
  daily: "Daily",
  app: "App",
};

export interface Destination {
  readonly title: string;
  readonly hint: string;
  readonly route: string;
  readonly params?: Record<string, string | number>;
  /** The browse-mode group. */
  readonly intent: Intent;
}

/**
 * The app's own screens, copied from `src/app/more.tsx` plus the four tab
 * roots. Titles and hints are the ones More already uses, so a student who
 * searched "attendance" and a student who went through More see one name.
 *
 * `intent` is the browse group: what the student is trying to do, not which
 * feature folder owns the screen. Results is split out of More's "Study"
 * because a mark, a rank and a merit list are their own errand.
 */
export const DESTINATIONS: readonly Destination[] = [
  { title: "Home", hint: "Today at a glance", route: "home", intent: "app" },
  { title: "Syllabus", hint: "Subjects, units and topics", route: "syllabus", intent: "study" },
  { title: "Notes & VVI", hint: "Short notes and handwritten PDFs", route: "notes", intent: "study" },
  { title: "Previous year papers", hint: "BEU + GATE, subject by subject", route: "pyqs", intent: "study" },
  { title: "Study planner", hint: "Your syllabus, spread over the days left", route: "planner", intent: "study" },
  { title: "Notices", hint: "Important updates from the university", route: "notices", intent: "study" },
  { title: "Data browser", hint: "Every published dataset, searchable", route: "data", intent: "study" },
  { title: "Results", hint: "Marks, SGPA and CGPA", route: "results", intent: "results" },
  { title: "University rank", hint: "Where you stand, branch and college", route: "results.rank", intent: "results" },
  { title: "Merit list", hint: "Toppers by branch and semester", route: "results.merit", intent: "results" },
  { title: "Result battle", hint: "Compare two results, subject by subject", route: "results.battle", intent: "results" },
  { title: "SGPA / CGPA calculator", hint: "Grades in, percentage out", route: "tools.calculator", intent: "results" },
  { title: "Tools", hint: "Calculator, attendance, routine", route: "tools", intent: "daily" },
  { title: "Attendance", hint: "Bunk math that tells the truth", route: "tools.attendance", intent: "daily" },
  { title: "Routine", hint: "Today, this week, room and teacher", route: "tools.routine", intent: "daily" },
  { title: "Holidays", hint: "The next break, counted down", route: "tools.holidays", intent: "daily" },
  { title: "Wi-Fi help", hint: "Campus portal steps, copied in a tap", route: "tools.wifi", intent: "daily" },
  { title: "Profile", hint: "Registration number, branch, semester", route: "settings.profile", intent: "app" },
  { title: "Settings", hint: "Appearance, storage, reminders", route: "settings", intent: "app" },
  { title: "Send feedback", hint: "Bugs, ideas, anything", route: "feedback", params: { from: "search" }, intent: "app" },
  { title: "About BEUConnect", hint: "Built for BEU students", route: "settings.about", intent: "app" },
];

export interface DestinationGroup {
  readonly intent: Intent;
  readonly items: Destination[];
}

/** Every destination, grouped by intent, in `INTENT_ORDER`; empty groups drop. */
export function browseDestinations(): DestinationGroup[] {
  const groups: DestinationGroup[] = [];
  for (const intent of INTENT_ORDER) {
    const items = DESTINATIONS.filter((item) => item.intent === intent);
    if (items.length > 0) groups.push({ intent, items });
  }
  return groups;
}

/* ---------------------------------------------------------------- builders */

/** One subject offering, already de-duplicated by the caller across branches. */
export interface SubjectInput {
  readonly code: string;
  readonly name: string;
  /** The branch key the row opens: cse | ece | ee | mech | civil | eee. */
  readonly branch: string;
  readonly branchShort: string;
  /** Every branch short name that teaches this paper, in `BRANCH_META` order. */
  readonly branches: readonly string[];
  readonly sem: number;
  /** Unit / section headings from `parseSyllabus`. */
  readonly sections: readonly string[];
}

export interface GateInput {
  readonly code: string;
  readonly name: string;
  /** Section headings from `parseGate`. */
  readonly sections: readonly string[];
  readonly papers: number;
  readonly oldest: number;
  readonly newest: number;
}

export interface NoticeInput {
  readonly id: string;
  readonly title: string;
  /** The row's muted line: a formatted date, or "Undated". */
  readonly dateLabel: string;
  readonly category: string;
  readonly course: string;
  readonly semester: string;
}

export interface DatasetInput {
  /** Stable manifest key: batch|branch|sem|college. */
  readonly id: string;
  readonly batch: string;
  readonly branch: string;
  readonly branchShort: string;
  readonly branchName: string;
  readonly sem: number;
  readonly college: string;
  readonly collegeShort: string;
  readonly collegeName: string;
  /** Published tables in this batch + branch + semester — the dataset's size. */
  readonly cohort: number;
}

export function destinationEntries(): SearchEntry[] {
  return DESTINATIONS.map((item) => ({
    id: `destination:${item.route}`,
    kind: "destination",
    title: item.title,
    meta: item.hint,
    route: item.route,
    params: item.params ?? {},
    codes: [],
    // Typing the route name ("results.rank") is a power move, not a requirement.
    aliases: [{ text: item.route.toLowerCase(), via: item.route }],
  }));
}

export function subjectEntry(input: SubjectInput): SearchEntry {
  const meta = `${input.branches.length > 1 ? `${input.branches.length} branches` : input.branchShort} · Sem ${input.sem}`;
  return {
    id: `subject:${input.branch}:${input.code}`,
    kind: "subject",
    title: input.name,
    meta,
    route: "syllabus.subject",
    params: { code: input.code, branch: input.branch, sem: input.sem },
    codes: [normalise(input.code)],
    aliases: input.sections.map((section) => ({ text: normalise(section), via: section })),
  };
}

export function gateEntry(input: GateInput): SearchEntry {
  const meta =
    input.papers > 0
      ? `${input.papers} paper${input.papers === 1 ? "" : "s"} · ${input.oldest}–${input.newest}`
      : `${input.sections.length} sections`;
  return {
    id: `gate:${input.code}`,
    kind: "gate",
    title: input.name,
    meta,
    route: "pyqs.gate",
    params: { code: input.code },
    codes: [normalise(input.code)],
    aliases: input.sections.map((section) => ({ text: normalise(section), via: section })),
  };
}

export function noticeEntry(input: NoticeInput): SearchEntry {
  const aliases: Alias[] = [];
  for (const text of [input.category, input.course, input.semester]) {
    const clean = text.trim();
    if (clean.length > 1 && clean.toLowerCase() !== "other") aliases.push({ text: normalise(clean), via: clean });
  }
  return {
    id: `notice:${input.id}`,
    kind: "notice",
    title: input.title,
    meta: input.dateLabel,
    route: "notices.detail",
    params: { id: input.id },
    codes: [],
    aliases,
  };
}

export function datasetEntry(input: DatasetInput): SearchEntry {
  const aliases: Alias[] = [
    { text: normalise(input.branchName), via: input.branchShort },
    { text: normalise(input.collegeName) },
  ];
  return {
    id: `dataset:${input.id}`,
    kind: "dataset",
    title: input.collegeShort,
    meta: `Batch ${input.batch} · ${input.branchShort} · Sem ${input.sem} · ${input.cohort} colleges`,
    route: "data.table",
    params: { batch: input.batch, branch: input.branch, sem: input.sem, college: input.college },
    codes: [normalise(input.college), normalise(input.batch), normalise(input.branchShort)],
    aliases,
  };
}

/* ----------------------------------------------------------------- matcher */

function normalise(text: string): string {
  return text.trim().toLowerCase();
}

/** `needle` starts a word of `text` (so "math" starts "mathematics"). */
function startsWord(text: string, needle: string): boolean {
  let at = text.indexOf(needle);
  while (at >= 0) {
    if (at === 0 || !/[a-z0-9]/.test(text.charAt(at - 1))) return true;
    at = text.indexOf(needle, at + 1);
  }
  return false;
}

/** Every character of `needle` appears in `text`, in order. */
function inOrder(needle: string, text: string): boolean {
  if (needle.length > text.length) return false;
  let at = 0;
  for (let index = 0; index < text.length && at < needle.length; index += 1) {
    if (text.charAt(index) === needle.charAt(at)) at += 1;
  }
  return at === needle.length;
}

interface Match {
  score: number;
  alias: Alias | null;
  code: string | null;
}

/**
 * The best tier this entry reaches for `needle`, and what it matched there.
 *
 * `light` is the one-character pass: codes and the start of a word only. A
 * single letter inside a title ("e" in "Digital Electronics") selects most of
 * the index, so it is not a useful hit and not worth the alias scan.
 */
function bestMatch(entry: SearchEntry, needle: string, light: boolean): Match | null {
  let best: Match | null = null;
  const keep = (match: Match): void => {
    // Strictly greater: the title is examined before the aliases, so on a tie
    // the row highlights the title rather than an alias.
    if (best === null || match.score > best.score) best = match;
  };

  for (const code of entry.codes) {
    if (code === needle) {
      keep({ score: SCORE.codeExact, alias: null, code });
    } else if (code.startsWith(needle)) {
      keep({ score: SCORE.codePrefix, alias: null, code });
    }
  }

  const title = normalise(entry.title);
  if (title === needle) {
    keep({ score: SCORE.nameExact, alias: null, code: null });
  } else if (title.startsWith(needle)) {
    keep({ score: SCORE.namePrefix, alias: null, code: null });
  } else if (startsWord(title, needle)) {
    keep({ score: SCORE.wordStart, alias: null, code: null });
  } else if (!light && title.includes(needle)) {
    keep({ score: SCORE.substring, alias: null, code: null });
  } else if (!light && needle.length > 1 && inOrder(needle, title)) {
    keep({ score: SCORE.subsequence, alias: null, code: null });
  }

  if (light) return best;

  for (const alias of entry.aliases) {
    if (alias.text.startsWith(needle) || startsWord(alias.text, needle)) {
      keep({ score: SCORE.wordStart, alias, code: null });
    } else if (alias.text.includes(needle)) {
      keep({ score: SCORE.substring, alias, code: null });
    } else if (needle.length > 1 && inOrder(needle, alias.text)) {
      keep({ score: SCORE.subsequence, alias, code: null });
    }
  }

  return best;
}

/** The muted line, plus the phrase that explains a match outside the title. */
function metaFor(entry: SearchEntry, match: Match, needle: string): string {
  const meta = entry.meta;
  if (match.alias && match.alias.via) {
    const via = match.alias.via;
    if (!meta.toLowerCase().includes(via.toLowerCase())) return `${meta} · ${via}`;
    return meta;
  }
  if (
    match.code &&
    !normalise(entry.title).includes(needle) &&
    !meta.toLowerCase().includes(match.code)
  ) {
    return `${match.code.toUpperCase()} · ${meta}`;
  }
  return meta;
}

function compareHits(left: Hit, right: Hit): number {
  if (left.score !== right.score) return right.score - left.score;
  const kind = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
  if (kind !== 0) return kind;
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

/**
 * Scores every entry against `query` and returns the best `limit` hits (never
 * more than `HIT_LIMIT`) with the milliseconds the pass took.
 *
 * `kind` narrows by filter *before* the cap: with 200 notice matches and the
 * Notices chip on, the student gets 60 notices, not zero because subjects
 * filled the page. `counts` still reports every kind, so the screen can say
 * what the filter left out.
 */
export function searchAll(
  query: string,
  index: readonly SearchEntry[],
  limit = HIT_LIMIT,
  kind: FilterId = "all",
): SearchResult {
  const started = Date.now();
  const needle = normalise(query);
  const counts = emptyCounts();
  if (!needle) return { hits: [], took: 0, counts };

  const cap = Math.max(1, Math.min(Math.trunc(limit) || HIT_LIMIT, HIT_LIMIT));
  // A letter is not a dataset query: those rows are named by college and keyed
  // by batch, so one letter would walk the whole manifest to say nothing.
  const skipDatasets = needle.length === 1 && !/[0-9]/.test(needle);
  const light = needle.length === 1;
  const hits: Hit[] = [];

  for (const entry of index) {
    if (skipDatasets && entry.kind === "dataset") continue;
    const match = bestMatch(entry, needle, light);
    if (match === null) continue;
    counts[entry.kind] += 1;
    if (kind !== "all" && entry.kind !== kind) continue;
    hits.push({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      meta: metaFor(entry, match, needle),
      route: entry.route,
      params: entry.params,
      score: match.score,
      query: needle,
    });
  }
  hits.sort(compareHits);
  return { hits: hits.slice(0, cap), took: Math.max(0, Date.now() - started), counts };
}
