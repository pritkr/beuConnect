/**
 * Read-side helpers over the generated PDF index.
 *
 * `pdf-catalog.ts` is a packed snapshot of the 294 papers that were actually
 * downloaded (see `scripts/build-pyq-pdfs.mjs`); this module is the only thing
 * that decodes it, and it decodes once, lazily, so the shelf does not pay for
 * the papers unless a student expands a subject.
 *
 * Two rules keep the UI honest:
 *
 * 1. A PDF belongs to a syllabus subject by **any** code that subject has ever
 *    carried — its syllabus code, a legacy paper code, the papers already in
 *    the structured catalog. BEU renumbered most branches in 2019, so a 2014
 *    paper and a 2023 paper about the same subject rarely share a code.
 * 2. A paper screen opens a PDF only when the index has **that** paper: same
 *    year and same variant. A near-miss file is not offered as if it were the
 *    one the student asked for.
 */

import type { Nav } from "../../app/router";
import { RAW, SNAPSHOT, decode, type PdfPaper } from "./pdf-catalog";
import type { CatalogSubject } from "./catalog";
import { dataVersion, livePdfRaw } from "../data-feed/pyqs";

export { SNAPSHOT };
export type { PdfPaper };

let cached: PdfPaper[] | null = null;
let cachedVersion = -1;

/** Every PDF in the index, newest year first inside each subject code. */
export function pdfCatalog(): PdfPaper[] {
  const version = dataVersion();
  if (cached === null || cachedVersion !== version) {
    cachedVersion = version;
    try {
      cached = decode(livePdfRaw() ?? RAW);
    } catch {
      cached = [];
    }
  }
  return cached;
}

/** The index's own reading order: newest year first, then the plain paper. */
export function comparePdfPapers(left: PdfPaper, right: PdfPaper): number {
  if (left.year !== right.year) return right.year - left.year;
  if (left.variant !== right.variant) return left.variant.localeCompare(right.variant);
  return left.file.localeCompare(right.file);
}

/** Every PDF carrying `code`, newest first. */
export function pdfPapersForCode(code: string): PdfPaper[] {
  const needle = code.trim();
  if (needle === "") return [];
  return pdfCatalog()
    .filter((paper) => paper.subjectCode === needle)
    .sort(comparePdfPapers);
}

/** Every code a syllabus row answers to, including its papers' old codes. */
export function codesOfSubject(subject: CatalogSubject): string[] {
  const codes = new Set<string>();
  for (const code of subject.codes) {
    if (code && code !== "---") codes.add(code);
  }
  if (subject.code && subject.code !== "---") codes.add(subject.code);
  for (const paper of subject.papers) {
    if (paper.code && paper.code !== "---") codes.add(paper.code);
  }
  return [...codes];
}

/** Every PDF of a syllabus subject, newest year first. */
export function pdfPapersFor(subject: CatalogSubject): PdfPaper[] {
  const codes = new Set(codesOfSubject(subject));
  if (codes.size === 0) return [];
  return pdfCatalog()
    .filter((paper) => codes.has(paper.subjectCode))
    .sort(comparePdfPapers);
}

/** The PDF of one exact paper, or undefined when it was never downloaded. */
export function pdfForPaper(
  subject: CatalogSubject,
  code: string,
  year: number,
  variant: string,
): PdfPaper | undefined {
  return pdfPapersFor(subject).find(
    (paper) => paper.year === year && paper.variant === variant && (code === "" || paper.subjectCode === code),
  );
}

export function pdfCount(): number {
  return pdfCatalog().length;
}

/** How many papers of a subject are PDFs. */
export function pdfCountOf(subject: CatalogSubject): number {
  return pdfPapersFor(subject).length;
}

/**
 * The visible year label. Variant only appears when the source really named
 * one, so a lone "2020" never reads "2020 · ".
 */
export function pdfYearLabel(paper: PdfPaper): string {
  return paper.variant ? `${paper.year} · ${paper.variant.toUpperCase()}` : String(paper.year);
}

/** The name a saved copy should carry, without the extension. */
export function pdfFileStem(paper: PdfPaper): string {
  return paper.file.replace(/\.pdf$/i, "");
}

/** Opens a PDF in the app's viewer (native pages on Android, WebView elsewhere). */
export function openPdfPaper(nav: Nav, paper: PdfPaper, title = paper.subjectName): void {
  nav.push("pyqs.pdf", {
    url: paper.url,
    title,
    name: pdfFileStem(paper),
  });
}
