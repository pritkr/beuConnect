/**
 * The four generated snapshots the app is built on — no engine, no network.
 *
 * Runs headless: `nsh test qa/data.test.ts`
 *
 * The pipelines in `scripts/` own these files; this suite owns the promises the
 * screens make about them: every branch the shelf offers has a pack, every
 * archived paper has a PDF, the register's totals add up, and a notes manifest
 * that is half-broken still yields the subjects it did describe.
 *
 * It reads the bundled snapshot, never the live feed, so it runs offline and
 * fails for the same reason on every machine.
 */

import { describe, expect, test } from "nsh/test";

import {
  fileCount,
  findSubject,
  parseManifest,
  searchSubjects,
  subjectsFor,
  vviCount,
} from "../src/features/notes/data";
import {
  allSubjects,
  branches,
  catalog,
  catalogShape,
  catalogSource,
  findSubjectByCode,
  orderSubjects,
  paperSummary,
  semestersOf,
  subjectsOf,
} from "../src/features/pyqs/catalog";
import { RAW as PDF_RAW, decode as decodePdfs } from "../src/features/pyqs/pdf-catalog";
import { ALL_STUDENTS, BRANCH_COUNTS, SESSION_COUNTS, TOTAL, studentByReg, studentsInBranch } from "../src/features/students/data";
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import type { BranchPack } from "../src/features/syllabus/parse";
import { parseSyllabus } from "../src/features/syllabus/parse";

describe("syllabus packs", () => {
  test("every branch on the shelf decodes to its own subjects", () => {
    expect(BRANCH_META.length).toBeGreaterThan(0);

    for (const meta of BRANCH_META) {
      // The pack is a lazy JSON string: decoded once on first read, then cached.
      const pack = JSON.parse(BRANCH_PACKS[meta.code]) as BranchPack;
      expect(pack.code).toBe(meta.code);
      expect(pack.name.length).toBeGreaterThan(0);
    }

    const cse = JSON.parse(BRANCH_PACKS.cse) as BranchPack;
    const subjects = Object.values(cse.semesters).flat();
    expect(subjects.length).toBeGreaterThan(50);

    for (const subject of subjects) {
      expect(subject.name.length).toBeGreaterThan(0);
    }

    // One subject's text must survive the trip into units and topics, because
    // that is the only shape the paper screen can render.
    const sample = subjects.find((subject) => subject.content.trim().length > 0);
    expect(sample !== undefined).toBe(true);
    const units = parseSyllabus(sample!.content);
    expect(units.length).toBeGreaterThan(0);
    expect(units.some((unit) => unit.topics.length > 0)).toBe(true);
  });
});

describe("pyq pdfs", () => {
  test("every archived paper is a PDF the app can build a URL for", () => {
    const pdfs = decodePdfs(PDF_RAW);
    expect(pdfs.length).toBeGreaterThan(0);

    const files = new Set<string>();
    for (const paper of pdfs) {
      expect(paper.file.endsWith(".pdf")).toBe(true);
      expect(paper.url).toContain("/PYQPDFs/");
      expect(paper.url.endsWith(encodeURIComponent(paper.file))).toBe(true);
      expect(paper.subjectCode.length).toBeGreaterThan(0);
      expect(Number.isFinite(paper.year)).toBe(true);
      files.add(paper.file);
    }

    // The packed table is meant to be one row per PDF; a duplicate means the
    // generator counted the same paper twice.
    expect(files.size).toBe(pdfs.length);
  });
});

