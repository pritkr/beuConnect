/**
 * Wire format → the JSON strings `./packs.ts` has always exported.
 *
 * Two data sets, one shared string table:
 *
 *   · branches — every BEU branch, eight semesters of subjects;
 *   · GATE     — the syllabus sections of each GATE paper.
 *
 * The prose (subject `content`, `references` blocks, GATE section titles and
 * bodies) is 95% of the bytes, and the same paragraph is used by up to six
 * branches. So every long string is stored exactly once in `./table`, and a
 * record only carries its index. Short scalars stay inline because an index is
 * as wide as the value.
 *
 * ```
 * branch wire                        gate wire
 *   <branch name>                      <paper name>
 *   #<semester>                        <section title>|<body index>
 *   <name>|<type>|<credits>|           …
 *     <code>|<lecture>|<tutorial>|
 *     <practical>|<body index>|<refs index>|<flags>
 * ```
 *
 * · one record per line, `|` between fields — neither character occurs in the
 *   data, and `build-packs.ts` refuses to generate a wire if it ever does;
 * · `#` starts a semester, in file order;
 * · an empty numeric field means "the source had no such key", and an empty
 *   code means the same — `0` is a real value and stays;
 * · `<body index>` / `<refs index>` point into the table, `-` means absent.
 *   A `references` block is the array joined with `\n`, so it splits back;
 * · `<flags>` is `e` when the subject is an elective, empty otherwise.
 *
 * The table itself is packed: `DICT` holds the 2004 phrases that pay for
 * themselves, and every chunk is one long token stream (`./table/*.ts`). A
 * chunk is expanded the first time an index inside it is read — cheap, and it
 * keeps a phone from inflating 750 KB of prose it is not showing.
 *
 * Decoding is lazy too: `BRANCH_PACKS["cse"]` builds that branch on first read
 * and keeps the string, so the screens that only want `BRANCH_META` (home,
 * settings) never pay for it.
 */
import { DICT } from "./dict";

const SEP = "|";
const ABSENT = "-";
const ELECTIVE = "e";
/** Entry separator: `\x1f\x00` cannot occur inside a packed entry (see build-packs.ts). */
const FIELD = "\u001f\u0000";
const TOKENS = /[\u0001-\u0009]|[\u000b-\u001f][\u0020-\u007e]/g;

/** One line of a branch wire. */
function subject(f: string[], table: Lookup): Record<string, unknown> {
  const out: Record<string, unknown> = { name: f[0], type: f[1], credits: +f[2] };
  if (f[3]) out.code = f[3];
  if (f[4]) out.lecture = +f[4];
  if (f[5]) out.tutorial = +f[5];
  if (f[6]) out.practical = +f[6];
  if (f[9] === ELECTIVE) out.elective = true;
  if (f[7] !== ABSENT) out.content = table(+f[7]);
  if (f[8] !== ABSENT) out.references = table(+f[8]).split("\n");
  return out;
}

/** A code the source left blank: "-", "—" or nothing at all. */
const BLANK_CODE = /^[-\u2013\u2014]*$/;

/** A stable, readable code for a subject the source forgot to code. */
function derivedCode(name: string, type: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 22);
  const suffix = type.toLowerCase().startsWith("prac") ? "P" : "";
  return `X-${slug}${suffix === "" ? "" : `-${suffix}`}`;
}

/**
 * The site's JSON has a handful of rows with no code (a route cannot open them)
 * and a few exact duplicates. Both are fixed here, once, at the boundary — every
 * screen above this line sees a code that is present and unique per semester.
 */
function normalise(rows: unknown[]): unknown[] {
  const kept: Record<string, unknown>[] = [];
  const byCode = new Map<string, Record<string, unknown>>();
  for (const entry of rows) {
    const subject = entry as Record<string, unknown>;
    const name = typeof subject.name === "string" ? subject.name : "";
    const type = typeof subject.type === "string" ? subject.type : "";
    let code = typeof subject.code === "string" ? subject.code.trim() : "";
    if (BLANK_CODE.test(code)) code = "";
    if (code === "") code = derivedCode(name, type);
    subject.code = code;

    const existing = byCode.get(code);
    if (existing) {
      // Keep the richer of the two rather than showing one subject twice.
      if (!existing.content && subject.content) {
        existing.content = subject.content;
        if (subject.references) existing.references = subject.references;
      }
      continue;
    }
    byCode.set(code, subject);
    kept.push(subject);
  }
  return kept;
}

/** Branch wire → the `{"code","name","semesters"}` JSON the syllabus screen parses. */
export function decodeBranch(code: string, wire: string, table: Lookup): string {
  const rows = wire.split("\n");
  const semesters: Record<string, unknown[]> = {};
  let sem: unknown[] | null = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (row.charCodeAt(0) === 35 /* # */) {
      sem = [];
      semesters[row.slice(1)] = sem;
      continue;
    }
    sem?.push(subject(row.split(SEP), table));
  }
  for (const key of Object.keys(semesters)) semesters[key] = normalise(semesters[key]);
  return JSON.stringify({ code, name: rows[0], semesters });
}

/** Gate wire → `{"code","name","sections"}`. */
export function decodeGate(code: string, wire: string, table: Lookup): string {
  const rows = wire.split("\n");
  const sections: { title: string; content: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]) continue;
    const f = rows[i].split(SEP);
    sections.push({ title: f[0], content: table(+f[1]) });
  }
  return JSON.stringify({ code, name: rows[0], sections });
}

/** First line of a wire: the branch or paper name. */
export function wireName(wire: string): string {
  return wire.slice(0, wire.indexOf("\n"));
}

export type Lookup = (index: number) => string;

/**
 * Token stream → text. The alphabet is fixed by `scripts/data/wire-lib.ts`:
 * `\x01`-`\x09` are the nine best phrases, `\x0b`-`\x1f` + a printable are the
 * rest, and everything else is itself.
 */
export function unpack(blob: string): string {
  return blob.replace(TOKENS, (token) => {
    const lead = token.charCodeAt(0);
    return lead <= 9 ? DICT[lead - 1] : DICT[9 + (lead - 0x0b) * 95 + (token.charCodeAt(1) - 0x20)];
  });
}

/** Chunked packed table → `index → string`, expanding one chunk per first touch. */
export function makeTable(chunks: string[], counts: number[]): Lookup {
  const starts: number[] = [];
  const rows: (string[] | undefined)[] = [];
  let at = 0;
  for (let i = 0; i < counts.length; i++) {
    starts.push(at);
    at += counts[i];
  }
  return (index: number) => {
    let c = 0;
    while (c + 1 < starts.length && starts[c + 1] <= index) c++;
    let decoded = rows[c];
    if (!decoded) decoded = rows[c] = chunks[c].split(FIELD).map(unpack);
    return decoded[index - starts[c]];
  };
}

/**
 * Turns a `Record<string, wire>` into the `Record<string, JSON string>` the app
 * exports, decoding each entry the first time it is read.
 */
export function lazy<T>(wire: Record<string, string>, make: (key: string, wire: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(wire)) {
    let value: T | undefined;
    Object.defineProperty(out, key, {
      enumerable: true,
      get() {
        if (value === undefined) value = make(key, wire[key]);
        return value;
      },
    });
  }
  return out;
}
