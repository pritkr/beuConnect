/**
 * The two rows every app without a store needs: hand the app to a classmate,
 * and take the next build.
 *
 * Sharing is a link, not a file. An APK in a WhatsApp chat is a dead copy —
 * nobody can update it, and some WhatsApp builds refuse `.apk` documents
 * outright. The link points at `releases/latest/download/BEUConnect.apk`, so
 * the person who opens it next term still gets the current build.
 *
 * Updating is honest about what it knows: `Up to date`, `vX.Y.Z`, or
 * `Not checked` — never a version this phone has not actually seen.
 */

import { Clipboard, Text, View, announce, signal } from "nsh";
import { Badge, Btn, Label, Panel, Row } from "../../ui";
import { openExternal } from "../../lib/link";
import { APP_VERSION } from "../../lib/app-info";
import {
  availableVersion,
  checkForUpdates,
  checking,
  lastCheckAt,
  latestRelease,
  shareMessage,
  updateUrl,
  whatsappShareUrl,
} from "../../lib/release";
import { SettingsRow } from "./ui";

/* ------------------------------------------------------------------- share */

/** `Copied` or `""` — what the row says after a press it could not hand off. */
const shareNote = signal("");

/** Opens WhatsApp with the download link, and falls back to the clipboard. */
export function shareApp(): void {
  shareNote.set("");
  void openExternal(whatsappShareUrl()).then((opened) => {
    if (opened) return;
    void Clipboard.writeText(shareMessage()).then(() => {
      shareNote.set("Copied");
      announce("Download link copied");
      setTimeout(() => shareNote.set(""), 2200);
    });
  });
}

export function ShareAppRow(props: { last?: boolean }) {
  return (
    <View>
      {() => (
        <SettingsRow
          title="Share BEUConnect"
          hint="Sends the download link on WhatsApp"
          value={shareNote() !== "" ? shareNote() : "Share"}
          onPress={shareApp}
          last={props.last}
        />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ update */

/** Runs the check and, when there is something to install, opens it. */
export function checkThenOpen(): void {
  void checkForUpdates(true).then((release) => {
    if (availableVersion(release) !== "") void openExternal(updateUrl(release));
  });
}

/** `v1.1.1`, `Checking…`, `Up to date`, `Could not check` or `Not checked`. */
export function updateState(): string {
  if (checking()) return "Checking…";
  const next = availableVersion();
  if (next !== "") return `v${next}`;
  if (latestRelease() !== null) return "Up to date";
  return lastCheckAt() === 0 ? "Not checked" : "Could not check";
}

export function UpdateRow(props: { last?: boolean }) {
  return (
    <View>
      {() => {
        const next = availableVersion();
        return (
          <SettingsRow
            title={next !== "" ? "Install the update" : "Check for updates"}
            hint={next !== "" ? "A newer build is on GitHub" : `You are on v${APP_VERSION}`}
            value={updateState()}
            onPress={checkThenOpen}
            last={props.last}
          />
        );
      }}
    </View>
  );
}

/**
 * The update card, only when there is an update: version, the notes the release
 * carries, and one button that downloads it.
 */
export function UpdatePanel() {
  return (
    <View>
      {() => {
        const release = latestRelease();
        const next = availableVersion(release);
        if (release === null || next === "") return null;
        return (
          <Panel tone="ember" class="gap-3">
            <Row class="justify-between gap-2">
              <Label>Update available</Label>
              <Badge tone="ember">{`v${release.version}`}</Badge>
            </Row>
            <View class="gap-1">
              <Text class="text-[16px] font-semibold leading-5 text-foreground">
                {`BEUConnect ${release.version} is out`}
              </Text>
              <Text class="text-[12px] leading-4 text-muted-foreground">
                {`You are on v${APP_VERSION}. It installs over this one; your data stays.`}
              </Text>
            </View>
            {release.notes !== "" ? (
              <View class="gap-1 rounded-2xl bg-card/60 p-3">
                <Text class="text-[12px] leading-5 text-foreground" numberOfLines={6}>
                  {release.notes}
                </Text>
              </View>
            ) : null}
            <Btn onPress={() => void openExternal(updateUrl(release))} label="Download the update">
              Download
            </Btn>
          </Panel>
        );
      }}
    </View>
  );
}

/** A badge for a header, so "there is a new build" is visible without opening Settings. */
export function UpdateBadge() {
  return (
    <View>
      {() => {
        const next = availableVersion();
        if (next === "") return null;
        return <Badge tone="ember">{`v${next} ready`}</Badge>;
      }}
    </View>
  );
}

/** The share action as a primary button, for About and any empty state. */
export function ShareButton(props: { variant?: "primary" | "secondary"; class?: string }) {
  return (
    <Btn
      variant={props.variant ?? "primary"}
      icon="link-external"
      onPress={shareApp}
      label="Share BEUConnect on WhatsApp"
      class={props.class}
    >
      Share with a classmate
    </Btn>
  );
}
