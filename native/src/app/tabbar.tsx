import { Text, View } from "nsh";
import { Haptics } from "nsh/mobile";
import { Icon, type IconName } from "../ui/icons";

/**
 * The bottom navigation surface. It is full width and flush with the window:
 * the card background runs under the gesture inset, while the five
 * destinations stay above it. Each destination is a `tab` in a `tablist` with
 * a Material 3 rhythm — a 56 × 30 active indicator, a 20 pt icon and an 11 pt
 * label — and says "selected" with the indicator, the solid icon and the
 * heavier label. Three cues, all legible in greyscale, no underline and no
 * block behind the whole tab.
 *
 * Press and selection are the same shape. A press paints the indicator itself
 * — the `muted` tint a selected tab rests on, or one step deeper (`border`)
 * on the tab that already owns it — so the finger sees the mark it is about
 * to keep instead of a block behind the whole cell that vanishes on release.
 *
 * The label is the accessibility name, so it is capped rather than allowed to
 * ellipsize to "Syllab…" at 2× text. A change of tab plays the selection
 * haptic; re-pressing the active tab does not.
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

function Tab(props: { tab: TabItem; on: boolean; onSelect: (name: string) => void }) {
  const tab = props.tab;
  const on = props.on;
  return (
    <View
      class="group min-h-[52px] flex-1 items-center justify-center gap-1 rounded-2xl focus:ring-2 focus:ring-ring"
      onPress={() => {
        if (!on) Haptics.selection();
        props.onSelect(tab.name);
      }}
      role="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={tab.label}
    >
      <View
        class={`h-[30px] w-14 items-center justify-center rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none ${
          on ? "bg-muted group-active:bg-border" : "bg-transparent group-active:bg-muted"
        }`}
      >
        <Icon
          name={tab.icon}
          size={20}
          solid={on}
          class={`transition-colors duration-150 ease-out motion-reduce:transition-none ${
            on ? "text-primary-ink" : "text-muted-foreground"
          }`}
        />
      </View>
      <Text
        class={`text-[11px] transition-colors duration-150 ease-out motion-reduce:transition-none ${
          on ? "font-bold text-foreground" : "font-medium text-muted-foreground"
        }`}
        style={{ numberOfLines: 1 }}
        maxFontSizeMultiplier={1.4}
      >
        {tab.label}
      </Text>
    </View>
  );
}

export function TabBar(props: { active: string; onSelect: (name: string) => void }) {
  return (
    <View class="border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <View class="flex-row px-1 py-1" role="tablist" accessibilityLabel="Main navigation">
        {TABS.map((tab) => (
          <Tab tab={tab} on={props.active === tab.name} onSelect={props.onSelect} />
        ))}
      </View>
    </View>
  );
}
