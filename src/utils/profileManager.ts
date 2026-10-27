// src/utils/profileManager.ts

import {
	branchMap,
	branchPathMap,
	collegeMap,
	parseBeuRegNo,
} from "../lib/beuReg";

export { branchMap, branchPathMap, collegeMap };

export interface BEUProfile {
	regNo: string;
	name?: string;
	collegeCode: string;
	collegeName: string;
	branchCode: string;
	branchName: string;
	branchPath: string;
	batchYear: number;
	currentSem: number;
	lastSgpa?: string;
	lastCgpa?: string;
}

/**
 * Extracts and calculates useful data from an 11-digit BEU Registration Number.
 * Format for Regular: [YY][CCC][BBB][XXX] (Year, College, Branch, Roll)
 * Format for Lateral: [YY][BBB][CCC][9XX] (Year, Branch, College, Roll >= 900)
 */
export function parseRegNo(regNo: string): Partial<BEUProfile> {
	const parsed = parseBeuRegNo(regNo);
	if (!parsed) return { regNo };

	return {
		regNo: parsed.regNo,
		collegeCode: parsed.collegeCode,
		collegeName: parsed.collegeName,
		branchCode: parsed.branchCode,
		branchName: parsed.branchName,
		branchPath: parsed.branchPath,
		batchYear: parsed.batchYear,
		currentSem: parsed.currentSem,
	};
}

/**
 * Get profile from localStorage safely
 */
export function getProfile(): BEUProfile | null {
	if (typeof window === "undefined") return null;
	try {
		const str = localStorage.getItem("beu_profile");
		if (str) return JSON.parse(str) as BEUProfile;
	} catch (e) {
		console.error("Failed to parse BEU Profile", e);
	}
	return null;
}

/**
 * Save profile to localStorage safely
 */
export function saveProfile(profile: Partial<BEUProfile>) {
	if (typeof window === "undefined") return;
	try {
		const existing = getProfile() || {};
		const merged = { ...existing, ...profile };
		localStorage.setItem("beu_profile", JSON.stringify(merged));
		// Dispatch event so other components can react instantly
		window.dispatchEvent(new Event("beu_profile_updated"));
	} catch (e) {
		console.error("Failed to save BEU Profile", e);
	}
}

/**
 * Remove profile from localStorage (Forget Me)
 */
export function clearProfile() {
	if (typeof window === "undefined") return;
	try {
		localStorage.removeItem("beu_profile");
		window.dispatchEvent(new Event("beu_profile_updated"));
	} catch (e) {
		console.error("Failed to clear BEU Profile", e);
	}
}
