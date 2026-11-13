import type {
	ParsedRoutine,
	RoutineBlock,
	RoutineDay,
	RoutinePaper,
	RoutineSlot,
} from "./types";

const BASIC_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&#039;": "'",
	"&nbsp;": " ",
};

function decodeHtml(value: string): string {
	return value.replace(
		/&amp;|&lt;|&gt;|&quot;|&#39;|&#039;|&nbsp;/g,
		(entity) => BASIC_ENTITIES[entity] || entity,
	);
}

function stripTags(value: string): string {
	return decodeHtml(
		value
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/div>/gi, "\n")
			.replace(/<[^>]+>/g, " ")
			.replace(/\r/g, ""),
	)
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n")
		.trim();
}

function cleanSingleLine(value: string): string {
	return stripTags(value).replace(/\s+/g, " ").trim();
}

function cleanSubjectLabel(value: string): string {
	return value
		.replace(/\s*-\s*Room No\s*:.*$/i, "")
		.replace(/\s+\d+\s*hrs?.*$/i, "")
		.trim();
}

function normalizeTimePart(value: string): string {
	return value.trim().replace(/(\d{1,2})-(\d{2})$/, "$1:$2");
}

function buildDefaultSlots(): RoutineSlot[] {
	return [
		{ id: 1, label: "Period 1", start: "10:00", end: "11:00" },
		{ id: 2, label: "Period 2", start: "11:00", end: "12:00" },
		{ id: 3, label: "Period 3", start: "12:00", end: "13:00" },
		{ id: 4, label: "Period 4", start: "14:00", end: "15:00" },
		{ id: 5, label: "Period 5", start: "15:00", end: "16:00" },
		{ id: 6, label: "Period 6", start: "16:00", end: "17:00" },
	];
}

function parseSlots(html: string): RoutineSlot[] {
	const slots: RoutineSlot[] = [];
	for (const match of html.matchAll(/<th>([\s\S]*?)<\/th>/gi)) {
		const text = stripTags(match[1]);
		if (!text || text === "Day" || /^RECESS/i.test(text)) continue;
		const [labelPart = "", timePart = ""] = text.split("\n");
		const slotId = Number.parseInt(labelPart.replace(/[^0-9]/g, ""), 10);
		if (!Number.isFinite(slotId)) continue;

		const [rawStart = "", rawEnd = ""] = timePart.split("-");
		slots.push({
			id: slotId,
			label: labelPart.trim() || `Period ${slotId}`,
			start: normalizeTimePart(rawStart),
			end: normalizeTimePart(rawEnd),
		});
	}

	return slots.length === 6 ? slots : buildDefaultSlots();
}

function parseRoutineCell(innerHtml: string, startSlot: number, span: number): RoutineBlock | null {
	const subjectMatch = innerHtml.match(
		/<div class="abbr">\s*([\s\S]*?)\s*<\/div>/i,
	);
	const rawSubject = subjectMatch ? cleanSingleLine(subjectMatch[1]) : "";
	const rawText = stripTags(innerHtml);
	if (!rawText || /^RECESS$/i.test(rawText.replace(/🍽️/g, "").trim())) return null;
	const rawLines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);

	const typeMatch = innerHtml.match(/<span class="type-badge">\s*([^<]+)\s*<\/span>/i);
	const roomMatch = rawText.match(/Room No\s*:\s*([^\n]+)/i);
	const durationMatch = rawText.match(/(\d+\s*hrs?)/i);
	const fallbackSubject = cleanSubjectLabel(rawLines[0] || rawText);

	const subject = cleanSubjectLabel(rawSubject) || fallbackSubject || "Class";
	return {
		startSlot,
		span,
		subject,
		type: typeMatch ? cleanSingleLine(typeMatch[1]) : null,
		room: roomMatch ? roomMatch[1].trim() : null,
		durationLabel: durationMatch ? durationMatch[1].trim() : null,
	};
}

function parseDays(html: string): RoutineDay[] {
	const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
	if (!tbodyMatch) return [];

	const days: RoutineDay[] = [];
	for (const rowMatch of tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
		const cells = [...rowMatch[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
		if (cells.length === 0) continue;

		const dayLabel = cleanSingleLine(cells[0][2]);
		if (!dayLabel) continue;

		const blocks: RoutineBlock[] = [];
		let slotCursor = 1;

		for (const [, attrs, innerHtml] of cells.slice(1)) {
			const text = stripTags(innerHtml);
			if (/RECESS/i.test(text)) continue;

			const spanMatch = attrs.match(/colspan="?(\d+)"?/i);
			const span = spanMatch
				? Math.max(1, Number.parseInt(spanMatch[1], 10))
				: 1;

			const block = parseRoutineCell(innerHtml, slotCursor, span);
			if (block) blocks.push(block);
			slotCursor += span;
		}

		days.push({ day: dayLabel, blocks });
	}

	return days;
}

function parsePapers(html: string): RoutinePaper[] {
	const papers: RoutinePaper[] = [];
	for (const match of html.matchAll(/<div class="legend-card">\s*<div class="legend-header">\s*<span class="legend-abbr">([\s\S]*?)<\/span>\s*<span class="legend-code">([\s\S]*?)<\/span>\s*<\/div>\s*<div class="legend-name">([\s\S]*?)<\/div>\s*<div class="legend-faculty">([\s\S]*?)<\/div>\s*<div class="legend-hours">\s*<span>L:(\d+)<\/span>\s*<span>T:(\d+)<\/span>\s*<span>P:([^<]+)<\/span>\s*<\/div>\s*<\/div>/gi)) {
		const [, rawAbbr, rawCode, rawName, rawFaculty, rawL, rawT, rawP] = match;
		const abbr = cleanSingleLine(rawAbbr);
		const code = cleanSingleLine(rawCode);
		const name = cleanSingleLine(rawName);
		const faculty = cleanSingleLine(rawFaculty);
		const lectureHours = Number.parseInt(rawL || "0", 10);
		const tutorialHours = Number.parseInt(rawT || "0", 10);
		const practicalHours = cleanSingleLine(rawP || "0");

		if (!abbr || !code || !name) continue;
		papers.push({
			abbr,
			code,
			name,
			faculty,
			lectureHours: Number.isFinite(lectureHours) ? lectureHours : 0,
			tutorialHours: Number.isFinite(tutorialHours) ? tutorialHours : 0,
			practicalHours,
		});
	}

	return papers;
}

export function parseRoutineDetailHtml(
	html: string,
	sourceUrl: string,
	fetchedAt: string,
	isStale: boolean,
): ParsedRoutine {
	const title = cleanSingleLine(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "Routine");
	const heading = cleanSingleLine(
		html.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i)?.[1] || "Government Engineering College Sheikhpura",
	);
	const subheading = cleanSingleLine(
		html.match(/<h2[^>]*>\s*([\s\S]*?)\s*<\/h2>/i)?.[1] || title,
	);
	const infoBar = html.match(/<div class="info-bar">([\s\S]*?)<\/div>/i)?.[1] || "";
	const effectiveFrom = infoBar.match(/Effective From:\s*([^<\n]+)/i)?.[1]?.trim() || null;
	const roomValue = infoBar.match(/Room No:\s*([^<\n]+)/i)?.[1]?.trim() || null;
	const roomLabel = roomValue && roomValue !== "0" ? roomValue : null;

	return {
		title,
		heading,
		subheading,
		effectiveFrom,
		roomLabel,
		slots: parseSlots(html),
		days: parseDays(html),
		papers: parsePapers(html),
		sourceUrl,
		fetchedAt,
		isStale,
	};
}
