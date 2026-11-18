/**
 * Extracts one paper out of the site's server-rendered subject page.
 *
 * The site does not publish its PYQ JSON, but it does render every structured
 * question into stable classes (`paper-block`, `paper-section`, `question`,
 * `q-text`, `opt-item`, `marks`, …). This parser reads those blocks without a
 * DOM, so a paper opens as native text instead of a web page.
 *
 * Two contracts are load-bearing and both are pinned by
 * `qa/unit/paper-parse.test.ts`:
 *
 *  1. The selectors above are the site's current renderer. A redesign that
 *     renames one makes every paper open as "not on the page" — the 2025
 *     regression this parser exists to make impossible.
 *  2. A block's page id is `paper-<code>-<year>[-variant]`, while the bundled
 *     catalogue stores `<year>[_variant]`. `catalogueId` is the one conversion,
 *     used both to find a block and to key the cache.
 */

export interface ParsedOption {
  label: string;
  text: string;
}

export interface ParsedSubQuestion {
  label: string;
  text: string;
  marks: number | null;
  options: ParsedOption[];
  parts: ParsedOption[];
  images: string[];
}

export interface ParsedQuestion {
  number: string;
  text: string;
  marks: number | null;
  options: ParsedOption[];
  subs: ParsedSubQuestion[];
  images: string[];
}

export interface ParsedSection {
  title: string;
  marks: number | null;
  questions: ParsedQuestion[];
}

export interface ParsedPaper {
  found: boolean;
  /**
   * Why a missing paper is missing: `"unreadable"` means the page carries
   * paper blocks but none of them parsed (markup drift); `"absent"` means the
   * page parsed and this id is not on it. Only set on a `found: false` stub.
   */
  reason?: "absent" | "unreadable";
  year: number;
  code: string;
  title: string;
  time: string;
  fullMarks: string;
  instructions: string[];
  sections: ParsedSection[];
  questionCount: number;
}

