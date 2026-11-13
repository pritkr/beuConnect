import type { APIRoute } from "astro";
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
	SPECIAL_CASES,
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
	fetchPortalResult,
	OFFICIAL_PORTAL_URL,
	redactPortalResultUrl,
	requestPortalToken,
} from "../../lib/result/portal";
import type { ResultPayload, ViewMode } from "../../lib/result/types";
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
const CAPTCHA_BODY =
	"The university result portal requires a captcha before it returns data. Open the portal, complete the check, and read the result there.";

function captchaFailure(): ResultFailure {
	return {
		code: "upstream_captcha",
		status: 503,
		message: CAPTCHA_BODY,
		retryable: false,
		officialUrl: OFFICIAL_PORTAL_URL,
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
		return new Response(JSON.stringify(payload), {
			status: failure.status,
			headers: { "content-type": "application/json", "cache-control": "no-store" },
		});
	}

	const html =
		failure.code === "upstream_captcha"
			? buildCaptchaHTML({ retryHref: ctx.retryHref, theme: ctx.theme })
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

	const specialCase = !isCarry ? SPECIAL_CASES[`${effectiveBatchYY}-${semester}`] : undefined;

	// The portal issues the only working token and is fronted by a captcha. One
	// probe decides whether the portal can be read at all.
	const portal = await requestPortalToken();
	if (!portal.ok) logUpstreamFailure("portal token", portal.kind, portal.status);

	if (!portal.ok && portal.kind === "captcha") {
		// A challenge cannot be solved from here, and the legacy host is dead.
		return respondFailure(captchaFailure(), ctx);
	}

	let portalSaidNoResult = false;
	let portalHardFailure = false;
	let portalRejectedToken = false;

	if (specialCase) {
		for (const [index, candidate] of buildSpecialCaseCandidates(specialCase).entries()) {
			// The probe above already asked for the first token; later candidates
			// need their own because a token is single-use.
			const tokenOutcome = index === 0 ? portal : await requestPortalToken();
			if (!tokenOutcome.ok) {
				logUpstreamFailure(`portal token #${index + 1}`, tokenOutcome.kind, tokenOutcome.status);
				if (tokenOutcome.kind === "captcha") return respondFailure(captchaFailure(), ctx);
				portalHardFailure = true;
				break;
			}

			logChosenFetchUrl(
				`portal result #${index + 1}`,
				redactPortalResultUrl(candidate, registrationNo),
			);
			const outcome = await fetchPortalResult(candidate, registrationNo, tokenOutcome.token);
			if (outcome.ok) {
				if (hasResultData(outcome.data)) {
					await writeCachedResult(cacheParts, { data: outcome.data, source: "json" });
					return respondPayload(outcome.data, ctx, semester, "json");
				}
				portalSaidNoResult = true;
				continue;
			}

			logUpstreamFailure(`portal result #${index + 1}`, outcome.kind, outcome.status);
			if (outcome.kind === "captcha") return respondFailure(captchaFailure(), ctx);
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

	const legacyTarget =
		specialCase?.legacyTarget || buildLegacyTarget(registrationNo, semester, effectiveBatchYY, isCarry);
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
		return responseHtml(injectCssIntoHtmlDocument(legacyBody, MODERN_CSS), 200, "legacy");
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

	return responseHtml(`${MODERN_CSS}${cleanedLegacy}`, 200, "legacy");
};
