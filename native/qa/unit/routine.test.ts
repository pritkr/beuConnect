/**
 * The routine-page reader — `src/features/tools/routine-parse.ts`, no network.
 *
 * Runs headless: `nsh test qa/unit/routine.test.ts`
 *
 * The fixture is the published `/routine` page with its Astro data attributes
 * stripped: the real column order (P1–P3, Break, P4–P6), a `colspan="2"` lab,
 * the batch footnote in `block-alt`, the page's own `<style>` mentioning
 * `.group-choice`, and the "Cached" pill the site prints when it serves an old
 * upstream sheet. Everything here is a rule a student reads off the screen, so
 * it is pinned in milliseconds instead of being re-derived from a screenshot.
 */

import { describe, expect, test } from "nsh/test";

import type { AttendanceSubject, RoutineState } from "../../src/features/tools/state";
import { DEFAULT_ROUTINE } from "../../src/features/tools/state";
import type { ParsedRoutine, RoutineClass } from "../../src/features/tools/routine-parse";
import {
  WEEK_ORDER,
  blankRoutine,
  classMoment,
  clockMinutes,
  parseRoutineHtml,
  sanitiseRoutine,
  weekAsText,
  weekIndex,
} from "../../src/features/tools/routine-parse";
import { matchAttendance, shortCode } from "../../src/features/tools/shared";

/** A real cell from the site: primary block, then the other batch's footnote. */
const DBMS_LAB = `<td colspan="2" class="slot-block"><div class="block-subject">DBMS Lab</div><div class="block-meta"><span class="group-badge">Group B</span><span class="type-badge">LAB</span></div><div class="block-alt"><span class="alt-label">Group A</span><span class="alt-subject">DAA Lab</span><span>Room 109</span></div></td>`;

const PAGE = `<!doctype html><html><head><style>
.group-choice { color: var(--text); }
.status-pill.warn { color: #f59e0b; }
</style></head><body><main>
<span class="meta-pill strong">CSE</span>
<span class="meta-pill">Sem 4</span>
<span class="meta-pill">2K24</span>
<span class="meta-pill">From 24-08-2026</span>
<span class="meta-pill">Room 107</span>
<span class="status-pill warn">Cached</span>
<a class="group-choice" href="/routine?reg=24105157010&amp;group=A" title="Lab group A">A</a>
<a class="group-choice is-active" href="/routine?reg=24105157010&amp;group=B" aria-current="true" title="Lab group B">B</a>
<table class="routine-table"><thead><tr>
<th scope="col">Day</th>
<th scope="col">P1<br><small>10:00-11:00</small></th>
<th scope="col">P2<br><small>11:00-12:00</small></th>
<th scope="col">P3<br><small>12:00-13:00</small></th>
<th scope="col" class="recess-head">Break</th>
<th scope="col">P4<br><small>14:00-15:00</small></th>
<th scope="col">P5<br><small>15:00-16:00</small></th>
<th scope="col">P6<br><small>16:00-17:00</small></th>
</tr></thead><tbody>
<tr class="routine-row"><th class="day-cell">Monday</th>
${DBMS_LAB}
<td class="slot-block"><div class="block-subject">COA</div><div class="block-meta"><span class="type-badge">THEORY</span><span>Room 109</span></div></td>
<td class="recess-cell"></td>
<td></td>
<td colspan="2" class="slot-block"><div class="block-subject">CN Lab</div><div class="block-meta"><span class="group-badge">Group B</span><span class="type-badge">LAB</span><span>Room 7</span></div></td>
</tr>
<tr class="routine-row"><th class="day-cell">Tuesday</th>
<td class="slot-block"><div class="block-subject">DBMS</div><div class="block-meta"><span class="type-badge">THEORY</span><span>Room 107</span></div></td>
<td class="slot-block"><div class="block-subject">DAA</div><div class="block-meta"><span class="type-badge">THEORY</span><span>Room 107</span></div></td>
<td class="slot-block"><div class="block-subject">OS</div><div class="block-meta"><span class="type-badge">THEORY</span><span>Room 107</span></div></td>
<td class="recess-cell"></td>
<td></td><td></td><td></td>
</tr>
</tbody></table>
<article class="paper-item"><div class="paper-topline"><span class="paper-abbr">CN</span><span class="paper-code">105406</span><div class="paper-hours"><span>L:3</span><span>T:0</span><span>P:0</span></div></div><h3>Computer Networks</h3><p>Mr. Anand Raj (AP)</p></article>
</main></body></html>`;

function parsed(): ParsedRoutine {
  const result = parseRoutineHtml(PAGE, "https://beu.prit.eu.org/routine?reg=24105157010&group=B");
  if (!result.ok) throw new Error(result.message);
  return result.routine;
}

function dayClasses(routine: ParsedRoutine, day: string): RoutineClass[] {
  return routine.days.find((entry) => entry.day === day)?.classes ?? [];
}

