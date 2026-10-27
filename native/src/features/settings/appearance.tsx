/**
 * Appearance — light, dark, or follow the phone.
 *
 * Choosing an option applies it immediately (every screen, dialog, the native
 * header and the system bars repaint through `setColorScheme`) and persists it
 * for the next launch. The swatch strips are literal previews of the two
 * palettes from `nsh.json`, not a mock-up, so the choice is visible before the
 * app changes around it.
 */

import { Text, View, signal, colorScheme } from "nsh";

import { Badge, Body, Label, Muted, Panel, Screen, SectionHeader, Subtitle } from "../../ui";
import type { Scheme } from "./prefs";
import { schemeHint, schemeLabel, setAppearance, useAppearance } from "./prefs";
import { ScreenIntro } from "./ui";

const PALETTES: Record<"light" | "dark", { bg: string; card: string; ink: string; primary: string; accent: string }> = {
  light: { bg: "#FBF8F4", card: "#FFFFFF", ink: "#17130F", primary: "#E4572E", accent: "#0E6B5C" },
  dark: { bg: "#0E0C0A", card: "#1A1714", ink: "#F6F1EA", primary: "#FF7A4D", accent: "#4FD8BA" },
};

const OPTIONS: readonly Scheme[] = ["light", "dark", "system"];

function SwatchStrip(props: { scheme: "light" | "dark" }) {
  const palette = PALETTES[props.scheme];
  const colors = [palette.bg, palette.card, palette.ink, palette.primary, palette.accent];
  return (
    <View class="flex-row gap-1.5">
      {colors.map((color) => (
        <View class="h-8 flex-1 rounded-lg border border-border" style={{ backgroundColor: color }} />
      ))}
    </View>
  );
}

function Swatches(props: { scheme: Scheme }) {
  if (props.scheme === "system") {
    return (
      <View class="gap-1.5">
        <SwatchStrip scheme="light" />
        <SwatchStrip scheme="dark" />
      </View>
    );
  }
  return <SwatchStrip scheme={props.scheme} />;
}

export function AppearanceScreen() {
  const appearance = useAppearance();
  const failed = signal(false);

  const choose = (scheme: Scheme): void => {
    void setAppearance(scheme).then((saved) => failed.set(!saved));
  };

  return (
    <Screen>
      <Body>
        <ScreenIntro
          label="Look"
          title="Appearance"
        />

        <Panel tone="plain" class="gap-3">
          <View class="flex-row items-center justify-between gap-2">
            <Label>Live preview</Label>
            <Badge tone="mint">Ink &amp; Ember</Badge>
          </View>
          <View class="gap-1">
            <Text class="text-[18px] font-bold tracking-tight text-foreground">Semester 5</Text>
          </View>
          <View class="flex-row flex-wrap gap-2">
            <View class="rounded-full bg-primary px-3.5 py-2">
              <Text class="text-[12px] font-semibold text-primary-foreground">Ember</Text>
            </View>
            <View class="rounded-full bg-accent/12 px-3.5 py-2">
              <Text class="text-[12px] font-semibold text-accent">Teal</Text>
            </View>
            <View class="rounded-full border border-border bg-card px-3.5 py-2">
              <Text class="text-[12px] text-muted-foreground">Paper</Text>
            </View>
          </View>
        </Panel>

        <SectionHeader title="Theme" />

        {OPTIONS.map((option) => {
          const active = appearance() === option;
          return (
            <View
              class={`gap-3 rounded-3xl border p-4 ${
                active ? "border-primary bg-primary/8" : "border-border bg-card"
              } active:opacity-80`}
              onPress={() => choose(option)}
              role="radio"
              accessibilityLabel={schemeLabel(option)}
              accessibilityState={{ selected: active }}
            >
              <View class="flex-row items-center gap-3">
                <View
                  class={`h-5 w-5 items-center justify-center rounded-full border ${
                    active ? "border-primary" : "border-border"
                  }`}
                >
                  {active ? <View class="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                </View>
                <View class="flex-1 gap-0.5">
                  <Text class="text-[15px] font-semibold text-foreground">{schemeLabel(option)}</Text>
                  <Text class="text-[12px] text-muted-foreground">{schemeHint(option)}</Text>
                </View>
                {active ? <Badge tone="ember">Active</Badge> : null}
              </View>
              <Swatches scheme={option} />
            </View>
          );
        })}

        <Muted class="px-1">
          Currently showing: {colorScheme() === "dark" ? "dark" : "light"}
          {appearance() === "system" ? " (following the phone)" : ""}.
        </Muted>

        <Panel tone="amber" class="gap-1">
          <Label>Device-wide</Label>
          <Muted class="text-[12px] leading-5">
            This choice applies to the whole app, not one screen: dialogs, the native header and the status bar follow
            it too. It is saved on this phone and applied again on the next launch.
          </Muted>
        </Panel>

        {failed() ? (
          <Panel tone="plain" class="gap-1">
            <Label>Not remembered</Label>
            <Muted class="text-[12px] leading-5">
              The theme changed for this session, but Storage refused the write. Clear some downloads in Storage and
              choose again.
            </Muted>
          </Panel>
        ) : null}

      </Body>
    </Screen>
  );
}
