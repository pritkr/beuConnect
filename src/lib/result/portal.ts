import { fetchWithTimeout, SEM_ROMAN } from "./fetcher";
import type { ResultPayload, SpecialCase } from "./types";
import {
	classifyUpstream,
	isTransientUpstreamFailure,
	type UpstreamFailureKind,
} from "./upstream";

const PORTAL_ORIGIN = "https://beu-bih.ac.in";

/** The exam list is the only page that always has something to do. A direct
 * `/result-three` load is blank: BEU hands that page its result in Angular
 * router state, so opening it fresh is a dead end. */
export const OFFICIAL_PORTAL_URL = `${PORTAL_ORIGIN}/result-one`;

const TOKEN_URL = `${PORTAL_ORIGIN}/backend/v1/result/token`;
const RESULT_URL = `${PORTAL_ORIGIN}/backend/v1/result/get-result`;
const EXAMS_URL = `${PORTAL_ORIGIN}/backend/v1/result/sem-get`;

const PORTAL_HEADERS = {
	accept: "application/json, text/plain, */*",
	referer: `${PORTAL_ORIGIN}/result-three`,
	"user-agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const RESULT_HEADERS = { ...PORTAL_HEADERS, referer: `${PORTAL_ORIGIN}/` };

/** Token issuance is captcha-guarded. Two retries cover a blip; a 403 that asks
 * for a challenge is final and is never retried. A 4s timeout keeps the worst
 * case (three attempts plus backoff) inside the legacy-attempt budget. */
export const TOKEN_RETRY_DELAYS_MS = [400, 1200] as const;

const TOKEN_TIMEOUT_MS = 4000;
const RESULT_TIMEOUT_MS = 15000;
const RESULT_NOT_FOUND = "no_result";

export type PortalTokenOutcome =
	| { ok: true; token: string }
	| { ok: false; kind: UpstreamFailureKind; status: number | null };

export type PortalResultOutcome =
	| { ok: true; data: ResultPayload }
	| { ok: false; kind: UpstreamFailureKind | typeof RESULT_NOT_FOUND; status: number | null };

/**
 * One published exam, as `/backend/v1/result/sem-get` describes it. The portal
 * builds its own `/result-two/:name?d=…` links from exactly these fields, so
 * mirroring them is what makes the link behave like a click on the exam list.
 */
export type PortalExam = {
	examName: string;
	session: string;
	batchYear: string;
	examHeld: string;
	semId: number;
	examId: string;
	publishDate: string;
};

export type PortalCourse = {
	courseid: number;
	courseName: string;
	exams: PortalExam[];
};

/** The exam list changes when BEU publishes a result, not per request. */
const EXAMS_TIMEOUT_MS = 5000;
const EXAMS_CACHE_TTL_MS = 10 * 60 * 1000;

/** Supplementary, special and old exams are real, but the regular exam is the
 * one a semester result means; the others are only picked when they are all a
 * batch has. */
const AUXILIARY_EXAM = /supplementary|special|backlog|arrear|\(old\)|\(s\)/i;
const BTECH = /^b\.?\s*tech/i;

function readString(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return "";
}

function readExam(raw: unknown): PortalExam | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const examName = readString(record.examName);
	const semId = Number.parseInt(readString(record.semId), 10);
	if (!examName || !Number.isFinite(semId) || semId < 1 || semId > 8) return null;
	const examId = readString(record.examId);
	const batchYear = readString(record.batchYear);
	// The link payload is built from these two; a row without them cannot open
	// an exam, and a half-built link would land on the portal's error page.
	if (!examId || !batchYear) return null;
	return {
		examName,
		session: readString(record.session),
		batchYear,
		examHeld: readString(record.examHeld),
		semId,
		examId,
		publishDate: readString(record.publishDate),
	};
}

/** Turns the portal's course list into something the link builder can trust. */
export function parsePortalExamList(raw: unknown): PortalCourse[] {
	if (!Array.isArray(raw)) return [];
	const courses: PortalCourse[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const exams = Array.isArray(record.exams)
			? record.exams.map(readExam).filter((exam): exam is PortalExam => exam !== null)
			: [];
		if (exams.length === 0) continue;
		const courseid = Number.parseInt(readString(record.courseid), 10);
		courses.push({
			courseid: Number.isFinite(courseid) ? courseid : 0,
			courseName: readString(record.courseName),
			exams,
		});
	}
	return courses;
}

/**
 * The published exams, cached for ten minutes. `ok` says whether BEU actually
 * answered: an empty list from a failed read means "unknown", not "nothing is
 * published", and the two must not be reported the same way.
 */
type ExamListRead = { ok: boolean; courses: PortalCourse[] };

