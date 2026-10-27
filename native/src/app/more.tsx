import { Text, View } from "nsh";
import type { Nav } from "./router";
import { Body, Card, Divider, Label, Row, Screen, SectionHeader, Title } from "../ui";
import { Icon, type IconName } from "../ui/icons";
import { APP_VERSION } from "../lib/app-info";

/**
 * The "More" tab: the screens that are not on the five tabs, grouped by what a
 * student is doing rather than by which module owns them.
 *
 * Four groups, ordered by how often they are opened — Study first, App last.
 * Each group is a spoken header, one line saying what is in it, then a card of
 * 44 pt rows. Nothing that already has a tab root is repeated here, and no
 * destination appears twice.
 */

interface Entry {
  title: string;
  hint: string;
  route: string;
  icon: IconName;
  params?: Record<string, string>;
  tag?: string;
}

interface Group {
  heading: string;
  items: Entry[];
}

const GROUPS: Group[] = [
  {
    heading: "Study",
    items: [
      { title: "Notes & VVI", hint: "Short notes and handwritten PDFs", route: "notes", icon: "note", tag: "NEW" },
      { title: "Previous year papers", hint: "BEU + GATE, subject by subject", route: "pyqs", icon: "file-blank" },
      { title: "Study planner", hint: "Your syllabus, spread over the days left", route: "planner", icon: "calendar-check" },
      { title: "Search everything", hint: "Subjects, papers, notices, tools", route: "search", icon: "search" },
    ],
  },
  {
    heading: "Results & records",
    items: [
      { title: "University rank", hint: "Where you stand, branch and college", route: "results.rank", icon: "medal" },
      { title: "Merit list", hint: "Toppers by branch and semester", route: "results.merit", icon: "trophy" },
      { title: "Result battle", hint: "Compare two results, subject by subject", route: "results.battle", icon: "git-compare" },
      { title: "SGPA / CGPA calculator", hint: "Grades in, percentage out", route: "tools.calculator", icon: "calculator" },
      { title: "Data browser", hint: "Every published dataset, searchable", route: "data", icon: "data" },
    ],
  },
  {
    heading: "Daily",
    items: [
      { title: "Notices", hint: "Important updates from the university", route: "notices", icon: "megaphone" },
      { title: "Attendance", hint: "Bunk math that tells the truth", route: "tools.attendance", icon: "user-check" },
      { title: "Routine", hint: "Today, this week, room and teacher", route: "tools.routine", icon: "calendar-week" },
      { title: "Holidays", hint: "The next break, counted down", route: "tools.holidays", icon: "calendar-star" },
      { title: "Wi-Fi help", hint: "Campus portal steps, copied in a tap", route: "tools.wifi", icon: "wifi" },
    ],
  },
  {
    heading: "App",
    items: [
      { title: "Profile", hint: "Registration number, branch, semester", route: "settings.profile", icon: "user" },
      { title: "Settings", hint: "Appearance, storage, reminders", route: "settings", icon: "cog" },
      { title: "Send feedback", hint: "Bugs, ideas, anything", route: "feedback", icon: "message-square-dots", params: { from: "more" } },
      { title: "About BEUConnect", hint: "Built for BEU students", route: "settings.about", icon: "info-circle" },
    ],
  },
];

export function MoreScreen(props: { nav: Nav }) {
  return (
    <Screen>
      <Body>
        <View class="gap-1 pt-1">
          <Label>BEUConnect</Label>
          <Title class="text-[30px]">More</Title>
        </View>

        <View class="gap-5">
          {GROUPS.map((group) => (
            <View class="gap-2">
              <SectionHeader title={group.heading} />
              <Card class="gap-0 p-0">
                {group.items.map((item, index) => (
                  <View
                    class="min-h-11 flex-row items-center gap-3 px-4 py-2.5 active:bg-muted focus:ring-2 focus:ring-ring"
                    onPress={() => props.nav.push(item.route, item.params ?? {})}
                    role="button"
                    accessibilityLabel={item.title}
                    accessibilityHint={item.hint}
                  >
                    <View class="h-9 w-9 items-center justify-center rounded-xl bg-muted">
                      <Icon name={item.icon} size={19} class="text-muted-foreground" />
                    </View>
                    <View class="flex-1 gap-0.5">
                      <Text class="text-[15px] font-semibold text-foreground" numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                    {item.tag ? (
                      <Text class="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-ink">{item.tag}</Text>
                    ) : null}
                    <Icon name="chevron-right" size={18} class="text-muted-foreground" />
                    {index < group.items.length - 1 ? (
                      <View class="absolute bottom-0 left-4 right-0 h-px bg-border" />
                    ) : null}
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </View>

        <Divider class="mt-2" />
        <Row class="justify-between gap-3 px-1 pb-2">
          <Text class="flex-1 text-[12px] leading-4 text-muted-foreground">Made for Bihar Engineering University</Text>
          <Text class="shrink-0 text-[12px] tabular-nums text-muted-foreground" numberOfLines={1}>
            v{APP_VERSION}
          </Text>
        </Row>
      </Body>
    </Screen>
  );
}
