/**
 * Extracts one paper out of the site's server-rendered subject page.
 *
 * The site does not publish its PYQ JSON, but it does render every structured
 * question into stable classes (`paper-block`, `section-group`, `q-box`,
 * `q-text`, `opt-item`, …). This parser reads those blocks without a DOM, so a
 * paper opens as native text instead of a web page.
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

function firstText(html: string, pattern: RegExp): string {
  const match = pattern.exec(html);
  return match ? fragmentToText(match[1]) : "";
}

function marksOf(html: string): number | null {
  const match = /\[(\d+(?:\.\d+)?)\s*marks?\]/i.exec(html);
  return match ? Number(match[1]) : null;
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
        marks: marksOf(item),
        options: parseOptions(item),
        parts,
        images: imagesOf(innerByClass(item, "sub-text")),
      };
    })
    .filter((sub) => sub.text.length > 0 || sub.options.length > 0 || sub.parts.length > 0);
}

function parseQuestion(questionBox: string): ParsedQuestion {
  const number = textByClass(questionBox, "q-num");
  const content = innerByClass(questionBox, "q-content");
  const body = content || questionBox;
  const textBlock = innerByClass(body, "q-text");
  // Main options live above the sub-question list. `options-grid mini` inside
  // a sub-question must not be mistaken for the question's own choices.
  const beforeSubs = body.split(/<div[^>]*class="sub-list"/i)[0];
  return {
    number,
    text: fragmentToText(textBlock),
    marks: marksOf(innerByClass(questionBox, "q-actions")),
    options: parseOptions(innerByClass(beforeSubs, "options-grid")),
    subs: parseSubs(body),
    images: imagesOf(textBlock),
  };
}

function parseSection(group: string): ParsedSection {
  const rawTitle = textByClass(group, "heading-text") || firstText(group, /<h4[^>]*>([\s\S]*?)<\/h4>/i);
  return {
    title: rawTitle.replace(/\[\s*\d+(?:\.\d+)?\s*marks?\s*\]\s*$/i, "").trim(),
    marks: marksOf(innerByClass(group, "section-header-row")),
    questions: splitByClass(group, "q-box").map(parseQuestion).filter((question) => question.text.length > 0),
  };
}

function parseInstructions(block: string): string[] {
  const panel = innerByClass(block, "instructions-panel");
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
  let best = "";
  let bestScore = 0;

  for (const block of blocks) {
    const id = /\bid="paper-([^"]+)"/i.exec(block)?.[1] ?? "";
    if (id !== target.id) continue;
    const code = textByClass(block, "code-badge-outline", "span");
    const title = textByClass(block, "paper-title", "h2").replace(/\s+/g, " ").trim().toLowerCase();
    let score = 1;
    if (target.code && target.code !== "---" && code === target.code) score += 4;
    if (wanted && title === wanted) score += 8;
    if (score > bestScore) {
      best = block;
      bestScore = score;
    }
  }
  if (best) return best;

  // Fallback: match year + subject code + title inside every paper block.
  for (const block of blocks) {
    const year = firstText(block, /class="year-badge"[^>]*>([\s\S]*?)<\/span>/i);
    const code = firstText(block, /class="code-badge-outline"[^>]*>([\s\S]*?)<\/span>/i);
    const title = textByClass(block, "paper-title", "h2").replace(/\s+/g, " ").trim().toLowerCase();
    const titleOk = !wanted || title === wanted;
    if (year === String(target.year) && (target.code === "" || code === target.code) && titleOk) {
      return block;
    }
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
  const sections = splitByClass(block, "section-group").map(parseSection).filter((section) => section.title || section.questions.length);
  const questionCount = sections.reduce((sum, section) => sum + section.questions.length, 0);
  const yearText = textByClass(block, "year-badge", "span");
  const codeText = textByClass(block, "code-badge-outline", "span");
  const meta = block.match(/class="meta-item"[^>]*>\s*<span[^>]*class="label"[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*class="val"[^>]*>([\s\S]*?)<\/span>/gi) ?? [];
  let time = "";
  let fullMarks = "";
  for (const item of meta) {
    const label = firstText(item, /class="label"[^>]*>([\s\S]*?)<\/span>/i).toLowerCase();
    const value = firstText(item, /class="val"[^>]*>([\s\S]*?)<\/span>/i);
    if (label.includes("time")) time = value;
    if (label.includes("marks")) fullMarks = value;
  }

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
 * Every readable paper on one subject page, keyed by the page's own paper id
 * (`paper-<id>`), which is the same id the bundled catalog stores.
 *
 * One subject page carries all of its papers (a 300–400 KB download), so this
 * is what makes an offline copy cheap: parse once, keep the questions, and
 * throw the markup away.
 */
export function parseAllPapers(html: string): { id: string; paper: ParsedPaper }[] {
  const out: { id: string; paper: ParsedPaper }[] = [];
  for (const block of splitByClass(html, "paper-block", "section")) {
    const id = /\bid="paper-([^"]+)"/i.exec(block)?.[1] ?? "";
    if (!id) continue;
    const code = textByClass(block, "code-badge-outline", "span");
    const year = Number(textByClass(block, "year-badge", "span")) || 0;
    const paper = parsePaperBlock(block, { id, code, year, variant: "", title: "" });
    // A block with no questions is not worth a cache slot: the screen falls
    // back to the PDF/site, and a later build of the page can still be read.
    if (!paper.found) continue;
    out.push({ id, paper });
  }
  return out;
}

/** Resolves an image path from a question against the site origin. */
export function absoluteImage(site: string, src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${site}/${src.replace(/^\/+/, "")}`;
}
