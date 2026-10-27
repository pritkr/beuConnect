import { describe, expect, it } from "vitest";
import {
	buildRowCells,
	hasLabGroups,
	istDayIndex,
	orderBlocks,
	primaryAndRest,
	segmentsFor,
} from "./layout";
import type { ParsedRoutine, RoutineBlock, RoutineDay, RoutineLabGroup } from "./types";

function block(overrides: Partial<RoutineBlock> & { startSlot: number }): RoutineBlock {
	return {
		span: 1,
		subject: "SUB",
		type: null,
		room: null,
		durationLabel: null,
		faculty: null,
		group: null,
		...overrides,
	};
}

function day(name: string, blocks: RoutineBlock[]): RoutineDay {
	return { day: name, blocks };
}

function routine(days: RoutineDay[], recessAfterSlot: number | null = null): ParsedRoutine {
	return {
		title: "Timetable",
		heading: "GEC Sheikhpura",
		subheading: "CSE Sem 4",
		effectiveFrom: "24-08-2026",
		roomLabel: "107",
		slots: [],
		recessAfterSlot,
		days,
		papers: [],
		sourceUrl: "https://example.test/routine",
		fetchedAt: "2026-10-27T00:00:00.000Z",
		isStale: false,
	};
}

function totalSpan(cells: ReturnType<typeof buildRowCells>): number {
	return cells.reduce((sum, cell) => sum + cell.span, 0);
}

describe("segmentsFor", () => {
	it("splits the periods around the break column", () => {
		expect(segmentsFor(3, [1, 2, 3, 4, 5, 6])).toEqual([
			{ kind: "slots", from: 1, to: 3 },
			{ kind: "break" },
			{ kind: "slots", from: 4, to: 6 },
		]);
	});

	it("keeps one run when the recess is not a published period", () => {
		expect(segmentsFor(null, [1, 2, 3, 4, 5, 6])).toEqual([{ kind: "slots", from: 1, to: 6 }]);
	});

	it("prints no break column after the last period", () => {
		expect(segmentsFor(6, [1, 2, 3, 4, 5, 6])).toEqual([{ kind: "slots", from: 1, to: 6 }]);
		expect(segmentsFor(6, [4, 5, 6])).toEqual([{ kind: "slots", from: 4, to: 6 }]);
	});

	it("splits runs at a hole in the period ids", () => {
		expect(segmentsFor(2, [1, 2, 4, 5])).toEqual([
			{ kind: "slots", from: 1, to: 2 },
			{ kind: "break" },
			{ kind: "slots", from: 4, to: 5 },
		]);
		expect(segmentsFor(3, [5, 1, 2, 4, 1])).toEqual([
			{ kind: "slots", from: 1, to: 2 },
			{ kind: "slots", from: 4, to: 5 },
		]);
	});

	it("returns nothing for a routine without periods", () => {
		expect(segmentsFor(3, [])).toEqual([]);
	});
});

describe("buildRowCells", () => {
	it("fills a sparse day so the spans cover the whole segment", () => {
		const monday = day("Monday", [
			block({ startSlot: 1, subject: "SG" }),
			block({ startSlot: 4, span: 2, subject: "MTE LAB", room: "Others" }),
		]);

		const cells = buildRowCells(monday, 1, 6);

		expect(cells.map((cell) => cell.span)).toEqual([1, 2, 2, 1]);
		expect(totalSpan(cells)).toBe(6);
		expect(cells[1]).toEqual({ kind: "empty", span: 2 });
		expect(cells[2].kind).toBe("block");
	});

	it("covers an empty day with one full-width cell", () => {
		const cells = buildRowCells(day("Sunday", []), 1, 6);
		expect(cells).toEqual([{ kind: "empty", span: 6 }]);
	});

	it("keeps a two-period block that starts at period 4", () => {
		const tuesday = day("Tuesday", [
			block({ startSlot: 4, span: 2, subject: "MTE LAB", room: "Others" }),
		]);

		const cells = buildRowCells(tuesday, 4, 6);

		expect(cells).toHaveLength(2);
		const [lab, tail] = cells;
		expect(lab.kind).toBe("block");
		if (lab.kind !== "block") throw new Error("expected a block cell");
		expect(lab.span).toBe(2);
		expect(lab.blocks[0].subject).toBe("MTE LAB");
		expect(tail).toEqual({ kind: "empty", span: 1 });
		expect(totalSpan(cells)).toBe(3);
	});

	it("skips a block that starts before the segment instead of repeating it", () => {
		const tuesday = day("Tuesday", [block({ startSlot: 3, span: 2, subject: "LAB", room: "109" })]);

		// The lab starts at P3 and runs into P4; the tail segment starts at P4.
		const cells = buildRowCells(tuesday, 4, 6);

		expect(cells).toEqual([{ kind: "empty", span: 3 }]);
		expect(totalSpan(cells)).toBe(3);
	});

	it("keeps the two lab batches of one merged cell together", () => {
		const monday = day("Monday", [
			block({ startSlot: 1, subject: "DM", type: "L" }),
			// Monday P5-P6 is one cell carrying both batches.
			block({ startSlot: 5, span: 2, subject: "DAA Lab", room: "109", group: "A" }),
			block({ startSlot: 5, span: 2, subject: "DBMS Lab", room: "7", group: "B" }),
		]);

		const cells = buildRowCells(monday, 4, 6);

		expect(cells).toHaveLength(2);
		expect(cells[0]).toEqual({ kind: "empty", span: 1 });
		const cell = cells[1];
		if (cell.kind !== "block") throw new Error("expected a block cell");
		expect(cell.span).toBe(2);
		expect(cell.blocks).toHaveLength(2);
		expect(cell.blocks.map((entry) => entry.subject)).toEqual(["DAA Lab", "DBMS Lab"]);
	});

	it("clamps a block that would run past the segment", () => {
		const friday = day("Friday", [block({ startSlot: 5, span: 3, subject: "SM LAB", room: "23" })]);

		const cells = buildRowCells(friday, 4, 6);

		expect(cells.map((cell) => cell.span)).toEqual([1, 2]);
		expect(totalSpan(cells)).toBe(3);
	});
});

