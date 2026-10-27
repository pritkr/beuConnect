/**
 * One "Ask AI" control: the button and the handoff.
 *
 * There is no in-app provider menu. The system chooser is better than one we
 * could build: it lists every assistant the student has installed — Claude,
 * ChatGPT, Gemini, DeepSeek — in the order they use them, and a new app shows
 * up the day it is installed. The prompt travels in the intent, so the chosen
 * app opens with the question already in its composer.
 *
 * The component itself is mounted once, in the shell (`AskAiBridge`): a card
 * that shows ten questions must not mount ten invisible native views. Asking
 * is a module call, so any screen can offer it without knowing where it lives.
 */

import { Clipboard, Text, View, nativeComponent, platform, signal, type YNode } from "nsh";

import { webAskLink } from "../lib/ask-ai";
import { openExternal } from "../lib/link";
import { Icon } from "./icons";

interface AskAiEvents {
  opened: { app: string };
  fallback: { app: string };
  fail: { message: string };
}

const AskAiHost = nativeComponent<object, AskAiEvents>("AskAi", {
  props: [],
  events: ["opened", "fallback", "fail"],
});

type Outcome = "opened" | "fallback" | "failed";

/** The host, while it is mounted: one sender and one waiting screen. */
const bridge: {
  send: ((prompt: string) => void) | null;
  settle: ((outcome: Outcome) => void) | null;
} = { send: null, settle: null };

/**
 * Mount once, at the root. The zero-sized view is where the Android intent
 * lives; events resolve the screen that asked.
 */
export function AskAiBridge() {
  if (platform.os !== "android") return null;
  let host: YNode | null = null;

  const settle = (outcome: Outcome): void => {
    const waiting = bridge.settle;
    bridge.settle = null;
    if (waiting) waiting(outcome);
  };

  return (
    <AskAiHost
      style={{ width: 0, height: 0 }}
      ref={(element: YNode) => {
        host = element;
        bridge.send = (prompt: string) => host?.command("open", { prompt });
      }}
      onOpened={() => settle("opened")}
      onFallback={() => settle("fallback")}
      onFail={() => settle("failed")}
    />
  );
}

/**
 * Hand a prompt to the system chooser. Resolves with what happened so the
 * caller can say it once: opened, copied with the web assistant, or nothing
 * could take it.
 */
export async function askWithAi(prompt: string): Promise<Outcome> {
  if (platform.os === "android" && bridge.send !== null) {
    return new Promise<Outcome>((resolve) => {
      bridge.settle = resolve;
      bridge.send?.(prompt);
    });
  }

  // No native chooser: the prompt goes to the clipboard and a web assistant
  // that takes it in the address opens. The copy is the safety net for a
  // browser that drops the query.
  let copied = false;
  try {
    await Clipboard.writeText(prompt);
    copied = true;
  } catch {
    // A browser that cannot take the prompt still opens; the student retypes.
  }
  if (await openExternal(webAskLink(prompt))) return "opened";
  return copied ? "fallback" : "failed";
}

/**
 * One row: the action, and nothing to decide before it.
 *
 * Asking is one tap. The OS chooser owns the choice of assistant, so the row
 * never grows, never reflows a topic, and never needs a menu of its own.
 */
export function AskAi(props: { prompt: string; class?: string }) {
  const working = signal(false);
  const note = signal("");

  const ask = async (): Promise<void> => {
    if (working()) return;
    working.set(true);
    note.set("");
    const outcome = await askWithAi(props.prompt);
    working.set(false);
    if (outcome === "fallback") note.set("Prompt copied — paste it in");
    if (outcome === "failed") note.set("Could not open an AI app");
  };

  return (
    <View class={props.class}>
      <View
        class={`min-h-11 flex-row items-center gap-2 rounded-xl px-1 active:bg-muted ${
          working() ? "opacity-50" : ""
        }`}
        onPress={() => void ask()}
        role="button"
        accessibilityLabel="Ask AI"
        accessibilityState={{ disabled: working() }}
      >
        <Icon name="bot" size={17} class="text-primary-ink" />
        <Text class="flex-1 text-[13px] font-semibold text-primary-ink">Ask AI</Text>
        <Icon name="chevron-right" size={15} class="text-muted-foreground" />
      </View>

      {() => (note() === "" ? null : <Text class="mt-1 text-[11px] text-muted-foreground">{() => note()}</Text>)}
    </View>
  );
}
