import * as cheerio from "cheerio";
import type { ResultPayload, SubjectRow } from "./types";

export function parseLegacyHtmlToJson(html: string): ResultPayload | null {
	const $ = cheerio.load(html);

	if ($(".error-card").length > 0 || $("body").text().includes("Result Not Found")) {
		return null;
	}

	const data: ResultPayload = {
		theorySubjects: [],
		practicalSubjects: [],
		sgpa: Array(8).fill(null),
	};

	// Helper to find text next to a label
	const getTextAfterLabel = (labelPattern: RegExp | string, isBold = false) => {
		const elements = isBold ? $("b, strong") : $("td, span, div");
		for (const el of elements.toArray()) {
			const text = $(el).text().trim();
			if (typeof labelPattern === "string" ? text.includes(labelPattern) : labelPattern.test(text)) {
				// Try to find the next sibling's text or parent's next sibling
				let value = $(el).next().text().trim();
				if (!value) {
					value = $(el).parent().next().text().trim();
				}
				if (!value) {
					const parentText = $(el).parent().text().replace(text, "").trim();
					if (parentText) return parentText;
				}
				if (!value) {
					value = $(el).parent().next("td").find("span").text().trim();
				}
				if (value) return value;
			}
		}
		return "";
	};

	data.name = getTextAfterLabel("Student Name", true);
	data.redg_no = getTextAfterLabel("Registration No", true);
	data.father_name = getTextAfterLabel("Father Name", true);
	data.mother_name = getTextAfterLabel("Mother Name", true);
	data.college_name = getTextAfterLabel("College Name", true);
	data.course = getTextAfterLabel("Course Name", true);

	data.semester = $("#ContentPlaceHolder1_DataList2_SemesterLabel_0").text().trim() || getTextAfterLabel("Semester", true);
	data.exam_held = $("#ContentPlaceHolder1_DataList2_ExamHeldLabel_0").text().trim() || getTextAfterLabel("Examination Held", true);

	const examName = $("#ContentPlaceHolder1_lblExamName").text().trim();
	if (examName) {
		const yearMatch = examName.match(/\b(20\d{2})\b/);
		if (yearMatch) data.examYear = yearMatch[1];
	}

	const sgpaText = getTextAfterLabel("SGPA", true);
	if (sgpaText) {
		const semIdx = Number.parseInt(data.semester || "1", 10) - 1;
		if (semIdx >= 0 && semIdx < 8) {
			data.sgpa[semIdx] = sgpaText;
		}
	}

	const cgpaEl = $("th:contains('Cur. CGPA'), th:contains('Cur.CGPA')").closest("table").find("tr").last().find("td").last();
	if (cgpaEl.length > 0) {
		data.cgpa = cgpaEl.text().trim();
		if (data.cgpa === "NA") data.cgpa = "";
	}

	data.fail_any = getTextAfterLabel("Remarks", true);

	const parseTable = (tableId: string, targetArray: SubjectRow[]) => {
		$(`table#${tableId} tr`).each((i, row) => {
			if (i === 0) return; // Skip header
			const cells = $(row).find("td");
			if (cells.length >= 6) {
				const isCodeColZero = $(cells[0]).text().trim().match(/^\d/);
				const offset = isCodeColZero ? 0 : (cells.length === 7 ? 0 : -1);
				
				const name = $(cells[offset + 1]).text().trim();
				if (!name || name.toLowerCase().includes("subject name")) return;

				targetArray.push({
					code: offset >= 0 ? $(cells[offset]).text().trim() : "",
					name,
					ese: $(cells[offset + 2]).text().trim(),
					ia: $(cells[offset + 3]).text().trim(),
					total: $(cells[offset + 4]).text().trim(),
					grade: $(cells[offset + 5]).text().trim(),
					credit: cells.length > offset + 6 ? $(cells[offset + 6]).text().trim() : "",
				});
			}
		});
	};

	parseTable("ContentPlaceHolder1_GridView1", data.theorySubjects!);
	parseTable("ContentPlaceHolder1_GridView2", data.practicalSubjects!);

	// fallback for generic tables if ID not found
	if (data.theorySubjects!.length === 0) {
		$("tr[align='left'], tr[align='center']").each((i, row) => {
			const cells = $(row).find("td");
			if (cells.length >= 6) {
				const isCodeColZero = $(cells[0]).text().trim().match(/^\d/);
				const offset = isCodeColZero ? 0 : (cells.length === 7 ? 0 : 0);
				const name = $(cells[offset + 1]).text().trim();
				if (!name || name.toLowerCase().includes("subject name")) return;
				
				data.theorySubjects!.push({
					code: $(cells[offset]).text().trim(),
					name,
					ese: $(cells[offset + 2]).text().trim(),
					ia: $(cells[offset + 3]).text().trim(),
					total: $(cells[offset + 4]).text().trim(),
					grade: $(cells[offset + 5]).text().trim(),
					credit: cells.length > offset + 6 ? $(cells[offset + 6]).text().trim() : "",
				});
			}
		});
	}

	return data;
}

