import { fetchWithTimeout } from "./fetcher";
import type { ResultPayload, SpecialCase } from "./types";
import {
	classifyUpstream,
	isTransientUpstreamFailure,
	type UpstreamFailureKind,
} from "./upstream";

/** The page a student opens to clear the challenge by hand. */
export const OFFICIAL_PORTAL_URL = "https://beu-bih.ac.in/result-three";

const PORTAL_ORIGIN = "https://beu-bih.ac.in";
const TOKEN_URL = `${PORTAL_ORIGIN}/backend/v1/result/token`;
const RESULT_URL = `${PORTAL_ORIGIN}/backend/v1/result/get-result`;

const PORTAL_HEADERS = {
	accept: "application/json, text/plain, */*",
	referer: OFFICIAL_PORTAL_URL,
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
	return `${RESULT_URL}?year=${encodeURIComponent(candidate.year)}&redg_no=${encodeURIComponent(registrationNo)}&semester=${encodeURIComponent(candidate.semester)}&exam_held=${encodeURIComponent(candidate.examHeld)}&token=${encodeURIComponent(token)}`;
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
