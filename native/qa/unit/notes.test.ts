/**
 * Notes manifest parsing and selection — no UI, no network.
 *
 * Runs headless: `nsh test qa/unit/notes.test.ts`
 *
 * The screen trusts this file to turn whatever the host serves into a typed
 * shelf. A malformed subject must disappear, not crash the list; a subject with
 * only a PDF must survive; search must put an exact code above a name match.
 */

import { describe, expect, test } from "nsh/test";
import {
  fileCount,
  findSubject,
  firstCourse,
  parseManifest,
  searchSubjects,
  sizeLabel,
  subjectsFor,
  topicText,
  vviCount,
  type NoteSubject,
} from "../../src/features/notes/data";

const RAW = JSON.stringify({
  updatedAt: "2026-10-26",
  subjects: [
    {
      id: "cse-1-100102",
      branch: "cse",
      sem: 1,
      code: "100102",
      name: "Engineering Mathematics–I",
      vvi: [
        { topic: "Rolle's theorem", note: "Three conditions.", marks: 7, confidence: "high" },
        { topic: "Eigenvalues", note: "Trace equals the sum.", marks: "5", confidence: "unknown" },
        { topic: "", note: "no title, dropped" },
      ],
      files: [
        {
          id: "f1",
          title: "Unit 1",
          kind: "handwritten",
          pages: "24",
          bytes: 2_400_000,
          url: "https://beu.prit.eu.org/notes/cse/1/100102/unit-1.pdf",
          updatedAt: "2026-10-20",
        },
        { id: "f2", title: "Bad host", url: "javascript:alert(1)" },
      ],
    },
    { branch: "cse", sem: 1, name: "No code, fine" },
    { branch: "cse", sem: 9, name: "Bad semester, dropped" },
    { branch: "", sem: 1, name: "No branch, dropped" },
  ],
});

describe("parseManifest", () => {
  test("keeps subjects with a name, branch and semester", () => {
    const manifest = parseManifest(RAW);
    expect(manifest.subjects.map((row) => row.name)).toEqual(["Engineering Mathematics–I", "No code, fine"]);
  });

  test("drops malformed topics but keeps the rest", () => {
    const subject = parseManifest(RAW).subjects[0];
    expect(subject.vvi.map((topic) => topic.topic)).toEqual(["Rolle's theorem", "Eigenvalues"]);
    expect(subject.vvi[1].marks).toBe(5);
    // An unrecognised confidence is the middle, never a claim of "high".
    expect(subject.vvi[1].confidence).toBe("medium");
  });

  test("only http(s) files survive", () => {
    const subject = parseManifest(RAW).subjects[0];
    expect(subject.files.map((file) => file.id)).toEqual(["f1"]);
    expect(subject.files[0].pages).toBe(24);
  });

  test("junk is an empty manifest, never a throw", () => {
    expect(parseManifest("not json").subjects).toEqual([]);
    expect(parseManifest("[]").subjects).toEqual([]);
    expect(parseManifest("null").subjects).toEqual([]);
  });
});

describe("selection", () => {
  const manifest = parseManifest(RAW);

  test("subjectsFor filters branch and semester and puts VVI-heavy first", () => {
    const rows = subjectsFor(manifest, "cse", 1);
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("Engineering Mathematics–I");
  });

  test("findSubject matches the code and the id", () => {
    expect(findSubject(manifest, "cse", 1, "100102")?.code).toBe("100102");
    expect(findSubject(manifest, "cse", 1, "cse-1-100102")?.name).toBe("Engineering Mathematics–I");
    expect(findSubject(manifest, "ece", 1, "100102")).toBeNull();
  });

  test("firstCourse names a pair the manifest actually covers", () => {
    expect(firstCourse(manifest)).toEqual({ branch: "cse", sem: 1 });
    expect(firstCourse(parseManifest("{}"))).toBeNull();
  });

  test("counts add up", () => {
    const rows: NoteSubject[] = subjectsFor(manifest, "cse", 1);
    expect(vviCount(rows)).toBe(2);
    expect(fileCount(rows)).toBe(1);
  });

  test("search ranks an exact code above a name match", () => {
    const rows = subjectsFor(manifest, "cse", 1);
    expect(searchSubjects(rows, "100102")[0].name).toBe("Engineering Mathematics–I");
    expect(searchSubjects(rows, "rolle")[0].name).toBe("Engineering Mathematics–I");
    expect(searchSubjects(rows, "zzz")).toEqual([]);
  });
});

describe("labels", () => {
  test("sizeLabel speaks in KB and MB", () => {
    expect(sizeLabel(0)).toBe("");
    expect(sizeLabel(840 * 1024)).toBe("840 KB");
    expect(sizeLabel(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });

  test("topicText is a paste-ready block", () => {
    const subject = parseManifest(RAW).subjects[0];
    const text = topicText(subject, subject.vvi[0]);
    expect(text).toContain("Rolle's theorem");
    expect(text).toContain("Engineering Mathematics–I");
    expect(text).toContain("Likely 7 marks");
    expect(text).toContain("Three conditions.");
  });
});
