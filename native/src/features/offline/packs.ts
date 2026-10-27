/**
 * Offline data — what the app can show with no network, and how it gets there.
 *
 * Three tiers, cheapest first:
 *
 *   1. **Bundled** — the syllabus, the GATE syllabus and the PYQ catalog ship
 *      inside the binary. They are offline from the second the app is installed,
 *      cost no storage and need no download. This is where a student's course,
 *      every subject code and every paper *link* already lives.
 *   2. **Downloaded once** — a paper's questions, the notice board, the notes
 *      manifest and result tables are written to the device cache the first time
 *      they are seen, and served from there forever after (see
 *      `src/lib/cache.ts`).
 *   3. **On request** — "Download my course" pulls the papers for the student's
 *      own branch and semester in one pass, so every PYQ in that semester opens
 *      on a train with no signal.
 *
 * The silent warm-up that runs on launch only touches tier 2's small feeds
 * (notices, notes manifest, dataset index). Papers are never downloaded behind
 * a student's back on mobile data: they are fetched when a paper is opened, or
 * when the student taps the button that says exactly that.
 */

import { signal } from "nsh";

import { CACHE_BUDGET, clearCacheWhere, listEntries, type CacheRow } from "../../lib/cache";
import { formatBytes } from "../../lib/bytes";
import { readStore, writeStore } from "../../lib/net";
import { allSubjects, subjectsOf, totalPapers } from "../pyqs/catalog";
import { cachedPapers, loadDatasets, prefetchSubject, readPapers } from "../pyqs/api";
import { gateTotalPapers } from "../pyqs/gate-index";
import { GATE_META } from "../syllabus/data/packs";
import { loadNotices, loadAnnouncements } from "../notices/api";
import { loadNotes } from "../notes/data";
import { isProfileComplete, useProfile, type Profile } from "../settings/profile";

/* -------------------------------------------------------------------- packs */

export type PackId = "syllabus" | "gate" | "pyq" | "notes" | "notices" | "tables";

export interface Pack {
  id: PackId;
  title: string;
  hint: string;
  /** True when the data ships inside the app and costs no download. */
  bundled: boolean;
  /** The cache rows this pack owns; bundled packs own none. */
  match: (key: string) => boolean;
  /** What clearing the pack costs, said plainly. */
  effect: string;
  dialog: string;
  confirm: string;
}

const NEVER: (key: string) => boolean = () => false;

/**
 * The packs, in the order the screen shows them. The matchers are the single
 * source of truth: the Offline screen, the Storage screen and the clearing
 * action all read them, so a key can never belong to two packs.
 */
export const PACKS: readonly Pack[] = [
  {
    id: "syllabus",
    title: "BEU syllabus",
    hint: "Every subject, unit and topic for all six branches.",
    bundled: true,
    match: NEVER,
    effect: "",
    dialog: "",
    confirm: "",
  },
  {
    id: "gate",
    title: "GATE syllabus & papers",
    hint: "Branch-wise syllabus and the PDF link for every past paper.",
    bundled: true,
    match: NEVER,
    effect: "",
    dialog: "",
    confirm: "",
  },
  {
    id: "pyq",
    title: "BEU PYQ papers",
    hint: "Questions from the papers you have opened, or downloaded for your course.",
    bundled: false,
    match: (key) => key.startsWith("pyqs.papers.v1."),
    effect: "Papers you have not opened since come back from the site when you next open them.",
    dialog: "Delete offline papers?",
    confirm: "Delete papers",
  },
  {
    id: "notes",
    title: "Notes & VVI",
    hint: "The notes manifest: what exists for your semester, and where.",
    bundled: false,
    match: (key) => key.startsWith("notes."),
    effect: "The list of notes downloads again the next time you open Notes.",
    dialog: "Clear the notes list?",
    confirm: "Clear notes",
  },
  {
    id: "notices",
    title: "Notices & announcements",
    hint: "The notice board and announcements, as they were when last fetched.",
    bundled: false,
    match: (key) => key.startsWith("notices.") || key.startsWith("announcement"),
    effect: "The board shows an error until it downloads again. Read marks are kept.",
    dialog: "Clear the notice board?",
    confirm: "Clear notices",
  },
  {
    id: "tables",
    title: "Result tables",
    hint: "Rosters and wide tables downloaded for rank, merit and result tables.",
    bundled: false,
    match: (key) =>
      key.startsWith("pyqs.csv.") ||
      key === "pyqs.manifest.v1" ||
      key.startsWith("wide:") ||
      key.startsWith("roster:"),
    effect: "Rank, merit and table screens download them again when you next open them.",
    dialog: "Clear downloaded tables?",
    confirm: "Clear tables",
  },
];

