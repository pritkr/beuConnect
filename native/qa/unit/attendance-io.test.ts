/**
 * The attendance backup file — the site's envelope, read and written.
 *
 * Two contracts are pinned here, both silent when they break:
 *
 *  1. **The export is the site's file.** `beu.prit.eu.org/attendance` writes
 *     `{ version: 2, settings, subjects }`, so an export that renames a field or
 *     carries an app-only one opens as an empty page on the other side.
 *  2. **A bad file changes nothing.** Every row is checked before the ledger is
 *     touched, so a half-valid backup cannot leave attendance half-imported.
 *
 * All names and ids are synthetic; no student data is in this file.
 */

import { describe, expect, test } from "nsh/test";

import type { AttendanceRead } from "../../src/features/tools/attendance-io";
import {
  ATTENDANCE_FILE_VERSION,
  attendanceFileSummary,
  attendanceMergeSummary,
  exportAttendance,
  mergeAttendance,
  readAttendanceFile,
} from "../../src/features/tools/attendance-io";
import type { AttendanceState, AttendanceSubject } from "../../src/features/tools/state";

const TARGET = 80;
const DAY = 86_400_000;
const NOV_1 = Date.UTC(2026, 10, 1);
const NOV_3 = Date.UTC(2026, 10, 3);

/* ── fixtures ─────────────────────────────────────────────────────────── */

function paper(overrides: Partial<AttendanceSubject> = {}): AttendanceSubject {
  return { id: "site-1", name: "DBMS", attended: 12, total: 20, ...overrides };
}

function ledger(subjects: AttendanceSubject[], target = TARGET): AttendanceState {
  return { subjects, log: [], target };
}

/** The v2 envelope, with `settings` overridable so a legacy file can be built. */
function envelope(subjects: unknown[], settings: unknown = { targetPercentage: 75 }): string {
  return JSON.stringify({ version: 2, settings, subjects });
}

/** A parsed file, or the reason the parse was rejected. */
function read(text: string): AttendanceRead {
  const parsed = readAttendanceFile(text);
  if (!parsed.ok) throw new Error(`expected a valid file, got: ${parsed.reason}`);
  return parsed.file;
}

/** The sentence a rejection carries, asserted to be a sentence. */
function rejected(text: string): string {
  const parsed = readAttendanceFile(text);
  if (parsed.ok) throw new Error("expected the file to be rejected");
  expect(typeof parsed.reason).toBe("string");
  expect(parsed.reason.trim().length > 0).toBe(true);
  return parsed.reason;
}

/* ── export ───────────────────────────────────────────────────────────── */

describe("exportAttendance", () => {
  test("writes the site's version-2 envelope with this ledger's target", () => {
    const file = exportAttendance(ledger([paper()]));

    expect(file.version).toBe(ATTENDANCE_FILE_VERSION);
    expect(file.version).toBe(2);
    expect(file.settings.targetPercentage).toBe(TARGET);
    expect(file.subjects.length).toBe(1);
  });

  test("writes one row per paper, and nothing the site would not read", () => {
    const file = exportAttendance(
      ledger([
        paper({ id: "site-1", name: "DBMS", attended: 12, total: 20 }),
        paper({ id: "site-2", name: "COA", attended: 5, total: 8 }),
      ]),
    );

    expect(file.subjects.length).toBe(2);
    expect(file.subjects[0]).toEqual({
      id: "site-1",
      name: "DBMS",
      attended: 12,
      total: 20,
      history: [],
    });
    expect(file.subjects[1].name).toBe("COA");
    // The app's own markers stay here: the site has no field for them.
    expect(Object.keys(file.subjects[0])).toEqual(["id", "name", "attended", "total", "history"]);
  });

  test("a register-filled paper exports its two counts without the marker", () => {
    const file = exportAttendance(
      ledger([paper({ code: "105301", source: "gecs", syncedAt: NOV_1 })]),
    );

    expect(file.subjects[0]).toEqual({
      id: "site-1",
      name: "DBMS",
      attended: 12,
      total: 20,
      history: [],
    });
  });

  test("exports an empty ledger as the envelope with no papers", () => {
    const file = exportAttendance(ledger([]));

    expect(file.version).toBe(2);
    expect(file.subjects).toEqual([]);
    expect(file.settings.targetPercentage).toBe(TARGET);
  });

  test("round-trips through the reader with the same counts", () => {
    const state = ledger([paper(), paper({ id: "site-2", name: "COA", attended: 5, total: 8 })]);
    const back = read(JSON.stringify(exportAttendance(state)));

    expect(back.subjects.length).toBe(2);
    expect(back.subjects.map((subject) => [subject.id, subject.attended, subject.total])).toEqual([
      ["site-1", 12, 20],
      ["site-2", 5, 8],
    ]);
    expect(back.targetPercentage).toBe(TARGET);
    expect(back.legacy).toBe(false);
  });
});

