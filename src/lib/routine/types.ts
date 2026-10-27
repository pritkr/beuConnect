export type RoutineSection = "A" | "B";

/** Lab batches a merged class is split into (the sheet prints "LAB Group A/B"). */
export type RoutineLabGroup = "A" | "B";

export interface RoutineSlot {
	id: number;
	label: string;
	start: string;
	end: string;
}

export interface RoutineBlock {
	startSlot: number;
	span: number;
	subject: string;
	type: string | null;
	room: string | null;
	durationLabel: string | null;
	/** Teacher printed under the abbreviation on the sheet. */
	faculty: string | null;
	/**
	 * Lab batch this block runs for, when the sheet splits a cell
	 * (`LAB Group A - Room No : 109`). `null` means the whole class attends.
	 */
	group: RoutineLabGroup | null;
}

export interface RoutineDay {
	day: string;
	blocks: RoutineBlock[];
}

export interface RoutinePaper {
	abbr: string;
	code: string;
	name: string;
	faculty: string;
	lectureHours: number;
	tutorialHours: number;
	practicalHours: string;
}

export interface RoutineSourceEntry {
	sourceUrl: string;
	branchLabel: string;
	semester: number;
	batchLabel: string;
	queryEffectiveDate: string;
	queryRoomNo: string;
}

export interface RoutineIndex {
	entries: RoutineSourceEntry[];
	fetchedAt: string;
	isStale: boolean;
}

export interface ParsedRoutine {
	title: string;
	heading: string;
	subheading: string;
	effectiveFrom: string | null;
	roomLabel: string | null;
	slots: RoutineSlot[];
	/** Period the RECESS column follows, so the grid is not hard-coded. */
	recessAfterSlot: number | null;
	days: RoutineDay[];
	papers: RoutinePaper[];
	sourceUrl: string;
	fetchedAt: string;
	isStale: boolean;
}

export interface ResolvedStudentRoutine {
	regNo: string;
	collegeCode: string;
	collegeName: string;
	branchCode: string;
	branchName: string;
	branchPath: string;
	batchYear: number;
	batchLabel: string;
	semester: number;
	isLateral: boolean;
	section: RoutineSection | null;
	/** Which lab batch the student's labs are read from. */
	labGroup: RoutineLabGroup;
	sourceBranchLabel: string;
	routine: ParsedRoutine;
}

export type RoutineLookupErrorCode =
	| "invalid_reg"
	| "unsupported_college"
	| "unsupported_branch"
	| "batch_unavailable"
	| "routine_unavailable"
	| "upstream_unavailable";
