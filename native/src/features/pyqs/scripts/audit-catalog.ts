#!/usr/bin/env bun
/**
 * Audit the PYQ shelf against the syllabus snapshot.
 *
 * The promise this file protects: **every branch, every semester, every
 * subject code** in `src/features/syllabus/data/packs.ts` is visible on the
 * pyqs screen — including the subjects with no paper yet. The syllabus packs
 * are read-only here; they are the source of truth for branch → semester →
 * code/name.
 *
 *   bun native/src/features/pyqs/scripts/audit-catalog.ts
 *   bun native/src/features/pyqs/scripts/audit-catalog.ts --json
 *   bun native/src/features/pyqs/scripts/audit-catalog.ts --papers   # per-subject rows
 *   bun native/src/features/pyqs/scripts/audit-catalog.ts --coverage # every shelf cell
 *
 * Exit code: 0 when the catalog covers the syllabus, 1 when a code is missing
 * or a paper is unreachable. `qa/unit/pyq-catalog.test.ts` runs the same
 * contract without the CLI, so a stale catalog fails the suite too.
 */

import { BRANCH_META, BRANCH_PACKS } from "../../syllabus/data/packs";
import type { BranchPack } from "../../syllabus/parse";
import { allSubjects, branches, catalog, catalogShape, catalogSource, findSubjectByCode, totalPapers } from "../catalog-core";
import { branchCoverage, coverageLine, zeroPaperCount } from "../coverage";

interface Row {
  branch: string;
  branchName: string;
  sem: number;
  code: string;
  name: string;
  type: string;
  papers: number;
  latest: number;
  present: boolean;
}

interface Gap {
  branch: string;
  sem: number;
  code: string;
  name: string;
  reason: string;
}

/** Bun's globals are not in the shell's type surface; this script still runs under `bun`. */
const runtime = globalThis as {
  process?: { argv?: string[]; exitCode?: number };
};
const isMain = (import.meta as ImportMeta & { main?: boolean }).main === true;

const args = new Set((runtime.process?.argv ?? []).slice(2));
const asJson = args.has("--json");
const showPapers = args.has("--papers");
const showCoverage = args.has("--coverage");

function packOf(branch: string): BranchPack | null {
  const raw = BRANCH_PACKS[branch];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BranchPack;
  } catch {
    return null;
  }
}