export function packById(id: PackId): Pack | undefined {
  return PACKS.find((pack) => pack.id === id);
}

/** The pack that owns a cache key, or null for a key no pack claims. */
export function packOf(key: string): Pack | null {
  for (const pack of PACKS) {
    if (pack.match(key)) return pack;
  }
  return null;
}

export interface PackReport {
  pack: Pack;
  /** Cache rows on the device. Always 0 for a bundled pack. */
  keys: number;
  bytes: number;
  /** When the newest row was written, 0 when there is none. */
  at: number;
  /** The right-hand line: a count for bundled data, size for downloads. */
  detail: string;
}

function sizeLine(keys: number, bytes: number, noun: string): string {
  if (keys === 0) return "Not downloaded";
  return `${keys} ${noun}${keys === 1 ? "" : "s"} · ${formatBytes(bytes)}`;
}

/** What one pack holds, measured against the rows already scanned. */
export function reportOf(pack: Pack, rows: readonly CacheRow[], facts: Facts): PackReport {
  const mine = rows.filter((row) => pack.match(row.key));
  const bytes = mine.reduce((total, row) => total + row.bytes, 0);
  const at = mine.reduce((newest, row) => (row.at > newest ? row.at : newest), 0);
  if (pack.id === "syllabus") {
    return { pack, keys: 0, bytes: 0, at: 0, detail: `${facts.subjects} subjects · bundled` };
  }
  if (pack.id === "gate") {
    return { pack, keys: 0, bytes: 0, at: 0, detail: `${facts.gateBranches} branches · bundled` };
  }
  if (pack.id === "pyq") {
    const detail =
      facts.papers === 0
        ? `None of ${facts.papersTotal} paper sets`
        : `${facts.papers} of ${facts.papersTotal} paper sets · ${formatBytes(bytes)}`;
    return { pack, keys: mine.length, bytes, at, detail };
  }
  return { pack, keys: mine.length, bytes, at, detail: sizeLine(mine.length, bytes, "item") };
}

/* ------------------------------------------------------------------ report */

/** Counts that come from the bundled snapshot rather than the device. */
export interface Facts {
  subjects: number;
  papersTotal: number;
  papers: number;
  gateBranches: number;
  gatePapers: number;
}

export interface OfflineReport extends Facts {
  packs: PackReport[];
  /** Bytes the download cache holds. */
  bytes: number;
  /** The most the cache may hold (see `CACHE_BUDGET`). */
  budget: number;
  /** When the silent warm-up last ran, 0 when it never has. */
  warmedAt: number;
}

/** Reads the device and returns everything the Offline screen shows. */
export async function readOfflineReport(): Promise<OfflineReport> {
  const [rows, papers, warmedAt] = await Promise.all([
    listEntries(),
    cachedPapers(),
    readStore<number>("offline.warmed.v1", 0),
  ]);
  const facts: Facts = {
    subjects: allSubjects().length,
    papersTotal: totalPapers(),
    papers: papers.reduce((total, row) => total + row.papers, 0),
    gateBranches: GATE_META.length,
    gatePapers: gateTotalPapers(),
  };
  const bytes = rows.reduce((total, row) => total + row.bytes, 0);
  return {
    packs: PACKS.map((pack) => reportOf(pack, rows, facts)),
    bytes,
    budget: CACHE_BUDGET,
    warmedAt: typeof warmedAt === "number" ? warmedAt : 0,
    ...facts,
  };
}

/** Clears one downloaded pack. Returns what actually went. */
export async function clearPack(pack: Pack): Promise<{ removed: number; bytes: number }> {
  if (pack.bundled) return { removed: 0, bytes: 0 };
  return clearCacheWhere(pack.match);
}

/* -------------------------------------------------------------------- warm */

export interface WarmProgress {
  running: boolean;
  /** Subject pages already handled in this run. */
  done: number;
  total: number;
  /** The subject being fetched, for the button's label. */
  label: string;
  /** Papers cached by the last finished run. */
  papers: number;
  /** Epoch ms of the last finished run, 0 before the first. */
  finishedAt: number;
  error: string;
}

export const EMPTY_PROGRESS: WarmProgress = {
  running: false,
  done: 0,
  total: 0,
  label: "",
  papers: 0,
  finishedAt: 0,
  error: "",
};

export const warmProgress = signal<WarmProgress>(EMPTY_PROGRESS);

/** How stale a cached subject may be before "download" fetches it again. */
const REFRESH_AFTER = 30 * 24 * 60 * 60 * 1000;

