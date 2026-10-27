import { beforeEach, describe, expect, it, vi } from "vitest";
import { inferLabGroup, RoutineLookupError, resolveRoutineFromRegNo } from "./resolver";
import * as source from "./source";
import type {
	ParsedRoutine,
	RoutineIndex,
	RoutineSourceEntry,
} from "./types";

vi.mock("./source", async (importOriginal) => {
	const original = await importOriginal<typeof import("./source")>();
	return {
		...original,
		fetchRoutineIndex: vi.fn(),
		fetchRoutineDetail: vi.fn(),
	};
});

const FETCHED_AT = "2026-10-27T14:30:00.000Z";

function entry(
	batchLabel: string,
	semester: number,
	branchLabel: string,
): RoutineSourceEntry {
	const sourceUrl = `https://classroutine.free.nf/view_timetable.php?branch=${encodeURIComponent(
		branchLabel,
	)}&semester=${semester}&batch=${batchLabel}&effective_date=2026-10-27&room_no=101`;

	return {
		sourceUrl,
		branchLabel,
		semester,
		batchLabel,
		queryEffectiveDate: "2026-10-27",
		queryRoomNo: "101",
	};
}

function parsedFor(sourceEntry: RoutineSourceEntry): ParsedRoutine {
	return {
		title: `Timetable - ${sourceEntry.branchLabel} Sem ${sourceEntry.semester}`,
		heading: "GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA",
		subheading: `Time Table of Branch ${sourceEntry.branchLabel} | Semester ${sourceEntry.semester} | Batch ${sourceEntry.batchLabel}`,
		effectiveFrom: "27-10-2026",
		roomLabel: sourceEntry.queryRoomNo,
		slots: [],
		recessAfterSlot: null,
		days: [],
		papers: [],
		sourceUrl: sourceEntry.sourceUrl,
		fetchedAt: FETCHED_AT,
		isStale: false,
	};
}

function mockIndex(entries: RoutineSourceEntry[]): void {
	const index: RoutineIndex = { entries, fetchedAt: FETCHED_AT, isStale: false };
	vi.mocked(source.fetchRoutineIndex).mockResolvedValue(index);
}

async function expectLookupError(
	regNo: string,
	code: RoutineLookupError["code"],
): Promise<RoutineLookupError> {
	const error = await resolveRoutineFromRegNo(regNo).catch((thrown) => thrown);
	expect(error).toBeInstanceOf(RoutineLookupError);
	expect((error as RoutineLookupError).code).toBe(code);
	return error as RoutineLookupError;
}

beforeEach(() => {
	vi.mocked(source.fetchRoutineIndex).mockReset();
	vi.mocked(source.fetchRoutineDetail).mockReset();
	vi.mocked(source.fetchRoutineDetail).mockImplementation(async (sourceEntry) =>
		parsedFor(sourceEntry),
	);
});

describe("CSE sections", () => {
	it("splits 2K26 CSE into CSE-A and CSE-B at roll 60", async () => {
		mockIndex([entry("2K26", 1, "CSE-A"), entry("2K26", 1, "CSE-B")]);

		const sectionA = await resolveRoutineFromRegNo("26105157010");
		expect(sectionA.sourceBranchLabel).toBe("CSE-A");
		expect(sectionA.section).toBe("A");

		const sectionB = await resolveRoutineFromRegNo("26105157070");
		expect(sectionB.sourceBranchLabel).toBe("CSE-B");
		expect(sectionB.section).toBe("B");
	});

	it("uses the merged CSE class for 2K25 regardless of section", async () => {
		mockIndex([entry("2K25", 3, "CSE")]);

		const sectionA = await resolveRoutineFromRegNo("25105157010");
		expect(sectionA.sourceBranchLabel).toBe("CSE");
		expect(sectionA.semester).toBe(3);

		const sectionB = await resolveRoutineFromRegNo("25105157070");
		expect(sectionB.sourceBranchLabel).toBe("CSE");
		expect(sectionB.semester).toBe(3);
	});

	it("uses the merged CSE class for 2K24 semester 4", async () => {
		mockIndex([entry("2K24", 4, "CSE")]);

		const sectionA = await resolveRoutineFromRegNo("24105157010");
		expect(sectionA.sourceBranchLabel).toBe("CSE");
		expect(sectionA.semester).toBe(4);

		const sectionB = await resolveRoutineFromRegNo("24105157070");
		expect(sectionB.sourceBranchLabel).toBe("CSE");
		expect(sectionB.semester).toBe(4);
	});

	it("never borrows the other section's timetable", async () => {
		mockIndex([entry("2K26", 1, "CSE-A")]);

		await expectLookupError("26105157070", "routine_unavailable");
	});
});