export interface PaperTarget {
  id: string;
  code: string;
  year: number;
  variant: string;
  /** The exam title, which disambiguates two papers with the same file stem. */
  title: string;
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  times: "×",
  divide: "÷",
  plusmn: "±",
  deg: "°",
  micro: "µ",
  sup2: "²",
  sup3: "³",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  rarr: "→",
  larr: "←",
  harr: "↔",
  le: "≤",
  ge: "≥",
  ne: "≠",
  infin: "∞",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  omega: "ω",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    const named = NAMED[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** Turns one HTML fragment (a question, a heading) into clean native text. */
export function fragmentToText(fragment: string): string {
  const text = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // KaTeX renders each formula twice: MathML (for screen readers) and glyph
    // spans. Keep the glyphs so the text stays in reading order.
    .replace(/<math[\s\S]*?<\/math>/gi, " ")
    .replace(/<span[^>]*class="[^"]*\bkatex-mathml\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, " ")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, " [$1] ")
    .replace(/<img[^>]*>/gi, " [image] ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The inner HTML of the first element whose class list contains `className`. */
export function innerByClass(html: string, className: string, tag = "div"): string {
  const pattern = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>`, "i");
  const open = pattern.exec(html);
  if (!open || open.index === undefined) return "";
  const start = open.index + open[0].length;
  const closer = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
  closer.lastIndex = start;
  let depth = 1;
  let match = closer.exec(html);
  while (match !== null) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(start, match.index);
    match = closer.exec(html);
  }
  return html.slice(start);
}

function textByClass(html: string, className: string, tag = "div"): string {
  return fragmentToText(innerByClass(html, className, tag));
}

/** The inner HTML of every `<span>` in a fragment, in order. */
function spansOf(fragment: string): string[] {
  const out: string[] = [];
  const pattern = /<span\b[^>]*>([\s\S]*?)<\/span>/gi;
  let match = pattern.exec(fragment);
  while (match !== null) {
    out.push(match[1]);
    match = pattern.exec(fragment);
  }
  return out;
}

function firstText(html: string, pattern: RegExp): string {
  const match = pattern.exec(html);
  return match ? fragmentToText(match[1]) : "";
}

function marksOf(html: string): number | null {
  const match = /\[(\d+(?:\.\d+)?)\s*marks?\]/i.exec(html);
  return match ? Number(match[1]) : null;
}

/** The number in a `<span class="marks">14 marks</span>`, or `[14 marks]`. */
function marksIn(fragment: string): number | null {
  const span = innerByClass(fragment, "marks", "span");
  if (span !== "") {
    const value = /(\d+(?:\.\d+)?)/.exec(fragmentToText(span));
    if (value) return Number(value[1]);
  }
  return marksOf(fragment);
}

/**
 * The first code of a cross-listed paper's label (`100103/100203`). The page
 * id and the catalogue row both key on it; the label keeps the pair.
 */
function primaryCode(mono: string): string {
  return mono.split("/")[0].trim() || mono;
}

/**
 * The catalogue id for one page block. The site names a block
 * `paper-<code>-<year>[-variant]`; the catalogue stores `<year>[_variant]`.
 * `code` comes from the block's own `span.mono`, so a cross-listed paper whose
 * code differs from the subject row still resolves.
 */
export function catalogueId(pageId: string, code: string): string {
  const id = pageId.replace(/^paper-/, "");
  const prefix = code === "" ? "" : `${code}-`;
  const rest = prefix !== "" && id.startsWith(prefix) ? id.slice(prefix.length) : id;
  // No usable code: drop the leading six-digit subject code instead.
  const shaped = /^\d{4,6}-(\d{4})(?:-(.+))?$/.exec(rest);
  if (shaped) return `${shaped[1]}${shaped[2] ? `_${shaped[2].replace(/-/g, "_")}` : ""}`;
  return rest.replace(/-/g, "_");
}

function imagesOf(fragment: string): string[] {
  const out: string[] = [];
  const pattern = /<img\b[^>]*src="([^"]+)"/gi;
  let match = pattern.exec(fragment);
  while (match !== null) {
    const src = decodeEntities(match[1]).trim();
    if (src && !src.startsWith("data:") && !out.includes(src)) out.push(src);
    match = pattern.exec(fragment);
  }
  return out;
}

/** Splits `html` at every opening tag whose class contains `className`. */
function splitByClass(html: string, className: string, tag = "div"): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>`, "gi");
  const starts: number[] = [];
  let match = pattern.exec(html);
  while (match !== null) {
    starts.push(match.index);
    match = pattern.exec(html);
  }
  return starts.map((start, index) => html.slice(start, index + 1 < starts.length ? starts[index + 1] : html.length));
}

function parseOptions(block: string): ParsedOption[] {
  return splitByClass(block, "opt-item")
    .map((item) => {
      const label = textByClass(item, "opt-lbl", "span");
      const text = textByClass(item, "opt-val");
      return { label, text };
    })
    .filter((option) => option.text.length > 0 || option.label.length > 0);
}

function parseSubs(questionBox: string): ParsedSubQuestion[] {
  return splitByClass(questionBox, "sub-item")
    .map((item) => {
      const parts = splitByClass(item, "subpart-item").map((part) => ({
        label: textByClass(part, "subpart-lbl", "span"),
        text: textByClass(part, "subpart-text"),
      }));
      return {
        label: textByClass(item, "sub-lbl", "span"),
        text: textByClass(item, "sub-text"),
        marks: marksIn(item),
        options: parseOptions(item),
        parts,
        images: imagesOf(innerByClass(item, "sub-text")),
      };
    })
    .filter((sub) => sub.text.length > 0 || sub.options.length > 0 || sub.parts.length > 0);
}

function parseQuestion(questionBox: string): ParsedQuestion {
  const number = textByClass(questionBox, "q-num", "p");
  const content = innerByClass(questionBox, "q-body");
  const body = content || questionBox;
  const textBlock = innerByClass(body, "q-text");
  // Main options live above the sub-question list. `options-grid mini` inside
  // a sub-question must not be mistaken for the question's own choices.
  const beforeSubs = body.split(/<div[^>]*class="sub-list"/i)[0];
  return {
    number,
    text: fragmentToText(textBlock),
    marks: marksIn(innerByClass(questionBox, "q-tools")),
    options: parseOptions(innerByClass(beforeSubs, "options-grid")),
    subs: parseSubs(body),
    images: imagesOf(textBlock),
  };
}

/** A question with no prose can still be an image, a set of choices or sub-parts. */
function hasQuestionBody(question: ParsedQuestion): boolean {
  return (
    question.text.length > 0 ||
    question.options.length > 0 ||
    question.subs.length > 0 ||
    question.images.length > 0
  );
}

function parseSection(group: string): ParsedSection {
  const rawTitle = textByClass(group, "section-title", "h3") || firstText(group, /<h4[^>]*>([\s\S]*?)<\/h4>/i);
  return {
    title: rawTitle.replace(/\[\s*\d+(?:\.\d+)?\s*marks?\s*\]\s*$/i, "").trim(),
    marks: marksOf(innerByClass(group, "section-head")),
    questions: splitByClass(group, "question", "li").map(parseQuestion).filter(hasQuestionBody),
  };
}

function parseInstructions(block: string): string[] {
  const panel = innerByClass(block, "instructions");
  if (!panel) return [];
  const out: string[] = [];
  const pattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match = pattern.exec(panel);
  while (match !== null) {
    const text = fragmentToText(match[1]);
    if (text) out.push(text);
    match = pattern.exec(panel);
  }
  return out;
}

/** Finds the `<section class="paper-block" id="paper-…">` for a target paper. */
export function paperBlock(html: string, target: PaperTarget): string {
  const blocks = splitByClass(html, "paper-block", "section");
  const wanted = target.title.replace(/\s+/g, " ").trim().toLowerCase();
  const wantedCode = primaryCode(target.code);
  let best = "";
  let bestScore = 0;

  for (const block of blocks) {
    const pageId = /\bid="paper-([^"]+)"/i.exec(block)?.[1] ?? "";
    if (pageId === "") continue;
    const code = primaryCode(textByClass(block, "mono", "span"));
    // The catalogue id alone is not unique on a page: a year+variant can exist
    // under several paper codes. The code is part of the identity.
    if (wantedCode !== "" && wantedCode !== "---" && code !== wantedCode) continue;
    if (catalogueId(`paper-${pageId}`, code) !== target.id) continue;
    const title = textByClass(block, "paper-title", "h2").replace(/\s+/g, " ").trim().toLowerCase();
    const score = 1 + (wanted && title === wanted ? 8 : 0);
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
  }
  if (best) return best;

  // Fallback: the page id shape moved, so match the paper's own facts instead.
  const targetVariant = target.id.includes("_") ? target.id.slice(target.id.indexOf("_") + 1) : target.variant;
  for (const block of blocks) {
    const pageId = /\bid="paper-([^"]+)"/i.exec(block)?.[1] ?? "";
    if (pageId === "") continue;
    const code = primaryCode(textByClass(block, "mono", "span"));
    const id = catalogueId(`paper-${pageId}`, code);
    const year = Number(textByClass(block, "year", "span")) || 0;
    if (target.year > 0 && year !== target.year) continue;
    const variant = id.includes("_") ? id.slice(id.indexOf("_") + 1) : "";
    if (targetVariant !== "" && variant !== targetVariant) continue;
    const title = textByClass(block, "paper-title", "h2").replace(/\s+/g, " ").trim().toLowerCase();
    if (wanted && title !== wanted) continue;
    if (wantedCode && wantedCode !== "---" && code !== wantedCode) continue;
    return block;
  }
  return "";
}

