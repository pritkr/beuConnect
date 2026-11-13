/**
 * The GECS student register.
 *
 * Source of truth: `native/assets/data/students-gecs.json`, generated from the
 * college register by `native/scripts/build-students-data.py`. The trimmed copy
 * in `src/assets/data/students/` is produced by
 * `bun scripts/sync-student-register.mjs` — never edit it by hand.
 *
 * This is the only place the site can answer "registration number → name"
 * without the university's result portal. The portal now sits behind a
 * captcha, so the register is the reliable path and the portal is the
 * enrichment path (SGPA/CGPA).
 */
import roster from "../../assets/data/students/gecs-register.json";
import { normalizeRegNo } from "../beuReg";

export interface RosterStudent {
	regNo: string;
	rollNo?: string;
	name: string;
	branch: string;
	branchLabel?: string;
	session: string;
	section?: string;
	provisionalReg?: boolean;
}

const students = roster as RosterStudent[];

/** Digits-only registration numbers, which is how BEU writes them. */
const byRegNo = new Map<string, RosterStudent>();
for (const student of students) {
	byRegNo.set(normalizeRegNo(student.regNo), student);
}

export function findStudent(regNo: string): RosterStudent | null {
	const key = normalizeRegNo(regNo);
	if (!key) return null;
	return byRegNo.get(key) ?? null;
}

export function allStudents(): RosterStudent[] {
	return students;
}

export function sessions(): string[] {
	return [...new Set(students.map((student) => student.session))].sort();
}

export function studentsInSession(session: string): RosterStudent[] {
	return students.filter((student) => student.session === session);
}

export interface RegisterSummary {
	total: number;
	latestSession: string | null;
	sessions: Array<{ session: string; count: number }>;
	branches: Array<{ branch: string; label: string; count: number }>;
}

export function registerSummary(): RegisterSummary {
	const bySession = new Map<string, number>();
	for (const student of students) {
		bySession.set(student.session, (bySession.get(student.session) ?? 0) + 1);
	}

	const latestSession = [...bySession.keys()].sort().at(-1) ?? null;
	const branchLabels = new Map<string, string>();
	const branchCounts = new Map<string, number>();
	for (const student of studentsInSession(latestSession ?? "")) {
		branchLabels.set(student.branch, student.branchLabel ?? student.branch);
		branchCounts.set(student.branch, (branchCounts.get(student.branch) ?? 0) + 1);
	}

	return {
		total: students.length,
		latestSession,
		sessions: [...bySession.entries()]
			.sort(([a], [b]) => b.localeCompare(a))
			.map(([session, count]) => ({ session, count })),
		branches: [...branchCounts.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([branch, count]) => ({
				branch,
				label: branchLabels.get(branch) ?? branch,
				count,
			})),
	};
}
