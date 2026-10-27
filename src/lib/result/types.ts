export type ViewMode = "modern" | "official";

export type SpecialCase = {
	year: string;
	semester: string;
	examHeld: string;
	legacyTarget?: string;
};

export type ResultPayload = {
	examYear?: string;
	exam_held?: string;
	semester?: string;
	redg_no?: string;
	name?: string;
	father_name?: string;
	mother_name?: string;
	college_code?: string;
	college_name?: string;
	course_code?: string;
	course?: string;
	theorySubjects?: SubjectRow[];
	practicalSubjects?: SubjectRow[];
	sgpa?: Array<string | null>;
	cgpa?: string;
	fail_any?: string;
	failed_subjects?: Array<string | { code?: string; name?: string }>;
	backlog_subjects?: Array<string | { code?: string; name?: string }>;
};

export type SubjectRow = {
	code?: string;
	name?: string;
	ese?: string;
	ia?: string;
	total?: string;
	grade?: string;
	credit?: string;
};