export function parsePaperHtml(html: string, target: PaperTarget): ParsedPaper {
  const block = paperBlock(html, target);
  if (!block) {
    return {
      found: false,
      year: target.year,
      code: target.code,
      title: "",
      time: "",
      fullMarks: "",
      instructions: [],
      sections: [],
      questionCount: 0,
    };
  }
  return parsePaperBlock(block, target);
}

/** One `section.paper-block` as a readable paper. */
export function parsePaperBlock(block: string, target: PaperTarget): ParsedPaper {
  const sections = splitByClass(block, "paper-section", "section")
    .map(parseSection)
    .filter((section) => section.title || section.questions.length);
  const questionCount = sections.reduce((sum, section) => sum + section.questions.length, 0);
  const yearText = textByClass(block, "year", "span");
  const codeText = textByClass(block, "mono", "span");
  // The live head is `3 hours` then `70 marks`, with no label around either.
  const meta = spansOf(innerByClass(block, "paper-meta", "p")).map(fragmentToText).filter((value) => value !== "");
  const time = meta.find((value) => /\b(hour|minute)/i.test(value)) ?? "";
  // The head says `70 marks`; the model (and the screen) wants the number.
  const fullMarks = /(\d+(?:\.\d+)?)/.exec(meta.find((value) => /\bmarks?\b/i.test(value)) ?? "")?.[1] ?? "";

  return {
    found: sections.length > 0,
    year: Number(yearText) || target.year,
    code: codeText || target.code,
    title: textByClass(block, "paper-title", "h2") || target.title,
    time,
    fullMarks,
    instructions: parseInstructions(block),
    sections,
    questionCount,
  };
}

