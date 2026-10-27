/**
 * Syllabus — what a topic can do beyond being read.
 *
 * Two actions, both real, neither invented by us:
 *
 *  - **Short note** opens the paper's VVI sheet, and it exists only when the
 *    notes manifest actually carries VVI topics for this exact code. The
 *    manifest is read from the notes cache first, so a student who has opened
 *    Notes once gets the action instantly and offline; the network is asked
 *    only when there is no copy at all, and a failure hides the action rather
 *    than promising a note we do not have.
 *  - **YouTube** hands a search for "<paper> <topic>" to the device's browser.
 *    There is no in-app player and no scraped result: the search page is the
 *    honest answer when the app does not host the lecture. When no browser
 *    takes it, the link is copied and the row says so, once.
 *
 * `Ask AI` is not duplicated here: the shell already ships one (ui/ask-ai),
 * which hands the prompt to an installed assistant or a real web assistant and
 * never writes an answer itself.
 *
 * Storage: nothing. A confirmation is session-only, keyed by the topic it was
 * said under, so two open topics cannot wear each other's message.
 */

import { Clipboard, Text, View, cleanup, signal } from "nsh";
import { Btn, Row } from "../../ui";
import { getCache } from "../../lib/net";
import { openExternal } from "../../lib/link";
import { NOTES_CACHE_KEY, loadNotes, parseManifest, type NotesManifest } from "../notes/data";
import type { Topic } from "./parse";

/* ------------------------------------------------------------- search link */

/** The YouTube search for one topic of one paper. */
export function youtubeUrl(subject: string, topic: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${subject} ${topic}`)}`;
}

/* ----------------------------------------------------------------- manifest */

/** `branch|sem|code` for every subject the manifest gives at least one VVI topic. */
function vviKeys(manifest: NotesManifest): Set<string> {
  const keys = new Set<string>();
  for (const subject of manifest.subjects) {
    if (subject.vvi.length > 0) keys.add(`${subject.branch}|${subject.sem}|${subject.code}`);
  }
  return keys;
}

/**
 * The VVI-bearing papers, `null` until the first read settles. A miss is an
 * empty set, not an error: "we could not check" and "there is no note" both
 * mean the action is not offered, and the topic row gains nothing by saying so.
 */
const vvi = signal<Set<string> | null>(null);

let reading: Promise<void> | null = null;
let started = false;

async function readManifest(): Promise<void> {
  if (reading) return reading;
  reading = (async () => {
    // A copy of any age still answers "does this paper have VVI topics"; the
    // notes screen is the one that refreshes it.
    const cached = await getCache(NOTES_CACHE_KEY, 0);
    if (cached) {
      vvi.set(vviKeys(parseManifest(cached)));
      return;
    }
    const result = await loadNotes();
    vvi.set(vviKeys(result.manifest));
  })()
    .catch(() => vvi.set(new Set<string>()))
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** Reads the manifest the first time a topic row is drawn, and never again. */
function ensureManifest(): void {
  if (started) return;
  started = true;
  void readManifest();
}

/** True when this exact paper has VVI topics. Reads a signal: call it in JSX. */
export function hasShortNote(branch: string, sem: number, code: string): boolean {
  return vvi()?.has(`${branch}|${sem}|${code}`) === true;
}

/* -------------------------------------------------------------------- copy */

/** Copies text, answering whether it reached the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** What a topic's copy action puts on the clipboard: the paper, then the words. */
export function topicText(subject: string, sem: number, code: string, topic: Topic): string {
  const head = `${topic.title} — ${subject} (${code}, sem ${sem})`;
  const body = topic.body.trim();
  return body === "" ? head : `${head}\n\n${body}`;
}

/* ------------------------------------------------------------------- notes */

/** The last thing an action said, and the topic it said it under. */
const said = signal<{ key: string; text: string } | null>(null);

/** A confirmation lives under three seconds; a topic closed sooner takes it with it. */
const NOTE_MS = 2600;

/* ------------------------------------------------------------------- row */

/**
 * The action row inside an open topic. `onShortNote` is the paper's VVI sheet;
 * it is offered only when `hasShortNote` says the manifest carries one, so the
 * button is never a door to an empty screen.
 */
export function TopicActions(props: {
  branch: string;
  sem: number;
  code: string;
  /** The paper's name, for the search and for the spoken labels. */
  name: string;
  topic: Topic;
  /** `branch|sem|code|topicId`: what a confirmation is said under. */
  markKey: string;
  onShortNote: () => void;
}) {
  ensureManifest();

  // The row owns its confirmation timer: closing the topic (or leaving the
  // paper) cancels it, so a late tick cannot write into a screen that is gone.
  // The message itself is keyed, so a stale one can never appear under another
  // topic; it expires on its own in under three seconds.
  let timer: ReturnType<typeof setTimeout> | undefined;
  cleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  const say = (text: string): void => {
    if (timer !== undefined) clearTimeout(timer);
    said.set({ key: props.markKey, text });
    timer = setTimeout(() => {
      timer = undefined;
      if (said()?.key === props.markKey && said()?.text === text) said.set(null);
    }, NOTE_MS);
  };

  const openVideo = async (): Promise<void> => {
    const url = youtubeUrl(props.name, props.topic.title);
    if (await openExternal(url)) return;
    const copied = await copyText(url);
    say(copied ? "No browser took the link; it is on the clipboard." : "No browser took the link.");
  };

  const copy = async (): Promise<void> => {
    const copied = await copyText(topicText(props.name, props.sem, props.code, props.topic));
    say(copied ? "Copied." : "Could not reach the clipboard.");
  };

  return (
    <View class="gap-1">
      <Row class="flex-wrap items-center gap-1">
        {() =>
          hasShortNote(props.branch, props.sem, props.code) ? (
            <Btn
              variant="link"
              class="min-h-11 px-1.5"
              label={`Short note for ${props.name}`}
              onPress={props.onShortNote}
            >
              Short note
            </Btn>
          ) : null
        }
        <Btn
          variant="link"
          class="min-h-11 px-1.5"
          label={`Search YouTube for ${props.topic.title}`}
          onPress={() => void openVideo()}
        >
          YouTube
        </Btn>
        <Btn
          variant="link"
          class="min-h-11 px-1.5"
          label={`Copy ${props.topic.title}`}
          onPress={() => void copy()}
        >
          Copy
        </Btn>
      </Row>
      {() => {
        const note = said();
        return note !== null && note.key === props.markKey ? (
          <Text class="text-[11px] text-muted-foreground" android={{ accessibilityLiveRegion: "polite" }}>
            {note.text}
          </Text>
        ) : null;
      }}
    </View>
  );
}
