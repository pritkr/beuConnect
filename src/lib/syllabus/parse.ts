/**
 * Syllabus bodies in `assets/data/branches/*.json` are plain-text blobs with
 * hand-typed headings. The same unit is written "Unit-1.0 7 hrs", "Unit- 1.0:",
 * "Unit 1.0- 7 hrs", "Module 1: Input and Output 6 Hrs" and a dozen other ways,
 * and a few blobs have no headings at all. This turns one blob into units of
 * numbered topics without dropping a single line.
 */

export type SyllabusTopic = { text: string };

export type SyllabusUnit = {
	/** Heading number. 0 is the unitless block: a preamble or a heading-free blob. */
	number: number;
	hours: number | null;
	title: string | null;
	topics: string[];
};

/*
 * "Unit" and "Module" both appear, with an optional separator, a major number,
 * an optional ".0" fraction, an optional separator and a free-form tail.
 * Matching the fraction optionally is what catches "Unit-4 Fitting Shop" and
 * "Module 1: Input and Output", which omit it.
 */
const HEADING =
	/^\s*(?:unit|module)\s*[-–:]?\s*(\d+)(?:\s*[.\-]\s*(\d+))?\s*[:\-–]?\s*(.*)$/i;

const HOURS = /(\d+)\s*hrs?\.?/gi;

/** A heading tail longer than this is body text typed on the heading line. */
const LONG_TITLE = 120;

/** Trim the punctuation headings wrap themselves in, never interior text. */
function trimEdges(value: string) {
	return value
		.replace(/^[\s:;,.–—-]+/, "")
		.replace(/[\s:;,.–—-]+$/, "")
		.trim();
}

export function collapseWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

/**
 * A unit body is usually one long comma list ("Overview, Turing test,
 * Intelligent agents.") but sometimes a sentence ("Use of CAD software to
 * draw shapes, apply dimensions, and modify objects."), and a checkbox per
 * sentence is too coarse. Split a list only when it reads like one: at least
 * three parts after folding "and/or" tails back in, and most of the parts
 * starting with a capital, a digit or a bracket. Prose keeps its commas.
 */
const LEAD_NUMBER = /^\d+[.)]\s*/;
const CONJUNCTION = /^(?:and|or|but|plus)\b/i;

function splitTopLevel(text: string) {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === "(" || char === "{" || char === "[") depth += 1;
		else if (char === ")" || char === "}" || char === "]") depth = Math.max(0, depth - 1);
		else if ((char === "," || char === ";") && depth === 0) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));

	const merged: string[] = [];
	let carry = "";
	for (const raw of parts) {
		let part = raw.trim();
		if (!part) continue;
		// "I, T, Angle sections" is one item: a one-letter fragment belongs to
		// the phrase that follows it, not to a checkbox of its own.
		if (part.length === 1) {
			carry = carry ? `${carry}, ${part}` : part;
			continue;
		}
		if (carry) {
			part = `${carry}, ${part}`;
			carry = "";
		}
		if (merged.length && CONJUNCTION.test(part)) {
			merged[merged.length - 1] = `${merged[merged.length - 1]}, ${part}`;
			continue;
		}
		merged.push(part);
	}
	if (carry && merged.length) merged[merged.length - 1] = `${merged[merged.length - 1]}, ${carry}`;
	return merged;
}

