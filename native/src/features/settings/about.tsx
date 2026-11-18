/**
 * About — version, real sources and the two disclosures that matter.
 *
 * Nothing here is decorative: every URL is one the app actually talks to, the
 * captcha paragraph describes exactly what `results/portal.tsx` does, and the
 * privacy paragraph is the literal truth of the build (no account, no
 * third-party SDK; the one count that leaves is hashed and switchable, and the
 * policy it points at is `src/pages/privacy.astro` on the site).
 */

import { Image, Text, View, signal, Clipboard } from "nsh";

import { Badge, Body, Card, Divider, Label, Mono, Muted, Panel, Screen, SectionHeader } from "../../ui";
import { APP_BUILD, APP_VERSION } from "../../lib/app-info";
import { setAnalyticsEnabled, useAnalytics } from "../../lib/analytics";
import { feedStatus } from "../data-feed/store";
import { SettingsGroup, SettingsToggle } from "./ui";
import { ShareButton, UpdatePanel } from "./release-rows";
import logo from "../../../assets/logo.png";

export { APP_BUILD, APP_VERSION };

interface Source {
  title: string;
  detail: string;
  url: string;
}

const SOURCES: readonly Source[] = [
  {
    title: "BEUConnect site",
    detail: "The web app this native app is built from.",
    url: "https://beu.prit.eu.org",
  },
  {
    title: "Results",
    detail: "BEU's own result data, normalised and rendered natively.",
    url: "https://beu.prit.eu.org/api/result",
  },
  {
    title: "BEU result portal",
    detail: "The official page, opened only for the captcha step.",
    url: "https://beu-bih.ac.in/result-three",
  },
  {
    title: "Notices",
    detail: "University circulars, mirrored as clean text.",
    url: "https://beu.prit.eu.org/notices/",
  },
  {
    title: "Papers and datasets",
    detail: "Previous-year papers plus the published rank, merit and result tables.",
    url: "https://beu.prit.eu.org/data/manifest/index.json",
  },
  {
    title: "Source code",
    detail: "The app and the site, in one repository.",
    url: "https://github.com/pritkr/beuconnectaw",
  },
  {
    title: "Privacy policy",
    detail: "What this app collects, what it never touches, and how to delete it.",
    url: "https://beu.prit.eu.org/privacy",
  },
];

export function AboutScreen() {
  const copied = signal("");
  const analytics = useAnalytics();

  const copy = (url: string): void => {
    void Clipboard.writeText(url).then(() => {
      copied.set(url);
      setTimeout(() => {
        if (copied() === url) copied.set("");
      }, 1600);
    });
  };

  return (
    <Screen>
      <Body>
        <View class="items-center gap-2 py-3">
          <Image
            src={logo}
            class="h-16 w-16 rounded-[20px]"
            style={{ objectFit: "contain", width: 64, height: 64 }}
            accessibilityElementsHidden
          />
          <Text class="text-[22px] font-bold tracking-tight text-foreground">BEUConnect</Text>
          <Muted>
            Version {APP_VERSION} · build {APP_BUILD} · native
          </Muted>
          <Badge tone="mint">Offline data {feedStatus().snapshot}</Badge>
        </View>

        <UpdatePanel />

        <ShareButton />

        <Card class="gap-2">
          <Text class="text-[14px] leading-6 text-foreground">
            A native app for Bihar Engineering University students: syllabus split into topics, results rendered
            properly, previous papers, rank, merit, calculators, attendance, routine and notices.
          </Text>
        </Card>

        <SectionHeader title="Where the data comes from" />
        <Card class="gap-0 p-0">
          {SOURCES.map((source, index) => (
            <View>
              <View
                class="min-h-11 gap-1 px-4 py-3 active:bg-muted"
                onPress={() => copy(source.url)}
                role="button"
                accessibilityLabel={`Copy ${source.title} URL`}
              >
                <View class="flex-row items-center justify-between gap-2">
                  <Text class="text-[14px] font-semibold text-foreground">{source.title}</Text>
                  <Badge tone={copied() === source.url ? "mint" : "neutral"}>
                    {copied() === source.url ? "Copied" : "Copy"}
                  </Badge>
                </View>
                <Text class="text-[12px] leading-4 text-muted-foreground">{source.detail}</Text>
                <Mono class="text-[11px] text-accent">{source.url}</Mono>
              </View>
              {index < SOURCES.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>

        <Panel tone="amber" class="gap-2">
          <Label>The captcha, honestly</Label>
          <Text class="text-[13px] leading-5 text-foreground">
            BEU's result page is protected by a captcha. You solve it yourself, on BEU's own page. The app only reads
            the result JSON that the page returns, saves it under the same key the native path uses, and renders it
            natively.
          </Text>
          <Text class="text-[12px] leading-5 text-muted-foreground">
            The app never fills, guesses, bypasses or replays the captcha.
          </Text>
        </Panel>

        <Panel tone="mint" class="gap-2">
          <Label>What is kept here</Label>
          <Text class="text-[13px] leading-5 text-foreground">
            No account, no advertising, no tracking SDK. Your profile, read marks and attendance live in this device's
            storage.
          </Text>
          <Text class="text-[12px] leading-5 text-muted-foreground">
            Usage analytics leave as an anonymous count of which screens and buttons get used, so the app can be built
            around what students actually open. It carries no name, registration number or typed text, and the switch
            below stops it.
          </Text>
        </Panel>

        <SectionHeader title="Usage analytics" />
        <SettingsGroup>
          <SettingsToggle
            title="Send anonymous usage"
            hint="Screen names and taps. Never your registration number, results or search text."
            checked={analytics()}
            onChange={(on) => void setAnalyticsEnabled(on)}
            last
          />
        </SettingsGroup>

        <Card class="gap-1">
          <Text class="text-[12px] leading-5 text-muted-foreground">
            Requests go to beu.prit.eu.org for app data, analytics and feedback, beu-bih.ac.in when you open the result
            portal (that page loads Google reCAPTCHA), and api.github.com to check for a newer build.
          </Text>
        </Card>

        <Panel tone="plain" class="gap-1">
          <Label>Not an official BEU app</Label>
          <Muted class="text-[12px] leading-5">
            Not affiliated with Bihar Engineering University. The university's notice is the final word; a result here
            is a copy of what BEU published.
          </Muted>
        </Panel>

        <View class="items-center gap-1 pb-2 pt-1">
          <Muted class="text-[11px]">Icons: Boxicons (MIT) · subset font</Muted>
        </View>
      </Body>
    </Screen>
  );
}