function paper(name: string): AttendanceSubject {
  return { id: name.toLowerCase(), name, attended: 0, total: 0 };
}

describe("parseRoutineHtml", () => {
  test("reads the header pills, the batch and the cache state", () => {
    const routine = parsed();
    expect(routine.branchLabel).toBe("CSE");
    expect(routine.semester).toBe("4");
    expect(routine.batch).toBe("2K24");
    expect(routine.effectiveFrom).toBe("24-08-2026");
    expect(routine.room).toBe("107");
    expect(routine.labGroup).toBe("B");
    expect(routine.splitClass).toBe(true);
    expect(routine.stale).toBe(true);
  });

  test("six periods, with the header's own times", () => {
    const routine = parsed();
    expect(routine.slots.length).toBe(6);
    expect(routine.slots[0]).toEqual({ index: 1, start: "10:00", end: "11:00" });
    expect(routine.slots[5]).toEqual({ index: 6, start: "16:00", end: "17:00" });
  });

  test("the recess column does not shift the periods after it", () => {
    const monday = dayClasses(parsed(), "Monday");
    const coa = monday.find((item) => item.subject === "COA");
    expect(coa?.slot).toBe(3);
    expect(coa?.start).toBe("12:00");
  });

  test("a merged lab covers two periods but is one class", () => {
    const monday = dayClasses(parsed(), "Monday");
    expect(monday.length).toBe(3);
    const lab = monday.find((item) => item.subject === "CN Lab");
    expect(lab?.slot).toBe(5);
    expect(lab?.start).toBe("15:00");
    expect(lab?.end).toBe("17:00");
  });

  test("the primary cell owns the room, not the other batch's footnote", () => {
    const lab = dayClasses(parsed(), "Monday").find((item) => item.subject === "DBMS Lab");
    expect(lab?.room).toBeNull();
    expect(lab?.alternatives).toEqual([{ group: "A", subject: "DAA Lab", room: "109" }]);
    expect(lab?.group).toBe("B");
  });

  test("papers keep their code, name, faculty and hours", () => {
    expect(parsed().papers).toEqual([
      { abbr: "CN", code: "105406", name: "Computer Networks", faculty: "Mr. Anand Raj (AP)", hours: "L:3 · T:0 · P:0" },
    ]);
  });

  test("a page whose styles mention group-choice but offers no switch is not split", () => {
    const single = `<style>.group-choice{color:red}</style><table class="routine-table"><thead><tr><th scope="col">P1 10:00-11:00</th><th scope="col">P2 11:00-12:00</th><th scope="col">P3 12:00-13:00</th><th scope="col">P4 14:00-15:00</th></tr></thead><tbody><tr><th>Monday</th><td class="slot-block"><div class="block-subject">DBMS</div></td><td></td><td></td><td></td></tr></tbody></table>`;
    const result = parseRoutineHtml(single, "https://example.test/routine");
    if (!result.ok) throw new Error(result.message);
    expect(result.routine.splitClass).toBe(false);
    expect(result.routine.labGroup).toBeNull();
    expect(result.routine.stale).toBe(false);
  });

  test("an error page answers with the site's sentence", () => {
    const result = parseRoutineHtml(
      `<main><p id="routineStateMessage">No routine is published for 21105157098, semester 4 yet.</p></main>`,
      "https://example.test/routine",
    );
    expect(result).toEqual({
      ok: false,
      message: "No routine is published for 21105157098, semester 4 yet.",
    });
  });

  test("a published table with no classes is empty, not a crash", () => {
    const result = parseRoutineHtml(
      `<table class="routine-table"><thead><tr><th scope="col">P1 10:00-11:00</th><th scope="col">P2 11:00-12:00</th><th scope="col">P3 12:00-13:00</th><th scope="col">P4 14:00-15:00</th></tr></thead><tbody><tr><th>Monday</th><td></td><td></td><td></td><td></td></tr></tbody></table>`,
      "https://example.test/routine",
    );
    expect(result).toEqual({ ok: false, message: "The routine is published but has no classes yet." });
  });
});

describe("weekAsText", () => {
  test("prints the header, the batch and one line per period", () => {
    const text = weekAsText(parsed());
    const lines = text.split("\n");
    expect(lines[0]).toBe("CSE · Sem 4 · 2K24");
    expect(lines[1]).toBe("From 24-08-2026 · Room 107");
    expect(lines[2]).toBe("Lab group B");
    expect(text).toContain("Monday");
    expect(text).toContain("10:00-12:00 · DBMS Lab (LAB)");
    expect(text).toContain("12:00-13:00 · COA (THEORY) · Room 109");
    expect(text).toContain("Tuesday");
    expect(text).toContain("15:00-17:00 · CN Lab (LAB) · Room 7");
  });

  test("a free day says so instead of disappearing", () => {
    const blank = blankRoutine();
    blank.days[0].classes.push({
      slot: 1,
      start: "10:00",
      end: "11:00",
      subject: "DBMS",
      type: null,
      room: null,
      teacher: null,
    });
    const text = weekAsText(blank);
    expect(text).toContain("Monday\n  10:00-11:00 · DBMS");
    expect(text).toContain("Tuesday\n  Free");
  });
});