/* ── reading ──────────────────────────────────────────────────────────── */

describe("readAttendanceFile — accepted files", () => {
  test("reads the v2 envelope and its target", () => {
    const file = read(envelope([paper()]));

    expect(file.legacy).toBe(false);
    expect(file.targetPercentage).toBe(75);
    expect(file.subjects.length).toBe(1);
    expect(file.subjects[0].id).toBe("site-1");
    expect(file.subjects[0].attended).toBe(12);
    expect(file.subjects[0].total).toBe(20);
  });

  test("reads a bare pre-v2 array, which carries no settings", () => {
    const file = read(JSON.stringify([{ id: "legacy-1", name: "COA", attended: 3, total: 4 }]));

    expect(file.legacy).toBe(true);
    expect(file.targetPercentage).toBe(null);
    expect(file.subjects.length).toBe(1);
    expect(file.subjects[0].name).toBe("COA");
  });

  test("a paper added but never marked has no attended count yet", () => {
    const file = read(envelope([{ id: "a", name: "COA", total: 0 }]));

    expect(file.subjects[0].attended).toBe(0);
    expect(file.subjects[0].total).toBe(0);
  });

  test("dates itself from the newest history timestamp", () => {
    const file = read(
      envelope([
        {
          id: "a",
          name: "DBMS",
          attended: 1,
          total: 2,
          history: [
            { action: "present", prevAttended: 0, prevTotal: 1, timestamp: NOV_1 },
            { action: "absent", prevAttended: 1, prevTotal: 1, timestamp: NOV_3 },
          ],
        },
      ]),
    );

    expect(file.updatedAt).toBe(NOV_3);
    expect(file.subjects[0].history.length).toBe(2);
  });

  test("keeps only history entries it can date, and normalises their action", () => {
    const file = read(
      envelope([
        {
          id: "a",
          name: "DBMS",
          attended: 1,
          total: 2,
          history: [
            { action: "present", prevAttended: 0, prevTotal: 1, timestamp: NOV_3 },
            { action: "undo", prevAttended: 0, prevTotal: 1, timestamp: NOV_1 },
            { action: "absent", prevAttended: 0, prevTotal: 1 },
            { action: "absent", prevAttended: 0, prevTotal: 1, timestamp: 0 },
          ],
        },
      ]),
    );

    expect(file.subjects[0].history.length).toBe(2);
    expect(file.subjects[0].history[0].action).toBe("present");
    expect(file.subjects[0].history[1].action).toBe("manual");
    expect(file.updatedAt).toBe(NOV_3);
  });
});

