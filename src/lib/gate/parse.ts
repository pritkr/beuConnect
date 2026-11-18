/**
 * GATE outlines in `assets/data/gate/*.json` are one PDF paragraph per section,
 * e.g. "Boolean algebra. Combinational and sequential circuits. Minimization."
 * A section is far too broad to tick off in one go, so each paragraph is cut
 * into the narrow topics a student actually revises: every sentence, every
 * top-level comma or semicolon list and every "Label:" group becomes checkable
 * on its own.
 *
 * The paragraph is re-flowed first. PDF extraction wraps a line wherever the
 * column ends, so a newline is only a topic boundary when the next line opens
 * a new item (a capital, a digit) and the previous one did not stop mid-phrase
 * ("…, partial orders and" / "lattices." is one topic; "…(Lotka-Voltera
 * equation, etc.)" / "Community Ecology: …" is two).
 */

/** One heading of a section: "Discrete Mathematics", "Calculus", or none. */
export type GateGroup = {
	label: string | null;
	topics: string[];
};

export type GateSection = {
	/** "Section 1: Linear Algebra" -> 1. Null when the title is not numbered. */
	number: number | null;
	/** "Section 1: Linear Algebra" -> "Linear Algebra". */
	title: string;
	groups: GateGroup[];
	/** Total checkboxes this section renders. */
	count: number;
};

export type GateSectionInput = { title?: unknown; content?: unknown };

function collapse(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

/** A line ending in one of these stops mid-phrase: the next line continues it. */
const OPEN_END =
	/(?:\b(?:and|or|of|the|a|an|in|to|for|with|by|on|from|into|as|at|is|are|be|using|based|between|versus|vs|via|than|that|which|their|its|each|per|over|under|across|within|without|both|not)|[-–—:,;])\s*$/i;

/** "strain-" + "rate", "one -" + "dimensional": the dash belongs to the word. */
const HYPHEN_END = /[A-Za-z][-‐‑]$/;
const DASH_END = /\s[-‐‑–—]$/;

/** "XE-B Fluid Mechanics", "XL-Q Biochemistry": a divider, not a topic. */
const PART_TITLE = /^(?:XE|XL)-[A-Z]\s+([^:;]{1,48})$/;

/** "Section 1", "Section A" on a line of its own: structure, not content. */
const SECTION_MARKER = /^Section\s+(?:\d+|[A-Z])$/;

/** "Section A: Atmospheric Science": a subject heading of a combined paper. */
const SECTION_LABEL = /^Section\s+[A-Z]\s*:\s*(.+)$/i;

/** "Community Ecology: Community assembly" opens a labelled item. */
const LABELLED_LINE = /^[^:;]{1,50}:/;

/** A line that closes its bracket ends an item even without a full stop. */
const CLOSED_END = /[)\]”"']$/;

const isHeading = (line: string) =>
	PART_TITLE.test(line) ||
	SECTION_MARKER.test(line) ||
	SECTION_LABEL.test(line);

/**
 * Join the wrapped lines of one paragraph back into running text, turning the
 * line breaks that *are* topic boundaries into sentence breaks.
 */
export function unwrapGateContent(content: string): string {
	const lines = content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !SECTION_MARKER.test(line));

	let text = "";
	let previousHeading = false;
	for (const line of lines) {
		if (!text) {
			text = line;
			previousHeading = isHeading(line);
			continue;
		}
		if (/^[a-z]/.test(line) && HYPHEN_END.test(text)) {
			// "pack-" + "aging" keeps the dash: most of these are real compounds
			// ("strain-rate", "prey-predator") and a re-joined "packaging" is not
			// worth breaking the ones that are.
			text += line;
			previousHeading = false;
			continue;
		}
		if (/^[a-z]/.test(line) && DASH_END.test(text)) {
			text = `${text.replace(DASH_END, "")}-${line}`;
			previousHeading = false;
			continue;
		}
		// Only a line that carries its own label, opens a subject of the
		// combined papers or follows a closed bracket starts a new item. A
		// capital alone is not enough: "…and Radiation" / "Balance" is one
		// topic wrapped in the middle.
		const opensItem =
			previousHeading ||
			(/^[A-Z0-9]/.test(line) &&
				(LABELLED_LINE.test(line) ||
					PART_TITLE.test(line) ||
					CLOSED_END.test(text)));
		if (opensItem && !OPEN_END.test(text)) text += `. ${line}`;
		else text += ` ${line}`;
		previousHeading = isHeading(line);
	}

	return collapse(
		text
			// "Ice- cream" is a typo in the source, not a range.
			.replace(/([A-Za-z])[-‐‑]\s+([a-z])/g, "$1-$2")
			// "Flow measurements - Venturi meter, …" is a labelled list, not a range.
			.replace(/\s+[-‐‑–—]\s*/g, ", "),
	);
}