let examCache: { at: number; read: ExamListRead } | null = null;
let examInFlight: Promise<ExamListRead> | null = null;

async function readPortalExamList(fetchImpl: typeof fetch): Promise<ExamListRead> {
	const cacheable = fetchImpl === fetch;
	const now = Date.now();
	if (cacheable && examCache && now - examCache.at < EXAMS_CACHE_TTL_MS) {
		return examCache.read;
	}
	if (cacheable && examInFlight) return examInFlight;

	const read = (async (): Promise<ExamListRead> => {
		try {
			const response = await fetchWithTimeout(
				EXAMS_URL,
				{ headers: PORTAL_HEADERS },
				EXAMS_TIMEOUT_MS,
				fetchImpl,
			);
			if (!response.ok) return { ok: false, courses: [] };
			const courses = parsePortalExamList(await response.json());
			const result: ExamListRead = { ok: true, courses };
			if (cacheable) examCache = { at: Date.now(), read: result };
			return result;
		} catch {
			return { ok: false, courses: [] };
		} finally {
			examInFlight = null;
		}
	})();

	if (cacheable) examInFlight = read;
	return read;
}

export async function fetchPortalExamList(
	fetchImpl: typeof fetch = fetch,
): Promise<PortalCourse[]> {
	return (await readPortalExamList(fetchImpl)).courses;
}

function publishTime(exam: PortalExam): number {
	const time = Date.parse(exam.publishDate);
	return Number.isFinite(time) ? time : 0;
}

/**
 * The exam a batch's semester result lives under. `admissionYear` comes from
 * the registration number; the portal's `session` starts with it ("2023-27"),
 * while its `batchYear` is the exam year and belongs in the link payload.
 */
export function selectPortalExam(
	courses: PortalCourse[],
	semester: number,
	admissionYear: number,
): PortalExam | null {
	const rows = courses
		.filter((course) => course.courseid === 3 || BTECH.test(course.courseName))
		.flatMap((course) => course.exams)
		.filter((exam) => exam.semId === semester);
	if (rows.length === 0) return null;

	const sessionPrefix = String(admissionYear);
	const sameBatch = rows.filter((exam) => exam.session.startsWith(sessionPrefix));
	if (sameBatch.length === 0) return null;

	const regular = sameBatch.filter((exam) => !AUXILIARY_EXAM.test(exam.examName));
	const pool = regular.length > 0 ? regular : sameBatch;
	return pool.reduce((best, exam) => (publishTime(exam) > publishTime(best) ? exam : best));
}

/**
 * The exam a registration number's semester sits under, straight from the
 * portal's own list. `ok: false` means the list could not be read at all, which
 * is not the same as "nothing is published" and must not be reported as such.
 */
export type PortalExamResolution = { ok: true; exam: PortalExam | null } | { ok: false };

export async function resolvePortalExam(
	semester: number,
	admissionYear: number,
	fetchImpl: typeof fetch = fetch,
): Promise<PortalExamResolution> {
	const read = await readPortalExamList(fetchImpl);
	if (!read.ok) return { ok: false };
	return { ok: true, exam: selectPortalExam(read.courses, semester, admissionYear) };
}

/**
 * A published exam as the result request needs it. Every field comes from the
 * portal's own row, so a batch that BEU publishes tomorrow needs no edit here —
 * the hand-copied table it replaces went stale the moment a result dropped.
 */
export function candidateFromExam(exam: PortalExam, semester: number): SpecialCase | null {
	const semRoman = SEM_ROMAN[semester - 1];
	if (!semRoman || !exam.examHeld) return null;
	return {
		year: exam.batchYear,
		semester: semRoman,
		examHeld: exam.examHeld,
		examId: exam.examId,
	};
}

/**
 * The exact link the portal's own exam list produces when a student clicks a
 * row: `/result-two/<exam>?d=<base64 of semester, session, examHeld, examId>`.
 * `session` is the portal's `batchYear` — the exam year, not the admission
 * session. The name is path-encoded, the payload query-encoded; the base64
 * alphabet contains `+`, `/` and `=`, which must survive the trip.
 */
export function buildPortalExamUrl(exam: PortalExam): string {
	const payload = btoa(
		JSON.stringify({
			semester: exam.semId,
			session: exam.batchYear,
			exam_held: exam.examHeld,
			exam_id: exam.examId,
		}),
	);
	return `${PORTAL_ORIGIN}/result-two/${encodeURIComponent(exam.examName)}?d=${encodeURIComponent(payload)}`;
}

export type OfficialExamStatus = "matched" | "not_published" | "unavailable";

export type OfficialExamLink = {
	/** The direct `/result-two/:exam?d=…` link. Only meaningful when `status`
	 * is `matched`; the other statuses carry the exam list as a last resort. */
	url: string;
	examName: string | null;
	status: OfficialExamStatus;
};

