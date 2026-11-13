export type RoutineSection = "A" | "B";

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
	sourceBranchLabel: string;
	routine: ParsedRoutine;
}
