import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { contributeInline } from "../../lib/corpus/store";
import {
	readCachedResult,
	type ResultCacheKeyParts,
	type ResultSource,
	writeCachedResult,
} from "../../lib/result/cache";
import {
	buildLegacyTarget,
	buildSpecialCaseCandidates,
	fetchWithTimeout,
	HTML_HEADERS,
	isAbortError,
} from "../../lib/result/fetcher";
import {
	buildCaptchaHTML,
	buildErrorHTML,
	buildOfficialLegacyDocument,
	injectCssIntoHtmlDocument,
	MODERN_CSS,
	renderJsonResultHtml,
	type CardTheme,
} from "../../lib/result/htmlBuilder";
import {
	extractBodyMarkup,
	extractLegacyResultMarkup,
	parseLegacyHtmlToJson,
} from "../../lib/result/parser";
import {
	candidateFromExam,
	fetchPortalResult,
	redactPortalResultUrl,
	requestPortalToken,
	resolveOfficialExamLink,
	resolvePortalExam,
	type OfficialExamLink,
} from "../../lib/result/portal";
import type { ResultPayload, SpecialCase, ViewMode } from "../../lib/result/types";
import { classifyUpstream, type UpstreamFailureKind } from "../../lib/result/upstream";

export const prerender = false;

/** The legacy ASP.NET host has no DNS record left. One short attempt covers a
 * host that comes back; it must never hold the request for 20s again. */
const LEGACY_TIMEOUT_MS = 6000;
const SOURCE_HEADER = "x-result-source";

type FailureCode =
	| "upstream_captcha"
	| "upstream_unavailable"
	| "not_found"
	| "invalid_input";

type ResultFailure = {
	code: FailureCode;
	status: number;
	message: string;
	retryable: boolean;
	officialUrl?: string;
	/** The exact exam the official link opens, when it could be matched. */
	officialExamName?: string | null;
	/** Why there is, or is not, a direct link. */
	officialStatus?: "matched" | "not_published" | "unavailable";
	/** Carried into the card so the student only has to paste it. */
	registrationNo?: string;
	semester?: number;
	title: string;
};

type ResponseContext = {
	isJson: boolean;
	viewMode: ViewMode;
	appBasePath: string;
	retryHref: string;
	/** The card pages follow the site's chosen theme; a bare API call follows
	 * the reader's system preference. */
	theme?: CardTheme;
};

const CAPTCHA_TITLE = "BEU asks for a captcha";

function captchaFailure(
	official: OfficialExamLink,
	registrationNo: string,
	semester: number,
): ResultFailure {
	const message =
		official.status === "matched"
			? `Results sit behind BEU's captcha. Open the semester ${semester} exam, paste registration number ${registrationNo}, and solve the check.`
			: official.status === "not_published"
				? `BEU has not published the semester ${semester} exam for this batch yet. Registration number ${registrationNo} is ready for when it is.`
				: `BEU's exam list did not answer, so the semester ${semester} exam link could not be built. Try again in a minute.`;
	return {
		code: "upstream_captcha",
		status: 503,
		message,
		retryable: false,
		officialUrl: official.status === "matched" ? official.url : undefined,
		officialExamName: official.examName,
		officialStatus: official.status,
		registrationNo,
		semester,
		title: CAPTCHA_TITLE,
	};
}

function unavailableFailure(): ResultFailure {
	return {
		code: "upstream_unavailable",
		status: 502,
		message: "BEU did not answer. Try again in a minute.",
		retryable: true,
		title: "Result unavailable",
	};
}

function notFoundFailure(): ResultFailure {
	return {
		code: "not_found",
		status: 404,
		message: "No result was found for this registration number and semester.",
		retryable: false,
		title: "Result not found",
	};
}

function invalidInputFailure(title: string, message: string): ResultFailure {
	return { code: "invalid_input", status: 400, message, retryable: false, title };
}

function parseSemester(rawSem: string | null): number | null {
	if (!rawSem) return null;
	const sem = Number.parseInt(rawSem, 10);
	if (!Number.isFinite(sem) || sem < 1 || sem > 8) return null;
	return sem;
}