/** The direct link to a semester's own exam. There is no list step: either the
 * exam is known and the link opens it, or the card says plainly why it cannot. */
export async function resolveOfficialExamLink(
	semester: number,
	admissionYear: number,
	fetchImpl: typeof fetch = fetch,
): Promise<OfficialExamLink> {
	const read = await readPortalExamList(fetchImpl);
	if (!read.ok) {
		return { url: OFFICIAL_PORTAL_URL, examName: null, status: "unavailable" };
	}
	const exam = selectPortalExam(read.courses, semester, admissionYear);
	if (!exam) {
		return { url: OFFICIAL_PORTAL_URL, examName: null, status: "not_published" };
	}
	try {
		return { url: buildPortalExamUrl(exam), examName: exam.examName, status: "matched" };
	} catch {
		// A name outside Latin-1 cannot be base64'd by btoa.
		return { url: OFFICIAL_PORTAL_URL, examName: null, status: "unavailable" };
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

function readToken(body: string): string | null {
	if (!body.trim()) return null;
	try {
		const parsed = JSON.parse(body) as {
			token?: unknown;
			data?: { token?: unknown };
		};
		const raw =
			typeof parsed?.token === "string"
				? parsed.token
				: typeof parsed?.data?.token === "string"
					? parsed.data.token
					: null;
		const token = raw?.trim();
		return token ? token : null;
	} catch {
		return null;
	}
}

async function attemptPortalToken(fetchImpl: typeof fetch): Promise<PortalTokenOutcome> {
	let response: Response;
	try {
		response = await fetchWithTimeout(
			TOKEN_URL,
			{ headers: PORTAL_HEADERS },
			TOKEN_TIMEOUT_MS,
			fetchImpl,
		);
	} catch {
		return { ok: false, kind: "network", status: null };
	}

	const body = await readBody(response);
	if (!response.ok) {
		return {
			ok: false,
			kind: classifyUpstream(response.status, body),
			status: response.status,
		};
	}

	const token = readToken(body);
	return token
		? { ok: true, token }
		: { ok: false, kind: "unknown", status: response.status };
}

/**
 * Asks the portal for a single-use token. Retries network and 5xx failures
 * twice; never retries a captcha, an auth refusal or a rate limit.
 */
export async function requestPortalToken(
	fetchImpl: typeof fetch = fetch,
): Promise<PortalTokenOutcome> {
	let outcome = await attemptPortalToken(fetchImpl);
	for (const delay of TOKEN_RETRY_DELAYS_MS) {
		if (outcome.ok || !isTransientUpstreamFailure(outcome.kind)) break;
		await sleep(delay);
		outcome = await attemptPortalToken(fetchImpl);
	}
	return outcome;
}

export function buildPortalResultUrl(
	candidate: SpecialCase,
	registrationNo: string,
	token: string,
): string {
	const examId = candidate.examId
		? `&exam_id=${encodeURIComponent(candidate.examId)}`
		: "";
	return `${RESULT_URL}?year=${encodeURIComponent(candidate.year)}&redg_no=${encodeURIComponent(registrationNo)}&semester=${encodeURIComponent(candidate.semester)}&exam_held=${encodeURIComponent(candidate.examHeld)}&token=${encodeURIComponent(token)}${examId}`;
}

/** Redacted form for dev logging: a token must never reach a log line. */
export function redactPortalResultUrl(candidate: SpecialCase, registrationNo: string): string {
	return buildPortalResultUrl(candidate, registrationNo, "<token>");
}

export async function fetchPortalResult(
	candidate: SpecialCase,
	registrationNo: string,
	token: string,
	fetchImpl: typeof fetch = fetch,
): Promise<PortalResultOutcome> {
	let response: Response;
	try {
		response = await fetchWithTimeout(
			buildPortalResultUrl(candidate, registrationNo, token),
			{ headers: RESULT_HEADERS },
			RESULT_TIMEOUT_MS,
			fetchImpl,
		);
	} catch {
		return { ok: false, kind: "network", status: null };
	}

	const body = await readBody(response);
	if (!response.ok) {
		return {
			ok: false,
			kind: classifyUpstream(response.status, body),
			status: response.status,
		};
	}

	let payload: { status?: number; message?: string; data?: ResultPayload };
	try {
		payload = JSON.parse(body) as typeof payload;
	} catch {
		return { ok: false, kind: "unknown", status: response.status };
	}

	if (payload?.status === 200 && payload.data) {
		return { ok: true, data: payload.data };
	}
	return { ok: false, kind: RESULT_NOT_FOUND, status: response.status };
}