describe("branch candidates", () => {
	it("resolves Mechatronics (161) to MET", async () => {
		mockIndex([
			entry("2K25", 3, "ME"),
			entry("2K25", 3, "MET"),
			entry("2K25", 3, "ME/MET"),
		]);

		const result = await resolveRoutineFromRegNo("25161157010");
		expect(result.sourceBranchLabel).toBe("MET");
		expect(result.branchName).toBe("Mechatronics Engineering");
	});

	it("prefers the merged ME class for Mechanical (102) on 2K25", async () => {
		mockIndex([
			entry("2K25", 3, "ME/MET"),
			entry("2K25", 3, "ME"),
			entry("2K25", 3, "MET"),
		]);

		const result = await resolveRoutineFromRegNo("25102157010");
		expect(result.sourceBranchLabel).toBe("ME");
	});

	it("falls back to the combined ME/MET class for Mechanical (102) on 2K26", async () => {
		mockIndex([entry("2K26", 1, "ME/MET")]);

		const result = await resolveRoutineFromRegNo("26102157010");
		expect(result.sourceBranchLabel).toBe("ME/MET");
	});

	it("matches labels case-insensitively and trims them", async () => {
		mockIndex([entry("2K25", 3, " cse ")]);

		const result = await resolveRoutineFromRegNo("25105157010");
		expect(result.semester).toBe(3);
	});
});

describe("semester selection", () => {
	it("tries the highest published semester first", async () => {
		mockIndex([
			entry("2K24", 3, "CSE"),
			entry("2K24", 5, "CSE"),
		]);

		const result = await resolveRoutineFromRegNo("24105157010");
		expect(result.semester).toBe(5);
	});

	it("falls back to a lower semester when the highest one lacks the branch", async () => {
		mockIndex([
			entry("2K24", 4, "CE"),
			entry("2K24", 3, "CSE"),
		]);

		const result = await resolveRoutineFromRegNo("24105157010");
		expect(result.semester).toBe(3);
		expect(result.sourceBranchLabel).toBe("CSE");
	});

	it("reports batch_unavailable when the batch publishes nothing", async () => {
		mockIndex([entry("2K25", 3, "CSE")]);

		await expectLookupError("26105157010", "batch_unavailable");
	});

	it("reports routine_unavailable when no semester carries the branch", async () => {
		mockIndex([entry("2K24", 4, "CE")]);

		await expectLookupError("24105157010", "routine_unavailable");
	});
});

describe("errors", () => {
	it("rejects a registration number that cannot be parsed", async () => {
		await expectLookupError("nope", "invalid_reg");
	});

	it("rejects colleges the routine source does not cover", async () => {
		const error = await expectLookupError("26105102010", "unsupported_college");
		expect(error.message).toContain("Vidya Vihar Institute of Technology, Purnea");
	});

	it("rejects branches the routine source has no label for", async () => {
		const error = await expectLookupError("25107157010", "unsupported_branch");
		expect(error.message).toContain("Leather Technology Engineering");
	});

	it("reports upstream_unavailable when the index cannot be fetched", async () => {
		vi.mocked(source.fetchRoutineIndex).mockRejectedValue(new Error("boom"));

		await expectLookupError("26105157010", "upstream_unavailable");
	});
});

describe("lab groups", () => {
	it("infers A/B at roll 60", () => {
		expect(inferLabGroup(1, false)).toBe("A");
		expect(inferLabGroup(60, false)).toBe("A");
		expect(inferLabGroup(61, false)).toBe("B");
		expect(inferLabGroup(117, false)).toBe("B");
		expect(inferLabGroup(905, true)).toBe("A");
	});

	it("lets the caller override the inferred group", async () => {
		mockIndex([entry("2K25", 3, "CSE")]);

		const inferredA = await resolveRoutineFromRegNo("25105157010");
		expect(inferredA.labGroup).toBe("A");

		const forcedB = await resolveRoutineFromRegNo("25105157010", {
			labGroup: "B",
		});
		expect(forcedB.labGroup).toBe("B");

		const inferredB = await resolveRoutineFromRegNo("25105157070");
		expect(inferredB.labGroup).toBe("B");

		const forcedA = await resolveRoutineFromRegNo("25105157070", {
			labGroup: "A",
		});
		expect(forcedA.labGroup).toBe("A");

		const ignoredNull = await resolveRoutineFromRegNo("25105157070", {
			labGroup: null,
		});
		expect(ignoredNull.labGroup).toBe("B");
	});
});

describe("lateral entry", () => {
	it("moves the batch back a year and keeps section/lab group A", async () => {
		mockIndex([entry("2K24", 4, "CSE"), entry("2K25", 3, "CSE")]);

		const result = await resolveRoutineFromRegNo("25105157905");
		expect(result.isLateral).toBe(true);
		expect(result.batchLabel).toBe("2K24");
		expect(result.semester).toBe(4);
		expect(result.section).toBe("A");
		expect(result.labGroup).toBe("A");
	});
});