function startsLikeItem(part: string) {
	const text = part.replace(LEAD_NUMBER, "").trimStart();
	return /^[A-Z0-9("“'[]/.test(text);
}

export function splitTopic(text: string): string[] {
	const whole = collapseWhitespace(text);
	if (!whole) return [];

	const parts = splitTopLevel(whole);
	if (parts.length < 3) return [whole];

	const capitalised = parts.filter(startsLikeItem).length;
	if (capitalised / parts.length < 0.6) return [whole];

	return parts.map((part) => part.replace(/[\s,;]+$/, "")).filter((part) => part.length > 0);
}

/** "Unit- 1.0: Linear Algebra-I 7 hrs" -> tail "Linear Algebra-I", hours 7. */
function takeHours(tail: string) {
	let last: RegExpExecArray | null = null;
	HOURS.lastIndex = 0;
	let match = HOURS.exec(tail);
	while (match) {
		last = match;
		match = HOURS.exec(tail);
	}
	if (!last) return { tail, hours: null as number | null };
	const stripped = `${tail.slice(0, last.index)} ${tail.slice(last.index + last[0].length)}`;
	return { tail: collapseWhitespace(stripped), hours: Number(last[1]) };
}

function readHeading(line: string) {
	const match = line.match(HEADING);
	if (!match) return null;
	const { tail, hours } = takeHours(collapseWhitespace(match[3] ?? ""));
	// "(8 hrs)" leaves an empty bracket pair behind once the hours are out.
	const cleaned = collapseWhitespace(tail.replace(/[(（]\s*[)）]/g, " "));
	return {
		number: Number(match[1]),
		hours,
		tail: trimEdges(cleaned),
	};
}

/**
 * Some headings swallow their whole unit ("Module 2 Petrology: Rock forming…",
 * 1400 characters). Keep the short label, hand the rest back as the first
 * topic so nothing is lost and the header stays readable.
 */
function splitHeadingTail(tail: string) {
	if (!tail) return { title: null, body: null };
	if (tail.length <= LONG_TITLE) return { title: tail, body: null };

	const split = tail.match(/^(.{1,80}?)\s*[:–—]\s*(.{20,})$/);
	if (split) {
		const title = trimEdges(split[1]);
		const body = collapseWhitespace(split[2]);
		if (title) return { title, body: body || null };
	}

	return { title: null, body: tail };
}

const NUMBERED = /^\d+\.\s/;

/** Lab courses list experiments as "LE-1 Diffraction Grating." */
const LAB_ITEM = /^LE-\d+\b/;

/** A stray ". " opening a paragraph is a PDF bullet, not part of the sentence. */
function stripLeadDot(line: string) {
	return /^\.\s/.test(line) ? line.slice(1).trimStart() : line;
}

export function parseSyllabusContent(
	content: string,
	options: { splitLists?: boolean } = {},
): SyllabusUnit[] {
	const text = typeof content === "string" ? content : "";
	const splitLists = options.splitLists ?? true;
	const units: SyllabusUnit[] = [];
	let current: SyllabusUnit | null = null;
	let topicOpen = false;

	const openUnit = (unit: SyllabusUnit) => {
		units.push(unit);
		current = unit;
		topicOpen = false;
		return unit;
	};

	/** Read through a function so the checker cannot narrow `current` to `null`. */
	const currentUnit = (): SyllabusUnit | null => current;

	const openTopic = (line: string) => {
		const unit =
			currentUnit() ?? openUnit({ number: 0, hours: null, title: null, topics: [] });
		unit.topics.push(stripLeadDot(line));
		topicOpen = true;
	};

	for (const raw of text.split(/\r?\n/)) {
		const line = collapseWhitespace(raw);

		// A blank line closes the paragraph, so the next unnumbered line starts
		// its own topic instead of running into the previous one.
		if (!line) {
			topicOpen = false;
			continue;
		}

		const heading = readHeading(line);
		if (heading) {
			const { title, body } = splitHeadingTail(heading.tail);
			openUnit({
				number: heading.number,
				hours: heading.hours,
				title,
				topics: body ? [body] : [],
			});
			topicOpen = Boolean(body);
			continue;
		}

		const unit = currentUnit();
		if (NUMBERED.test(line) || LAB_ITEM.test(line) || !topicOpen || !unit) {
			openTopic(line);
		} else {
			const index = unit.topics.length - 1;
			unit.topics[index] = `${unit.topics[index]} ${line}`;
		}
	}

	// Paragraphs are assembled first so a wrapped line cannot look like a list
	// of its own; only then is each paragraph cut into checkable items. A lab
	// experiment is one checkbox, so practical subjects keep their lines whole.
	if (splitLists) {
		for (const unit of units) {
			unit.topics = unit.topics.flatMap(splitTopic);
		}
	}

	return units;
}
