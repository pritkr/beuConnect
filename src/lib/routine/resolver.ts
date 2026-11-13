import { parseBeuRegNo } from "../beuReg";
import { fetchRoutineDetail, fetchRoutineIndex } from "./source";
import type {
	ResolvedStudentRoutine,
	RoutineIndex,
	RoutineSection,
	RoutineSourceEntry,
} from "./types";

export class RoutineLookupError extends Error {
	code:
		| "invalid_reg"
		| "unsupported_college"
		| "unsupported_branch"
		| "batch_unavailable"
		| "routine_unavailable"
		| "upstream_unavailable";

	constructor(
		code: RoutineLookupError["code"],
		message: string,
	) {
		super(message);
		this.code = code;
		this.name = "RoutineLookupError";
	}
}

function formatBatchLabel(batchYear: number): string {
	return `2K${String(batchYear).slice(-2)}`;
}

function inferSection(rollNumber: number, isLateral: boolean): RoutineSection | null {
	if (!Number.isFinite(rollNumber) || rollNumber <= 0) return null;
	if (isLateral || rollNumber >= 900) return "A";
	return rollNumber <= 60 ? "A" : "B";
}

function pickSemesterForBatch(entries: RoutineSourceEntry[], batchLabel: string): number | null {
	const matching = entries.filter((entry) => entry.batchLabel === batchLabel);
	if (matching.length === 0) return null;

	const counts = new Map<number, number>();
	for (const entry of matching) {
		counts.set(entry.semester, (counts.get(entry.semester) || 0) + 1);
	}

	let bestSemester: number | null = null;
	let bestCount = -1;
	for (const [semester, count] of counts.entries()) {
		if (count > bestCount || (count === bestCount && semester > (bestSemester || 0))) {
			bestSemester = semester;
			bestCount = count;
		}
	}

	return bestSemester;
}

function buildBranchCandidates(
	branchCode: string,
	section: RoutineSection | null,
	semester: number | null,
): string[] {
	switch (branchCode) {
		case "101":
			return ["CE"];
		case "102":
			return ["ME", "ME/MET"];
		case "103":
			return ["EE"];
		case "104":
			return ["ECE"];
		case "105":
			if (semester === 4) {
				return ["CSE"];
			}
			return section === "B" ? ["CSE-B", "CSE"] : ["CSE-A", "CSE"];
		default:
			return [];
	}
}

function resolveEntry(
	index: RoutineIndex,
	batchLabel: string,
	semester: number,
	candidates: string[],
): RoutineSourceEntry | null {
	const pool = index.entries.filter(
		(entry) => entry.batchLabel === batchLabel && entry.semester === semester,
	);
	if (pool.length === 0) return null;

	for (const candidate of candidates) {
		const matched = pool.find((entry) => entry.branchLabel === candidate);
		if (matched) return matched;
	}

	return null;
}

export async function resolveRoutineFromRegNo(
	regNo: string,
): Promise<ResolvedStudentRoutine> {
	const parsedReg = parseBeuRegNo(regNo);
	if (!parsedReg) {
		throw new RoutineLookupError(
			"invalid_reg",
			"Enter a valid BEU registration number to load your routine.",
		);
	}

	if (parsedReg.collegeCode !== "157") {
		throw new RoutineLookupError(
			"unsupported_college",
			"Routine is supported only for Government Engineering College, Sheikhpura right now.",
		);
	}

	const section = inferSection(parsedReg.rollNumber, parsedReg.isLateral);

	let index: RoutineIndex;
	try {
		index = await fetchRoutineIndex();
	} catch {
		throw new RoutineLookupError(
			"upstream_unavailable",
			"Routine source is temporarily unavailable. Please try again in a bit.",
		);
	}

	const batchLabel = formatBatchLabel(parsedReg.batchYear);
	const semester = pickSemesterForBatch(index.entries, batchLabel);
	if (!semester) {
		throw new RoutineLookupError(
			"batch_unavailable",
			"Routine has not been published for this batch yet.",
		);
	}

	const branchCandidates = buildBranchCandidates(parsedReg.branchCode, section, semester);
	if (branchCandidates.length === 0) {
		throw new RoutineLookupError(
			"unsupported_branch",
			"Routine is not available for this branch yet.",
		);
	}

	const entry = resolveEntry(index, batchLabel, semester, branchCandidates);
	if (!entry) {
		throw new RoutineLookupError(
			"routine_unavailable",
			"Routine is not live for your branch/section right now.",
		);
	}

	try {
		const routine = await fetchRoutineDetail(entry);
		return {
			regNo: parsedReg.regNo,
			collegeCode: parsedReg.collegeCode,
			collegeName: parsedReg.collegeName,
			branchCode: parsedReg.branchCode,
			branchName: parsedReg.branchName,
			branchPath: parsedReg.branchPath,
			batchYear: parsedReg.batchYear,
			batchLabel,
			semester,
			isLateral: parsedReg.isLateral,
			section,
			sourceBranchLabel: entry.branchLabel,
			routine,
		};
	} catch {
		throw new RoutineLookupError(
			"upstream_unavailable",
			"Routine source is temporarily unavailable. Please try again in a bit.",
		);
	}
}