/** A page costs ~390 KB of transfer; a semester has ~20. */
export function coursePlan(profile: Profile): string[] {
  if (!isProfileComplete(profile) || profile.branch === "" || profile.sem < 1) return [];
  const slugs = subjectsOf(profile.branch, profile.sem)
    .filter((subject) => subject.papers.length > 0)
    .map((subject) => subject.slug);
  // A paper can hang off two rows (a common first-year subject appears under
  // several branches); the slug is what the page is keyed by.
  return [...new Set(slugs)].sort();
}

export interface DownloadResult {
  /** Subject pages fetched. */
  pages: number;
  /** Papers now readable offline. */
  papers: number;
  /** Subjects skipped because a fresh copy was already on the device. */
  skipped: number;
  failed: number;
}

/**
 * Downloads the papers for the student's branch and semester.
 *
 * Sequential on purpose: one page at a time keeps the progress line honest and
 * never trips a rate limit on the site. A subject that fails is counted, not
 * fatal — the rest still download.
 */
export async function downloadCourse(options: { force?: boolean } = {}): Promise<DownloadResult> {
  const profile = useProfile()();
  const plan = coursePlan(profile);
  const result: DownloadResult = { pages: 0, papers: 0, skipped: 0, failed: 0 };
  if (plan.length === 0) {
    warmProgress.set({
      ...EMPTY_PROGRESS,
      error: "Pick your branch and semester in Settings to download your course.",
    });
    return result;
  }
  if (warmProgress().running) return result;

  warmProgress.set({ ...EMPTY_PROGRESS, running: true, total: plan.length });
  for (const slug of plan) {
    const progress = warmProgress();
    try {
      if (!options.force) {
        const existing = await readPapers(slug);
        const count = existing ? Object.keys(existing.papers).length : 0;
        if (count > 0 && existing !== null && Date.now() - existing.at < REFRESH_AFTER) {
          result.skipped += 1;
          result.papers += count;
          warmProgress.set({ ...progress, done: progress.done + 1, label: "" });
          continue;
        }
      }
      warmProgress.set({ ...progress, label: slug });
      const papers = await prefetchSubject(slug);
      if (papers > 0) {
        result.pages += 1;
        result.papers += papers;
      } else {
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
    }
    const next = warmProgress();
    warmProgress.set({ ...next, done: next.done + 1, label: "", papers: result.papers });
  }

  warmProgress.set({
    running: false,
    done: plan.length,
    total: plan.length,
    label: "",
    papers: result.papers,
    finishedAt: Date.now(),
    error: result.pages === 0 && result.skipped === 0 ? "The site could not be reached. Try again on Wi-Fi." : "",
  });
  return result;
}

/** "CSE · Semester 3", for the download button. */
export function courseLabel(profile: Profile): string {
  const branch = profile.branch.toUpperCase();
  return branch && profile.sem > 0 ? `${branch} · Semester ${profile.sem}` : "your course";
}

/* ------------------------------------------------------------------ launch */

const WARM_KEY = "offline.warmed.v1";
/**
 * How often the launch warm-up may run. Short on purpose: the board and feed
 * are published on the site, so a correction reaches every installed app
 * without a store release — the worst case is half an hour without a relaunch.
 */
const WARM_AFTER = 30 * 60 * 1000;
/** Give the first screen time to paint and settle before touching the network. */
const WARM_DELAY = 4000;

let warming = false;

/**
 * Fetches the small feeds that make Home, Notices and Notes open offline.
 * Runs at most every half hour, only for a student who has set up their course,
 * and never delays a launch.
 */
export async function warmSmallFeeds(): Promise<void> {
  if (warming) return;
  warming = true;
  try {
    await Promise.allSettled([
      loadNotices(),
      loadAnnouncements(),
      loadNotes(),
      loadDatasets(),
      // Rows from the old page cache (1.x kept ~390 KB of markup per subject).
      // Papers are parsed now, so those copies are dead weight on the budget.
      clearCacheWhere((key) => key.startsWith("pyqs.page.")),
    ]);
    await writeStore(WARM_KEY, Date.now());
  } finally {
    warming = false;
  }
}

/** Called once by the shell. Safe to call from any mount: it self-guards. */
export function startOfflineWarmup(now = Date.now()): void {
  void (async () => {
    const profile = useProfile()();
    if (!isProfileComplete(profile)) return;
    const last = await readStore<number>(WARM_KEY, 0);
    if (typeof last === "number" && last > 0 && now - last < WARM_AFTER) return;
    await new Promise<void>((resolve) => setTimeout(resolve, WARM_DELAY));
    await warmSmallFeeds();
  })().catch(() => {
    /* a warm-up that fails must never show up as a launch failure */
  });
}