/**
 * The key one paper occupies in its subject's cache, and the one `loadPaper`
 * looks up: `<paper code>-<catalogue id>`.
 *
 * The catalogue id alone (`2020`) is not unique on a page — one subject page
 * carries papers from every branch's code (basic-electronics has three 2020
 * papers, codes 041401, 101302 and 104301) — so the code has to ride along.
 */
export function paperKey(code: string, id: string): string {
  return `${code}-${id}`;
}

/**
 * The inverse of `catalogueId`: the in-page anchor the site gives one paper,
 * `paper-<code>-<year>[-variant]`. "Open on the site" lands on the paper
 * instead of the top of a thirty-paper page.
 */
export function pageAnchor(code: string, id: string): string {
  const [year, ...variant] = id.split("_");
  const suffix = variant.length > 0 ? `-${variant.join("_")}` : "";
  return `paper-${primaryCode(code)}-${year}${suffix}`;
}

/** How many paper blocks a page carries, readable or not. */
export function paperBlockCount(html: string): number {
  return splitByClass(html, "paper-block", "section").length;
}

/**
 * Every readable paper on one subject page, keyed by `paperKey` — the code and
 * catalogue id `loadPaper` looks up, not the page's own
 * `paper-<code>-<year>[-variant]` id.
 *
 * One subject page carries all of its papers, so this is what makes an offline
 * copy cheap: parse once, keep the questions, and throw the markup away.
 */
export function parseAllPapers(html: string): { id: string; paper: ParsedPaper }[] {
  const out: { id: string; paper: ParsedPaper }[] = [];
  for (const block of splitByClass(html, "paper-block", "section")) {
    const pageId = /\bid="paper-([^"]+)"/i.exec(block)?.[1] ?? "";
    if (!pageId) continue;
    const mono = textByClass(block, "mono", "span");
    const code = primaryCode(mono);
    const catalogue = catalogueId(`paper-${pageId}`, code);
    const id = paperKey(code, catalogue);
    const year = Number(textByClass(block, "year", "span")) || 0;
    const paper = parsePaperBlock(block, { id: catalogue, code: mono, year, variant: "", title: "" });
    // A block with no sections is not worth a cache slot: the screen falls
    // back to the PDF/site, and a later build of the page can still be read.
    if (!paper.found) continue;
    const existing = out.find((entry) => entry.id === id);
    if (existing) {
      if (paper.questionCount > existing.paper.questionCount) existing.paper = paper;
      continue;
    }
    out.push({ id, paper });
  }
  return out;
}

/** Resolves an image path from a question against the site origin. */
export function absoluteImage(site: string, src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${site}/${src.replace(/^\/+/, "")}`;
}
