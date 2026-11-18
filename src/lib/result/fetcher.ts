import type { SpecialCase } from "./types";

export const HTML_HEADERS = {
	"content-type": "text/html; charset=utf-8",
	"cache-control": "no-store",
};

export const SEM_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export async function fetchWithTimeout(
	url: string,
	init: RequestInit = {},
	timeoutMs = 15000,
	fetchImpl: typeof fetch = fetch,
): Promise<Response> {
	return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export function isAbortError(error: unknown): boolean {
	const name =
		error instanceof DOMException
			? error.name
			: (error as { name?: string } | null)?.name;
	// AbortSignal.timeout() rejects with TimeoutError; a caller-supplied abort
	// rejects with AbortError. Both mean "no answer in time" to this code.
	return name === "AbortError" || name === "TimeoutError";
}

export function buildSpecialCaseCandidates(specialCase: SpecialCase): SpecialCase[] {
	const candidates: SpecialCase[] = [];
	const seen = new Set<string>();

	const pushCandidate = (candidate: SpecialCase) => {
		const key = `${candidate.year}|${candidate.semester}|${candidate.examHeld}`;
		if (seen.has(key)) return;
		seen.add(key);
		candidates.push(candidate);
	};

	pushCandidate(specialCase);

	const fallbackYear = String(Math.max(2000, Number.parseInt(specialCase.year, 10) - 1));
	if (fallbackYear !== specialCase.year) {
		for (const candidate of [...candidates]) {
			pushCandidate({ ...candidate, year: fallbackYear });
		}
	}

	return candidates;
}

export function getSemOffset(semester: number): number {
	if (semester === 1) return 0;
	if (semester === 2 || semester === 3) return 1;
	if (semester === 4 || semester === 5) return 2;
	if (semester === 6 || semester === 7) return 3;
	return 4;
}

export function getSemOrdinal(semester: number): string {
	if (semester === 1) return "1st";
	if (semester === 2) return "2nd";
	if (semester === 3) return "3rd";
	return `${semester}th`;
}

export function buildLegacyTarget(
	registrationNo: string,
	semester: number,
	effectiveBatchYY: number,
	isCarry: boolean,
): string {
	const semRoman = SEM_ROMAN[semester - 1];
	if (!semRoman) {
		throw new Error("Invalid semester");
	}

	if (effectiveBatchYY === 21 && semester === 2 && !isCarry) {
		return `https://oldresult.akuexam.net/ResultsBTechBPharm2ndSemPub2022.aspx?Sem=II&RegNo=${encodeURIComponent(registrationNo)}`;
	}

	if (effectiveBatchYY === 21 && semester === 1 && !isCarry) {
		return `https://oldresult.akuexam.net/ResultsBTechBPharm1stSemPub2021.aspx?Sem=I&RegNo=${encodeURIComponent(registrationNo)}`;
	}

	const urlYearFull = 2000 + effectiveBatchYY + getSemOffset(semester);
	const carrySlug = isCarry ? "_Carry" : "";
	return `https://results.beup.ac.in/ResultsBTech${getSemOrdinal(semester)}Sem${urlYearFull}_B20${effectiveBatchYY}${carrySlug}Pub.aspx?Sem=${semRoman}&RegNo=${encodeURIComponent(registrationNo)}`;
}
