/**
 * GATE papers: a small fixed catalog plus PDF links.
 *
 * GATE papers are published as PDFs only, so this area always ends in the PDF
 * viewer route. The list itself is bundled, which keeps it instant offline.
 */

import { RAW, type GateCatalog, type GatePaper, type GateSubject } from "./gate-data";
import { dataVersion, liveGateRaw } from "../data-feed/pyqs";

export type { GatePaper, GateSubject };

let cached: GateCatalog | null = null;
let cachedVersion = -1;

export function gateCatalog(): GateCatalog {
  const version = dataVersion();
  if (cached === null || cachedVersion !== version) {
    cachedVersion = version;
    try {
      cached = JSON.parse(liveGateRaw() ?? RAW) as GateCatalog;
    } catch {
      cached = { generated: "", papers: [] };
    }
  }
  return cached;
}

export function gateSubjects(): GateSubject[] {
  return gateCatalog().papers;
}

export function findGateSubject(code: string): GateSubject | undefined {
  return gateCatalog().papers.find((paper) => paper.code === code);
}

export function searchGateSubjects(query: string): GateSubject[] {
  const needle = query.trim().toLowerCase();
  const all = gateSubjects();
  if (!needle) return all;
  return all.filter(
    (paper) => paper.code.toLowerCase().includes(needle) || paper.name.toLowerCase().includes(needle),
  );
}

export function gatePaperLabel(paper: GatePaper): string {
  return paper.variant ? `${paper.year} · Set ${paper.variant}` : String(paper.year);
}

export function gateTotalPapers(): number {
  return gateCatalog().papers.reduce((sum, paper) => sum + paper.papers.length, 0);
}

/** The PDF path as stored ("/GATEPYQs/CS/CS12025.pdf") always starts with a slash. */
export function gatePdfPath(paper: GatePaper): string {
  return paper.path.startsWith("/") ? paper.path : `/${paper.path}`;
}