function getViewMode(rawMode: string | null): ViewMode {
	return rawMode === "modern" ? "modern" : "official";
}

function getAppBasePath(requestUrl: string): string {
	const { pathname } = new URL(requestUrl);
	const marker = "/api/result";
	const markerIdx = pathname.indexOf(marker);
	if (markerIdx < 0) return "/";
	const basePath = pathname.slice(0, markerIdx + 1);
	return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

function inferLateralFromReg(numericReg: string): boolean {
	if (numericReg.length < 3) return false;
	const serialCode = Number.parseInt(numericReg.slice(-3), 10);
	return Number.isFinite(serialCode) && serialCode >= 900;
}

function logChosenFetchUrl(label: string, targetUrl: string): void {
	if (!import.meta.env.DEV) return;
	console.info(`[result api] ${label}: ${targetUrl}`);
}

function logUpstreamFailure(
	label: string,
	kind: UpstreamFailureKind | "no_result",
	status: number | null,
): void {
	if (!import.meta.env.DEV) return;
	const detail = status === null ? kind : `${kind} (HTTP ${status})`;
	console.warn(`[result api] ${label}: ${detail}`);
}

function logDev(message: string): void {
	if (!import.meta.env.DEV) return;
	console.info(`[result api] ${message}`);
}

/** A payload without identity or marks is an error page, not a result. */
function hasResultData(payload: ResultPayload | null | undefined): payload is ResultPayload {
	if (!payload) return false;
	return Boolean(
		payload.name?.trim() ||
			payload.redg_no?.trim() ||
			payload.cgpa?.trim() ||
			payload.sgpa?.some((value) => typeof value === "string" && value.trim()) ||
			(payload.theorySubjects?.length ?? 0) > 0 ||
			(payload.practicalSubjects?.length ?? 0) > 0,
	);
}

const responseHtml = (html: string, status = 200, source?: ResultSource) => {
	const headers: Record<string, string> = { ...HTML_HEADERS };
	if (source) headers[SOURCE_HEADER] = source;
	return new Response(html, { status, headers });
};

function respondFailure(failure: ResultFailure, ctx: ResponseContext): Response {
	if (ctx.isJson) {
		const payload: Record<string, unknown> = {
			status: failure.status,
			message: failure.message,
			code: failure.code,
			retryable: failure.retryable,
		};
		if (failure.officialUrl) payload.officialUrl = failure.officialUrl;
		if (failure.officialExamName) payload.examName = failure.officialExamName;
		if (failure.officialStatus) payload.examStatus = failure.officialStatus;
		if (failure.registrationNo) payload.registrationNo = failure.registrationNo;
		if (failure.semester) payload.semester = failure.semester;
		return new Response(JSON.stringify(payload), {
			status: failure.status,
			headers: { "content-type": "application/json", "cache-control": "no-store" },
		});
	}

	const html =
		failure.code === "upstream_captcha"
			? buildCaptchaHTML({
					// A matched exam keeps asking for its captcha however often the
					// page reloads, so a retry there is a dead end; an unreadable
					// exam list is worth asking again.
					retryHref: failure.officialStatus === "unavailable" ? ctx.retryHref : undefined,
					theme: ctx.theme,
					officialUrl: failure.officialUrl,
					examName: failure.officialExamName,
					status: failure.officialStatus,
					registrationNo: failure.registrationNo,
					semester: failure.semester,
				})
			: buildErrorHTML(
					failure.title,
					failure.message,
					failure.retryable
						? { retryHref: ctx.retryHref, theme: ctx.theme }
						: { theme: ctx.theme },
				);
	return responseHtml(html, failure.status);
}

function respondPayload(
	data: ResultPayload,
	ctx: ResponseContext,
	semester: number,
	source: ResultSource,
): Response {
	if (ctx.isJson) {
		return new Response(JSON.stringify({ status: 200, data }), {
			status: 200,
			headers: {
				"content-type": "application/json",
				"cache-control": "no-store",
				[SOURCE_HEADER]: source,
			},
		});
	}
	return responseHtml(
		renderJsonResultHtml(data, semester, ctx.viewMode, ctx.appBasePath),
		200,
		source,
	);
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const appBasePath = getAppBasePath(request.url);
	const rawReg = url.searchParams.get("reg")?.trim() || "";
	const semester = parseSemester(url.searchParams.get("sem"));
	const isCarry = url.searchParams.get("carry") === "true";
	const viewMode = getViewMode(url.searchParams.get("view"));
	const isJsonRequest = url.searchParams.get("format") === "json";
	const themeParam = url.searchParams.get("theme");
	const theme: CardTheme | undefined =
		themeParam === "light" || themeParam === "dark" ? themeParam : undefined;
	const retryHref = `${url.pathname}${url.search}`;

	const ctx: ResponseContext = {
		isJson: isJsonRequest,
		viewMode,
		appBasePath,
		retryHref,
		theme,
	};

	if (!rawReg || !semester) {
		return respondFailure(
			invalidInputFailure("Missing inputs", "Registration number and semester are both required."),
			ctx,
		);
	}

	const registrationNo = rawReg.toUpperCase();
	const numericReg = registrationNo.replace(/\D/g, "");
	if (numericReg.length < 8) {
		return respondFailure(
			invalidInputFailure(
				"Invalid registration",
				"Registration number must include enough numeric digits.",
			),
			ctx,
		);
	}

	const parsedYY = Number.parseInt(numericReg.slice(0, 2), 10);
	if (!Number.isFinite(parsedYY)) {
		return respondFailure(
			invalidInputFailure(
				"Invalid registration",
				"Could not infer batch year from the provided registration number.",
			),
			ctx,
		);
	}

	const isLateral = inferLateralFromReg(numericReg);
	const effectiveBatchYY = isLateral ? Math.max(0, parsedYY - 1) : parsedYY;
	const cacheParts: ResultCacheKeyParts = { registrationNo, semester, isCarry };

	const cached = await readCachedResult(cacheParts);
	if (cached) {
		logDev(`cache hit: ${registrationNo} sem ${semester}${isCarry ? " carry" : ""}`);
		return respondPayload(cached.data, ctx, semester, "cache");
	}

	// What can be fetched is whatever the portal currently publishes. Asking its
	// exam list, rather than keeping a table of batches by hand, is what lets a
	// newly published result work without a code change.
	let candidate: SpecialCase | null = null;
	if (!isCarry) {
		const published = await resolvePortalExam(semester, 2000 + effectiveBatchYY);
		if (published.ok && published.exam) {
			candidate = candidateFromExam(published.exam, semester);
		}
	}

	// Resolving the exam is only worth it when the challenge blocks us; the
	// fetch starts lazily and is reused if the portal asks again later.
	let officialExam: Promise<OfficialExamLink> | null = null;
	const captchaResponse = async (): Promise<Response> => {
		officialExam ??= resolveOfficialExamLink(semester, 2000 + effectiveBatchYY);
		return respondFailure(captchaFailure(await officialExam, registrationNo, semester), ctx);
	};

	// Nothing published for this batch and semester (or the list itself did not
	// answer): a token could not be spent on anything, so the card that opens
	// BEU is the whole answer. Carry papers are left on the legacy route below.
	if (!candidate && !isCarry) return captchaResponse();

	// The portal issues the only working token and is fronted by a captcha. One
	// probe decides whether the portal can be read at all.
	const portal = await requestPortalToken();
	if (!portal.ok) logUpstreamFailure("portal token", portal.kind, portal.status);

	if (!portal.ok && portal.kind === "captcha") {
		// A challenge cannot be solved from here, and the legacy host is dead.
		return captchaResponse();
	}

	let portalSaidNoResult = false;
	let portalHardFailure = false;
	let portalRejectedToken = false;

	if (candidate) {
		for (const [index, attempt] of buildSpecialCaseCandidates(candidate).entries()) {
			// The probe above already asked for the first token; later candidates
			// need their own because a token is single-use.
			const tokenOutcome = index === 0 ? portal : await requestPortalToken();
			if (!tokenOutcome.ok) {
				logUpstreamFailure(`portal token #${index + 1}`, tokenOutcome.kind, tokenOutcome.status);
				if (tokenOutcome.kind === "captcha") return captchaResponse();
				portalHardFailure = true;
				break;
			}

			logChosenFetchUrl(
				`portal result #${index + 1}`,
				redactPortalResultUrl(attempt, registrationNo),
			);
			const outcome = await fetchPortalResult(attempt, registrationNo, tokenOutcome.token);
			if (outcome.ok) {
				if (hasResultData(outcome.data)) {
					await writeCachedResult(cacheParts, { data: outcome.data, source: "json" });
					// One best-effort copy into the corpus; it can never change this response.
					void contributeInline(env.DB, numericReg, semester, {
						status: 200,
						data: outcome.data,
					});
					return respondPayload(outcome.data, ctx, semester, "json");
				}
				portalSaidNoResult = true;
				continue;
			}

			logUpstreamFailure(`portal result #${index + 1}`, outcome.kind, outcome.status);
			if (outcome.kind === "captcha") return captchaResponse();
			if (outcome.kind === "no_result") {
				portalSaidNoResult = true;
				continue;
			}
			if (outcome.kind === "auth") {
				portalRejectedToken = true;
				break;
			}
			portalHardFailure = true;
		}
	}

	// The portal answered and has nothing for this registration: it is the only
	// live source, so the dead legacy host adds nothing but latency.
	if (portalSaidNoResult && !portalHardFailure && !portalRejectedToken) {
		return respondFailure(notFoundFailure(), ctx);
	}

	const legacyTarget = buildLegacyTarget(
		registrationNo,
		semester,
		effectiveBatchYY,
		isCarry,
	);
	logChosenFetchUrl("legacy source", legacyTarget);

	let legacyResponse: Response;
	try {
		legacyResponse = await fetchWithTimeout(
			legacyTarget,
			{ redirect: "follow" },
			LEGACY_TIMEOUT_MS,
		);
	} catch (error) {
		logUpstreamFailure(
			isAbortError(error) ? "legacy fetch (timed out)" : "legacy fetch",
			"network",
			null,
		);
		return respondFailure(unavailableFailure(), ctx);
	}

	const legacyBody = await legacyResponse.text().catch(() => "");

	if (!legacyResponse.ok) {
		const kind = classifyUpstream(legacyResponse.status, legacyBody);
		logUpstreamFailure("legacy response", kind, legacyResponse.status);
		if (legacyResponse.status === 404) return respondFailure(notFoundFailure(), ctx);
		return respondFailure(unavailableFailure(), ctx);
	}

	const extracted = extractLegacyResultMarkup(legacyBody);
	const parsedPayload = parseLegacyHtmlToJson(legacyBody);

	if (parsedPayload === null) {
		// BEU rendered its own "Result Not Found" page.
		return respondFailure(notFoundFailure(), ctx);
	}

	if (isJsonRequest) {
		if (!hasResultData(parsedPayload)) {
			return respondFailure(notFoundFailure(), ctx);
		}
		await writeCachedResult(cacheParts, { data: parsedPayload, source: "legacy" });
		return respondPayload(parsedPayload, ctx, semester, "legacy");
	}

	if (!extracted) {
		if (!legacyBody.trim()) {
			return respondFailure(notFoundFailure(), ctx);
		}
		const looksLikeSpaShell =
			/<app-root\b/i.test(legacyBody) || /<base\s+href=\s*["']\//i.test(legacyBody);
		if (looksLikeSpaShell || viewMode === "official") {
			return responseHtml(
				buildOfficialLegacyDocument(
					legacyBody,
					extractBodyMarkup(legacyBody),
					legacyTarget,
					appBasePath,
				),
				200,
				"legacy",
			);
		}
		return responseHtml(injectCssIntoHtmlDocument(legacyBody, MODERN_CSS, ctx.theme), 200, "legacy");
	}

	const cleanedLegacy = extracted.replace(
		/<a id=["']ContentPlaceHolder1_HyperLink_Back["'][^>]*>View another Result<\/a>/g,
		"",
	);

	if (viewMode === "official") {
		return responseHtml(
			buildOfficialLegacyDocument(legacyBody, cleanedLegacy, legacyTarget, appBasePath),
			200,
			"legacy",
		);
	}

	return responseHtml(injectCssIntoHtmlDocument(cleanedLegacy, MODERN_CSS, ctx.theme), 200, "legacy");
};
