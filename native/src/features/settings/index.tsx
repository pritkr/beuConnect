/**
 * Settings — where the app knows you, looks the way you choose, and shows its
 * work. The hub is deliberately three groups rather than one long scroll:
 *
 *   you     → the profile card, and Home's greeting behind it
 *   app     → appearance and reminders
 *   data    → offline data, storage and about
 *
 * The modules are split by concern: `profile.ts` (the contract other screens
 * read), `prefs.ts` (appearance + reminders, applied at boot), `ui.tsx` (the
 * shared row/group/switch) and one file per screen.
 */

import { Text, View } from "nsh";
import type { Nav, RouteDef } from "../../app/router";
import { Badge, Body, Muted, Screen, SectionHeader } from "../../ui";
import { Icon } from "../../ui/icons";
import { APP_VERSION } from "./about";
import { AboutScreen } from "./about";
import { AppearanceScreen } from "./appearance";
import { offlineRoutes } from "../offline";
import { ProfileScreen } from "./profile-screen";
import { branchShort, collegeShortLabel, isProfileComplete, useProfile } from "./profile";
import { schemeLabel, useAppearance, useReminders } from "./prefs";
import { RemindersScreen } from "./reminders";
import { StorageScreen } from "./storage";
import { ScreenIntro, SettingsGroup, SettingsRow } from "./ui";
import { ShareAppRow, UpdateRow, UpdatePanel } from "./release-rows";

/* --------------------------------------------------------------------- hub */

function ProfileCard(props: { nav: Nav }) {
  const profile = useProfile();
  const complete = (): boolean => isProfileComplete(profile());
  // A name is optional now: the registration number resolves one from BEU's
  // roster, so a saved number without a typed name is still a set-up profile.
  const title = (): string =>
    profile().name || (profile().reg ? "Your BEU profile" : "Tell the app who you are");
  const hint = (): string => {
    if (!complete()) {
      return profile().reg
        ? "Pick your branch and semester to finish setting up."
        : "Your registration number unlocks results, rank and attendance.";
    }
    return [profile().reg, branchShort(profile().branch), `Semester ${profile().sem}`].filter(Boolean).join(" · ");
  };
  const tag = (): string => collegeShortLabel(profile().college) || "Ready";

  return (
    <View
      class="gap-3 overflow-hidden rounded-[28px] border border-border bg-card p-5 active:bg-muted"
      onPress={() => props.nav.push("settings.profile")}
      role="button"
      accessibilityLabel="Open your profile"
    >
      <View class="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary/12" pointerEvents="none" />
      <View class="flex-row items-center gap-3">
        <View class="h-14 w-14 items-center justify-center rounded-2xl bg-primary/12">
          <Text class="text-[22px] font-bold text-primary">
            {profile().name ? profile().name.slice(0, 1).toUpperCase() : "B"}
          </Text>
        </View>
        <View class="flex-1 gap-1">
          <Text class="text-[18px] font-bold tracking-tight text-foreground" numberOfLines={1}>
            {title()}
          </Text>
          <Muted>{hint()}</Muted>
        </View>
        <Icon name="chevron-right" size={18} class="text-muted-foreground" />
      </View>
      <View class="flex-row flex-wrap items-center gap-2">
        {complete() ? (
          <Badge tone="mint">{tag()}</Badge>
        ) : (
          <Badge tone="amber">Finish setup</Badge>
        )}
      </View>
    </View>
  );
}

function SettingsHome(props: { nav: Nav }) {
  const appearance = useAppearance();
  const reminders = useReminders();

  const reminderValue = (): string => {
    const current = reminders();
    if (!current.classes) return "Off";
    const count = current.times.length;
    return count === 0 ? "No times" : `${count} time${count === 1 ? "" : "s"}`;
  };

  const reminderHint = (): string =>
    reminders().holidays ? "Class times and holiday countdowns" : "Class times · holidays hidden";

  return (
    <Screen>
      <Body>
        <ScreenIntro
          label="BEUConnect"
          title="Settings"
        />

        <ProfileCard nav={props.nav} />

        <SectionHeader title="Personalise" />
        <SettingsGroup>
          <SettingsRow
            title="Appearance"
            value={schemeLabel(appearance())}
            onPress={() => props.nav.push("settings.appearance")}
          />
          <SettingsRow
            title="Reminders & holidays"
            hint={reminderHint()}
            value={reminderValue()}
            onPress={() => props.nav.push("settings.reminders")}
            last
          />
        </SettingsGroup>

        <UpdatePanel />

        <SectionHeader title="Data & app" />
        <SettingsGroup>
          <SettingsRow title="Offline data" onPress={() => props.nav.push("settings.offline")} />
          <SettingsRow
            title="Storage"
            onPress={() => props.nav.push("settings.storage")}
          />
          <SettingsRow
            title="About BEUConnect"
            value={`v${APP_VERSION}`}
            onPress={() => props.nav.push("settings.about")}
            last
          />
        </SettingsGroup>

        <SectionHeader title="Pass it on" />
        <SettingsGroup>
          <ShareAppRow />
          <UpdateRow last />
        </SettingsGroup>

        <View class="items-center py-3">
          <Text class="text-[12px] font-semibold text-muted-foreground">BEUConnect {APP_VERSION} · native</Text>
        </View>
      </Body>
    </Screen>
  );
}

/* ------------------------------------------------------------------ routes */

export const settingsRoutes: RouteDef[] = [
  { name: "settings", title: () => "Settings", render: (nav) => <SettingsHome nav={nav} /> },
  { name: "settings.profile", title: () => "Profile", render: () => <ProfileScreen /> },
  { name: "settings.appearance", title: () => "Appearance", render: () => <AppearanceScreen /> },
  { name: "settings.reminders", title: () => "Reminders", render: (nav) => <RemindersScreen nav={nav} /> },
  { name: "settings.storage", title: () => "Storage", render: () => <StorageScreen /> },
  { name: "settings.about", title: () => "About", render: () => <AboutScreen /> },
  ...offlineRoutes,
];

/** Other modules can read the profile without touching this screen. */
export { useProfile, loadProfile, saveProfile } from "./profile";
export type { Profile } from "./profile";