describe("student register", () => {
  // In the public source the register is a stub, so this test has nothing to
  // read. It runs in the maintainer's checkout, where the real data is generated.
  test("the totals add up and a real registration resolves", () => {
    if (ALL_STUDENTS.length === 0) return;
    expect(ALL_STUDENTS.length).toBe(TOTAL);
    expect(Object.values(SESSION_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(TOTAL);
    expect(Object.values(BRANCH_COUNTS).reduce((sum, count) => sum + count, 0)).toBe(TOTAL);

    expect(studentsInBranch("cse").length).toBe(BRANCH_COUNTS.cse);

    const student = studentByReg("23105157031");
    expect(student).not.toBe(null);
    expect(student!.reg).toBe("23105157031");
    expect(student!.branch).toBe("cse");
  });
});

describe("pyq shelf coverage", () => {
  /**
   * The product promise the audit (`src/features/pyqs/scripts/audit-catalog.ts`)
   * prints: every branch, every semester and every subject code the syllabus
   * packs ship is visible on the shelf — including rows with no paper yet.
   * The snapshot arrives in two shapes (packed via the packer, readable straight
   * from the generator); the checks below hold for both, with the alias
   * uniqueness promise tightened only where the packed file curates it.
   */
  // The suite reads the bundled snapshot, never the live feed: audit-catalog
  // binds it inside `catalog.ts` at import time, so no test-local setup.
  test("every branch has a shelf row for every pack semester and code", () => {
    for (const meta of BRANCH_META) {
      // The rail must list the branch and the semesters its pack actually has.
      expect(branches().some((branch) => branch.key === meta.code)).toBe(true);
      const pack = JSON.parse(BRANCH_PACKS[meta.code]!) as BranchPack;
      for (const semKey of Object.keys(pack.semesters)) {
        const sem = Number(semKey);
        expect(semestersOf(meta.code).includes(sem)).toBe(true);
        expect(subjectsOf(meta.code, sem).length).toBeGreaterThan(0);
      }
      // Every syllabus code opens a row that claims it.
      for (const [semKey, subjects] of Object.entries(pack.semesters)) {
        for (const subject of subjects) {
          const row = findSubjectByCode(meta.code, Number(semKey), subject.code);
          expect(row !== undefined).toBe(true);
          if (row) expect(row.codes.includes(subject.code)).toBe(true);
        }
      }
    }
  });

  test("a row with no papers is still on the shelf and says so", () => {
    const empty = allSubjects().filter((subject) => subject.papers.length === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const subject of empty) {
      expect(paperSummary(subject)).toBe("No papers yet");
      expect(subjectsOf(subject.branch, subject.sem).some((row) => row.key === subject.key)).toBe(true);
      expect(findSubjectByCode(subject.branch, subject.sem, subject.codes[0]!) !== undefined).toBe(true);
    }
  });

  test("hydration keeps every row, keyed and without silent paper loss", () => {
    const source = catalogSource();
    const rows = catalog().subjects;
    expect(rows.length).toBe(source.subjects.length);
    expect(new Set(rows.map((subject) => subject.key)).size).toBe(rows.length);

    // A packed row indexes the shared table; a readable row carries its
    // papers inline. Either way hydration must not shrink one.
    const packed = catalogShape() === "packed";
    for (const subject of rows) {
      const raw = source.subjects.find((entry) => entry.key === subject.key);
      expect(raw === undefined).toBe(false);
      const listed = raw && (packed ? (raw.paperIds?.length ?? 0) : (raw.papers?.length ?? 0));
      if (raw) expect(subject.papers.length).toBe(listed as number);
    }
  });

  test("years and totals are honest, and the shelf order is total", () => {
    const data = catalog();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(data.generated)).toBe(true);
    expect(data.years.length).toBeGreaterThan(0);
    expect(data.papers.length).toBeGreaterThan(0);
    // The paper totals count distinct papers, not one row per branch copy:
    // the flatten over every shelf row carries copies, so it can only repeat.
    const rowPapers = allSubjects().reduce((total, subject) => total + subject.papers.length, 0);
    expect(rowPapers).toBeGreaterThanOrEqual(data.papers.length);

    const ordered = orderSubjects(allSubjects(), { now: new Date("2026-10-26T12:00:00") });
    expect(ordered.length).toBe(allSubjects().length);
    expect(new Set(ordered.map((subject) => subject.key)).size).toBe(allSubjects().length);
  });
});

describe("notes manifest", () => {
  /** Two real rows, one of them carrying a file that must never be linked. */
  const WIRE = JSON.stringify({
    updatedAt: "2026-10-01T00:00:00Z",
    subjects: [
      {
        id: "cse-4-ds",
        branch: "cse",
        sem: 4,
        code: "051403",
        name: "Data Structures",
        vvi: [{ topic: "AVL rotations", note: "LL, RR, LR, RL", marks: 5, confidence: "high" }],
        files: [
          {
            id: "ds-1",
            title: "Handwritten",
            kind: "handwritten",
            pages: 12,
            bytes: 2400000,
            url: "https://beu.prit.eu.org/notes/ds.pdf",
            updatedAt: "2026-09-30",
          },
        ],
      },
      { id: "cse-4-dbms", branch: "cse", sem: 4, code: "051402", name: "DBMS", vvi: [], files: [] },
      {
        id: "cse-5-os",
        branch: "cse",
        sem: 5,
        code: "061503",
        name: "Operating Systems",
        vvi: [],
        files: [{ url: "javascript:alert(1)" }, { url: "https://beu.prit.eu.org/notes/os.pdf" }],
      },
    ],
  });

  test("a broken manifest is empty, not a crash or a half-subject", () => {
    const empty = parseManifest("not json");
    expect(empty.subjects).toEqual([]);
    expect(empty.updatedAt).toBe("");
  });

  test("rows survive, unlinkable files do not, and lookups prefer the exact code", () => {
    const manifest = parseManifest(WIRE);
    expect(manifest.subjects.map((subject) => subject.code)).toEqual(["051403", "051402", "061503"]);

    const os = findSubject(manifest, "cse", 5, "061503");
    expect(os).not.toBe(null);
    // `javascript:` is not a note a student can open, so it is dropped.
    expect(os!.files.length).toBe(1);
    expect(os!.files[0].url).toContain("/notes/os.pdf");

    const sem4 = subjectsFor(manifest, "cse", 4);
    // VVI-heavy first, so the exam-relevant subject leads the shelf.
    expect(sem4.map((subject) => subject.code)).toEqual(["051403", "051402"]);
    expect(vviCount(sem4)).toBe(1);
    expect(fileCount(manifest.subjects)).toBe(2);

    expect(searchSubjects(manifest.subjects, "051402")[0].name).toBe("DBMS");
    expect(searchSubjects(manifest.subjects, "operating")[0].code).toBe("061503");
  });
});
