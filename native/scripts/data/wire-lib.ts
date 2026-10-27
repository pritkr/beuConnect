/**
 * Shared machinery of the two data generators (`build-packs.ts`, `build-catalog.ts`).
 *
 * Data ships as *wire*: a delimited text format whose long strings live once in
 * a chunked, token-packed table, plus a small decoder at runtime. Two reasons:
 *
 * · literal characters in a source file are bytes in the app — the QuickJS
 *   atom table stores them as UTF-16, so one character of syllabus prose costs
 *   two bytes of `bundle.nshc`. The same paragraph was shipping up to six
 *   times, once per branch;
 * · the compiler does no code splitting for a native app, so every byte here is
 *   in the first frame's download.
 *
 * Token packing: the 2004 most profitable phrases of the corpus become two
 * characters (`\x01`-`\x09` alone for the top nine, then `\x0b`-`\x1f` followed
 * by `\x20`-`\x7e`). A literal newline stays a newline — `\x0a` is deliberately
 * not a token lead — and anything that would need a third byte is rejected.
 * Generated files carry literal text and nothing else, so the compiler folds
 * each into a single string constant.
 */

/** Escape the three things a template literal cannot hold verbatim. */
export function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** Template-literal source for `text`, with control characters spelled `\xNN`. */
export function literal(text: string): string {
  return esc(text).replace(/[\u0000-\u0009\u000b-\u001f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/** Owners are branch codes and `gate`; chunk files are named after them. */
export type Owner = string;

export interface Entry {
  value: string;
  owner: Owner;
}

/**
 * Insertion-ordered, deduplicated table of long strings.
 *
 * The index it hands out is what the wire stores, so the order is part of the
 * format: entries are appended as they are first met, walking branches in
 * `BRANCH_META` order and then the GATE papers. A branch's entries therefore
 * stay contiguous, which is what lets `chunk` cut the table by owner.
 */
export class Table {
  readonly entries: Entry[] = [];
  private readonly index = new Map<string, number>();

  add(value: string, owner: Owner): number {
    const seen = this.index.get(value);
    if (seen !== undefined) return seen;
    const at = this.entries.length;
    this.entries.push({ value, owner });
    this.index.set(value, at);
    return at;
  }

  /** `owner-n` groups, each holding at most `limit` characters of prose. */
  chunk(limit: number): { name: string; owner: Owner; from: number; to: number }[] {
    const chunks: { name: string; owner: Owner; from: number; to: number }[] = [];
    const seq: Record<string, number> = {};
    let from = 0;
    let chars = 0;
    const flush = (to: number) => {
      const owner = this.entries[from].owner;
      seq[owner] = (seq[owner] ?? 0) + 1;
      chunks.push({ name: `${owner}-${seq[owner]}`, owner, from, to });
    };
    for (let i = 0; i < this.entries.length; i++) {
      const { owner, value } = this.entries[i];
      if (i > from && (owner !== this.entries[from].owner || chars + value.length > limit)) {
        flush(i);
        from = i;
        chars = 0;
      }
      chars += value.length + 1;
    }
    if (from < this.entries.length) flush(this.entries.length);
    return chunks;
  }
}

// ── token packing ───────────────────────────────────────────────────────────

/** Entry separator inside a chunk. `\x1f` never ends a token and `\x00` never appears in the prose. */
export const SEPARATOR = "\u001f\u0000";
export const SINGLE_TOKENS = 9;
export const PAIRS_PER_LEAD = 95;
export const LEADS = 21;
export const MAX_TOKENS = SINGLE_TOKENS + LEADS * PAIRS_PER_LEAD; // 2004

/** `\x01`…`\x09`, then `\x0b`…`\x1f` + one printable character. */
export function tokenCode(i: number): string {
  if (i < SINGLE_TOKENS) return String.fromCharCode(1 + i);
  const j = i - SINGLE_TOKENS;
  return String.fromCharCode(0x0b + Math.floor(j / PAIRS_PER_LEAD), 0x20 + (j % PAIRS_PER_LEAD));
}

const WORD = /[A-Za-z]+|\d+(?:\.\d+)?|[^A-Za-z0-9]+/g;

/**
 * The phrases worth a token: 1–5 words with their exact separators, ranked by
 * `(length - 2) * count` — what the token saves in the corpus minus its own
 * cost in the dictionary.
 */
export function rankPhrases(corpus: string, max: number): string[] {
  const spans: { start: number; end: number }[] = [];
  for (const m of corpus.matchAll(WORD)) spans.push({ start: m.index!, end: m.index! + m[0].length });

  const counts = new Map<string, number>();
  for (let i = 0; i < spans.length; i++) {
    for (let n = 1; n <= 5 && i + n - 1 < spans.length; n++) {
      const start = spans[i].start;
      const len = spans[i + n - 1].end - start;
      if (len > 48) break;
      if (len <= 2) continue; // a token would not make it smaller
      const phrase = corpus.slice(start, start + len);
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([phrase, count]) => ({ phrase, gain: (phrase.length - 2) * count - phrase.length }))
    .filter((c) => c.gain > 0)
    .sort((a, b) => b.gain - a.gain || a.phrase.length - b.phrase.length)
    .slice(0, max)
    .map((c) => c.phrase);
}

/** Corpus → token stream. Greedy longest match, so a phrase beats its parts. */
export function pack(corpus: string, dict: string[]): string {
  const trie = new Map<string, unknown>();
  for (let i = 0; i < dict.length; i++) {
    let node = trie;
    for (const ch of dict[i]) {
      let next = node.get(ch) as Map<string, unknown> | undefined;
      if (!next) node.set(ch, (next = new Map()));
      node = next;
    }
    node.set("", i);
  }

  const parts: string[] = [];
  let i = 0;
  while (i < corpus.length) {
    let node = trie;
    let best = -1;
    let width = 0;
    for (let j = i; j < corpus.length; j++) {
      const next = node.get(corpus[j]) as Map<string, unknown> | undefined;
      if (!next) break;
      node = next;
      const hit = node.get("");
      if (hit !== undefined) {
        best = hit as number;
        width = j - i + 1;
      }
    }
    if (best >= 0) {
      parts.push(tokenCode(best));
      i += width;
    } else {
      const code = corpus.charCodeAt(i);
      if (code < 0x20 && code !== 0x0a) throw new Error(`control character U+00${code.toString(16).padStart(2, "0")} in the corpus`);
      parts.push(corpus[i]);
      i++;
    }
  }
  return parts.join("");
}

/** The decoder's half: `decode.ts` unpacks with the same alphabet. */
export function renderDict(dict: string[], target = "decode.ts"): string {
  return `/* eslint-disable */
/**
 * The token dictionary: \`${target}\` expands each entry when it unpacks a chunk.
 * Ranked by what each phrase saves, so the first ${SINGLE_TOKENS} cost one character and the rest two.
 * Generated by \`scripts/data/build-packs.ts\`.
 */
export const DICT: string[] = [
${dict.map((p) => `  \`${literal(p)}\`,`).join("\n")}
];
`;
}

/**
 * Renders one `table/<name>.ts`: the chunk's entries joined by a separator and
 * packed. `COUNT` is what lets the decoder find an index inside the chunk.
 */
export function renderChunk(chunk: { name: string; from: number; to: number }, blob: string, note: string): string {
  return `/* eslint-disable */
/** ${note} */
export const ${symbol(chunk.name)} = \`${literal(blob)}\`;
export const ${symbol(chunk.name)}_COUNT = ${chunk.to - chunk.from};
`;
}

/** `cse-1` → `CHUNK_cse_1`, a stable identifier for the chunk module. */
export function symbol(name: string): string {
  return `CHUNK_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
}