/** Split on a separator only where it is not inside brackets. */
function splitOutside(text: string, separator: RegExp): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	let index = 0;

	while (index < text.length) {
		const char = text[index];
		if (char === "(" || char === "{" || char === "[") depth += 1;
		else if (char === ")" || char === "}" || char === "]") {
			depth = Math.max(0, depth - 1);
		}
		if (depth === 0) {
			const match = text.slice(index).match(separator);
			if (match && match.index === 0) {
				parts.push(text.slice(start, index));
				index += match[0].length;
				start = index;
				continue;
			}
		}
		index += 1;
	}

	parts.push(text.slice(start));
	return parts;
}

/** Trim the scaffolding a list item wraps itself in, never interior words. */
function tidyItem(text: string): string {
	const value = text
		.replace(/^[\s;,.–—•·-]+/, "")
		.replace(/^(?:and|or|but|plus|&)\s+/i, "")
		.replace(/[\s;,.–—:]+$/, "")
		.replace(/[\s,;]*\betc\.?$/i, "")
		.trim();
	if (!value) return "";
	// A lower-case phrase still reads as a topic once it starts a checkbox, but
	// "pH" and "mRNA" are spelled the way they are.
	const [first = ""] = value.split(/\s+/);
	const capitalisable = /^[a-z][a-z'’-]*$/.test(first);
	return capitalisable ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** "Sets, relations, functions, partial orders and lattices" -> 4 checkboxes. */
export function splitGateTopics(text: string): string[] {
	const out: string[] = [];
	for (const part of splitOutside(text, /^\s*[,;]\s*/)) {
		const topic = tidyItem(part);
		if (topic && !out.includes(topic)) out.push(topic);
	}
	return out;
}

/**
 * "Discrete Mathematics: Propositional and first order logic." -> the label
 * "Discrete Mathematics" over the topics that follow it. A long lead-in or a
 * label-looking fragment in the middle of a sentence is left as body text, and
 * the "Section A:" prefixes the combined papers use are dropped so the group
 * reads as its subject.
 */
const LABEL = /^([A-Z][^:;]{1,58}?):\s+(.+)$/;
const MAX_LABEL_WORDS = 6;

/** A divider keeps its words, never the full stop that closed the line. */
function trimLabel(value: string) {
	return value.replace(/[\s.;:]+$/, "").trim();
}

function readLabel(sentence: string) {
	// The combined papers put a subject heading above their sections. It is a
	// divider, so it carries no topics of its own.
	const part = sentence.match(PART_TITLE);
	if (part) return { label: trimLabel(part[1]), body: "" };

	const sectioned = sentence.match(SECTION_LABEL);
	const text = sectioned ? sectioned[1] : sentence;
	if (sectioned && !text.includes(":")) {
		return { label: trimLabel(text), body: "" };
	}

	const match = text.match(LABEL);
	if (!match) return { label: null, body: sentence };
	if (match[1].split(/\s+/).length > MAX_LABEL_WORDS) {
		return { label: null, body: sentence };
	}
	return { label: match[1], body: match[2] };
}

/** Cut one section paragraph into labelled groups of checkable topics. */
export function parseGateGroups(content: unknown): GateGroup[] {
	const text = typeof content === "string" ? unwrapGateContent(content) : "";
	if (!text) return [];

	const groups: GateGroup[] = [];
	for (const raw of text.split(/(?<=[.!?])\s+/)) {
		const sentence = raw.trim();
		if (!sentence) continue;
		const { label, body } = readLabel(sentence);
		const topics = body ? splitGateTopics(body) : [];
		if (!label && !topics.length) continue;

		const last = groups[groups.length - 1];
		// An unlabelled sentence continues the block above it: "Discrete
		// Mathematics: … . Monoids, Groups." is still discrete mathematics.
		if (last && (label === null || last.label === label)) {
			for (const topic of topics) {
				if (!last.topics.includes(topic)) last.topics.push(topic);
			}
		} else {
			groups.push({ label, topics });
		}
	}

	return groups;
}

const SECTION_NUMBER = /^Section\s+(\d+)\s*:\s*(.+)$/i;

/** "Section 1: Engineering Mathematics" -> number 1, title the rest. */
export function readSectionTitle(title: unknown) {
	const value = typeof title === "string" ? collapse(title) : "";
	const match = value.match(SECTION_NUMBER);
	if (match) return { number: Number(match[1]), title: match[2] };
	return { number: null, title: value };
}

/** Every section of one paper, each already cut into its checkable topics. */
export function parseGateSections(sections: unknown): GateSection[] {
	if (!Array.isArray(sections)) return [];

	return sections.map((section: GateSectionInput) => {
		const { number, title } = readSectionTitle(section?.title);
		const groups = parseGateGroups(section?.content);
		const count = groups.reduce((sum, group) => sum + group.topics.length, 0);
		return { number, title, groups, count };
	});
}