describe("sanitiseRoutine", () => {
  test("keeps the batch and the other batch's footnote", () => {
    const saved = sanitiseRoutine({
      ...parsed(),
      labGroup: "b",
      days: [
        {
          day: "Monday",
          classes: [
            {
              slot: "2",
              start: "9:5",
              end: "11:00",
              subject: "DBMS Lab",
              group: "b",
              alternatives: [
                { group: "a", subject: "DAA Lab", room: "109" },
                { group: "A", subject: "" },
              ],
            },
          ],
        },
      ],
    });
    expect(saved?.labGroup).toBe("B");
    const first = saved?.days[0].classes[0];
    expect(first?.slot).toBe(2);
    expect(first?.start).toBe("");
    expect(first?.end).toBe("11:00");
    expect(first?.group).toBe("B");
    expect(first?.alternatives).toEqual([{ group: "A", subject: "DAA Lab", room: "109" }]);
  });

  test("junk is dropped, not rendered", () => {
    expect(sanitiseRoutine(null)).toBeNull();
    expect(sanitiseRoutine({ days: "Monday" })).toBeNull();
    const saved = sanitiseRoutine({
      days: [{ day: "Monday", classes: [{ subject: "" }, { subject: "DBMS", slot: -4 }] }, { day: "" }],
    });
    expect(saved?.days.length).toBe(1);
    expect(saved?.days[0].classes.map((item) => item.subject)).toEqual(["DBMS"]);
    expect(saved?.slots.length).toBe(6);
  });

  test("a stored routine keeps the student's own batch choice", () => {
    const state: RoutineState = { ...DEFAULT_ROUTINE, group: "A" };
    expect(state.group).toBe("A");
  });
});

describe("routine maths", () => {
  const item = (start: string, end: string, slot = 1): RoutineClass => ({
    slot,
    start,
    end,
    subject: "DBMS",
    type: null,
    room: null,
    teacher: null,
  });

  test("a week-grid code fits a 40pt cell and names the paper", () => {
    expect(shortCode("Data Structures")).toBe("DS");
    expect(shortCode("DBMS")).toBe("DBMS");
    expect(shortCode("DBMS Lab")).toBe("DBMS");
    expect(shortCode("DAA Lab")).toBe("DAA");
    expect(shortCode("CN Lab")).toBe("CN");
    expect(shortCode("Computer Organization & Architecture")).toBe("COA");
    expect(shortCode("Design and Analysis of Algorithms")).toBe("DAA");
    expect(shortCode("  ")).toBe("");
  });

  test("the week runs Monday to Sunday; unknown days sort last", () => {
    expect(clockMinutes("10:00")).toBe(600);
    expect(clockMinutes("9:05")).toBe(545);
    expect(clockMinutes("")).toBe(-1);
    expect(WEEK_ORDER.indexOf("Monday")).toBeLessThan(WEEK_ORDER.indexOf("Saturday"));
    expect(weekIndex("Holiday")).toBe(WEEK_ORDER.length);
  });

  test("a class is now, next, later or past", () => {
    expect(classMoment(item("10:00", "11:00"), 10 * 60 + 20, null)).toBe("now");
    expect(classMoment(item("10:00", "11:00"), 9 * 60, 1)).toBe("next");
    expect(classMoment(item("10:00", "11:00"), 9 * 60, 2)).toBe("later");
    expect(classMoment(item("10:00", "11:00"), 12 * 60, null)).toBe("past");
    expect(classMoment(item("", ""), 12 * 60, 1)).toBe("next");
  });
});

describe("matchAttendance", () => {
  const routine = parsed();
  const papers = routine.papers;
  const lab = dayClasses(routine, "Monday").find((entry) => entry.subject === "DBMS Lab")!;

  test("an abbreviation finds the paper the sheet named in full", () => {
    const ledger = [paper("Computer Networks")];
    const cn: RoutineClass = { ...lab, subject: "CN", type: "THEORY", slot: 1 };
    expect(matchAttendance(cn, papers, ledger)?.name).toBe("Computer Networks");
    expect(matchAttendance({ ...lab, subject: "Computer Networks" }, papers, ledger)?.name).toBe("Computer Networks");
  });

  test("a prefix on either side is the same paper", () => {
    const ledger = [paper("Computer Organization & Architecture")];
    const coa: RoutineClass = { ...lab, subject: "Computer Organization", type: "THEORY", slot: 3 };
    expect(matchAttendance(coa, papers, ledger)?.name).toBe("Computer Organization & Architecture");
  });

  test("an untracked paper gets no mark", () => {
    expect(matchAttendance(lab, papers, [paper("Operating Systems")])).toBeNull();
  });
});
