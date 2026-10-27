/**
 * BEUConnect's native design system — "Ink & Ember".
 *
 * Warm paper surfaces, hairline borders, oversized soft radii, one ember accent
 * and one deep-teal accent. No shadows, no gradients-as-decoration beyond the
 * aurora blobs: every surface is a real native view, cheap to lay out on a
 * small Android phone.
 *
 * Rules for feature screens:
 *  - Use these primitives instead of raw cards/buttons so the app stays one app.
 *  - Pressables are >= 44pt tall and use `active:` feedback, never hover-only.
 *  - Text containers grow with the system font scale: use `min-h`, never a
 *    fixed height around text.
 *  - Ink: `text-foreground` for body text, `text-muted-foreground` for support
 *    text, `text-primary-ink` / `text-accent-ink` when the words themselves are
 *    ember or mint (never the `primary` / `accent` surface fills as text — in
 *    dark mode those are darker than the card). `destructive` is the one
 *    surface token that is also readable as ink.
 *  - A border that is the *only* affordance of a control uses
 *    `border-border-strong` (3:1 against every surface). Cards, dividers and
 *    other decoration stay on `border-border`.
 *
 * `nsh test` prints `unknown class` for those three token classes. It is a
 * false positive in the build's class check, not a styling bug: `nsh check` is
 * clean, and `app.spanStyle` reports the themed colour in both schemes
 * (`text-primary-ink` → #B0401D light / #FF7A4D dark). The check reads
 * `primary-ink` as the token `primary` with the shade `-ink` because our extra
 * tokens share a prefix with a shadcn token. Re-spelling them as
 * `text-(--primary-ink)` / `border-(color:--border-strong)` — valid Tailwind and
 * identical at runtime — still warns in these files, so keep the readable form
 * and leave the warning alone.
 */

import { Text, View, Scroll, Canvas, cleanup, token, type JSX } from "nsh";
import { Input } from "nsh/base";

import { FeedbackFooter } from "../features/feedback/footer";
import { Icon, type IconName } from "./icons";

export type Children = JSX.Element | JSX.Element[] | string | number | false | null | undefined;

/**
 * The spoken label a control can own from its visible text. Only plain text is
 * mined: an icon or a nested component has no text of its own, so callers that
 * pass one must pass `label` too.
 */
