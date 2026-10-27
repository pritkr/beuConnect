/**
 * Storage — a real breakdown of what the app keeps on this phone.
 *
 * Every number comes from `Storage`: keys and values are read once, measured as
 * UTF-8 bytes, and grouped by what they belong to. Clearing is always a two-step
 * action: the group shows its key count and size first, the native dialog
 * repeats exactly what will be removed and what the consequence is, and only
 * then are those keys deleted. The confirmation afterwards names the count and
 * the bytes freed.
 *
 * The groups cover the whole store: the four named groups, other downloaded
 * caches, and a "kept" remainder (profile, appearance, reminders, attendance,
 * calculator, bookmarks, recents) that is never cleared from here. Their sizes
 * add up to the total at the top.
 */

import { Text, View, signal, Storage } from "nsh";

import { Body, ErrorState, Label, Loading, Muted, Progress, Screen, SectionHeader } from "../../ui";
import { STORAGE_LIMIT } from "../../lib/cache";
import { clearDataFeed } from "../data-feed/store";
import { ClearAction, ScreenIntro, SettingsGroup, SettingsRow, confirmDestructive, formatBytes, utf8Bytes } from "./ui";

type GroupId = "tables" | "saved" | "papers" | "live" | "syllabus" | "notices" | "other";

interface Group {
  id: GroupId;
  title: string;
  hint: string;
  /** What the student loses / gets back; used inside the dialog. */
  effect: string;
  dialog: string;
  confirm: string;
  noun: string;
  plural: string;
  match: (key: string) => boolean;
  /** Runs once the keys are gone, for state the keys alone do not reset. */
  after?: () => Promise<void>;
}

/** Order matters: the first matcher wins, so "other" only sees leftovers. */
const GROUPS: readonly Group[] = [
  {
    id: "tables",
    title: "Result tables",
    hint: "Rosters and wide tables downloaded for rank, merit and result tables.",
    effect: "Rank, merit and table screens download them again when you next open them.",
    dialog: "Clear downloaded tables?",
    confirm: "Clear tables",
    noun: "table",
    plural: "tables",
    match: (key) => key.startsWith("beu.cache.wide:") || key.startsWith("beu.cache.roster:"),
  },
  {
    id: "saved",
    title: "Saved results",
    hint: "One offline copy of each result you have opened.",
    effect: "A result can still be fetched from BEU while online; the offline copies are gone.",
    dialog: "Delete saved result copies?",
    confirm: "Delete copies",
    noun: "saved result",
    plural: "saved results",
    match: (key) => key.startsWith("beu.cache.result:"),
  },
  {
    id: "syllabus",
    title: "Syllabus read state",
    hint: "The topics you have ticked off while studying.",
    effect: "Bookmarked topics and your chosen branch and semester are kept.",
    dialog: "Reset syllabus read marks?",
    confirm: "Reset marks",
    noun: "read mark",
    plural: "read marks",
    match: (key) => key === "beu.syllabus.studied",
  },
  {
    id: "notices",
    title: "Notices read state",
    hint: "Which notices you have already opened.",
    effect: "Every notice shows its unread dot again.",
    dialog: "Mark every notice unread?",
    confirm: "Reset read state",
    noun: "read entry",
    plural: "read entries",
    match: (key) => key === "beu.notices.read.v1",
  },
  {
    id: "papers",
    title: "PYQ papers",
    hint: "Structured questions for every paper you have opened or downloaded.",
    effect: "A paper opens from the site again the next time you need it; the PDFs stay linked.",
    dialog: "Delete offline papers?",
    confirm: "Delete papers",
    noun: "subject",
    plural: "subjects",
    match: (key) => key.startsWith("beu.cache.pyqs.papers.v1."),
  },
  {
    id: "live",
    title: "Live syllabus & catalog updates",
    hint: "Syllabus corrections and paper links fetched after this build was installed.",
    effect: "The app goes back to the syllabus and catalog built into this version until it checks again.",
    dialog: "Revert to bundled data?",
    confirm: "Revert",
    noun: "entry",
    plural: "entries",
    match: (key) => key.startsWith("beu.feed."),
    after: clearDataFeed,
  },
  {
    id: "other",
    title: "Other downloads",
    hint: "Bulletin pages, the notes list and the Home ticker cache.",
    effect: "They download again the next time you open those screens.",
    dialog: "Clear other downloads?",
    confirm: "Clear downloads",
    noun: "cached page",
    plural: "cached pages",
    match: (key) => key.startsWith("beu.cache."),
  },
];

const CAPACITY = STORAGE_LIMIT;

interface Entry {
  key: string;
  bytes: number;
}

interface Snapshot {
  entries: Entry[];
  bytes: number;
  keys: number;
}

interface Flash {
  id: GroupId;
  text: string;
}

function groupOf(key: string): GroupId | "kept" {
  for (const group of GROUPS) {
    if (group.match(key)) return group.id;
  }
  return "kept";
}

async function scan(): Promise<Snapshot> {
  const keys = await Storage.keys();
  const entries: Entry[] = [];
  for (const key of keys) {
    try {
      const value = await Storage.getItem(key);
      if (value === null) continue;
      entries.push({ key, bytes: utf8Bytes(key) + utf8Bytes(value) });
    } catch {
      /* unreadable keys are not worth failing the whole screen for */
    }
  }
  const bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  return { entries, bytes, keys: entries.length };
}

