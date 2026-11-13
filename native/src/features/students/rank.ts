/**
 * The students matcher — one pass, best tier wins.
 *
 * A student row has three searchable pieces: the registration number, the
 * class roll number and the name. The query is normalised once (case, runs of
 * punctuation and spacing) and then tokens match in any order, so "kumar
 * suraj" finds SURAJ KUMAR and "sk ram" finds SURAJ KUMAR RAM (`sk` is the
 * initials of the first two words, `ram` starts the third).
 *
 * Scoring, highest first:
 *
 *   exact registration / roll ...... 1000   the query IS a code
 *   code prefix ....................  900   23105 → 23105157001, 25CSE → 25CSE62
 *   name prefix ....................  700   the name starts with the whole query
 *   every token matches ............  600   a word start or a run of initials, any order
 *   every token is a substring .....  300   last resort, and never for one-letter tokens
 *
 * Codes are compared with their punctuation removed, so "24/CV/19",
 * "24-CV-19" and "24CV19" are one roll. The code tiers need at least two
 * characters: a single digit would otherwise prefix half the register.
 *
 * Ties break by the newer batch, then name A–Z, then registration number, so
 * the same query always produces the same screen.
 *
 * The register is 1,784 rows and every keystroke ranks it, so the row fields
 * the matcher reads are normalised once into a `StudentIndex` (`indexStudents`)
 * and `rankIndexed` scores against that copy. `rankStudents` is the same two
 * calls in one — keep them equal, and say so in `qa/unit/students-search.test.ts`.
 */

export interface SearchableStudent {
  readonly reg: string;
  readonly name: string;
  readonly roll?: string;
  /** `2024-28`; ties break on its year. */
  readonly session?: string;
}

export const SCORE = {
  regExact: 1000,
  regPrefix: 900,
  namePrefix: 700,
  tokens: 600,
  substring: 300,
} as const;

/** Uppercase, punctuation to spaces, runs of spaces collapsed. */
export function normaliseSearch(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The same value with no spaces, for a code comparison. */
export function compactSearch(value: string): string {
  return normaliseSearch(value).replace(/ /g, "");
}

/** True when every letter of `token` starts a consecutive word, "sk" → SURAJ KUMAR. */
function initialsHit(token: string, words: readonly string[]): boolean {
  if (token.length < 2) return false;
  for (let start = 0; start < words.length; start += 1) {
    let initials = "";
    for (let index = start; index < words.length && initials.length < token.length; index += 1) {
      initials += words[index][0] ?? "";
      if (initials === token) return true;
    }
  }
  return false;
}

function tokenHit(token: string, words: readonly string[]): boolean {
  return words.some((word) => word.startsWith(token)) || initialsHit(token, words);
}

function codeScore(codes: readonly string[], query: string): number {
  if (query.length < 2) return 0;
  if (codes.some((code) => code === query)) return SCORE.regExact;
  if (codes.some((code) => code.length > query.length && code.startsWith(query))) return SCORE.regPrefix;
  return 0;
}

function sessionYear(row: SearchableStudent): number {
  const fromSession = Number((row.session ?? "").slice(0, 4));
  if (Number.isFinite(fromSession) && fromSession > 0) return fromSession;
  const fromReg = Number(row.reg.slice(0, 2));
  return Number.isFinite(fromReg) && fromReg >= 10 ? 2000 + fromReg : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** One row, normalised once: what the scorer compares and what ties break on. */
export interface IndexedStudent<T extends SearchableStudent = SearchableStudent> {
  readonly row: T;
  /** `normaliseSearch(row.name)`. */
  readonly name: string;
  /** The name's words, in order, for the word-start and initials tiers. */
  readonly words: readonly string[];
  /** The compact registration and roll; empty strings dropped. */
  readonly codes: readonly string[];
  /** `sessionYear(row)`, read only by the tie-break. */
  readonly year: number;
}

/** A pool of rows with their normalised fields; rank it as often as you like. */
export interface StudentIndex<T extends SearchableStudent = SearchableStudent> {
  readonly items: readonly IndexedStudent<T>[];
}

function indexStudent<T extends SearchableStudent>(row: T): IndexedStudent<T> {
  const name = normaliseSearch(row.name);
  return {
    row,
    name,
    words: name.split(" ").filter(Boolean),
    codes: [compactSearch(row.reg), compactSearch(row.roll ?? "")].filter(Boolean),
    year: sessionYear(row),
  };
}

/** Normalise every row once. The input order is kept, so an empty query browses it. */
export function indexStudents<T extends SearchableStudent>(rows: readonly T[]): StudentIndex<T> {
  return { items: rows.map(indexStudent) };
}

/** The same index narrowed to the rows `keep` accepts, input order kept. */
export function filterIndex<T extends SearchableStudent>(
  index: StudentIndex<T>,
  keep: (row: T) => boolean,
): StudentIndex<T> {
  return { items: index.items.filter((item) => keep(item.row)) };
}

function scoreIndexed(
  item: IndexedStudent,
  query: string,
  compact: string,
  tokens: readonly string[],
): number {
  const byCode = codeScore(item.codes, compact);
  if (byCode > 0) return byCode;

  if (item.name.startsWith(query)) return SCORE.namePrefix;

  if (tokens.length > 0 && tokens.every((token) => tokenHit(token, item.words))) return SCORE.tokens;

  // A one-letter query is useful at a word start, not inside every name.
  if (tokens.length > 0 && tokens.every((token) => token.length >= 2 && item.name.includes(token))) {
    return SCORE.substring;
  }
  return 0;
}

/**
 * The rows that match `query`, best first. An empty or all-punctuation query
 * returns the input order, because the caller is showing a browse list.
 */
export function rankIndexed<T extends SearchableStudent>(index: StudentIndex<T>, query: string): T[] {
  const normalised = normaliseSearch(query);
  if (!normalised) return index.items.map((item) => item.row);
  const compact = compactSearch(query);
  const tokens = normalised.split(" ").filter(Boolean);
  const hits: { item: IndexedStudent<T>; score: number }[] = [];
  for (const item of index.items) {
    const score = scoreIndexed(item, normalised, compact, tokens);
    if (score > 0) hits.push({ item, score });
  }
  hits.sort(
    (left, right) =>
      right.score - left.score ||
      right.item.year - left.item.year ||
      compareText(left.item.row.name, right.item.row.name) ||
      compareText(left.item.row.reg, right.item.row.reg),
  );
  return hits.map((hit) => hit.item.row);
}

/**
 * The rows that match `query`, best first — `indexStudents` + `rankIndexed`.
 * A caller that ranks the same pool more than once should keep the index.
 */
export function rankStudents<T extends SearchableStudent>(rows: readonly T[], query: string): T[] {
  return rankIndexed(indexStudents(rows), query);
}