function textLabel(children: Children): string | undefined {
  if (typeof children === "string" || typeof children === "number") {
    const text = String(children).trim();
    return text.length > 0 ? text : undefined;
  }
  if (Array.isArray(children)) {
    const parts = children
      .map((child) => textLabel(child))
      .filter((part): part is string => part !== undefined);
    return parts.length > 0 ? parts.join(" ") : undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------------ layout */

export function Screen(props: { children?: Children; class?: string }) {
  return <View class={`flex-1 bg-background ${props.class ?? ""}`}>{props.children}</View>;
}

/**
 * A scrolling page body with the standard gutter, and the feedback footer as
 * its last line. Pass `contentClass` to replace the gutter, `footer={false}` on
 * the feedback page itself.
 */
export function Body(props: {
  children?: Children;
  class?: string;
  contentClass?: string;
  footer?: boolean;
  testID?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <Scroll
      class={`flex-1 ${props.class ?? ""}`}
      contentClass={props.contentClass ?? "p-4 gap-4"}
      testID={props.testID}
      refreshing={props.refreshing}
      onRefresh={props.onRefresh}
      keyboardShouldPersistTaps="handled"
    >
      {props.children}
      {props.footer === false ? null : <FeedbackFooter />}
    </Scroll>
  );
}

export function Row(props: {
  children?: Children;
  class?: string;
  onPress?: () => void;
  role?: string;
  /** Spoken label; defaults to the row's plain-text children. */
  label?: string;
}) {
  const interactive = typeof props.onPress === "function";
  return (
    <View
      class={`flex-row items-center gap-3 ${interactive ? "min-h-11" : ""} ${props.class ?? ""}`}
      onPress={props.onPress}
      role={(props.role ?? (interactive ? "button" : undefined)) as never}
      accessibilityLabel={props.label ?? (interactive ? textLabel(props.children) : undefined)}
    >
      {props.children}
    </View>
  );
}

export function Col(props: { children?: Children; class?: string }) {
  return <View class={`gap-1 ${props.class ?? ""}`}>{props.children}</View>;
}

export function Divider(props: { class?: string }) {
  return <View class={`h-px w-full bg-border ${props.class ?? ""}`} />;
}

export function Spacer(props: { size?: number }) {
  return <View style={{ height: props.size ?? 8 }} />;
}

/* -------------------------------------------------------------------- text */

export function Title(props: { children?: Children; class?: string; numberOfLines?: number }) {
  return (
    <Text
      class={`text-2xl font-bold tracking-tight text-foreground ${props.class ?? ""}`}
      numberOfLines={props.numberOfLines}
    >
      {props.children}
    </Text>
  );
}

export function Subtitle(props: { children?: Children; class?: string; numberOfLines?: number }) {
  return (
    <Text class={`text-[15px] leading-6 text-muted-foreground ${props.class ?? ""}`} numberOfLines={props.numberOfLines}>
      {props.children}
    </Text>
  );
}

export function Muted(props: { children?: Children; class?: string; numberOfLines?: number }) {
  return (
    <Text class={`text-xs text-muted-foreground ${props.class ?? ""}`} numberOfLines={props.numberOfLines}>
      {props.children}
    </Text>
  );
}

/** The tiny uppercase label used above sections and inside cards. */
export function Label(props: { children?: Children; class?: string; role?: "header" }) {
  return (
    <Text
      class={`text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${props.class ?? ""}`}
      role={props.role}
    >
      {props.children}
    </Text>
  );
}

export function Mono(props: { children?: Children; class?: string; numberOfLines?: number }) {
  return (
    <Text class={`font-mono text-[13px] text-foreground ${props.class ?? ""}`} numberOfLines={props.numberOfLines}>
      {props.children}
    </Text>
  );
}

/**
 * A fixed bar above a virtualised list. The list owns the scroll, so without a
 * bar the screen has no visible title until its first row lays out — and a
 * screen with no title reads like a screen with no content.
 */
export function ListBar(props: { title: string; meta?: string; class?: string }) {
  return (
    <View class={`flex-row items-baseline justify-between gap-2 border-b border-border bg-card px-4 py-2.5 ${props.class ?? ""}`}>
      <Text class="flex-1 text-[14px] font-semibold tracking-tight text-foreground" numberOfLines={1}>
        {props.title}
      </Text>
      {props.meta ? <Muted class="text-[11px] tabular-nums">{props.meta}</Muted> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ surface */

export function Card(props: {
  children?: Children;
  class?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  label?: string;
  testID?: string;
}) {
  const interactive = typeof props.onPress === "function" || typeof props.onLongPress === "function";
  return (
    <View
      class={`rounded-3xl border bg-card p-4 ${interactive ? "min-h-11 border-border-strong" : "border-border"} ${
        interactive ? "active:scale-[0.985] active:bg-muted focus:ring-2 focus:ring-ring" : ""
      } ${props.class ?? ""}`}
      testID={props.testID}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      role={interactive ? "button" : undefined}
      accessibilityLabel={props.label ?? (interactive ? textLabel(props.children) : undefined)}
    >
      {props.children}
    </View>
  );
}

/** A tinted information panel: `tone` picks the accent, not a random color. */
export function Panel(props: {
  children?: Children;
  class?: string;
  tone?: "ember" | "mint" | "amber" | "plain";
  testID?: string;
}) {
  const tone = props.tone ?? "plain";
  const tones: Record<string, string> = {
    ember: "bg-primary/10 border-primary/25",
    mint: "bg-accent/10 border-accent/25",
    amber: "bg-chart-3/15 border-chart-3/30",
    plain: "bg-muted border-border",
  };
  return (
    <View class={`rounded-3xl border p-4 ${tones[tone]} ${props.class ?? ""}`} testID={props.testID}>
      {props.children}
    </View>
  );
}

export function SectionHeader(props: {
  title: string;
  action?: string;
  onAction?: () => void;
  /** A count or state chip that belongs to the heading, before the action. */
  trailing?: Children;
  class?: string;
}) {
  return (
    <View class={`flex-row items-center justify-between gap-3 ${props.class ?? ""}`}>
      <View class="flex-1 gap-1">
        <Row class="gap-2">
          <View class="h-2 w-2 rounded-full bg-primary" />
          <Label class="text-muted-foreground" role="header">{props.title}</Label>
        </Row>
      </View>
      {props.trailing ? <View>{props.trailing}</View> : null}
      {props.action ? (
        <View
          class="-mr-3 min-h-11 justify-center rounded-full px-3 active:bg-muted focus:ring-2 focus:ring-ring"
          onPress={props.onAction}
          role="button"
          accessibilityLabel={props.action}
        >
          <Text class="text-[13px] font-semibold text-primary-ink" numberOfLines={1}>
            {props.action}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------- input */

export function Chip(props: {
  children?: Children;
  active?: boolean;
  onPress?: () => void;
  class?: string;
  tone?: "default" | "mint" | "amber";
  /** Spoken label; defaults to the chip's plain-text children. */
  label?: string;
  /** Optional leading icon. */
  icon?: IconName;
  iconSolid?: boolean;
}) {
  const interactive = typeof props.onPress === "function";
  // Read `props.active` inside the JSX, not into a const: nsh re-evaluates a
  // prop expression in place, so a chip whose selection changes repaints. A
  // local `const active = props.active` freezes at the first render.
  const surface = (active: boolean): string =>
    active
      ? "bg-foreground border-foreground"
      : props.tone === "mint"
        ? "bg-accent/10 border-accent/25"
        : props.tone === "amber"
          ? "bg-chart-3/15 border-chart-3/30"
          : "bg-card border-border-strong";
  const ink = (active: boolean): string =>
    active ? "text-background" : props.tone === "mint" ? "text-accent-ink" : "text-foreground";
  return (
    <View
      class={`min-h-11 flex-row items-center rounded-full border px-4 ${surface(props.active === true)} ${
        interactive ? "active:opacity-80 focus:ring-2 focus:ring-ring" : ""
      } ${props.class ?? ""}`}
      onPress={props.onPress}
      role={interactive ? "button" : undefined}
      accessibilityLabel={props.label ?? textLabel(props.children)}
      accessibilityState={interactive ? { selected: props.active === true } : undefined}
    >
      {props.icon ? (
        <Icon name={props.icon} size={14} solid={props.iconSolid} class={ink(props.active === true)} />
      ) : null}
      <Text
        class={`text-[13px] ${props.active === true ? "font-bold" : "font-semibold"} ${ink(props.active === true)}`}
        numberOfLines={1}
      >
        {props.children}
      </Text>
    </View>
  );
}

/**
 * The app's one progress control: a real checkbox.
 *
 * A 24 pt box inside a 44 pt target. The box is square with a small radius —
 * circles mean "go somewhere", the square means "this mark stays". Checked
 * fills with the mint accent; unchecked keeps the strong border, because the
 * border is the only affordance. The tick is the only thing that changes, so a
 * tick never reflows the row.
 */
export function Check(props: {
  checked: boolean;
  onPress: () => void;
  /** Spoken label, usually "<topic>, studied". */
  label: string;
  class?: string;
}) {
  return (
    <View
      class={`h-11 w-11 items-center justify-center rounded-xl active:opacity-60 focus:ring-2 focus:ring-ring ${props.class ?? ""}`}
      onPress={props.onPress}
      role="checkbox"
      accessibilityState={{ checked: props.checked }}
      accessibilityLabel={props.label}
    >
      <View
        class={`h-6 w-6 items-center justify-center rounded-[7px] border-2 ${
          props.checked ? "border-accent bg-accent" : "border-border-strong bg-card"
        }`}
      >
        {props.checked ? <Icon name="check" size={14} class="text-accent-foreground" /> : null}
      </View>
    </View>
  );
}

export function Btn(props: {
  children?: Children;
  onPress?: () => void;
  /** Finds the button in tests. */
  testID?: string;
  /**
   * `link` is the text-only action (a "See all" / "Open" inside content):
   * ember ink with no fill, and its own press wash so the tap is still visible.
   */
  variant?: "primary" | "secondary" | "ghost" | "link" | "danger";
  disabled?: boolean;
  class?: string;
  label?: string;
  /** Optional leading icon, e.g. a star on a save action. */
  icon?: IconName;
  iconSolid?: boolean;
}) {
  const variant = props.variant ?? "primary";
  // Colour lives in `ink` only: the child Text inherits it, and two sources
  // would make the button's contrast depend on which one won.
  const styles: Record<string, string> = {
    primary: "bg-primary active:bg-primary/90",
    secondary: "bg-secondary active:bg-secondary/70",
    ghost: "bg-transparent active:bg-muted",
    link: "bg-transparent active:bg-primary/10",
    danger: "bg-destructive/10 active:bg-destructive/20",
  };
  const ink =
    variant === "primary"
      ? "text-primary-foreground"
      : variant === "secondary"
        ? "text-secondary-foreground"
        : variant === "danger"
          ? "text-destructive"
          : variant === "link"
            ? "text-primary-ink"
            : "text-foreground";
  return (
    <View
      class={`min-h-11 flex-row items-center justify-center gap-2 rounded-full px-5 py-2.5 ${styles[variant]} ${
        props.disabled ? "opacity-40" : "active:scale-[0.98] focus:ring-2 focus:ring-ring"
      } ${props.class ?? ""}`}
      testID={props.testID}
      onPress={props.disabled ? undefined : props.onPress}
      disabled={props.disabled}
      role="button"
      accessibilityLabel={props.label ?? textLabel(props.children)}
      accessibilityState={{ disabled: props.disabled }}
    >
      {props.icon ? <Icon name={props.icon} size={16} solid={props.iconSolid} class={ink} /> : null}
      <Text class={`text-center text-[15px] font-semibold ${ink}`}>{props.children}</Text>
    </View>
  );
}

export function Field(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  keyboard?: "default" | "number-pad" | "decimal-pad" | "email-address" | "url" | "phone-pad";
  masked?: boolean;
  multiline?: boolean;
  maxLength?: number;
  onSubmit?: () => void;
  class?: string;
  autoFocus?: boolean;
  prefix?: string;
}) {
  return (
    <View class={`gap-2 ${props.class ?? ""}`}>
      {props.label ? <Label>{props.label}</Label> : null}
      <Row class="rounded-2xl border border-border-strong bg-card px-3.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
        {props.prefix ? <Text class="text-[15px] text-muted-foreground">{props.prefix}</Text> : null}
        <Input
          class="min-h-12 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground"
          value={props.value}
          onChange={props.onChange}
          placeholder={props.placeholder}
          accessibilityLabel={props.label ?? props.placeholder}
          keyboardType={props.keyboard ?? "default"}
          masked={props.masked}
          multiline={props.multiline}
          maxLength={props.maxLength}
          autoFocus={props.autoFocus}
          autoCorrect={false}
          onSubmit={() => props.onSubmit?.()}
        />
      </Row>
      {props.hint ? <Muted class="px-1">{props.hint}</Muted> : null}
    </View>
  );
}

/** A search field with a leading glyph, used everywhere. */
export function Search(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
}) {
  return (
    <Row
      class={`min-h-11 rounded-full border border-border-strong bg-card px-4 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring ${
        props.class ?? ""
      }`}
      role="search"
    >
      <Icon name="search" size={16} class="text-muted-foreground" />
      <Input
        class="min-h-11 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground"
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder ?? "Search"}
        accessibilityLabel={props.placeholder ?? "Search"}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {props.value ? (
        <View
          class="-mr-3 h-11 w-11 items-center justify-center rounded-full active:bg-muted focus:ring-2 focus:ring-ring"
          onPress={() => props.onChange("")}
          role="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="x" size={14} class="text-muted-foreground" />
        </View>
      ) : null}
    </Row>
  );
}

/* -------------------------------------------------------------- data viz */

export function Skeleton(props: { w?: number; h?: number; class?: string }) {
  return (
    <View
      class={`animate-pulse rounded-2xl bg-muted ${props.w === undefined ? "w-full" : ""} ${props.class ?? ""}`}
      style={{ height: props.h ?? 16, width: props.w }}
    />
  );
}

export function Loading(props: { label?: string }) {
  return (
    <View
      class="gap-3 p-1"
      accessible
      accessibilityLabel={props.label ?? "Loading"}
      android={{ accessibilityLiveRegion: "polite" }}
    >
      {props.label ? <Muted>{props.label}</Muted> : null}
      <Skeleton h={20} w={220} />
      <Skeleton h={14} />
      <Skeleton h={14} w={260} />
      <Skeleton h={64} />
    </View>
  );
}

export function ErrorState(props: { message?: string; onRetry?: () => void; title?: string }) {
  return (
    <View class="items-center gap-3 rounded-3xl border border-border bg-card px-5 py-8">
      <View class="h-12 w-12 items-center justify-center rounded-full bg-destructive/10" accessibilityElementsHidden>
        <Icon name="error-circle" size={24} class="text-destructive" />
      </View>
      <Text class="text-center text-[15px] font-semibold text-foreground" role="alert">
        {props.title ?? "Something went wrong"}
      </Text>
      <Text class="text-center text-[13px] leading-5 text-muted-foreground">
        {props.message ?? "Check your connection and try again."}
      </Text>
      {props.onRetry ? <Btn variant="secondary" onPress={props.onRetry} class="mt-1">Try again</Btn> : null}
    </View>
  );
}

export function EmptyState(props: { title: string; hint?: string; action?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <View class="items-center gap-3 rounded-3xl border border-dashed border-border px-5 py-10">
      <View class="h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <Icon name={props.icon ?? "inbox"} size={24} class="text-muted-foreground" />
      </View>
      <Text class="text-center text-[15px] font-semibold text-foreground">{props.title}</Text>
      {props.hint ? <Text class="text-center text-[13px] leading-5 text-muted-foreground">{props.hint}</Text> : null}
      {props.action ? <Btn onPress={props.onAction} class="mt-1">{props.action}</Btn> : null}
    </View>
  );
}

export function Badge(props: { children?: Children; tone?: "ember" | "mint" | "amber" | "neutral"; class?: string }) {
  const tone = props.tone ?? "neutral";
  const map: Record<string, string> = {
    ember: "bg-primary/12 text-primary-ink",
    mint: "bg-accent/12 text-accent-ink",
    amber: "bg-chart-3/20 text-foreground",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <View class={`rounded-full px-2 py-0.5 ${map[tone]} ${props.class ?? ""}`}>
      <Text class="text-[11px] font-semibold tracking-wide" numberOfLines={1}>
        {props.children}
      </Text>
    </View>
  );
}

export function Progress(props: {
  value: number;
  class?: string;
  tone?: "ember" | "mint" | "amber";
  /** What the bar means, for screen readers. */
  label?: string;
}) {
  const tone = props.tone ?? "ember";
  // The mint fill is `accent-ink`, not `accent`: the surface token is darker
  // than the card in dark mode and the bar would read as empty.
  const fill = tone === "mint" ? "bg-accent-ink" : tone === "amber" ? "bg-chart-3" : "bg-primary";
  // Read `props.value` inside the JSX, never into a body const: nsh re-evaluates
  // a prop expression in place, so a bar whose value changes still fills. A
  // local `const pct = …props.value` freezes at the first render (same trap as
  // `Chip.active`).
  const pct = (value: number): number => Math.max(0, Math.min(100, value));
  return (
    <View
      class={`h-2 w-full overflow-hidden rounded-full bg-muted ${props.class ?? ""}`}
      role="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct(props.value)) }}
      accessibilityLabel={props.label ?? "Progress"}
    >
      <View class={`h-full rounded-full ${fill}`} style={{ width: `${pct(props.value)}%` }} />
    </View>
  );
}

/** A big number with a caption — the app's favourite statistic. */
export function Stat(props: {
  value: string;
  label: string;
  hint?: string;
  tone?: "ember" | "mint" | "plain";
  class?: string;
}) {
  const tone = props.tone ?? "plain";
  const ink = tone === "ember" ? "text-primary-ink" : tone === "mint" ? "text-accent-ink" : "text-foreground";
  return (
    <View class={`flex-1 gap-1 rounded-3xl border p-4 ${
      tone === "ember" ? "border-primary/25 bg-primary/8" : tone === "mint" ? "border-accent/25 bg-accent/8" : "border-border bg-card"
    } ${props.class ?? ""}`}>
      <Text
        class={`text-[30px] font-bold tabular-nums tracking-tight ${ink}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {props.value}
      </Text>
      <Label class="text-[10px]">{props.label}</Label>
      {props.hint ? <Muted class="text-[11px]">{props.hint}</Muted> : null}
    </View>
  );
}

/** A native canvas progress ring. */
export function Ring(props: { value: number; size?: number; label?: string; tone?: "ember" | "mint" }) {
  const size = props.size ?? 72;
  // Chart series take the chart tokens, not the surface pair: `accent` is a
  // dark mint surface in dark mode and reads as empty on the card.
  const ringColor = props.tone === "mint" ? token("chart-2") : token("chart-1");
  return (
    <View style={{ width: size, height: size }} class="items-center justify-center">
      <Canvas
        style={{ position: "absolute", width: size, height: size }}
        draw={(cx, box) => {
          const stroke = 7;
          const r = box.width / 2 - stroke / 2;
          const c = box.width / 2;
          cx.clearRect(0, 0, box.width, box.height);
          cx.beginPath();
          cx.arc(c, c, r, 0, Math.PI * 2);
          cx.strokeStyle = token("border");
          cx.lineWidth = stroke;
          cx.stroke();
          cx.beginPath();
          cx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, props.value))) / 100);
          cx.strokeStyle = ringColor;
          cx.lineWidth = stroke;
          cx.lineCap = "round";
          cx.stroke();
        }}
      />
      <Text class="text-[15px] font-bold tabular-nums text-foreground">{props.label ?? `${Math.round(props.value)}%`}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- marquee */

/**
 * A one-line auto-advancing ticker. Long strings and long lists of short
 * strings both work: the row scrolls itself every few seconds and can always
 * be dragged by hand, so it never traps a touch on a small phone.
 */
export function Marquee(props: {
  items: string[];
  label?: string;
  onPressItem?: (item: string, index: number) => void;
  class?: string;
  interval?: number;
}) {
  let node: { scrollTo?: (o: { x?: number; y?: number; animated?: boolean }) => void } | null = null;
  let offset = 0;
  let contentWidth = 0;
  let viewport = 0;

  const tick = () => {
    if (!node || typeof node.scrollTo !== "function" || contentWidth <= viewport) return;
    offset += Math.max(120, viewport * 0.7);
    if (offset > contentWidth - viewport + 8) offset = 0;
    node.scrollTo({ x: offset, animated: true });
  };

  if (typeof setInterval === "function") {
    const timer = setInterval(tick, props.interval ?? 3600);
    cleanup(() => clearInterval(timer));
  }

  return (
    <View class={`flex-row items-center gap-2 overflow-hidden rounded-full border border-border bg-card pl-2 ${props.class ?? ""}`}>
      {props.label ? (
        <View class="rounded-full bg-primary px-2 py-1">
          <Text class="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground">{props.label}</Text>
        </View>
      ) : null}
      <Scroll
        class="flex-1"
        horizontal
        bounces={false}
        scrollbar={false}
        contentClass="flex-row items-center gap-6 py-2.5 pr-4"
        ref={(n: unknown) => {
          node = n as unknown as typeof node;
        }}
        onLayout={(bounds) => {
          viewport = bounds.size.width;
        }}
      >
        {props.items.map((item, index) => (
          <View
            class={`flex-row items-center gap-2 ${
              props.onPressItem ? "min-h-11 active:opacity-60 focus:ring-2 focus:ring-ring" : ""
            }`}
            onPress={props.onPressItem ? () => props.onPressItem?.(item, index) : undefined}
            role={props.onPressItem ? "button" : undefined}
            accessibilityLabel={props.onPressItem ? item : undefined}
            hitSlop={props.onPressItem ? 8 : undefined}
          >
            <View class="h-1.5 w-1.5 rounded-full bg-primary/60" accessibilityElementsHidden />
            <Text class="max-w-[260px] text-[13px] font-medium text-foreground" numberOfLines={1}>
              {item}
            </Text>
          </View>
        ))}
        <View
          onLayout={(bounds) => {
            contentWidth = Math.max(contentWidth, bounds.size.width);
          }}
        />
      </Scroll>
    </View>
  );
}
