import type {
	ParsedRoutine,
	RoutineBlock,
	RoutineDay,
	RoutineLabGroup,
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

/**
 * Timetable header prints `10:00-11:00`, but period 2 is published as
 * `11:00-12-00` (a dash where the end time wants a colon). Accept `:`, `.` and
 * `-` on either side of the minutes so the typo still parses.
 */
const TIME_RANGE_PATTERN =
	/(\d{1,2})\s*[:.-]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.-]\s*(\d{2})/;

const ENTRY_OPEN_PATTERN =
	/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bentry\b[^"']*["'][^>]*>/i;

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

function firstTextLine(value: string): string {
	const [line = ""] = stripTags(value).split("\n");
	return line.trim();
}

function cleanSubjectLabel(value: string): string {
	return value
		.replace(/\s*-\s*Room No\s*:.*$/i, "")
		.replace(/\s+\d+\s*hrs?.*$/i, "")
		.trim();
}

function cleanRoomValue(value: string): string | null {
	const cleaned = cleanSingleLine(value)
		.replace(/\s+\d+\s*hrs?\b.*$/i, "")
		.trim();
	return cleaned || null;
}

/** Inner HTML of the first `<tag class="... className ...">` element. */
function tagInnerHtml(
	html: string,
	tag: string,
	className: string,
): string | null {
	const matcher = new RegExp(
		`<${tag}\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
		"i",
	);
	return html.match(matcher)?.[1] ?? null;
}

function tagText(html: string, tag: string, className: string): string {
	return cleanSingleLine(tagInnerHtml(html, tag, className) ?? "");
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

function parseTimeRange(value: string): { start: string; end: string } | null {
	const match = value.match(TIME_RANGE_PATTERN);
	if (!match) return null;

	const [, startHour, startMinute, endHour, endMinute] = match;
	return {
		start: `${startHour.padStart(2, "0")}:${startMinute}`,
		end: `${endHour.padStart(2, "0")}:${endMinute}`,
	};
}

function findHeaderCells(html: string): string[] {
	for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
		const cells = [...row[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
		if (cells.length > 0) return cells.map((cell) => cell[1]);
	}
	return [];
}

interface ParsedHeader {
	slots: RoutineSlot[];
	/** Id of the period the RECESS column follows; null when there is no recess column. */
	recessAfterSlot: number | null;
}

function parseHeader(html: string): ParsedHeader {
	const parsedSlots: RoutineSlot[] = [];
	let lastParsedId: number | null = null;
	let periodColumns = 0;
	let periodsBeforeRecess: number | null = null;
	let lastParsedIdBeforeRecess: number | null = null;

	for (const cellHtml of findHeaderCells(html)) {
		const lines = stripTags(cellHtml).split("\n").filter(Boolean);
		const label = lines[0] ?? "";
		if (!label) continue;

		if (/^recess\b/i.test(label)) {
			periodsBeforeRecess = periodColumns;
			lastParsedIdBeforeRecess = lastParsedId;
			continue;
		}
		if (/^day$/i.test(label)) continue;

		periodColumns += 1;
		const times = parseTimeRange(lines.join(" "));
		if (!times) continue;

		const printedId = Number.parseInt(
			label.match(/period\s*(\d+)/i)?.[1] ?? "",
			10,
		);
		const id =
			Number.isFinite(printedId) && printedId > 0 ? printedId : periodColumns;
		const slotLabel =
			cleanSingleLine(label.replace(TIME_RANGE_PATTERN, "")) || `Period ${id}`;

		parsedSlots.push({
			id,
			label: slotLabel,
			start: times.start,
			end: times.end,
		});
		lastParsedId = id;
	}

	const canUseParsedSlots = parsedSlots.length >= 4;
	const slots = canUseParsedSlots ? parsedSlots : buildDefaultSlots();
	const recessAfterSlot =
		periodsBeforeRecess !== null && periodsBeforeRecess > 0
			? canUseParsedSlots
				? lastParsedIdBeforeRecess
				: periodsBeforeRecess
			: null;

	return { slots, recessAfterSlot };
}

/** Split a cell into its `<div class="entry">` blocks (one cell may hold two). */
function splitEntries(cellHtml: string): string[] {
	const matcher = new RegExp(ENTRY_OPEN_PATTERN.source, "gi");
	const starts: number[] = [];

	for (
		let match = matcher.exec(cellHtml);
		match;
		match = matcher.exec(cellHtml)
	) {
		starts.push(match.index + match[0].length);
	}

	return starts.map((start, index) =>
		cellHtml.slice(start, starts[index + 1] ?? cellHtml.length),
	);
}

function parseCellColspan(attrs: string): number {
	const match = attrs.match(/colspan\s*=\s*["']?\s*(\d+)/i);
	if (!match) return 1;

	const span = Number.parseInt(match[1], 10);
	return Number.isFinite(span) && span > 0 ? span : 1;
}

function isRecessCell(attrs: string, innerHtml: string): boolean {
	if (/\brecess-cell\b/i.test(attrs)) return true;

	const text = stripTags(innerHtml).replace(/\s+/g, " ").trim();
	return /^[^a-z0-9]*recess$/i.test(text);
}

/**
 * Build one block from an entry (or a whole filler cell). `scopeHtml` bounds the
 * subject/faculty/type lookup so a cell with two entries never leaks the first
 * entry's subject into the second.
 */
function buildBlock(
	scopeHtml: string,
	cellHtml: string,
	startSlot: number,
	span: number,
): RoutineBlock | null {
	const scopeText = stripTags(scopeHtml);
	if (!scopeText) return null;

	const subject = cleanSubjectLabel(
		tagText(scopeHtml, "div", "abbr") ||
			tagText(cellHtml, "div", "filler-header") ||
			firstTextLine(scopeText),
	);
	if (!subject) return null;

	const typeBadge = tagText(scopeHtml, "span", "type-badge");
	const labBadge = tagText(scopeHtml, "span", "lab-badge");
	const bifurcatedBadge = tagText(scopeHtml, "span", "bifurcated-badge");
	const groupMatch = bifurcatedBadge.match(/group\s*([ab])\b/i);
	// Stay on the badge's own line: some sheets print `Room No :` and put the
	// duration on the next line, which must not become the room.
	const roomMatch = scopeText.match(/room\s*no\s*:[^\S\r\n]*([^\n<]*)/i);
	const durationMatch = scopeText.match(/(\d+)\s*hrs?\b/i);

	return {
		startSlot,
		span,
		subject,
		type: typeBadge || (labBadge || bifurcatedBadge ? "LAB" : null),
		room: roomMatch ? cleanRoomValue(roomMatch[1]) : null,
		durationLabel: durationMatch
			? durationMatch[0].replace(/\s+/g, " ").trim()
			: null,
		faculty: tagText(scopeHtml, "div", "faculty-short") || null,
		group: groupMatch ? (groupMatch[1].toUpperCase() as RoutineLabGroup) : null,
	};
}

function parseCellBlocks(
	innerHtml: string,
	startSlot: number,
	span: number,
): RoutineBlock[] {
	const entries = splitEntries(innerHtml);
	if (entries.length === 0) {
		const block = buildBlock(innerHtml, innerHtml, startSlot, span);
		return block ? [block] : [];
	}

	const blocks: RoutineBlock[] = [];
	for (const entryHtml of entries) {
		const block = buildBlock(entryHtml, innerHtml, startSlot, span);
		if (block) blocks.push(block);
	}
	return blocks;
}

function parseDays(html: string): RoutineDay[] {
	const bodyHtml = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
	if (!bodyHtml) return [];

	const days: RoutineDay[] = [];
	for (const row of bodyHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
		const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(
			(cell) => ({ attrs: cell[1], html: cell[2] }),
		);
		if (cells.length === 0) continue;

		const [dayCell, ...periodCells] = cells;
		if (!dayCell || /colspan\s*=/i.test(dayCell.attrs)) continue;

		const dayLabel = cleanSingleLine(dayCell.html);
		if (!dayLabel) continue;

		let slotCursor = 1;
		const blocks: RoutineBlock[] = [];
		for (const cell of periodCells) {
			// The recess column is not a period, so it must not advance the cursor.
			if (isRecessCell(cell.attrs, cell.html)) continue;

			const span = parseCellColspan(cell.attrs);
			blocks.push(...parseCellBlocks(cell.html, slotCursor, span));
			slotCursor += span;
		}

		days.push({ day: dayLabel, blocks });
	}

	return days;
}

const LEGEND_CARD_PATTERN =
	/<div class="legend-card">\s*<div class="legend-header">\s*<span class="legend-abbr">([\s\S]*?)<\/span>\s*<span class="legend-code">([\s\S]*?)<\/span>\s*<\/div>\s*<div class="legend-name">([\s\S]*?)<\/div>\s*<div class="legend-faculty">([\s\S]*?)<\/div>\s*<div class="legend-hours">\s*<span>L:(\d+)<\/span>\s*<span>T:(\d+)<\/span>\s*<span>P:([^<]+)<\/span>\s*<\/div>\s*<\/div>/gi;

function parsePapers(html: string): RoutinePaper[] {
	const papers: RoutinePaper[] = [];
	const seen = new Set<string>();

	for (const match of html.matchAll(LEGEND_CARD_PATTERN)) {
		const [, rawAbbr, rawCode, rawName, rawFaculty, rawL, rawT, rawP] = match;
		const abbr = cleanSingleLine(rawAbbr);
		const code = cleanSingleLine(rawCode);
		const name = cleanSingleLine(rawName);
		const faculty = cleanSingleLine(rawFaculty);
		const lectureHours = Number.parseInt(rawL || "0", 10);
		const tutorialHours = Number.parseInt(rawT || "0", 10);
		const practicalHours = cleanSingleLine(rawP || "0");

		if (!abbr || !code || !name) continue;

		// MET sem 3 repeats the same paper once per faculty member; one card is enough.
		const key = `${abbr}\u0000${code}`;
		if (seen.has(key)) continue;
		seen.add(key);

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

function matchInfoBar(html: string): string {
	return (
		html.match(
			/<div\b[^>]*\bclass\s*=\s*["'][^"']*\binfo-bar\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
		)?.[1] ?? ""
	);
}

export function parseRoutineDetailHtml(
	html: string,
	sourceUrl: string,
	fetchedAt: string,
	isStale: boolean,
): ParsedRoutine {
	const title = cleanSingleLine(
		html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "Routine",
	);
	const heading = cleanSingleLine(
		html.match(/<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i)?.[1] ||
			"Government Engineering College Sheikhpura",
	);
	const subheading = cleanSingleLine(
		html.match(/<h2[^>]*>\s*([\s\S]*?)\s*<\/h2>/i)?.[1] || title,
	);

	const infoBar = matchInfoBar(html);
	const effectiveFrom =
		infoBar.match(/Effective From:\s*([^<\n]+)/i)?.[1]?.trim() || null;
	const roomValue = infoBar.match(/Room No:\s*([^<\n]+)/i)?.[1]?.trim() || null;
	const roomLabel = roomValue && roomValue !== "0" ? roomValue : null;
	const header = parseHeader(html);

	return {
		title,
		heading,
		subheading,
		effectiveFrom,
		roomLabel,
		slots: header.slots,
		recessAfterSlot: header.recessAfterSlot,
		days: parseDays(html),
		papers: parsePapers(html),
		sourceUrl,
		fetchedAt,
		isStale,
	};
}
