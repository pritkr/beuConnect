import { branchMap, parseBeuRegNo } from "../beuReg";
import { fetchRoutineDetail, fetchRoutineIndex } from "./source";
import type {
	ParsedRoutine,
	ResolvedStudentRoutine,
	RoutineIndex,
	RoutineLabGroup,
	RoutineLookupErrorCode,
	RoutineSection,
	RoutineSourceEntry,
} from "./types";

export class RoutineLookupError extends Error {
	code: RoutineLookupErrorCode;

	constructor(code: RoutineLookupErrorCode, message: string) {
		super(message);
		this.code = code;
		this.name = "RoutineLookupError";
	}
}

export interface RoutineLookupOptions {
	labGroup?: RoutineLabGroup | null;
}

/**
 * The source never lists rolls, so the split is modelled on the intake: the
 * first half of the class is section A. Every published CSE cohort at this
 * college is a single merged class except 2K26, which is split at roll 60.
 */
const SECTION_ROLL_LIMIT = 60;
const SUPPORTED_COLLEGE_CODE = "157";
const UPSTREAM_MESSAGE =
	"Routine could not be reached right now. Please try again in a minute.";

function inferSection(
	rollNumber: number,
	isLateral: boolean,
): RoutineSection | null {
	if (!Number.isFinite(rollNumber) || rollNumber <= 0) return null;
	// Rolls from 900 up are lateral entry, which beuReg already folds into
	// `isLateral`; honour the roll on its own too so a caller cannot mislabel one.
	if (isLateral || rollNumber >= 900) return "A";
	return rollNumber <= SECTION_ROLL_LIMIT ? "A" : "B";
}

/** Lab batches follow the same intake boundary as sections. */
export function inferLabGroup(
	rollNumber: number,
	isLateral: boolean,
): RoutineLabGroup {
	return inferSection(rollNumber, isLateral) ?? "A";
}

function normalizeLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ").toUpperCase();
}

function formatBatchLabel(batchYear: number): string {
	return `2K${String(batchYear).slice(-2)}`;
}

/**
 * Source labels to try, in order. Exact labels only — a section is never
 * inferred from a merged label or the other way round.
 */
function buildBranchCandidates(
	branchCode: string,
	section: RoutineSection | null,
): string[] {
	switch (branchCode) {
		case "101":
			return ["CE"];
		case "102":
			// First-year MET students share the combined ME/MET class.
			return ["ME", "ME/MET", "MET"];
		case "103":
			return ["EE"];
		case "104":
			return ["ECE"];
		case "105":
			return section === "B" ? ["CSE-B", "CSE"] : ["CSE-A", "CSE"];
		case "106":
			return ["IT"];
		case "110":
			return ["EEE"];
		case "161":
			return ["MET", "ME/MET"];
		default:
			return [];
	}
}

/** Every semester the batch publishes, highest first. */
function semestersForBatch(
	entries: RoutineSourceEntry[],
	batchLabel: string,
): number[] {
	const wanted = normalizeLabel(batchLabel);
	const semesters = new Set<number>();

	for (const entry of entries) {
		if (normalizeLabel(entry.batchLabel) !== wanted) continue;
		if (!Number.isFinite(entry.semester)) continue;
		semesters.add(entry.semester);
	}

	return [...semesters].sort((left, right) => right - left);
}

function findEntry(
	entries: RoutineSourceEntry[],
	batchLabel: string,
	semester: number,
	candidates: string[],
): RoutineSourceEntry | null {
	const wantedBatch = normalizeLabel(batchLabel);
	const pool = entries.filter(
		(entry) =>
			entry.semester === semester &&
			normalizeLabel(entry.batchLabel) === wantedBatch,
	);
	if (pool.length === 0) return null;

	for (const candidate of candidates) {
		const wantedBranch = normalizeLabel(candidate);
		const matched = pool.find(
			(entry) => normalizeLabel(entry.branchLabel) === wantedBranch,
		);
		if (matched) return matched;
	}

	return null;
}

export async function resolveRoutineFromRegNo(
	regNo: string,
	options: RoutineLookupOptions = {},
): Promise<ResolvedStudentRoutine> {
	const parsedReg = parseBeuRegNo(regNo);
	if (!parsedReg) {
		throw new RoutineLookupError(
			"invalid_reg",
			"Enter a valid 11-digit BEU registration number.",
		);
	}

	if (parsedReg.collegeCode !== SUPPORTED_COLLEGE_CODE) {
		throw new RoutineLookupError(
			"unsupported_college",
			`Routine is only published for Government Engineering College Sheikhpura, not ${parsedReg.collegeName}.`,
		);
	}

	const section = inferSection(parsedReg.rollNumber, parsedReg.isLateral);
	const labGroup =
		options.labGroup === "A" || options.labGroup === "B"
			? options.labGroup
			: inferLabGroup(parsedReg.rollNumber, parsedReg.isLateral);

	// Pure branch check, before the network: a student whose branch the source
	// never publishes should not wait on a fetch to learn that.
	const branchCandidates = buildBranchCandidates(parsedReg.branchCode, section);
	if (branchCandidates.length === 0) {
		const branchName = branchMap[parsedReg.branchCode];
		throw new RoutineLookupError(
			"unsupported_branch",
			branchName
				? `Routine is not published for ${branchName} yet.`
				: "Routine is not published for your branch yet.",
		);
	}

	let index: RoutineIndex;
	try {
		index = await fetchRoutineIndex();
	} catch {
		throw new RoutineLookupError("upstream_unavailable", UPSTREAM_MESSAGE);
	}

	const batchLabel = formatBatchLabel(parsedReg.batchYear);
	const semesters = semestersForBatch(index.entries, batchLabel);
	if (semesters.length === 0) {
		throw new RoutineLookupError(
			"batch_unavailable",
			"Routine has not been published for your batch yet.",
		);
	}

	let matchedSemester: number | null = null;
	let entry: RoutineSourceEntry | null = null;
	for (const semester of semesters) {
		const candidate = findEntry(
			index.entries,
			batchLabel,
			semester,
			branchCandidates,
		);
		if (candidate) {
			entry = candidate;
			matchedSemester = semester;
			break;
		}
	}

	if (!entry || matchedSemester === null) {
		throw new RoutineLookupError(
			"routine_unavailable",
			"Routine is not live for your branch right now.",
		);
	}

	let routine: ParsedRoutine;
	try {
		routine = await fetchRoutineDetail(entry);
	} catch {
		throw new RoutineLookupError("upstream_unavailable", UPSTREAM_MESSAGE);
	}

	return {
		regNo: parsedReg.regNo,
		collegeCode: parsedReg.collegeCode,
		collegeName: parsedReg.collegeName,
		branchCode: parsedReg.branchCode,
		branchName: parsedReg.branchName,
		branchPath: parsedReg.branchPath,
		batchYear: parsedReg.batchYear,
		batchLabel,
		semester: matchedSemester,
		isLateral: parsedReg.isLateral,
		section,
		labGroup,
		sourceBranchLabel: entry.branchLabel,
		routine,
	};
}
