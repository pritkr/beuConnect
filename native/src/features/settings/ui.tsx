/**
 * The small, shared pieces of the settings area: a consistent screen intro,
 * a grouped list, a 44 pt row, a switch and a destructive text action. They are
 * built from `src/ui` and keep every settings screen looking like one place.
 */

import { Text, View } from "nsh";
import { AlertDialog } from "nsh/base";
import { formatBytes, utf8Bytes } from "../../lib/bytes";
import type { Children } from "../../ui";
import { Label, Subtitle, Title } from "../../ui";
import { Icon } from "../../ui/icons";

export { formatBytes, utf8Bytes };

/** Label + title. Every settings screen opens with it. */
export function ScreenIntro(props: { label: string; title: string }) {
  return (
    <View class="gap-1 pt-1">
      <Label>{props.label}</Label>
      <Title>{props.title}</Title>
    </View>
  );
}

/** A card that holds rows: hairline border, oversized radius, no inner padding. */
export function SettingsGroup(props: { children?: Children; class?: string }) {
  return (
    <View class={`overflow-hidden rounded-3xl border border-border bg-card ${props.class ?? ""}`}>
      {props.children}
    </View>
  );
}

/**
 * One settings row. At least 44 pt tall, with an inset divider unless it is the
 * group's last row. `destructive` paints the title in the destructive colour
 * and drops the chevron — the caller still owns the confirmation.
 */
export function SettingsRow(props: {
  title: string;
  hint?: string;
  value?: string;
  onPress?: () => void;
  right?: Children;
  last?: boolean;
  destructive?: boolean;
  label?: string;
}) {
  const row = (
    <View
      class={`min-h-11 flex-row items-center gap-3 px-4 py-3 ${props.onPress ? "active:bg-muted" : ""}`}
      onPress={props.onPress}
      role={props.onPress ? "button" : undefined}
      accessibilityLabel={props.label ?? props.title}
    >
      <View class="flex-1 gap-0.5">
        <Text class={`text-[15px] font-semibold ${props.destructive ? "text-destructive" : "text-foreground"}`}>
          {props.title}
        </Text>
        {props.hint ? <Text class="text-[12px] leading-4 text-muted-foreground">{props.hint}</Text> : null}
      </View>
      {props.value ? (
        <Text class="max-w-[132px] text-right text-[13px] text-muted-foreground" numberOfLines={1}>
          {props.value}
        </Text>
      ) : null}
      {props.right}
      {props.onPress && !props.destructive ? <Icon name="chevron-right" size={18} class="text-muted-foreground" /> : null}
    </View>
  );

  if (props.last) return row;
  return (
    <View>
      {row}
      <View class="ml-4 h-px bg-border" />
    </View>
  );
}

/** A native switch row: the whole 44 pt row toggles, with a mouth to tap. */
export function SettingsToggle(props: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  last?: boolean;
}) {
  const row = (
    <View
      class="min-h-11 flex-row items-center gap-3 px-4 py-3 active:bg-muted"
      onPress={() => props.onChange(!props.checked)}
      role="switch"
      accessibilityLabel={props.title}
      accessibilityState={{ checked: props.checked }}
    >
      <View class="flex-1 gap-0.5">
        <Text class="text-[15px] font-semibold text-foreground">{props.title}</Text>
        {props.hint ? <Text class="text-[12px] leading-4 text-muted-foreground">{props.hint}</Text> : null}
      </View>
      <View
        class={`h-7 w-12 flex-row items-center rounded-full border px-1 ${
          props.checked ? "justify-end border-primary bg-primary" : "justify-start border-border bg-muted"
        }`}
      >
        <View class={`h-5 w-5 rounded-full ${props.checked ? "bg-primary-foreground" : "bg-card"}`} />
      </View>
    </View>
  );

  if (props.last) return row;
  return (
    <View>
      {row}
      <View class="ml-4 h-px bg-border" />
    </View>
  );
}

/** A destructive text action that keeps a full 44 pt target. */
export function ClearAction(props: { text?: string; onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <View
      class={`min-h-11 justify-center rounded-full px-3 ${
        props.disabled ? "opacity-30" : "active:bg-destructive/10"
      }`}
      onPress={props.disabled ? undefined : props.onPress}
      role="button"
      accessibilityLabel={props.label ?? props.text ?? "Clear"}
      accessibilityState={{ disabled: props.disabled === true }}
    >
      <Text class="text-[13px] font-semibold text-destructive">{props.text ?? "Clear"}</Text>
    </View>
  );
}

/**
 * One native dialog, then the action. Returns false when the host has no
 * dialog: a destructive action must never happen without a confirmation.
 */
export async function confirmDestructive(title: string, description: string, confirmLabel: string): Promise<boolean> {
  try {
    const choice = await AlertDialog.show({
      title,
      description,
      actions: [
        { label: "Cancel", role: "cancel" },
        { label: confirmLabel, role: "destructive" },
      ],
    });
    return choice === confirmLabel;
  } catch {
    return false;
  }
}
