/**
 * Syllabus text → units → topics.
 *
 * The site ships one text blob per subject ("Unit- 1.0", numbered topics,
 * hours). That is fine for a web page and useless on a phone: students want a
 * tappable list, one topic at a time, with progress. This parser is tolerant of
 * the shapes BEU actually uses (Unit / Module / Part headings, 1. / 1) / (1)
 * numbering, "2 hrs" annotations) and never throws: anything it cannot split
 * becomes a single honest topic instead of disappearing.
 *
 * Two rules matter more than neatness here:
 *  - the split must never merge or drop a topic the source named, so the unit
 *    and topic counts stay the same as the PDF, and
 *  - a topic's title must be readable on a 320 pt phone. When the source writes
 *    a whole paragraph as an unnumbered topic, we lift its first clause into
 *    the title and keep every remaining word in `body`.
 */

export interface Topic {
  /** Stable within a subject: `t2`. */
  id: string;
  title: string;
  body: string;
  /** "2 hrs" when the source annotated one. */
  hours: string | null;
}

export interface Unit {
  id: string;
  /** The part after the "Unit 1" heading, e.g. "Digital Logic". May be "". */
  title: string;
  topics: Topic[];
  /** The hours printed on the unit heading, when the source printed them. */
  hours: string | null;
}

export interface Subject {
  name: string;
  type: string;
  credits: number;
  code: string;
  lecture?: number;
  tutorial?: number;
  practical?: number;
  content: string;
  references?: string[];
  elective?: boolean;
}

export interface BranchPack {
  code: string;
  name: string;
  semesters: Record<string, Subject[]>;
}

export interface GatePack {
  code: string;
  name: string;
  sections: { title: string; content: string }[];
}

/**
 * The words BEU prints above a unit, spelled out one letter at a time: the
 * regex has no `/i` flag on purpose, because the roman numerals `I`, `V`, `X`,
 * `C`, `D`, `L`, `M` are ordinary letters too and "unit. Instruction …" must
 * never read as "Unit I".
 */
const UNIT_WORD = "[Uu][Nn][Ii][Tt]|[Mm][Oo][Dd][Uu][Ll][Ee]|[Pp][Aa][Rr][Tt]|[Ss][Ee][Cc][Tt][Ii][Oo][Nn]";
const UNIT_NUMBER = "\\d{1,2}(?:\\.\\d+)?[A-Za-z]?|[ivxlcdmIVXLCDM]+";

const UNIT_RE = new RegExp(
  `^\\s*(${UNIT_WORD})\\s*[-–:.]?\\s*(${UNIT_NUMBER})(?![A-Za-z])(?=[\\s:.;–—-]|$)\\s*[.:–-]?\\s*(.*)$`,
);
const HOURS_RE =
  /\(\s*(\d+(?:\.\d+)?)\s*(hrs?|hours?|periods?|lectures?)\s*\)|\b(\d+(?:\.\d+)?)\s*(hrs?|hours?|periods?|lectures?)\b/i;

/** A label line ("Detailed contents:") that names the block, not a topic. */
const CAPTION_RE = /^(?:detailed\s+|course\s+)?(?:contents?|syllabus)\s*:?$/i;

/** The longest unit heading that reads as a heading on a 320 pt phone. */
const HEADING_MAX = 64;

