import { describe, it, expect, vi } from "vitest";
import { resolveRoutineFromRegNo } from "./resolver";
import * as source from "./source";
import type { RoutineIndex } from "./types";

vi.mock("./source", async (importOriginal) => {
	const original = await importOriginal<typeof import("./source")>();
	return {
		...original,
		fetchRoutineIndex: vi.fn(),
		fetchRoutineDetail: vi.fn(),
	};
});

describe("Routine Resolver - CSE 4th Semester Merged Classes", () => {
	it("resolves branch as 'CSE' for a 4th semester CSE student regardless of section", async () => {
		const mockIndex: RoutineIndex = {
			fetchedAt: new Date().toISOString(),
			isStale: false,
			entries: [
				{
					sourceUrl: "https://classroutine.free.nf/view_timetable.php?branch=CSE&semester=4&batch=2K24",
					branchLabel: "CSE",
					semester: 4,
					batchLabel: "2K24",
					queryEffectiveDate: "2026-05-27",
					queryRoomNo: "105",
				},
				// Even if a CSE-A or CSE-B exists in 4th sem (though they shouldn't), the resolver should search for CSE first/only
				{
					sourceUrl: "https://classroutine.free.nf/view_timetable.php?branch=CSE-A&semester=4&batch=2K24",
					branchLabel: "CSE-A",
					semester: 4,
					batchLabel: "2K24",
					queryEffectiveDate: "2026-05-27",
					queryRoomNo: "103",
				}
			],
		};

		vi.mocked(source.fetchRoutineIndex).mockResolvedValue(mockIndex);
		vi.mocked(source.fetchRoutineDetail).mockResolvedValue({
			title: "Timetable - CSE Sem 4",
			heading: "GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA",
			subheading: "Time Table of Branch CSE | Semester 4 | Batch 2K24",
			effectiveFrom: "05-03-2026",
			roomLabel: "105",
			slots: [],
			days: [],
			papers: [],
			sourceUrl: "https://classroutine.free.nf/view_timetable.php?branch=CSE&semester=4&batch=2K24",
			fetchedAt: new Date().toISOString(),
			isStale: false,
		});

		// CSE Registration numbers (105 is CSE)
		// Roll 10 is section A in other semesters, but should resolve to CSE in 4th sem
		const regNoA = "24105157010"; 
		const resultA = await resolveRoutineFromRegNo(regNoA);
		expect(resultA.sourceBranchLabel).toBe("CSE");

		// Roll 70 is section B in other semesters, but should resolve to CSE in 4th sem
		const regNoB = "24105157070";
		const resultB = await resolveRoutineFromRegNo(regNoB);
		expect(resultB.sourceBranchLabel).toBe("CSE");
	});

	it("resolves branch as 'CSE-A' or 'CSE-B' in semesters other than 4th", async () => {
		const mockIndex: RoutineIndex = {
			fetchedAt: new Date().toISOString(),
			isStale: false,
			entries: [
				{
					sourceUrl: "https://classroutine.free.nf/view_timetable.php?branch=CSE-A&semester=3&batch=2K24",
					branchLabel: "CSE-A",
					semester: 3,
					batchLabel: "2K24",
					queryEffectiveDate: "2026-05-27",
					queryRoomNo: "103",
				},
				{
					sourceUrl: "https://classroutine.free.nf/view_timetable.php?branch=CSE-B&semester=3&batch=2K24",
					branchLabel: "CSE-B",
					semester: 3,
					batchLabel: "2K24",
					queryEffectiveDate: "2026-05-27",
					queryRoomNo: "105",
				}
			],
		};

		vi.mocked(source.fetchRoutineIndex).mockResolvedValue(mockIndex);
		vi.mocked(source.fetchRoutineDetail).mockImplementation(async (entry) => ({
			title: `Timetable - ${entry.branchLabel} Sem 3`,
			heading: "GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA",
			subheading: `Time Table of Branch ${entry.branchLabel} | Semester 3 | Batch 2K24`,
			effectiveFrom: "05-03-2026",
			roomLabel: "103",
			slots: [],
			days: [],
			papers: [],
			sourceUrl: entry.sourceUrl,
			fetchedAt: new Date().toISOString(),
			isStale: false,
		}));

		const regNoA = "24105157010"; // section A
		const resultA = await resolveRoutineFromRegNo(regNoA);
		expect(resultA.sourceBranchLabel).toBe("CSE-A");

		const regNoB = "24105157070"; // section B
		const resultB = await resolveRoutineFromRegNo(regNoB);
		expect(resultB.sourceBranchLabel).toBe("CSE-B");
	});
});
