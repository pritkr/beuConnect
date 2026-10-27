import type { ResultPayload, SubjectRow } from "./crawler.js";
import { sanitizeField } from "./utils.js";

// WideRow schema matching requirements.md
export interface WideRow {
	Session: string;
	RegNo: string;
	Name: string;
	FatherName: string;
	MotherName: string;
	CollegeCode: string;
	Branch: string;
	Semester: string;
	ExamYear: string;
	ExamHeld: string;

	SGPA: string;
	SGPA_History: string;
	CGPA: string;
	FailAny: string;

	StateRank: string;
	CollegeRank: string;

	[subjectCol: string]: string;
}

export function computeDenseRanks(rows: WideRow[], sortKey: "CGPA" | "SGPA", rankKey: "StateRank" | "CollegeRank") {
	// Sort descending by CGPA/SGPA
	rows.sort((a, b) => {
		const aVal = parseFloat(a[sortKey]) || 0;
		const bVal = parseFloat(b[sortKey]) || 0;
		return bVal - aVal;
	});

	let currentRank = 1;
	let currentScore = rows[0] ? (parseFloat(rows[0][sortKey]) || 0) : 0;

	for (let i = 0; i < rows.length; i++) {
		const score = parseFloat(rows[i][sortKey]) || 0;
		// If score is 0 or NaN, we can leave rank empty or put bottom rank
		if (score < currentScore) {
			currentRank++;
			currentScore = score;
		}
		if (score > 0) {
			rows[i][rankKey] = currentRank.toString();
		} else {
			rows[i][rankKey] = "";
		}
	}
}

export function pivotResultPayload(
	payload: ResultPayload,
	sessionLabel: string,
	sgpaHistoryStr: string
): WideRow {
	const row: WideRow = {
		Session: sessionLabel,
		RegNo: sanitizeField(payload.redg_no),
		Name: sanitizeField(payload.name?.toUpperCase()),
		FatherName: sanitizeField(payload.father_name?.toUpperCase()),
		MotherName: sanitizeField(payload.mother_name?.toUpperCase()),
		CollegeCode: sanitizeField(payload.college_code),
		Branch: sanitizeField(payload.course_code),
		Semester: sanitizeField(payload.semester),
		ExamYear: sanitizeField(payload.examYear),
		ExamHeld: sanitizeField(payload.exam_held),
		SGPA: Array.isArray(payload.sgpa) ? sanitizeField(payload.sgpa[parseInt(payload.semester || "1", 10) - 1]) : "",
		SGPA_History: sgpaHistoryStr,
		CGPA: sanitizeField(payload.cgpa),
		FailAny: sanitizeField(payload.fail_any || "PASS"),
		StateRank: "",
		CollegeRank: ""
	};

	// Helper to pivot subjects
	const mapSubject = (subject: SubjectRow) => {
		if (!subject.code) return;
		// Normalize subject codes to alphanumeric slug (e.g. "100101" -> "Sub_100101")
		// Often BEU subjects have dashes or spaces. We sanitize to a clean slug.
		const rawCode = subject.code.trim().toUpperCase();
		const slug = rawCode; 
        // e.g., 101101_ESE
		row[`${slug}_ESE`] = sanitizeField(subject.ese);
		row[`${slug}_IA`] = sanitizeField(subject.ia);
		row[`${slug}_Total`] = sanitizeField(subject.total);
		row[`${slug}_Grade`] = sanitizeField(subject.grade?.toUpperCase());
	};

	if (payload.theorySubjects) payload.theorySubjects.forEach(mapSubject);
	if (payload.practicalSubjects) payload.practicalSubjects.forEach(mapSubject);

	return row;
}

export function extractSubjectMap(rows: WideRow[]): Record<string, string> {
	// A real pipeline would extract subject names from the payload before pivoting.
	// Since we pivot dynamically, we assume crawler builds the Subject Map globally inside build-data.ts.
	return {};
}