export function audit() {
  const rows: Row[] = [];
  const gaps: Gap[] = [];
  const unknownBranches: string[] = [];
  let duplicateClaimCount = 0;

  const known = new Set(branches().map((branch) => branch.key));
  const syllabusBranches = new Set(BRANCH_META.map((meta) => meta.code));

  for (const meta of BRANCH_META) {
    const pack = packOf(meta.code);
    if (!pack) {
      gaps.push({ branch: meta.code, sem: 0, code: "", name: meta.name, reason: "pack missing or unreadable" });
      continue;
    }
    for (const key of Object.keys(pack.semesters).sort((a, b) => Number(a) - Number(b))) {
      const sem = Number(key);
      for (const subject of pack.semesters[key] ?? []) {
        const match = findSubjectByCode(meta.code, sem, subject.code);
        rows.push({
          branch: meta.code,
          branchName: meta.short,
          sem,
          code: subject.code,
          name: subject.name,
          type: subject.type,
          papers: match ? match.papers.length : 0,
          latest: match ? Math.max(0, ...match.papers.map((paper) => paper.year)) : 0,
          present: match !== undefined,
        });
        if (!match) {
          gaps.push({
            branch: meta.code,
            sem,
            code: subject.code,
            name: subject.name,
            reason: "no catalog row for this branch + semester + code",
          });
        }
      }
    }
    if (!known.has(meta.code)) {
      unknownBranches.push(meta.code);
      gaps.push({ branch: meta.code, sem: 0, code: "", name: meta.name, reason: "branch absent from the catalog" });
    }
  }

  // Every paper must be reachable from at least one row, or it is dead weight
  // a search result can never open. Read the ids from the snapshot itself: the
  // hydrated rows have already dropped a dangling one, and hiding that is
  // exactly what this audit exists to prevent. In the readable shape the rows
  // carry their papers inline, so nothing can dangle — the check is a
  // packed-shape property and the snapshot reports which shape it is.
  const snapshot = catalogSource();
  const orphans: string[] = [];
  if (catalogShape() === "packed") {
    const reachable = new Set<number>();
    for (const subject of snapshot.subjects) {
      for (const index of subject.paperIds ?? []) {
        if (snapshot.papers?.[index] === undefined) {
          gaps.push({
            branch: subject.branch,
            sem: subject.sem,
            code: subject.code ?? "",
            name: subject.name,
            reason: `paper id ${index} is not in the papers table`,
          });
          continue;
        }
        reachable.add(index);
      }
    }
    orphans.push(
      ...(snapshot.papers ?? [])
        .map((paper, index) => ({ paper, index }))
        .filter((row) => !reachable.has(row.index))
        .map((row) => `${row.paper.code || "—"} ${row.paper.year} (${row.paper.id})`),
    );
  }
  for (const orphan of orphans) {
    gaps.push({ branch: "", sem: 0, code: "", name: orphan, reason: "paper is not attached to any subject" });
  }

  // A code names one shelf row per branch + semester. BEU recycles numbers
  // across schemes, so two rows can carry the same code unless the generator
  // resolves it — and `findSubjectByCode` would then answer with whichever row
  // happens to sort first. The packed file resolves every alias; the readable
  // intermediate still carries archive aliases (the lookup prefers the syllabus
  // row deterministically), so this is a packed-shape property.
  if (catalogShape() === "packed") {
    const claims = new Map<string, string[]>();
    for (const subject of allSubjects()) {
      for (const code of subject.codes) {
        if (!code) continue;
        const key = `${subject.branch}|${subject.sem}|${code}`;
        const list = claims.get(key) ?? [];
        list.push(subject.key);
        claims.set(key, list);
      }
    }
    const duplicateClaims = [...claims].filter(([, keys]) => keys.length > 1);
    for (const [key, keys] of duplicateClaims) {
      const [branch, sem, code] = key.split("|");
      gaps.push({
        branch: branch ?? "",
        sem: Number(sem) || 0,
        code: code ?? "",
        name: keys.join(", "),
        reason: `code claimed by ${keys.length} rows`,
      });
    }
    duplicateClaimCount = duplicateClaims.length;
  }

  // Rows outside the syllabus are allowed (older schemes, IT, electives), but
  // they must belong to a branch the rail can actually show.
  const extraRowBranches = [...new Set(allSubjects().map((subject) => subject.branch))].filter(
    (branch) => !syllabusBranches.has(branch),
  );
  for (const branch of extraRowBranches) {
    if (!known.has(branch)) {
      unknownBranches.push(branch);
      gaps.push({ branch, sem: 0, code: "", name: branch, reason: "catalog row on an unlisted branch" });
    }
  }

  const zeroPapers = allSubjects().filter((subject) => subject.papers.length === 0).length;
  return {
    snapshot: catalog().generated,
    rows,
    gaps,
    unknownBranches,
    totals: {
      branches: known.size,
      catalogSubjects: allSubjects().length,
      catalogPapers: totalPapers(),
      syllabusRows: rows.length,
      syllabusCodes: new Set(rows.map((row) => `${row.branch}|${row.sem}|${row.code}`)).size,
      covered: rows.filter((row) => row.present).length,
      zeroPapers,
      orphanPapers: orphans.length,
      duplicateCodes: duplicateClaimCount,
    },
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

function print(): void {
  const report = audit();
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`BEU PYQ shelf — snapshot ${report.snapshot}`);
  console.log(
    `${report.totals.catalogSubjects} rows · ${report.totals.catalogPapers} papers · ` +
      `${report.totals.zeroPapers} rows with no paper yet · ${report.totals.branches} branches`,
  );
  console.log("");
  console.log(`${pad("Branch", 8)}${pad("Sem", 5)}${padLeft("Codes", 6)}${padLeft("Rows", 6)}${padLeft("Papers", 8)}${padLeft("Zero", 6)}  Status`);
  console.log("-".repeat(60));

  const byCell = new Map<string, Row[]>();
  for (const row of report.rows) {
    const key = `${row.branch}|${row.sem}`;
    const list = byCell.get(key) ?? [];
    list.push(row);
    byCell.set(key, list);
  }
  for (const [key, list] of byCell) {
    const [branch, sem] = key.split("|");
    const papers = list.reduce((sum, row) => sum + row.papers, 0);
    const zero = list.filter((row) => row.papers === 0).length;
    const missing = list.filter((row) => !row.present).length;
    const status = missing === 0 ? "ok" : `${missing} MISSING`;
    console.log(
      `${pad(branch ?? "", 8)}${pad(sem ?? "", 5)}${padLeft(String(list.length), 6)}${padLeft(String(list.length), 6)}${padLeft(String(papers), 8)}${padLeft(String(zero), 6)}  ${status}`,
    );
    if (showPapers) {
      for (const row of list) {
        console.log(
          `  ${pad(row.code, 12)}${pad(row.papers === 0 ? "—" : String(row.papers), 3)} ${row.name}${
            row.latest > 0 ? ` (latest ${row.latest})` : ""
          }`,
        );
      }
    }
  }

  const extra = allSubjects().filter((subject) => !report.rows.some((row) => row.branch === subject.branch && row.sem === subject.sem && subject.codes.includes(row.code)));
  if (extra.length > 0) {
    console.log("");
    console.log(`Rows outside the syllabus snapshot (older schemes, IT, electives): ${extra.length}`);
    const byBranch = new Map<string, number>();
    for (const subject of extra) byBranch.set(subject.branch, (byBranch.get(subject.branch) ?? 0) + 1);
    console.log("  " + [...byBranch].map(([branch, count]) => `${branch}: ${count}`).join(" · "));
  }

  console.log("");
  if (report.gaps.length === 0) {
    console.log("No gaps: every syllabus code has a shelf row.");
  } else {
    console.log(`GAPS (${report.gaps.length})`);
    for (const gap of report.gaps) {
      console.log(`  ${gap.branch || "—"} sem ${gap.sem || "—"} ${gap.code || "—"} ${gap.name} — ${gap.reason}`);
    }
  }
  console.log(
    `\nSyllabus coverage: ${report.totals.covered}/${report.totals.syllabusRows} row(s), ` +
      `${report.totals.syllabusCodes} unique branch|sem|code.`,
  );

  if (showCoverage) {
    const rows = allSubjects();
    console.log(`\nShelf coverage: ${rows.length} rows, ${zeroPaperCount(rows)} with no paper yet.`);
    for (const branch of branchCoverage(rows)) {
      console.log("  " + coverageLine(branch));
    }
  }
}

if (isMain) {
  print();
  const report = audit();
  if (runtime.process) runtime.process.exitCode = report.gaps.length === 0 ? 0 : 1;
}
