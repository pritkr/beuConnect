/**
 * Offline data — one screen that answers "what works on a train?".
 *
 * It is a ledger, not a toggle: two rows are bundled and can never be cleared
 * (removing them means a new build), four are downloads with a size, a count
 * and a clear action. The hero card is the only place that spends data, and it
 * names the course it will download for.
 */

import { Text, View, signal } from "nsh";

import type { RouteDef } from "../../app/router";
import { formatBytes } from "../../lib/bytes";
import { relativeTime } from "../../lib/net";
import { Badge, Body, Btn, ErrorState, Label, Loading, Muted, Progress, Screen, SectionHeader } from "../../ui";
import { branchShort, isProfileComplete, useProfile } from "../settings/profile";
import { ClearAction, ScreenIntro, SettingsGroup, SettingsRow, confirmDestructive } from "../settings/ui";
import { feedStatus, syncDataFeed } from "../data-feed/store";
import {
  PACKS,
  clearPack,
  courseLabel,
  coursePlan,
  downloadCourse,
  readOfflineReport,
  warmProgress,
  type OfflineReport,
  type Pack,
} from "./packs";

function whenLine(at: number): string {
  return at > 0 ? `updated ${relativeTime(at)}` : "";
}

export function OfflineScreen() {
  const report = signal<OfflineReport | null>(null);
  const error = signal<string | null>(null);
  const flash = signal("");
  const feed = signal(feedStatus());
  const checking = signal(false);
  const feedNote = signal("");
  const profile = useProfile();
  let started = false;

  const checkFeed = (force: boolean): void => {
    if (checking()) return;
    checking.set(true);
    feedNote.set("");
    void syncDataFeed(force)
      .then((result) => {
        checking.set(false);
        feed.set(feedStatus());
        feedNote.set(
          result.outcome === "updated"
            ? `Updated · ${formatBytes(result.bytes)}`
            : result.outcome === "offline"
              ? "Could not reach the server"
              : "Already up to date",
        );
      })
      .catch(() => {
        checking.set(false);
        feedNote.set("Could not reach the server");
      });
  };

  const scan = (): void => {
    void readOfflineReport()
      .then((value) => {
        report.set(value);
        error.set(null);
      })
      .catch(() => {
        error.set("This phone's storage could not be read. Try again in a moment.");
      });
  };

  if (!started) {
    started = true;
    scan();
    void syncDataFeed(false).then(() => feed.set(feedStatus()));
  }

  const rowOf = (pack: Pack) => report()?.packs.find((entry) => entry.pack.id === pack.id) ?? null;

  const download = (): void => {
    flash.set("");
    void downloadCourse().then((result) => {
      if (result.papers > 0) flash.set(`${result.papers} paper sets ready offline`);
      scan();
    });
  };

  const clear = (pack: Pack): void => {
    if (pack.bundled) return;
    void (async () => {
      const row = rowOf(pack);
      if (!row || row.keys === 0) return;
      const confirmed = await confirmDestructive(
        pack.dialog,
        `This removes ${row.keys} saved ${row.keys === 1 ? "item" : "items"} (${formatBytes(row.bytes)}). ${pack.effect}`,
        pack.confirm,
      );
      if (!confirmed) return;
      const gone = await clearPack(pack);
      flash.set(`Removed ${gone.removed} ${gone.removed === 1 ? "item" : "items"} · ${formatBytes(gone.bytes)} freed`);
      scan();
    })();
  };

  const used = (): number => report()?.bytes ?? 0;
  const budget = (): number => report()?.budget ?? 1;
  const running = (): boolean => warmProgress().running;
  const canDownload = (): boolean => isProfileComplete(profile()) && !running();
  const plan = (): string[] => coursePlan(profile());

  const downloadLabel = (): string => {
    const progress = warmProgress();
    if (progress.running) {
      return progress.total > 0 ? `Downloading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : "Downloading…";
    }
    if (profile().branch && profile().sem > 0) return `Download ${branchShort(profile().branch)} · Sem ${profile().sem}`;
    return "Download my course";
  };

  return (
    <Screen>
      <Body>
        <ScreenIntro label="On this phone" title="Offline data" />

        {error() ? <ErrorState title="Storage unavailable" message={error() ?? undefined} onRetry={scan} /> : null}

        {report() === null ? (
          error() ? null : <Loading label="Measuring offline data" />
        ) : (
          <View class="gap-4">
            <View class="gap-3 rounded-3xl border border-border bg-card p-4">
              <View class="flex-row items-end justify-between gap-3">
                <View class="flex-1 gap-0.5">
                  <Label>Ready without a network</Label>
                  <View class="flex-row items-end gap-2">
                    <Text class="text-[30px] font-bold tabular-nums tracking-tight text-foreground">
                      {formatBytes(used())}
                    </Text>
                    <Muted class="pb-1.5">of {formatBytes(budget())}</Muted>
                  </View>
                </View>
                <Badge tone={report()!.warmedAt > 0 ? "mint" : "neutral"}>
                  {report()!.warmedAt > 0 ? whenLine(report()!.warmedAt) : "Not updated yet"}
                </Badge>
              </View>
              <Progress value={(used() / budget()) * 100} tone={used() / budget() > 0.85 ? "amber" : "ember"} />
              <Muted>
                {report()!.papers} paper {report()!.papers === 1 ? "set" : "sets"} readable offline, on top of every
                syllabus and paper link bundled with the app.
              </Muted>
            </View>

            <View class="gap-3 rounded-3xl border border-border bg-card p-4">
              <View class="flex-row items-start gap-3">
                <View class="flex-1 gap-0.5">
                  <Text class="text-[15px] font-semibold text-foreground">Syllabus, GATE &amp; PYQs</Text>
                  <Muted>
                    {feed().live ? "Live data" : "Bundled data"}
                    {feed().checkedAt > 0 ? ` · checked ${relativeTime(feed().checkedAt)}` : ""}
                  </Muted>
                </View>
                <Badge tone={feed().live ? "mint" : "neutral"}>{feed().snapshot}</Badge>
              </View>
              <Btn onPress={() => checkFeed(true)} disabled={checking()} label={checking() ? "Checking" : "Check for updates"}>
                {checking() ? "Checking…" : "Check for updates"}
              </Btn>
              {feedNote() ? <Text class="px-1 text-[12px] font-semibold text-accent">{feedNote()}</Text> : null}
            </View>

            <View class="gap-3 rounded-3xl border border-border bg-card p-4">
              <View class="flex-1 gap-0.5">
                <Text class="text-[15px] font-semibold text-foreground">Your course papers</Text>
                <Muted>
                  {plan().length === 0
                    ? "Set your branch and semester in Profile."
                    : `${plan().length} subject ${plan().length === 1 ? "page" : "pages"} for ${courseLabel(profile())} · mobile data`}
                </Muted>
              </View>
              <Btn onPress={download} disabled={!canDownload()} label={downloadLabel()}>
                {downloadLabel()}
              </Btn>
              {running() ? (
                <Progress
                  value={warmProgress().total === 0 ? 0 : (warmProgress().done / warmProgress().total) * 100}
                  tone="ember"
                  label="Downloading your course"
                />
              ) : null}
              {warmProgress().error ? (
                <Text class="px-1 text-[12px] text-destructive">{warmProgress().error}</Text>
              ) : null}
              {flash() ? <Text class="px-1 text-[12px] font-semibold text-accent">{flash()}</Text> : null}
            </View>

            <SectionHeader title="Bundled with the app" />
            <SettingsGroup>
              {PACKS.filter((pack) => pack.bundled).map((pack, index, list) => (
                <SettingsRow
                  title={pack.title}
                  hint={pack.hint}
                  value={rowOf(pack)?.detail ?? ""}
                  last={index === list.length - 1}
                />
              ))}
            </SettingsGroup>
            <Muted class="px-1">
              Installed with the app: {report()!.subjects} subjects, {report()!.gatePapers} GATE papers linked and{" "}
              {report()!.papersTotal} BEU paper sets listed. Never expires, never needs data.
            </Muted>

            <SectionHeader title="Downloaded on this phone" />
            <View class="gap-2">
              {PACKS.filter((pack) => !pack.bundled).map((pack) => {
                const row = rowOf(pack);
                return (
                  <View class="gap-2 rounded-3xl border border-border bg-card p-4">
                    <View class="flex-row items-start gap-3">
                      <View class="flex-1 gap-0.5">
                        <Text class="text-[15px] font-semibold text-foreground">{pack.title}</Text>
                        <Text class="text-[12px] leading-4 text-muted-foreground">{pack.hint}</Text>
                      </View>
                      <ClearAction
                        onPress={() => clear(pack)}
                        disabled={(row?.keys ?? 0) === 0}
                        label={`Clear ${pack.title}`}
                      />
                    </View>
                    <Muted class="tabular-nums">
                      {[row?.detail ?? "Not downloaded", row ? whenLine(row.at) : ""].filter(Boolean).join(" · ")}
                    </Muted>
                  </View>
                );
              })}
            </View>

            <Muted class="px-1">
              Downloads are kept on this phone and replaced as the site changes. Clearing a group only removes the
              items named in its confirmation.
            </Muted>
          </View>
        )}
      </Body>
    </Screen>
  );
}

export const offlineRoutes: RouteDef[] = [
  { name: "settings.offline", title: () => "Offline data", render: () => <OfflineScreen /> },
];
