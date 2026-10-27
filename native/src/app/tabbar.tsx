import { Text, View } from "nsh";
import { Icon, type IconName } from "../ui/icons";

/**
 * The floating native tab bar. Each tab is a `tab` in a `tablist`, 52 pt tall,
 * and says "selected" in three ways that survive greyscale: the pill behind it,
 * the solid icon, the bolder label and the ember bar under the label. The label
 * is the accessibility name, so it is capped rather than allowed to ellipsize
 * to "Syllab…" at 2× text.
 */

export interface TabItem {
  name: string;
  label: string;
  icon: IconName;
}

export const TABS: TabItem[] = [
  { name: "home", label: "Home", icon: "home-alt-2" },
  { name: "syllabus", label: "Syllabus", icon: "book-open" },
  { name: "results", label: "Results", icon: "bar-chart-alt-2" },
  { name: "tools", label: "Tools", icon: "wrench" },
  { name: "more", label: "More", icon: "grid-alt" },
];

export function TabBar(props: { active: string; onSelect: (name: string) => void }) {
  return (
    <View class="bg-transparent pb-[env(safe-area-inset-bottom)]">
      <View
        class="mx-3 mb-2 flex-row rounded-[26px] border border-border bg-card px-1.5 py-1.5"
        role="tablist"
        accessibilityLabel="Main navigation"
      >
        {TABS.map((tab) => {
          const on = props.active === tab.name;
          return (
            <View
              class={`flex-1 items-center justify-center gap-1 rounded-[18px] pb-1 pt-2 focus:ring-2 focus:ring-ring ${
                on ? "bg-muted" : "active:bg-muted/60"
              }`}
              onPress={() => props.onSelect(tab.name)}
              role="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab.label}
            >
              <Icon
                name={tab.icon}
                size={19}
                solid={on}
                class={on ? "text-primary-ink" : "text-muted-foreground"}
              />
              <Text
                class={`text-[11px] ${on ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
              >
                {tab.label}
              </Text>
              <View class={`h-[3px] w-5 rounded-full ${on ? "bg-primary" : "bg-transparent"}`} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
