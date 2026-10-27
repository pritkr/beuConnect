import type { APIRoute } from "astro";
import type { ResultPayload, ViewMode } from "../../lib/result/types";
import { extractLegacyResultMarkup, extractBodyMarkup } from "../../lib/result/parser";
import { 
	buildErrorHTML, 
	buildOfficialLegacyDocument, 
	injectCssIntoHtmlDocument, 
	MODERN_CSS, 
	renderJsonResultHtml 
} from "../../lib/result/htmlBuilder";
import { 
	buildLegacyTarget, 
	buildSpecialCaseCandidates, 
	fetchWithTimeout, 
	HTML_HEADERS, 
	isAbortError, 
	SPECIAL_CASES 
} from "../../lib/result/fetcher";

export const prerender = false;

const responseHtml = (html: string, status = 200) =>
	new Response(html, { status, headers: HTML_HEADERS });

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

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const appBasePath = getAppBasePath(request.url);
	const rawReg = url.searchParams.get("reg")?.trim() || "";
	const semester = parseSemester(url.searchParams.get("sem"));
	const isCarry = url.searchParams.get("carry") === "true";
	const viewMode = getViewMode(url.searchParams.get("view"));
	const isJsonRequest = url.searchParams.get("format") === "json";

	if (!rawReg || !semester) {
		const msg = "Registration number and semester are both required.";
		if (isJsonRequest) {
			return new Response(JSON.stringify({ status: 400, message: msg }), {
				status: 400,
				headers: { "content-type": "application/json" },
			});
		}
		return responseHtml(buildErrorHTML("Missing inputs", msg), 400);
	}

	const registrationNo = rawReg.toUpperCase();
	const numericReg = registrationNo.replace(/\D/g, "");
	if (numericReg.length < 8) {
		const msg = "Registration number must include enough numeric digits.";
		if (isJsonRequest) {
			return new Response(JSON.stringify({ status: 400, message: msg }), {
				status: 400,
				headers: { "content-type": "application/json" },
			});
		}
		return responseHtml(buildErrorHTML("Invalid registration", msg), 400);
	}

	const parsedYY = Number.parseInt(numericReg.slice(0, 2), 10);
	if (!Number.isFinite(parsedYY)) {
		const msg = "Could not infer batch year from the provided registration number.";
		if (isJsonRequest) {
			return new Response(JSON.stringify({ status: 400, message: msg }), {
				status: 400,
				headers: { "content-type": "application/json" },
			});
		}
		return responseHtml(buildErrorHTML("Invalid registration", msg), 400);
	}

	const isLateral = inferLateralFromReg(numericReg);
	const effectiveBatchYY = isLateral ? Math.max(0, parsedYY - 1) : parsedYY;

	let specialFailureReason: string | null = null;
	const specialCase = !isCarry ? SPECIAL_CASES[`${effectiveBatchYY}-${semester}`] : undefined;
	if (specialCase) {
		for (const [index, candidate] of buildSpecialCaseCandidates(specialCase).entries()) {
			try {
				// 1. Fetch a fresh dynamic single-use token from the university portal
				let token: string | null = null;
				try {
					const tokenResp = await fetchWithTimeout(
						"https://beu-bih.ac.in/backend/v1/result/token",
						{
							headers: {
								accept: "application/json, text/plain, */*",
								referer: "https://beu-bih.ac.in/result-three",
								"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
							},
						},
						8000,
					);
					if (tokenResp.ok) {
						const tokenJson = (await tokenResp.json()) as { token?: string };
						token = tokenJson.token || null;
					} else {
						if (import.meta.env.DEV) {
							console.error(`[result api] Token fetch failed with status: ${tokenResp.status}`);
						}
					}
				} catch (err) {
					if (import.meta.env.DEV) {
						console.error("[result api] Token fetch error:", err);
					}
				}

				if (!token) {
					specialFailureReason = "Failed to obtain a secure single-use token from the BEU server.";
					continue;
				}

				const jsonUrl = `https://beu-bih.ac.in/backend/v1/result/get-result?year=${candidate.year}&redg_no=${encodeURIComponent(registrationNo)}&semester=${candidate.semester}&exam_held=${encodeURIComponent(candidate.examHeld)}&token=${encodeURIComponent(token)}`;
				logChosenFetchUrl(`json source #${index + 1}`, jsonUrl);

				const specialResp = await fetchWithTimeout(
					jsonUrl,
					{
						headers: {
							accept: "application/json, text/plain, */*",
							referer: "https://beu-bih.ac.in/",
							"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						},
					},
					15000,
				);
				if (!specialResp.ok) {
					specialFailureReason = `JSON endpoint responded with status ${specialResp.status}.`;
					continue;
				}

				const jsonData = (await specialResp.json()) as {
					status?: number;
					message?: string;
					data?: ResultPayload;
				};
				if (jsonData.status === 200 && jsonData.data) {
					if (isJsonRequest) {
						return new Response(JSON.stringify({ status: 200, data: jsonData.data }), {
							status: 200,
							headers: { "content-type": "application/json" },
						});
					}
					return responseHtml(
						renderJsonResultHtml(jsonData.data, semester, viewMode, appBasePath),
					);
				}

				specialFailureReason = jsonData.message || "JSON endpoint did not return a result.";
			} catch (error) {
				specialFailureReason = isAbortError(error)
					? "JSON endpoint timed out while fetching result data."
					: "JSON endpoint failed; falling back to legacy BEU result source.";
			}
		}
	}

	const legacyTarget = buildLegacyTarget(registrationNo, semester, effectiveBatchYY, isCarry);
	const fallbackTarget = specialCase?.legacyTarget || legacyTarget;
	logChosenFetchUrl("legacy source", fallbackTarget);
	try {
		const legacyResp = await fetchWithTimeout(
			fallbackTarget,
			{ redirect: "follow" },
			20000,
		);
		if (!legacyResp.ok) {
			const msg = `Target server returned status ${legacyResp.status}. Try again in a few minutes.`;
			if (isJsonRequest) {
				return new Response(JSON.stringify({ status: 502, message: msg }), {
					status: 502,
					headers: { "content-type": "application/json" },
				});
			}
			return responseHtml(buildErrorHTML("BEU server unavailable", msg), 502);
		}

		const html = await legacyResp.text();
		const extracted = extractLegacyResultMarkup(html);

		if (isJsonRequest) {
			const parsedData = parseLegacyHtmlToJson(html);
			if (parsedData) {
				return new Response(JSON.stringify({
					status: 200,
					data: parsedData
				}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			} else {
				return new Response(JSON.stringify({
					status: 404,
					message: "Could not extract a valid result from BEU response."
				}), {
					status: 404,
					headers: { "content-type": "application/json" },
				});
			}
		}

		if (!extracted) {
			if (!html.trim()) {
				const fallbackHint = specialFailureReason
					? ` JSON source info: ${specialFailureReason}`
					: "";
				return responseHtml(
					buildErrorHTML(
						"Result not found",
						`Could not extract a valid result from BEU response. Checked URL: ${fallbackTarget}.${fallbackHint}`,
					),
					404,
				);
			}
			const looksLikeSpaShell = /<app-root\b/i.test(html) || /<base\s+href=\s*["']\//i.test(html);
			if (looksLikeSpaShell) {
				const officialDoc = buildOfficialLegacyDocument(
					html,
					extractBodyMarkup(html),
					fallbackTarget,
					appBasePath,
				);
				return responseHtml(officialDoc);
			}
			if (viewMode === "official") {
				const officialDoc = buildOfficialLegacyDocument(
					html,
					extractBodyMarkup(html),
					fallbackTarget,
					appBasePath,
				);
				return responseHtml(officialDoc);
			}
			const rawHtmlResult = injectCssIntoHtmlDocument(html, MODERN_CSS);
			return responseHtml(rawHtmlResult);
		}

		const cleanedLegacy = extracted.replace(
			/<a id=["']ContentPlaceHolder1_HyperLink_Back["'][^>]*>View another Result<\/a>/g,
			"",
		);

		if (viewMode === "official") {
			const officialDoc = buildOfficialLegacyDocument(
				html,
				cleanedLegacy,
				fallbackTarget,
				appBasePath,
			);
			return responseHtml(officialDoc);
		}

		return responseHtml(`${MODERN_CSS}${cleanedLegacy}`);
	} catch (error) {
		const detail = isAbortError(error)
			? "BEU server timed out. This usually means BEU is down or overloaded."
			: "Unexpected server-side fetch error while contacting BEU.";
		return responseHtml(buildErrorHTML("Result fetch failed", detail), 504);
	}
};
