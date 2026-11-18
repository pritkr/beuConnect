/**
 * The attendance backup file — `src/features/tools/attendance-io.ts`, no
 * network and no screen.
 *
 * The shape is the website's, not ours: an export made on either side has to
 * open on the other. So the contract here is a file format plus two honesty
 * rules — an unreadable file changes nothing, and a paper the file does not
 * mention is left exactly as it was. Everything is synthetic; no real register.
 */

import { describe, expect, test } from "nsh/test";
import {
  ATTENDANCE_FILE_VERSION,
  attendanceFileSummary,
  attendanceMergeSummary,
  exportAttendance,
  mergeAttendance,
  readAttendanceFile,
  type AttendanceFile,
} from "../../src/features/tools/attendance-io";
import type { AttendanceState } from "../../src/features/tools/state";

/* --------------------------------------------------------------- fixtures */

const DAY = Date.UTC(2026, 10, 3);

function state(overrides: Partial<AttendanceState> = {}): AttendanceState {
  return {
    target: 75,
    subjects: [
      { id: "sub-a", name: "Data Structures", attended: 18, total: 24 },
      { id: "sub-b", name: "Digital Circuits", attended: 12, total: 20, code: "EC401" },
    ],
    log: [
      {
        id: "log-1",
        subjectId: "sub-a",
        subjectName: "Data Structures",
        action: "present",
        at: DAY,
      },
    ],
    ...overrides,
  };
}

/** The exact envelope `beu.prit.eu.org/attendance` writes. */
function siteFile(): AttendanceFile {
  return {
    version: 2,
    settings: { targetPercentage: 75 },
    subjects: [
      {
        id: "site-1",
        name: "Data Structures",
        attended: 20,
        total: 25,
        history: [
          { action: "present", prevAttended: 19, prevTotal: 24, timestamp: DAY },
          { action: "absent", prevAttended: 18, prevTotal: 24, timestamp: DAY - 86_400_000 },
        ],
      },
    ],
  };
}

function parse(value: unknown) {
  return readAttendanceFile(JSON.stringify(value));
}

/* ------------------------------------------------------------------ export */