describe("orderBlocks", () => {
	const groupA = block({ startSlot: 5, subject: "DAA Lab", group: "A" });
	const shared = block({ startSlot: 5, subject: "MM" });
	const groupB = block({ startSlot: 5, subject: "DBMS Lab", group: "B" });

	it("puts the student's own batch first, then the shared block, then the other batch", () => {
		expect(orderBlocks([groupA, shared, groupB], "B").map((entry) => entry.subject)).toEqual([
			"DBMS Lab",
			"MM",
			"DAA Lab",
		]);
		expect(orderBlocks([groupA, shared, groupB], "A").map((entry) => entry.subject)).toEqual([
			"DAA Lab",
			"MM",
			"DBMS Lab",
		]);
	});

	it("leaves the source order alone when nothing matches the student", () => {
		const grouped: RoutineLabGroup = "B";
		expect(orderBlocks([groupA, shared], grouped).map((entry) => entry.subject)).toEqual([
			"MM",
			"DAA Lab",
		]);
	});

	it("does not mutate the cell's blocks", () => {
		const input = [groupA, shared, groupB];
		orderBlocks(input, "B");
		expect(input.map((entry) => entry.subject)).toEqual(["DAA Lab", "MM", "DBMS Lab"]);
	});

	it("returns the primary plus the alternatives", () => {
		const { primary, rest } = primaryAndRest([groupA, groupB], "B");
		expect(primary?.subject).toBe("DBMS Lab");
		expect(rest.map((entry) => entry.subject)).toEqual(["DAA Lab"]);
	});

	it("keeps both ungrouped entries, the printed one first", () => {
		const cell = [
			block({ startSlot: 4, span: 2, subject: "EC LAB", room: "5" }),
			block({ startSlot: 4, span: 2, subject: "MM" }),
		];
		const { primary, rest } = primaryAndRest(cell, "A");
		expect(primary?.subject).toBe("EC LAB");
		expect(rest.map((entry) => entry.subject)).toEqual(["MM"]);
	});

	it("handles a cell with nothing in it", () => {
		expect(primaryAndRest([], "A")).toEqual({ primary: null, rest: [] });
	});
});

describe("hasLabGroups", () => {
	it("is false when the whole class attends every block", () => {
		const plain = routine([day("Monday", [block({ startSlot: 1 }), block({ startSlot: 2 })])]);
		expect(hasLabGroups(plain)).toBe(false);
	});

	it("is false when a block carries no group field at all", () => {
		const legacy = routine([
			day("Monday", [
				{ ...block({ startSlot: 1 }), group: undefined as unknown as RoutineLabGroup },
			]),
		]);
		expect(hasLabGroups(legacy)).toBe(false);
	});

	it("is true as soon as one cell splits the class", () => {
		const merged = routine([
			day("Monday", [block({ startSlot: 1 })]),
			day("Tuesday", [block({ startSlot: 4, span: 2, subject: "DBMS Lab", group: "B" })]),
		]);
		expect(hasLabGroups(merged)).toBe(true);
	});
});

describe("istDayIndex", () => {
	it("rolls over to the next weekday once IST passes midnight", () => {
		// Monday 26 Oct 2026, 19:00 UTC = Tuesday 27 Oct, 00:30 IST.
		expect(istDayIndex(new Date("2026-10-26T19:00:00Z"))).toBe(2);
		// A day later the same clock reading is Wednesday 28 Oct, 00:30 IST.
		expect(istDayIndex(new Date("2026-10-27T19:00:00Z"))).toBe(3);
	});

	it("keeps the UTC weekday while IST is still on the same day", () => {
		// 05:00 UTC = 10:30 IST, Tuesday 27 Oct 2026.
		expect(istDayIndex(new Date("2026-10-27T05:00:00Z"))).toBe(2);
		// Sunday 25 Oct 2026, 19:00 UTC = Monday 26 Oct, 00:30 IST.
		expect(istDayIndex(new Date("2026-10-25T19:00:00Z"))).toBe(1);
	});
});

describe("segmentsFor + buildRowCells", () => {
	it("draws the same periods the header draws", () => {
		const friday = day("Friday", [
			block({ startSlot: 1, subject: "SM" }),
			block({ startSlot: 3, subject: "SG" }),
			block({ startSlot: 4, span: 3, subject: "SM LAB", room: "23" }),
		]);
		const segments = segmentsFor(3, [1, 2, 3, 4, 5, 6]);

		const spans = segments.map((segment) =>
			segment.kind === "break" ? 1 : totalSpan(buildRowCells(friday, segment.from, segment.to)),
		);

		expect(spans).toEqual([3, 1, 3]);
		expect(segments.map((segment) => (segment.kind === "break" ? "break" : segment.to))).toEqual([
			3,
			"break",
			6,
		]);
	});
});