function tidy(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  // Cut on a word, not inside one, unless that would throw away most of the row.
  const space = cut.lastIndexOf(" ");
  const kept = space > max / 2 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

/** Reads the "7 hrs" of a unit heading and removes it from the heading text. */
function hoursLabel(match: RegExpExecArray): string {
  const value = match[1] ?? match[3] ?? "";
  const word = (match[2] ?? match[4] ?? "hrs").toLowerCase();
  const unit = word.startsWith("lecture") ? "lectures" : word.startsWith("period") ? "periods" : "hrs";
  return `${value} ${unit}`;
}

interface Heading {
  title: string;
  hours: string | null;
  /** The unit's content when the source wrote it on the heading line itself. */
  inline: string;
}

function headingOf(rest: string): Heading {
  const match = HOURS_RE.exec(rest);
  const hours = match ? hoursLabel(match) : null;
  const text = tidy(rest.replace(HOURS_RE, ""))
    .replace(/^[\s:;,.–—-]+/, "")
    .replace(/[\s:;,.–—-]+$/, "")
    // A page number often survives a PDF copy-paste at the head of a heading
    // ("Module 4 1 Sequential Circuit Blocks"). It is not part of the title.
    .replace(/^\d{1,3}\s+(?=[A-Z])/, "");
  if (!text) return { title: "", hours, inline: "" };
  const split = splitHeading(text);
  return { title: split.title, hours, inline: split.inline };
}

/**
 * A unit heading can carry the unit's whole topic list on the same line
 * ("Module 1 Digital Principle: Analog Vs Digital, Number System, …"). What
 * names the unit is the head; everything after it is content, and content
 * dropped along with the heading is the syllabus silently losing topics.
 */
function splitHeading(text: string): { title: string; inline: string } {
  if (text.length <= HEADING_MAX) return { title: text, inline: "" };

  for (const separator of [": ", " – ", " — ", " - ", "; "]) {
    const at = text.indexOf(separator);
    if (at < 3 || at > HEADING_MAX) continue;
    const inline = tidy(text.slice(at + separator.length));
    if (inline.split(/\s+/).length < 3) continue;
    return { title: tidy(text.slice(0, at)), inline };
  }

  // No separator: the line is already prose. Keep every word in the body and
  // take the readable head of it as the heading.
  return { title: deriveTitle(text) || shorten(text, HEADING_MAX), inline: text };
}

/**
 * A unit heading the source wrote mid-line — "… control unit. Unit 2 Data
 * representation …" — still names a unit. The break the PDF lost is put back,
 * so a paper that arrives as one long line splits into units anyway. "part" and
 * "section" only count with a digit: prose says "Part III of the Constitution",
 * and that is a reference, not a heading. "unit" and "module" may carry a roman
 * numeral ("MODULE-I") or a decimal number ("Unit- 1.0").
 */
const INLINE_UNIT_RE = new RegExp(`\\b(${UNIT_WORD})[\\s\\-–—:.]*?(${UNIT_NUMBER})(?![A-Za-z])`, "g");

function isHeadingNumber(word: string, number: string): boolean {
  const lower = word.toLowerCase();
  if (lower === "part" || lower === "section") return /^\d/.test(number);
  return true;
}

/** True when the text after a heading number reads as a heading, not prose. */
function headingFollows(text: string, end: number): boolean {
  const rest = text.slice(end).replace(/^\s+/, "");
  if (rest === "") return true;
  return /^[A-Z0-9(:\-–—]/.test(rest);
}

/** Inserts the line breaks the source lost before unit headings written mid-line. */
function breakUnits(text: string): string {
  let out = "";
  let at = 0;
  INLINE_UNIT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_UNIT_RE.exec(text)) !== null) {
    const word = match[1] ?? "";
    const number = match[2] ?? "";
    if (!isHeadingNumber(word, number)) continue;
    // "/i" would make the uppercase check below match lowercase letters, so
    // the word after a roman numeral is judged by `headingFollows`, not a
    // regex class: "control unit. Instruction" is prose, not "Unit I".
    if (!headingFollows(text, match.index + match[0].length)) continue;
    const start = match.index;
    const before = start > 0 ? text[start - 1] : "\n";
    // A heading already at the head of a line needs no break; a heading glued
    // to a word ("sub-unit") is not a heading at all.
    if (before === "\n" || !/[\s.;:!?)\]]/.test(before)) continue;
    out += `${text.slice(at, start).replace(/[ \t]+$/, "")}\n`;
    at = start;
  }
  return at === 0 ? text : `${out}${text.slice(at)}`;
}

interface Mark {
  at: number;
  end: number;
  value: number;
}

/**
 * The numbered-topic markers in `text` that form a counting run: 1, 2, 3 …
 * A number in the middle of a line only starts a run at 1, and a lone mid-line
 * number is prose ("Fig. 1. The reading …"), not a list, so it is ignored.
 * Semicolons, commas and "(2 hrs)" inside a topic do not interrupt the run.
 */
function topicMarks(text: string): Mark[] {
  const marks: Mark[] = [];
  const pattern = /(?:\(\s*)?(\d{1,2})\s*[.)]\s+/g;
  let want: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const at = match.index;
    const value = Number(match[1]);
    if (at > 0 && !/[\s.;:!?)\]]/.test(text[at - 1])) continue;
    const rest = text.slice(at + match[0].length);
    if (!rest.trim()) continue;
    if (want === null) {
      // A number mid-line only starts a run at 1, and its topic opens with a
      // capital ("Fig. 1. The …" is prose, not a list). A number at the start
      // of a line may be any value and any case ("10. a. Insert …").
      if (at > 0 && (value !== 1 || !/^[A-Z0-9(]/.test(rest))) continue;
      want = value;
    } else if (value !== want) {
      continue;
    }
    marks.push({ at, end: at + match[0].length, value });
    want = value + 1;
  }
  if (marks.length === 1 && marks[0].at > 0) return [];
  return marks;
}