describe("writing the site's file", () => {
  test("the envelope names the site's version and keeps every count", () => {
    const file = exportAttendance(state());
    expect(file.version).toBe(ATTENDANCE_FILE_VERSION);
    expect(file.settings).toEqual({ targetPercentage: 75 });
    expect(file.subjects.map((s) => [s.id, s.name, s.attended, s.total])).toEqual([
      ["sub-a", "Data Structures", 18, 24],
      ["sub-b", "Digital Circuits", 12, 20],
    ]);
  });

  test("history goes out empty, because this app cannot rebuild previous totals", () => {
    const file = exportAttendance(state());
    for (const subject of file.subjects) expect(subject.history).toEqual([]);
  });

  test("a paper the register filled in exports its two counts like any other", () => {
    const file = exportAttendance(
      state({
        subjects: [
          { id: "sub-c", name: "Physics", attended: 9, total: 12, code: "PH201", source: "gecs", syncedAt: 1 },
        ],
      }),
    );
    expect(file.subjects[0]).toEqual({
      id: "sub-c",
      name: "Physics",
      attended: 9,
      total: 12,
      history: [],
    });
  });

  test("an empty ledger is a valid file with no papers", () => {
    const file = exportAttendance(state({ subjects: [] }));
    expect(file.subjects).toEqual([]);
    expect(parse(file).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------- parse */

describe("reading a file", () => {
  test("the site's envelope reads back with its target and newest history date", () => {
    const read = parse(siteFile());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.legacy).toBe(false);
    expect(read.file.targetPercentage).toBe(75);
    expect(read.file.updatedAt).toBe(DAY);
    expect(read.file.subjects[0]).toMatchObject({ attended: 20, total: 25 });
  });

  test("the pre-v2 bare array is accepted, with no settings and no invented target", () => {
    const read = parse([{ id: "a", name: "Maths", attended: 4, total: 6 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.legacy).toBe(true);
    expect(read.file.targetPercentage).toBeNull();
    expect(read.file.updatedAt).toBeNull();
  });

  test("a paper added but never marked has an attended count of zero", () => {
    const read = parse([{ id: "a", name: "Maths", total: 6 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.subjects[0].attended).toBe(0);
  });

  test("a missing total is an error that names its row", () => {
    expect(parse([{ id: "a", name: "Maths", total: 6 }, { id: "b", name: "Physics" }])).toMatchObject({
      ok: false,
      reason: "Row 2 has no class count.",
    });
  });

  test("a count that is not a whole number is a sentence, not a rounded guess", () => {
    expect(parse([{ id: "a", name: "Maths", total: "6" }])).toMatchObject({
      ok: false,
      reason: "Row 1 has an invalid class count.",
    });
    expect(parse([{ id: "a", name: "Maths", attended: "4", total: 6 }])).toMatchObject({
      ok: false,
      reason: "Row 1 has an invalid attended count.",
    });
  });

  test("attended more classes than the paper held is refused", () => {
    expect(parse([{ id: "a", name: "Maths", attended: 7, total: 6 }])).toMatchObject({
      ok: false,
      reason: "Row 1 has attended more classes than it held.",
    });
  });

  test("a paper with no id and a paper with no name each name their row", () => {
    expect(parse([{ name: "Maths", total: 6 }])).toMatchObject({
      ok: false,
      reason: "Row 1 has no paper id.",
    });
    expect(parse([{ id: "a", name: "   ", total: 6 }])).toMatchObject({
      ok: false,
      reason: "Row 1 has no paper name.",
    });
  });

  test("junk, the wrong version and an empty file are refused before anything applies", () => {
    expect(readAttendanceFile("")).toMatchObject({ ok: false, reason: "Nothing pasted." });
    expect(readAttendanceFile("{")).toMatchObject({ ok: false, reason: "Not valid JSON." });
    expect(readAttendanceFile("42")).toMatchObject({
      ok: false,
      reason: "Not a BEUConnect attendance file.",
    });
    expect(parse({ version: 1, settings: {}, subjects: [] })).toMatchObject({
      ok: false,
      reason: "Not a BEUConnect attendance file.",
    });
    expect(parse({ version: 2, settings: {} })).toMatchObject({
      ok: false,
      reason: "Not a BEUConnect attendance file.",
    });
    expect(parse({ version: 2, settings: {}, subjects: [] })).toMatchObject({
      ok: false,
      reason: "The file has no papers.",
    });
  });

  test("history keeps real dates, forgets the rest, and never invents an action", () => {
    const read = parse([
      {
        id: "a",
        name: "Maths",
        attended: 4,
        total: 6,
        history: [
          { action: "present", prevAttended: 3, prevTotal: 6, timestamp: 1_000 },
          { action: "teleported", prevAttended: 2, prevTotal: 6, timestamp: 2_000 },
          { action: "absent", prevAttended: 1, prevTotal: 6, timestamp: 0 },
        ],
      },
    ]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.subjects[0].history).toEqual([
      { action: "present", prevAttended: 3, prevTotal: 6, timestamp: 1_000 },
      { action: "manual", prevAttended: 2, prevTotal: 6, timestamp: 2_000 },
    ]);
    expect(read.file.updatedAt).toBe(2_000);
  });

  test("a target outside 1–100 is clamped, and a missing target stays missing", () => {
    const rows = [{ id: "a", name: "M", total: 1 }];
    const high = parse({ version: 2, settings: { targetPercentage: 150 }, subjects: rows });
    const low = parse({ version: 2, settings: { targetPercentage: 0 }, subjects: rows });
    const none = parse({ version: 2, settings: {}, subjects: rows });
    expect(high.ok && high.file.targetPercentage).toBe(100);
    expect(low.ok && low.file.targetPercentage).toBe(1);
    expect(none.ok && none.file.targetPercentage).toBeNull();
  });
});

/* ------------------------------------------------------------------- merge */

describe("merging a file into the ledger", () => {
  test("a paper matches by code, then by the site's id, then by name", () => {
    const read = parse({
      version: 2,
      settings: { targetPercentage: 80 },
      subjects: [
        { id: "site-x", name: "Data Structures", attended: 20, total: 25 },
        { id: "site-y", name: "Digital Circuits", attended: 15, total: 20, code: "ec401" },
      ],
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const merge = mergeAttendance(state(), read.file);
    expect(merge.replaced).toBe(2);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects.map((s) => [s.name, s.attended, s.total])).toEqual([
      ["Data Structures", 20, 25],
      ["Digital Circuits", 15, 20],
    ]);
    expect(merge.state.target).toBe(80);
  });

  test("a paper the file does not mention keeps its counts exactly", () => {
    const read = parse([{ id: "site-x", name: "Data Structures", attended: 20, total: 25 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const merge = mergeAttendance(state(), read.file);
    expect(merge.replaced).toBe(1);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects[1]).toEqual(state().subjects[1]);
  });

  test("a new paper is added, with a generated id and the file's code", () => {
    const read = parse([{ id: "site-z", name: "Thermodynamics", attended: 3, total: 8, code: "ME301" }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const merge = mergeAttendance(state(), read.file);
    expect(merge.added).toBe(1);
    const added = merge.state.subjects[2];
    expect(added.id).toMatch(/^sub-/);
    expect(added).toMatchObject({ name: "Thermodynamics", attended: 3, total: 8, code: "ME301" });
  });

  test("imported counts are the student's again, not the register's", () => {
    const current = state({
      subjects: [{ id: "sub-a", name: "Physics", attended: 9, total: 12, code: "PH201", source: "gecs", syncedAt: 5 }],
    });
    const read = parse([{ id: "sub-a", name: "Physics", attended: 10, total: 12 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const merge = mergeAttendance(current, read.file);
    expect(merge.state.subjects[0].source).toBe("manual");
    expect(merge.state.subjects[0].syncedAt).toBeUndefined();
  });

  test("the date log is never rewritten by an import", () => {
    const read = parse([{ id: "sub-a", name: "Data Structures", attended: 20, total: 25 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(mergeAttendance(state(), read.file).state.log).toEqual(state().log);
  });

  test("the caller's ledger is not edited", () => {
    const current = state();
    const read = parse([{ id: "sub-a", name: "Data Structures", attended: 20, total: 25 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    mergeAttendance(current, read.file);
    expect(current).toEqual(state());
  });

  test("export then read then merge round-trips every count", () => {
    const current = state();
    const read = readAttendanceFile(JSON.stringify(exportAttendance(current)));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const merge = mergeAttendance(current, read.file);
    expect(merge.replaced).toBe(current.subjects.length);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects.map((s) => [s.id, s.name, s.attended, s.total])).toEqual(
      current.subjects.map((s) => [s.id, s.name, s.attended, s.total]),
    );
    expect(merge.state.target).toBe(current.target);
  });
});

/* ------------------------------------------------------------------- words */

describe("what the screen prints", () => {
  test("the file summary counts papers and dates the newest event", () => {
    const read = parse({
      version: 2,
      settings: {},
      subjects: [
        { id: "a", name: "Maths", total: 6, history: [{ action: "present", timestamp: DAY }] },
        { id: "b", name: "Physics", total: 8 },
      ],
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const summary = attendanceFileSummary(read.file);
    expect(summary.startsWith("2 subjects · updated ")).toBe(true);
    expect(summary.endsWith("2026")).toBe(true);
  });

  test("one paper is singular and no history drops the date", () => {
    const read = parse([{ id: "a", name: "Maths", total: 6 }]);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(attendanceFileSummary(read.file)).toBe("1 subject");
  });

  test("the merge summary names only the half that happened", () => {
    expect(attendanceMergeSummary({ state: state(), replaced: 2, added: 0 })).toBe("2 replaced");
    expect(attendanceMergeSummary({ state: state(), replaced: 0, added: 3 })).toBe("3 added");
    expect(attendanceMergeSummary({ state: state(), replaced: 1, added: 2 })).toBe("1 replaced · 2 added");
    expect(attendanceMergeSummary({ state: state(), replaced: 0, added: 0 })).toBe("Nothing changed");
  });
});