function countOf(snapshot: Snapshot | null, id: GroupId | "kept"): { keys: number; bytes: number } {
  if (!snapshot) return { keys: 0, bytes: 0 };
  let keys = 0;
  let bytes = 0;
  for (const entry of snapshot.entries) {
    if (groupOf(entry.key) !== id) continue;
    keys += 1;
    bytes += entry.bytes;
  }
  return { keys, bytes };
}

function countLabel(count: number, group: Group): string {
  return `${count} ${count === 1 ? group.noun : group.plural}`;
}

export function StorageScreen() {
  const snapshot = signal<Snapshot | null>(null);
  const error = signal<string | null>(null);
  const flash = signal<Flash | null>(null);
  let started = false;

  const refresh = (): void => {
    void scan()
      .then((value) => {
        snapshot.set(value);
        error.set(null);
      })
      .catch(() => {
        error.set("This phone's storage could not be read. Try again in a moment.");
      });
  };

  if (!started) {
    started = true;
    refresh();
  }

  const clear = (group: Group): void => {
    void (async () => {
      const current = snapshot();
      if (!current) return;
      const victims = current.entries.filter((entry) => groupOf(entry.key) === group.id);
      const bytes = victims.reduce((total, entry) => total + entry.bytes, 0);
      if (victims.length === 0) return;
      const confirmed = await confirmDestructive(
        group.dialog,
        `This removes ${countLabel(victims.length, group)} (${formatBytes(bytes)}). ${group.effect}`,
        group.confirm,
      );
      if (!confirmed) return;
      for (const entry of victims) {
        try {
          await Storage.removeItem(entry.key);
        } catch {
          /* keep going: report what was actually removed by re-measuring */
        }
      }
      if (group.after) {
        try {
          await group.after();
        } catch {
          /* the keys are gone either way; the next launch hydrates from storage */
        }
      }
      flash.set({ id: group.id, text: `Removed ${countLabel(victims.length, group)} · ${formatBytes(bytes)} freed` });
      refresh();
    })();
  };

  const total = (): number => snapshot()?.bytes ?? 0;
  const kept = (): { keys: number; bytes: number } => countOf(snapshot(), "kept");

  return (
    <Screen>
      <Body>
        <ScreenIntro
          label="On this phone"
          title="Storage"
        />

        {error() ? (
          <ErrorState title="Storage unavailable" message={error() ?? undefined} onRetry={refresh} />
        ) : snapshot() === null ? (
          <Loading label="Measuring stored data" />
        ) : (
          <View class="gap-4">
            <View class="gap-2 rounded-3xl border border-border bg-card p-4">
              <Label>Stored by the app</Label>
              <View class="flex-row items-end gap-2">
                <Text class="text-[30px] font-bold tabular-nums tracking-tight text-foreground">{formatBytes(total())}</Text>
                <Muted class="pb-1.5">
                  {snapshot()?.keys ?? 0} {(snapshot()?.keys ?? 0) === 1 ? "key" : "keys"}
                </Muted>
              </View>
              <Progress
                value={(total() / CAPACITY) * 100}
                tone={total() / CAPACITY > 0.8 ? "amber" : "ember"}
              />
              <Muted>{formatBytes(total())} of 5 MB. The 5 MB cap is the runtime's storage limit.</Muted>
            </View>

            <SectionHeader title="What you can clear" />

            {GROUPS.map((group) => {
              const size = countOf(snapshot(), group.id);
              const removed = flash()?.id === group.id ? flash() : null;
              return (
                <View class="gap-2 rounded-3xl border border-border bg-card p-4">
                  <View class="flex-row items-start gap-3">
                    <View class="flex-1 gap-0.5">
                      <Text class="text-[15px] font-semibold text-foreground">{group.title}</Text>
                      <Text class="text-[12px] leading-4 text-muted-foreground">{group.hint}</Text>
                    </View>
                    <ClearAction
                      onPress={() => clear(group)}
                      disabled={size.keys === 0}
                      label={`Clear ${group.title}`}
                    />
                  </View>
                  <View class="flex-row items-center justify-between gap-2">
                    <Muted class="tabular-nums">
                      {size.keys === 0
                        ? "Nothing stored"
                        : `${size.keys} ${size.keys === 1 ? "key" : "keys"} · ${formatBytes(size.bytes)}`}
                    </Muted>
                    {removed ? <Text class="text-[11px] font-semibold text-accent">{removed.text}</Text> : null}
                  </View>
                </View>
              );
            })}

            <SectionHeader title="Kept" />
            <SettingsGroup>
              <SettingsRow
                title="Profile and saved work"
                value={snapshot() ? `${kept().keys} keys · ${formatBytes(kept().bytes)}` : ""}
                last
              />
            </SettingsGroup>

            <Muted class="px-1">
              Clearing a group only removes the keys named in its confirmation. Your profile, settings and the work you
              typed are never touched by this screen.
            </Muted>
          </View>
        )}
      </Body>
    </Screen>
  );
}
