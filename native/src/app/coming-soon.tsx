import { Text, View } from "nsh";
import { Body, Btn, Label, Screen } from "../ui";

/** Shown for a route that a feature module has not registered yet. */
export function ComingSoon(props: { name: string; note?: string }) {
  return (
    <Screen>
      <Body contentClass="flex-1 justify-center p-6 gap-4">
        <View class="items-center gap-3">
          <View class="h-16 w-16 items-center justify-center rounded-[22px] border border-border bg-card">
            <View class="h-6 w-6 rounded-full border-2 border-primary" />
          </View>
          <Label>In progress</Label>
          <Text class="text-center text-[22px] font-bold tracking-tight text-foreground">{props.name}</Text>
          <Text class="max-w-[300px] text-center text-[14px] leading-5 text-muted-foreground">
            {props.note ?? "This module is being wired up. The rest of the app already works — go back and keep exploring."}
          </Text>
        </View>
      </Body>
    </Screen>
  );
}

/** A tiny screen used by the fallback route. */
export function NotFound(props: { route: string; onBack: () => void }) {
  return (
    <Screen>
      <Body contentClass="flex-1 justify-center p-6 gap-4">
        <View class="items-center gap-3">
          <Text class="text-[44px] font-bold tracking-tight text-primary-ink">404</Text>
          <Text class="text-center text-[16px] font-semibold text-foreground">No screen for “{props.route}”</Text>
          <Btn variant="secondary" onPress={props.onBack}>Go back</Btn>
        </View>
      </Body>
    </Screen>
  );
}