export function normalizeFailedSubjects(data: ResultPayload): string[] {
	const directArray = Array.isArray(data.failed_subjects)
		? data.failed_subjects
		: Array.isArray(data.backlog_subjects)
			? data.backlog_subjects
			: [];
	const normalizedArray = directArray
		.map((entry) => {
			if (typeof entry === "string") return entry.trim();
			if (entry && typeof entry === "object") {
				const code = typeof entry.code === "string" ? entry.code.trim() : "";
				const name = typeof entry.name === "string" ? entry.name.trim() : "";
				return [code, name].filter(Boolean).join(" - ");
			}
			return "";
		})
		.filter(Boolean);

	if (normalizedArray.length > 0) return normalizedArray;

	const failText = typeof data.fail_any === "string" ? data.fail_any.trim() : "";
	if (!failText) return [];
	const normalizedUpper = failText.toUpperCase();
	if (normalizedUpper === "PASS" || normalizedUpper === "NA") return [];

	const cleaned = failText
		.replace(/^(FAIL(?:ED)?(?:\s+IN)?|FAILURE(?:\s+IN)?|BACKLOG(?:\s+IN)?|REMARKS?\s*:)\s*/i, "")
		.replace(/\.$/, "")
		.trim();
	if (!cleaned) return [];

	return cleaned
		.split(/[;,|/]+/)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function extractLegacyResultMarkup(html: string): string | null {
	const longMatch = html.match(/<div class=["']rnd["'][\s\S]*?<\/div>\s*<\/div>/i);
	if (longMatch?.[0]) {
		return longMatch[0];
	}

	const listMatch = html.match(/<div class=["']rnd["'][\s\S]*?<\/ul>/i);
	if (listMatch?.[0]) {
		return listMatch[0];
	}

	const startIdx = html.search(/<div[^>]+class=["'][^"']*\brnd\b[^"']*["'][^>]*>/i);
	if (startIdx >= 0) {
		const bodyEndIdx = html.search(/<\/body>/i);
		if (bodyEndIdx > startIdx) {
			return html.slice(startIdx, bodyEndIdx);
		}
		return html.slice(startIdx);
	}

	return null;
}

export function getLegacyDocumentBase(legacyTarget: string): string {
	const parsed = new URL(legacyTarget);
	parsed.search = "";
	parsed.hash = "";
	return parsed.toString();
}

export function normalizeAssetUrl(rawValue: string, baseUrl: string): string {
	if (
		/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(
			rawValue,
		)
	) {
		return rawValue;
	}
	try {
		return new URL(rawValue, baseUrl).toString();
	} catch {
		return rawValue;
	}
}

export function absolutizeTagUrlAttribute(
	tag: string,
	attrName: "href" | "src",
	baseUrl: string,
): string {
	const attrPattern = new RegExp(`\\b${attrName}\\s*=\\s*(['"])([^'"]+)\\1`, "gi");
	return tag.replace(attrPattern, (_, quote: string, rawValue: string) => {
		const normalized = normalizeAssetUrl(rawValue, baseUrl);
		return `${attrName}=${quote}${normalized}${quote}`;
	});
}

export function absolutizeAssetUrls(markup: string, baseUrl: string): string {
	return markup.replace(/<(?:link|script|img|a)\b[^>]*>/gi, (tag) => {
		const withHref = absolutizeTagUrlAttribute(tag, "href", baseUrl);
		return absolutizeTagUrlAttribute(withHref, "src", baseUrl);
	});
}

export function extractBodyMarkup(html: string): string {
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	return bodyMatch?.[1] || html;
}
