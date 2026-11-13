import { inferCurrentSemester } from "../beuReg";

/** What the page knows about the student, before it reads the URL. */
export interface TableProfile {
	batchYear?: number;
	branchPath?: string;
	collegeCode?: string;
}

/** The four filters the result table opens with. */
export interface TableDefaults {
	session: string;
	branch: string;
	semester: string;
	college: string;
}

/**
 * The semesters BEU has actually published per session, and the one a page
 * lands on when the class semester has no table yet.
 *
 * Publication lags the class: the 2024 batch is in semester 4 today, but its
 * semester 2 table is the newest one BEU has put out. A page that opened on 4
 * would show an empty table, so it opens on the newest published one instead.
 */
const PUBLISHED: Record<string, { semesters: string[]; fallback: string }> = {
	"25": { semesters: ["1"], fallback: "1" },
	"24": { semesters: ["1", "2"], fallback: "2" },
	"23": { semesters: ["1", "2", "3", "4"], fallback: "4" },
	// Semester 7 exists, but its rank data does not, so 6 is the landing table.
	"22": { semesters: ["1", "2", "3", "4", "5", "6", "7"], fallback: "6" },
};

/** A semester that has a published table for this session, else the newest one. */
export function publishedSemester(session: string, semester: string): string {
	const published = PUBLISHED[session];
	if (!published) return semester;
	return published.semesters.includes(semester) ? semester : published.fallback;
}

/** GEC Sheikhpura, the college the app opens on when nothing points elsewhere. */
export const HOME_COLLEGE = "157";

/** A preferred value the control actually has, else the fallback it always has. */
export function pickOption(values: string[], preferred: string, fallback: string): string {
	return values.includes(preferred) ? preferred : fallback;
}

/**
 * College options: the student's college, then GEC Sheikhpura, then the rest
 * in their published order. A college the manifest does not list is dropped.
 */
export function collegeOrder(codes: string[], preferred: string, home = HOME_COLLEGE): string[] {
	const head = preferred && preferred !== home ? [preferred, home] : [home];
	const seen = new Set(head);
	return [...head.filter((code) => codes.includes(code)), ...codes.filter((code) => !seen.has(code))];
}

/** The saved registration number leads; URL parameters are a deliberate choice. */
export function tableDefaults(
	params: URLSearchParams,
	profile: TableProfile | null,
): TableDefaults {
	const batchYear = profile?.batchYear && profile.batchYear > 2000
		? profile.batchYear
		: 0;
	const session = params.get("session") || (batchYear ? String(batchYear).slice(-2) : "25");

	return {
		session,
		branch: params.get("branch") || profile?.branchPath || "cse",
		semester: params.get("semester") || (batchYear
			? publishedSemester(session, String(inferCurrentSemester(batchYear)))
			: "1"),
		college: params.get("college") || profile?.collegeCode || "157",
	};
}