/** One line → its numbered topics, plus any unnumbered head it opened with. */
function lineItems(line: string): { number: number | null; text: string }[] {
  const marks = topicMarks(line);
  if (!marks.length) return [{ number: null, text: tidy(line) }];
  const items: { number: number | null; text: string }[] = [];
  const head = tidy(line.slice(0, marks[0].at));
  if (head) items.push({ number: null, text: head });
  marks.forEach((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].at : line.length;
    items.push({ number: mark.value, text: tidy(line.slice(mark.end, end)) });
  });
  return items;
}

/**
 * A unit heading can share its line with the first numbered topics when the
 * source arrived as one line. The heading ends where the numbering starts.
 */
function splitHeadingBody(rest: string): { head: string; body: string } {
  const marks = topicMarks(rest);
  if (!marks.length) return { head: rest, body: "" };
  return { head: rest.slice(0, marks[0].at), body: rest.slice(marks[0].at) };
}

/** Splits one subject's `content` into units of topics. */
export function parseSyllabus(content: string): Unit[] {
  const raw = breakUnits((content ?? "").replace(/\r\n?/g, "\n").trim());
  if (!raw) return [];

  interface Block {
    title: string;
    hours: string | null;
    inline: string;
    /** True for a block the source opened with a "Unit n" heading. */
    explicit: boolean;
    lines: string[];
  }

  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const unit = UNIT_RE.exec(line);
    // "Part III of the Constitution" is prose about a document, not a syllabus
    // heading. The same rule `breakUnits` applies mid-line applies here.
    if (unit && isHeadingNumber(unit[1] ?? "", unit[2] ?? "")) {
      const parts = splitHeadingBody(unit[3] ?? "");
      const heading = headingOf(parts.head);
      // "Unit- 1.0" names no topic, only a number. A unit with no descriptive
      // heading is still titled by that number instead of rendering a blank
      // heading — the screens show the title as the section label.
      const word = (unit[1] ?? "Unit").toLowerCase();
      const number = (unit[2] ?? "").trim().replace(/\.0+$/, "");
      const title = heading.title || `${word.charAt(0).toUpperCase()}${word.slice(1)}${number ? ` ${number}` : ""}`;
      current = {
        title,
        hours: heading.hours,
        inline: heading.inline,
        explicit: true,
        lines: parts.body ? [parts.body] : [],
      };
      blocks.push(current);
      continue;
    }
    if (!current) {
      current = { title: "Course content", hours: null, inline: "", explicit: false, lines: [] };
      blocks.push(current);
    }
    current.lines.push(line);
  }

  const units: Unit[] = [];
  for (const block of blocks) {
    const topics = [...inlineTopics(block.inline), ...splitTopics(block.lines.join("\n"), block.explicit)];
    // "Detailed contents:" is a caption the source printed above the units, not
    // a topic. Everything else is kept, even a unit whose topics are all on the
    // heading line: a hidden unit reads like a shorter syllabus.
    // "Detailed contents: 3" is a caption and a page number the source printed
    // above the units, not a topic. A caption that carries real prose is kept:
    // dropping text is worse than showing a heading twice.
    if (
      !block.explicit &&
      topics.length === 1 &&
      CAPTION_RE.test(tidy(topics[0].title)) &&
      /^\d{0,3}$/.test(tidy(topics[0].body))
    ) {
      continue;
    }
    if (!topics.length && !block.explicit) continue;
    const id = `u${units.length + 1}`;
    units.push({
      id,
      title: block.title,
      hours: block.hours,
      topics: topics.map((topic, topicIndex) => ({ ...topic, id: `${id}-t${topicIndex + 1}` })),
    });
  }

  return units;
}

/**
 * The content a heading carried with it. It is prose or a comma list, so it is
 * split by sentence and, when a sentence is a plain list of short items, by
 * item: each becomes a topic a student can tick, and every word of the source
 * stays in a title or a body.
 */
function inlineTopics(text: string): { title: string; body: string; hours: string | null }[] {
  const clean = tidy(text);
  if (!clean) return [];
  const out: { title: string; body: string; hours: string | null }[] = [];
  for (const sentence of splitSentences(clean)) {
    const items = listItems(sentence);
    if (items) {
      for (const item of items) {
        // A long item is cut for the row, but its words stay in the body.
        out.push({ title: shorten(item, 72), body: item.length > 72 ? item : "", hours: null });
      }
      continue;
    }
    const title = deriveTitle(sentence);
    out.push({ title: title || shorten(sentence, 72), body: sentence, hours: null });
  }
  return out;
}