describe("readAttendanceFile — rejected files", () => {
  test("nothing pasted", () => {
    expect(rejected("")).toContain("Nothing");
    expect(rejected("   \n ")).toContain("Nothing");
  });

  test("text that is not JSON", () => {
    expect(rejected("{")).toContain("JSON");
    expect(rejected("DBMS 12/20")).toContain("JSON");
  });

  test("an envelope this app does not write", () => {
    rejected("null");
    rejected("42");
    rejected("{}");
    rejected('{"version":1,"settings":{"targetPercentage":75},"subjects":[]}');
    rejected('{"version":2,"settings":{"targetPercentage":75}}');
    rejected('{"version":2,"subjects":"DBMS"}');
  });

  test("a file with no papers", () => {
    expect(rejected("[]")).toContain("no papers");
    expect(rejected(envelope([]))).toContain("no papers");
  });

  test("a row that is not a paper", () => {
    expect(rejected(envelope(["DBMS"]))).toContain("Row 1");
    expect(rejected(envelope([[]]))).toContain("Row 1");
    expect(rejected(envelope([null]))).toContain("Row 1");
  });

  test("a paper without an id", () => {
    expect(rejected(envelope([{ name: "DBMS", attended: 1, total: 2 }]))).toContain("id");
    expect(rejected(envelope([{ id: "  ", name: "DBMS", attended: 1, total: 2 }]))).toContain("id");
  });

  test("a paper without a name", () => {
    expect(rejected(envelope([{ id: "a", attended: 1, total: 2 }]))).toContain("name");
    expect(rejected(envelope([{ id: "a", name: "   ", attended: 1, total: 2 }]))).toContain("name");
  });

  test("a count that is not a number", () => {
    expect(rejected(envelope([{ id: "a", name: "DBMS", attended: "1", total: 2 }]))).toContain("attended");
    expect(rejected(envelope([{ id: "a", name: "DBMS", attended: 1, total: "2" }]))).toContain("class count");
    expect(rejected(envelope([{ id: "a", name: "DBMS", attended: 1 }]))).toContain("class count");
  });

  test("a negative count", () => {
    expect(rejected(envelope([{ id: "a", name: "DBMS", attended: -1, total: 2 }]))).toContain("attended");
    expect(rejected(envelope([{ id: "a", name: "DBMS", attended: 1, total: -2 }]))).toContain("class count");
  });

  test("a paper marked present more often than it held classes", () => {
    const reason = rejected(envelope([{ id: "a", name: "DBMS", attended: 3, total: 2 }]));

    expect(reason).toContain("Row 1");
    expect(reason).toContain("more");
  });

  test("one bad row rejects the whole file, so nothing is half-read", () => {
    const text = envelope([
      { id: "a", name: "DBMS", attended: 1, total: 2 },
      { id: "b", name: "COA", attended: 9, total: 2 },
    ]);
    const reason = rejected(text);

    expect(reason).toContain("Row 2");
    expect("file" in readAttendanceFile(text)).toBe(false);
  });

  test("a rejected file gives the screen nothing to merge, so the ledger is untouched", () => {
    const state = ledger([paper()]);
    const snapshot = JSON.parse(JSON.stringify(state)) as AttendanceState;
    const parsed = readAttendanceFile(envelope([paper({ attended: 99, total: 20 })]));

    // The screen applies a file only when the read succeeded.
    if (parsed.ok) mergeAttendance(state, parsed.file);

    expect(parsed.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });
});

/* ── merging ──────────────────────────────────────────────────────────── */

describe("mergeAttendance", () => {
  test("adds every paper to an empty ledger, with the file's counts and target", () => {
    const file = read(
      envelope([
        { id: "site-1", name: "DBMS", attended: 12, total: 20 },
        { id: "site-2", name: "COA", attended: 5, total: 8 },
      ]),
    );
    const merge = mergeAttendance(ledger([]), file);

    expect(merge.replaced).toBe(0);
    expect(merge.added).toBe(2);
    expect(merge.state.subjects.length).toBe(2);
    expect(merge.state.subjects.map((subject) => subject.name)).toEqual(["DBMS", "COA"]);
    expect(merge.state.subjects.map((subject) => subject.attended)).toEqual([12, 5]);
    expect(merge.state.target).toBe(75);
    // A fresh local id, so two phones cannot disagree about the same paper.
    expect(merge.state.subjects[0].id.startsWith("sub-")).toBe(true);
    expect(merge.state.subjects[0].source).toBe("manual");
  });

  test("replaces the counts of a paper with the same id, without duplicating it", () => {
    const state = ledger([paper({ id: "site-1", name: "Old name", attended: 4, total: 10 })]);
    const merge = mergeAttendance(state, read(envelope([paper({ attended: 18, total: 20 })])));

    expect(merge.replaced).toBe(1);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects.length).toBe(1);
    expect(merge.state.subjects[0].id).toBe("site-1");
    expect(merge.state.subjects[0].name).toBe("DBMS");
    expect(merge.state.subjects[0].attended).toBe(18);
    expect(merge.state.subjects[0].total).toBe(20);
  });

  test("matches a paper by name when the two ids differ", () => {
    const state = ledger([paper({ id: "local-9", name: "  dbms ", attended: 4, total: 10 })]);
    const merge = mergeAttendance(state, read(envelope([paper({ id: "site-1" })])));

    expect(merge.replaced).toBe(1);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects.length).toBe(1);
    expect(merge.state.subjects[0].id).toBe("local-9");
    expect(merge.state.subjects[0].attended).toBe(12);
  });

  test("leaves a paper the file does not mention exactly as it was", () => {
    const state = ledger([paper(), paper({ id: "site-2", name: "COA", attended: 5, total: 8 })]);
    const merge = mergeAttendance(state, read(envelope([paper({ attended: 18, total: 20 })])));

    expect(merge.replaced).toBe(1);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects.length).toBe(2);
    expect(merge.state.subjects[1]).toEqual(state.subjects[1]);
  });

  test("takes the file's target, and keeps the local one when the file has none", () => {
    const withTarget = mergeAttendance(
      ledger([], 65),
      read(envelope([paper()], { targetPercentage: 85 })),
    );
    expect(withTarget.state.target).toBe(85);

    const legacy = read(JSON.stringify([{ id: "a", name: "COA", attended: 1, total: 2 }]));
    const kept = mergeAttendance(ledger([], 65), legacy);
    expect(kept.state.target).toBe(65);
  });

  test("clears the register marker on a paper the file replaces", () => {
    const state = ledger([paper({ source: "gecs", syncedAt: NOV_1, code: "105301" })]);
    const merge = mergeAttendance(
      state,
      read(envelope([{ id: "site-1", name: "DBMS", attended: 18, total: 20, code: "105301" }])),
    );

    expect(merge.state.subjects[0].source).toBe("manual");
    expect(merge.state.subjects[0].syncedAt).toBe(undefined);
  });

  test("never mutates the ledger it was given", () => {
    const state = ledger([paper(), paper({ id: "site-2", name: "COA", attended: 5, total: 8 })]);
    const snapshot = JSON.parse(JSON.stringify(state)) as AttendanceState;
    const merge = mergeAttendance(state, read(envelope([paper({ attended: 18, total: 20 })])));

    expect(state).toEqual(snapshot);
    expect(merge.state).not.toBe(state);
    expect(merge.state.subjects).not.toBe(state.subjects);
  });

  test("an empty file changes nothing", () => {
    const state = ledger([paper()]);
    const merge = mergeAttendance(state, {
      subjects: [],
      targetPercentage: null,
      updatedAt: null,
      legacy: false,
    });

    expect(merge.replaced).toBe(0);
    expect(merge.added).toBe(0);
    expect(merge.state.subjects).toEqual(state.subjects);
    expect(attendanceMergeSummary(merge)).toBe("Nothing changed");
  });
});

