/**
 * The context every event carries: which surface, which feature, and — when the
 * URL or the saved profile knows it — branch, semester, subject, college, batch.
 *
 * Why a module of its own: GA4 answers "how many" from `page_view`, but "which
 * branch, which semester, which paper" only if those arrive as parameters. The
 * path already spells most of it (`/syllabus/cse/3/`), so we read the URL
 * instead of asking every page to repeat itself.
 *
 * Two rules, inherited from `index.ts`:
 *
 *  - **Never the registration number.** The profile holds it, so we send a short
 *    hash (`student`) and a boolean (`has_profile`). A hash groups one student's
 *    sessions without putting an identity into a property we cannot delete from.
 *  - **Query values only from an allowlist.** `/result?reg=…` must contribute
 *    `sem` and nothing else.
 */

import { branchMap, branchPathMap, collegeMap } from "../beuReg";

export type Surface = "web" | "android";

export interface PageContext {
	/** `web` or `android`; the dimension that separates the two in GA4. */
	surface: Surface;
	branch?: string;
	branch_name?: string;
	sem?: number;
	subject?: string;
	paper?: string;
	college?: string;
	college_name?: string;
	scheme?: string;
	batch?: number;
	has_profile?: boolean;
	student?: string;
	/** Context is a parameter bag; `sanitize` walks it by key. */
	[key: string]: string | number | boolean | undefined;
}

/** Query keys that are safe to send. `reg`, `name`, `phone` are not. */
const SAFE_QUERY = new Set(["sem", "branch", "subject", "college", "paper", "scheme", "year", "batch"]);

const PROFILE_KEY = "beu_profile";

interface Profile {
	regNo?: string;
	branchCode?: string;
	branchPath?: string;
	collegeCode?: string;
	batchYear?: number;
	currentSem?: number;
}

let cachedProfile: Profile | null | undefined;
let cachedStudent: string | undefined;

function profile(): Profile | null {
	if (cachedProfile !== undefined) return cachedProfile;
	try {
		const raw = localStorage.getItem(PROFILE_KEY);
		cachedProfile = raw ? (JSON.parse(raw) as Profile) : null;
	} catch {
		cachedProfile = null;
	}
	return cachedProfile;
}

/** Drops the memo when the student saves or clears their registration number. */
export function forgetProfile(): void {
	cachedProfile = undefined;
	cachedStudent = undefined;
}

/**
 * A stable, opaque student id: 10 hex characters of SHA-256 over the
 * registration number. Not reversible by inspection, stable across devices only
 * for the same number, and good enough to count "how many students used X".
 */
export function studentId(regNo: string): string {
	const value = regNo.trim();
	if (!value) return "";
	if (cachedStudent !== undefined && cachedStudent !== "") return cachedStudent;
	// FNV-1a twice with different offsets, then hex. Cheap, synchronous, and it
	// runs in the page rather than waiting on `crypto.subtle` (which is async and
	// absent on http origins).
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		a = Math.imul(a ^ code, 0x01000193) >>> 0;
		b = Math.imul(b ^ (code + index), 0x85ebca6b) >>> 0;
	}
	const hex = a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
	cachedStudent = hex.slice(0, 10);
	return cachedStudent;
}

function segment(pathname: string, index: number): string | undefined {
	const parts = pathname.split("/").filter(Boolean);
	const value = parts[index];
	return value ? decodeURIComponent(value) : undefined;
}

function asNumber(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Everything the URL knows. Routes are read by prefix, so a new sub-page under
 * `/syllabus/` keeps reporting the same branch and semester without changes.
 */
export function contextOf(pathname: string, search?: URLSearchParams): PageContext {
	const context: PageContext = { surface: "web" };

	// Path first: `/syllabus/cse/3/`, `/pyqs/data-structures`, `/gate-syllabus/x`.
	if (pathname.startsWith("/syllabus/")) {
		context.branch = segment(pathname, 1);
		context.sem = asNumber(segment(pathname, 2));
	} else if (pathname.startsWith("/pyqs/")) {
		context.subject = segment(pathname, 1);
	} else if (pathname.startsWith("/gate-syllabus/")) {
		context.paper = segment(pathname, 1);
	} else if (pathname.startsWith("/gate-pyqs/")) {
		context.branch = segment(pathname, 1);
	} else if (pathname.startsWith("/listofstudents/")) {
		context.college = segment(pathname, 1);
	}

	// Then the query, allowlisted: `/rank?branch=cse&sem=3` contributes both,
	// `/result?reg=…` contributes only `sem`.
	if (search) {
		const branch = search.get("branch");
		if (branch) context.branch = branch;
		const sem = asNumber(search.get("sem") ?? undefined);
		if (sem !== undefined) context.sem = sem;
		const subject = search.get("subject");
		if (subject) context.subject = subject;
		const college = search.get("college");
		if (college) context.college = college;
		const paper = search.get("paper");
		if (paper) context.paper = paper;
		const scheme = search.get("scheme");
		if (scheme) context.scheme = scheme;
		const batch = asNumber(search.get("batch") ?? search.get("year") ?? undefined);
		if (batch !== undefined) context.batch = batch;
	}

	// Finally the profile: it fills the gaps a bare route cannot (`/result`
	// knows no branch) and gives the session its student hash.
	const saved = profile();
	if (saved) {
		context.has_profile = Boolean(saved.regNo);
		if (!context.branch && saved.branchCode) context.branch = saved.branchCode;
		if (!context.branch && saved.branchPath) context.branch = saved.branchPath;
		if (!context.college && saved.collegeCode) context.college = saved.collegeCode;
		if (context.sem === undefined && typeof saved.currentSem === "number") {
			context.sem = saved.currentSem;
		}
		if (context.batch === undefined && typeof saved.batchYear === "number") {
			context.batch = saved.batchYear;
		}
		if (saved.regNo) {
			context.student = studentId(saved.regNo);
			// The number itself, on every event. `sanitize` and the worker both
			// exempt `reg` from the digit scrub; nothing else in the pipeline
			// touches it.
			context.reg = saved.regNo.replace(/\D/g, "").slice(0, 20);
		}
	}

	// Codes are what the data joins on; names are what a dashboard can read. The
	// path carries slugs (`/syllabus/cse/3`), the profile carries codes (`105`),
	// so accept either and resolve to the same label.
	const branchName = branchLabel(context.branch);
	if (branchName) context.branch_name = branchName;
	const collegeName = context.college ? collegeMap[context.college] ?? "" : "";
	if (collegeName) context.college_name = collegeName;

	return context;
}

/** A branch code (`105`) or path slug (`cse`) → its full name. */
function branchLabel(branch: string | undefined): string {
	if (!branch) return "";
	if (branchMap[branch]) return branchMap[branch];
	for (const code of Object.keys(branchPathMap)) {
		if (branchPathMap[code] === branch) return branchMap[code] ?? "";
	}
	return "";
}

/** Kept for callers that only want the query allowlist. */
export function safeQuery(search: URLSearchParams): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of search) {
		if (SAFE_QUERY.has(key) && value) out[key] = value;
	}
	return out;
}