/**
 * Sentences end at ". " / "; " / "? " followed by a capital, digit or bracket.
 * A PDF that lost the space after a full stop ("… microscopes.Tensile test")
 * is repaired first, so that sentence is still its own topic.
 */
function splitSentences(text: string): string[] {
  return text
    .replace(/([a-z])\.(?=[A-Z][a-z])/g, "$1. ")
    .split(/(?<=[.;!?])\s+(?=[A-Z0-9(])/)
    // A PDF bullet that survived as a lone "." at the head of a line is not a
    // sentence: without this, ". Introduction: …" yields a topic titled ".".
    .map((part) => tidy(part).replace(/^[.;:,\s·•\-–—]+/, ""))
    // A bare page number that survived the PDF ("… (FPGA). 9") is not a topic.
    .filter((part) => part !== "" && !/^\d{1,3}$/.test(part));
}

/**
 * One line that starts lowercase is the tail of the line above — a PDF line
 * wrap, not a new topic — so it is joined back. Every other line stands alone.
 */
function paragraphsOf(text: string): string[] {
  const paragraphs: string[] = [];
  for (const line of text.split("\n")) {
    const clean = tidy(line);
    if (!clean) continue;
    const previous = paragraphs[paragraphs.length - 1];
    if (previous !== undefined && /^[a-z(“"'(]/.test(clean)) paragraphs[paragraphs.length - 1] = `${previous} ${clean}`;
    else paragraphs.push(clean);
  }
  return paragraphs;
}

/**
 * An unnumbered topic is a whole sentence. Its first clause becomes the row
 * title, and the rest of the sentence — never a word of it less — becomes the
 * body that expands under it.
 */
function sentenceTopic(text: string, index: number): Topic {
  const clean = tidy(text);
  const hoursMatch = HOURS_RE.exec(clean);
  const hours = hoursMatch ? hoursLabel(hoursMatch) : null;
  const title = deriveTitle(clean) || shorten(clean, 64);
  // When the title is the whole sentence (or a shortened copy of it) the body
  // keeps the full text; otherwise it keeps the clause the title did not take.
  const rest = title.endsWith("…") || title.length >= clean.length ? clean : tidy(clean.slice(title.length)).replace(/^[\s:;,.\-–—]+/, "");
  return { id: `t${index + 1}`, title, body: rest, hours };
}

/**
 * A unit body arrives three ways: numbered (one line or many, `1.` / `1)` /
 * `(1)`), one long paragraph with no numbers at all, or a handful of lines with
 * no numbers. Numbering is the strongest signal, so when it exists an
 * unnumbered line is the detail of the topic above it. With no numbering in an
 * explicit unit, each sentence is a topic. A block the source never split into
 * units stays one honest topic — nothing is invented where the source names
 * nothing.
 */
function splitTopics(text: string, explicit: boolean): Topic[] {
  const seeds: { number: number | null; text: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    seeds.push(...lineItems(line));
  }

  const numbered = seeds.some((seed) => seed.number !== null);
  if (!numbered) {
    const whole = tidy(text);
    if (!whole) return [];
    if (!explicit) return [sentenceTopic(whole, 0)];
    const topics: Topic[] = [];
    for (const paragraph of paragraphsOf(text)) {
      for (const sentence of splitSentences(paragraph)) topics.push(sentenceTopic(sentence, topics.length));
    }
    return topics;
  }

  const grouped: { title: string; body: string[] }[] = [];
  for (const seed of seeds) {
    if (seed.number !== null) grouped.push({ title: seed.text, body: [] });
    else if (grouped.length) grouped[grouped.length - 1].body.push(seed.text);
    else grouped.push({ title: seed.text, body: [] });
  }

  return grouped.map((topic, index) => {
    const bodyText = tidy(topic.body.join("\n"));
    const titleText = tidy(topic.title);
    const hoursMatch = HOURS_RE.exec(`${titleText} ${bodyText}`);
    const hours = hoursMatch ? hoursLabel(hoursMatch) : null;
    const cleanTitle = stripHours(titleText);

    if (cleanTitle) {
      const split = splitLongTitle(cleanTitle);
      return {
        id: `t${index + 1}`,
        title: split.title,
        body: tidy(`${split.rest} ${bodyText}`),
        hours,
      };
    }

    // A numbered line whose text was only an hours note: the body still names
    // the topic, so lift its first clause rather than showing an empty row.
    return sentenceTopic(bodyText, index);
  });
}

/**
 * A plain comma list — "Analog Vs Digital, Number System, Computer Codes, …" —
 * names separate topics, so each item becomes one. A sentence with long
 * clauses stays a single topic: a fragment is worse than a paragraph.
 */
function listItems(sentence: string): string[] | null {
  const items = sentence
    .split(",")
    .map((item) => tidy(item).replace(/^[\s.·•\-–—:;]+/, "").replace(/[\s:;,.–—-]+$/, ""))
    .filter(Boolean);
  if (items.length < 4) return null;
  const short = items.filter((item) => item.length >= 2 && item.length <= 48).length;
  if (short / items.length < 0.8) return null;
  if (items.some((item) => /\.\s/.test(item))) return null;
  return items;
}

/**
 * A numbered topic can be a whole paragraph. Keep the readable head as the
 * title and move the tail into the body, so nothing is lost when it expands.
 */
function splitLongTitle(title: string): { title: string; rest: string } {
  if (title.length <= 84) return { title, rest: "" };
  const separators = [": ", " — ", " – ", "; ", ", "];
  for (const separator of separators) {
    const at = title.indexOf(separator);
    if (at >= 12 && at <= 72) {
      return { title: tidy(title.slice(0, at)), rest: tidy(title.slice(at + separator.length)) };
    }
  }
  return { title, rest: "" };
}

function stripHours(title: string): string {
  return tidy(title.replace(HOURS_RE, ""))
    .replace(/^[\s:;,.–—-]+/, "")
    .replace(/[\s:;,.–—-]+$/, "");
}

/** The first clause of a paragraph, short enough for a 320 pt row. */
function deriveTitle(text: string): string {
  const clean = text.replace(/^[\s.·•\-–—:;,]+/, "").trim();
  if (!clean) return "";
  const sentence = clean.split(/(?<=[.?!])\s/)[0] ?? clean;
  const colon = sentence.indexOf(":");
  const head = colon >= 4 ? sentence.slice(0, colon) : sentence;
  const comma = head.indexOf(", ");
  const base = comma >= 8 ? head.slice(0, comma) : head;
  return shorten(tidy(base).replace(/\.$/, "").replace(/[\s:;,–—-]+$/, ""), 64);
}

/** GATE sections ("Section 1: Engineering Mathematics") → topics per keyword. */
export function parseGate(pack: GatePack): Unit[] {
  return pack.sections.map((section, index) => {
    const unitId = `u${index + 1}`;
    return {
      id: unitId,
      title: section.title,
      hours: null,
      topics: splitGate(section.content).map((topic, topicIndex) => ({
        ...topic,
        id: `${unitId}-t${topicIndex + 1}`,
      })),
    };
  });
}

const GATE_KEY_RE = /([A-Z][A-Za-z0-9 ,&()/+.-]{2,64}):\s/g;

function splitGate(content: string): Topic[] {
  const text = tidy(content);
  const matches: { title: string; start: number; end: number }[] = [];
  GATE_KEY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GATE_KEY_RE.exec(text)) !== null) {
    matches.push({ title: tidy(match[1]), start: match.index, end: match.index + match[0].length });
  }

  if (!matches.length) {
    return [{ id: "t1", title: "Overview", body: text, hours: null }];
  }

  const topics: Topic[] = [];
  matches.forEach((entry, index) => {
    const next = matches[index + 1];
    const body = text.slice(entry.end, next ? next.start : text.length).replace(/^[.;\s]+/, "").trim();
    topics.push({ id: `t${index + 1}`, title: entry.title, body, hours: null });
  });
  return topics;
}

/** A rough study-time estimate: 1 hour per annotated hour, else 25 min/topic. */
export function estimateMinutes(units: Unit[]): number {
  return units.reduce(
    (sum, unit) =>
      sum +
      unit.topics.reduce((topicSum, topic) => {
        if (topic.hours) {
          const value = Number(topic.hours.replace(/[^0-9.]/g, ""));
          if (Number.isFinite(value) && value > 0) return topicSum + value * 60;
        }
        const words = topic.body.split(/\s+/).filter(Boolean).length;
        return topicSum + Math.max(10, Math.min(60, Math.round((words / 120) * 60)));
      }, 0),
    0,
  );
}

/** Searches title and body, case-insensitive, returning the matched snippet. */
export function matchSnippet(text: string, query: string, radius = 48): string | null {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