/* ── summaries ────────────────────────────────────────────────────────── */

describe("summaries", () => {
  test("a file without history counts its papers", () => {
    const summary = attendanceFileSummary(read(envelope([paper(), paper({ id: "site-2", name: "COA" })])));

    expect(summary).toBe("2 subjects");
    expect(attendanceFileSummary(read(envelope([paper()])))).toBe("1 subject");
  });

  test("a file with history adds the date it was last written", () => {
    const summary = attendanceFileSummary(
      read(
        envelope([
          {
            id: "a",
            name: "DBMS",
            attended: 1,
            total: 2,
            history: [{ action: "present", prevAttended: 0, prevTotal: 1, timestamp: NOV_3 - DAY }],
          },
        ]),
      ),
    );

    expect(summary.length > 0).toBe(true);
    expect(summary).toContain("1 subject");
    expect(summary).toContain("updated");
  });

  test("a merge names the half that happened", () => {
    const state = ledger([paper()]);
    const merge = mergeAttendance(state, read(envelope([paper({ attended: 18, total: 20 })])));

    expect(attendanceMergeSummary(merge)).toBe("1 replaced");
    expect(attendanceMergeSummary({ ...merge, replaced: 8, added: 2 })).toBe("8 replaced · 2 added");
    expect(attendanceMergeSummary({ ...merge, replaced: 0, added: 3 })).toBe("3 added");
  });
});
