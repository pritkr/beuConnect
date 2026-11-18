import { describe, expect, it } from "vitest";
import civil from "../../assets/data/branches/civil.json";
import cse from "../../assets/data/branches/cse.json";
import ece from "../../assets/data/branches/ece.json";
import ee from "../../assets/data/branches/ee.json";
import eee from "../../assets/data/branches/eee.json";
import mech from "../../assets/data/branches/mech.json";
import { parseSyllabusContent, splitTopic, type SyllabusUnit } from "./parse";

const BRANCHES = [
	{ code: "cse", data: cse },
	{ code: "ece", data: ece },
	{ code: "ee", data: ee },
	{ code: "mech", data: mech },
	{ code: "civil", data: civil },
	{ code: "eee", data: eee },
] as const;

const HEADING_LINE =
	/^\s*(?:unit|module)\s*[-–:]?\s*(\d+)(?:\s*[.\-]\s*(\d+))?\s*[:\-–]?\s*(.*)$/i;

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

type Subject = {
	code?: string;
	name?: string;
	content?: string;
	type?: "Theory" | "Practical" | string;
};

function subjectList() {
	const rows: { branch: string; sem: string; subject: Subject; content: string }[] =
		[];
	for (const branch of BRANCHES) {
		const semesters = (branch.data as { semesters?: Record<string, unknown> })
			.semesters;
		if (!semesters) continue;
		for (const [sem, value] of Object.entries(semesters)) {
			const subjects = (value as { subjects?: Subject[] }).subjects ?? [];
			for (const subject of subjects) {
				rows.push({
					branch: branch.code,
					sem,
					subject,
					content: typeof subject.content === "string" ? subject.content : "",
				});
			}
		}
	}
	return rows;
}

const SUBJECTS = subjectList();

function allText(units: SyllabusUnit[]) {
	return units.flatMap((unit) => [unit.title ?? "", ...unit.topics]).join(" \n ");
}

/** Word sequence only: list splitting moves punctuation, never words. */
function words(value: string) {
	return collapse(value)
		.replace(/[,;]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function topicTotal(units: SyllabusUnit[]) {
	return units.reduce((sum, unit) => sum + unit.topics.length, 0);
}

describe("parseSyllabusContent headings", () => {
	const cases: { label: string; content: string; unit: SyllabusUnit }[] = [
		{
			label: "Unit-1.0 7 hrs",
			content: "Unit-1.0 7 hrs\nDigital signals and gates.",
			unit: {
				number: 1,
				hours: 7,
				title: null,
				topics: ["Digital signals and gates."],
			},
		},
		{
			label: "Unit- 1.0",
			content: "Unit- 1.0\nBoolean algebra.",
			unit: { number: 1, hours: null, title: null, topics: ["Boolean algebra."] },
		},
		{
			label: "Unit- 1.0: 7 hrs",
			content: "Unit- 1.0: 7 hrs\nNumber systems.",
			unit: { number: 1, hours: 7, title: null, topics: ["Number systems."] },
		},
		{
			label: "Unit 1.0- 7 hrs",
			content: "Unit 1.0- 7 hrs\nNumber systems.",
			unit: { number: 1, hours: 7, title: null, topics: ["Number systems."] },
		},
		{
			label: "Unit- 1.0: Linear Algebra-I 7 hrs",
			content: "Unit- 1.0: Linear Algebra-I 7 hrs\nMatrices and rank.",
			unit: {
				number: 1,
				hours: 7,
				title: "Linear Algebra-I",
				topics: ["Matrices and rank."],
			},
		},
		{
			label: "Unit- 1.0\\n1. Frame of Reference: 2 hrs",
			content: "Unit- 1.0\n1. Frame of Reference: 2 hrs\nInertial frames.",
			unit: {
				number: 1,
				hours: null,
				title: null,
				topics: ["1. Frame of Reference: 2 hrs Inertial frames."],
			},
		},
		{
			label: "Unit-1.0: N hrs.",
			content: "Unit-6.0: 3hrs.\nProgrammable logic devices.",
			unit: {
				number: 6,
				hours: 3,
				title: null,
				topics: ["Programmable logic devices."],
			},
		},
		{
			label: "Unit-4 Fitting Shop 10 hrs",
			content: "Unit-4 Fitting Shop 10 hrs\nMarking and filing.",
			unit: {
				number: 4,
				hours: 10,
				title: "Fitting Shop",
				topics: ["Marking and filing."],
			},
		},
		{
			label: "Module 1: Input and Output 6 Hrs",
			content:
				"Module 1: Input and Output 6 Hrs\nIdentifiers, keywords and statements.",
			unit: {
				number: 1,
				hours: 6,
				title: "Input and Output",
				topics: ["Identifiers, keywords and statements."],
			},
		},
		{
			label: "unit 3.0: 7 hrs.",
			content: "unit 3.0: 7 hrs.\nLower case heading.",
			unit: { number: 3, hours: 7, title: null, topics: ["Lower case heading."] },
		},
	];

	it.each(cases)("parses $label", ({ content, unit }) => {
		expect(parseSyllabusContent(content)).toEqual([unit]);
	});
});

describe("parseSyllabusContent topics", () => {
	it("continues an unnumbered line into the topic above it", () => {
		const units = parseSyllabusContent(
			[
				"Unit- 1.0: 5 hrs",
				"1. First topic",
				"runs onto the next line",
				"2. Second topic",
			].join("\n"),
		);

		expect(units[0].topics).toEqual([
			"1. First topic runs onto the next line",
			"2. Second topic",
		]);
	});

	it("starts a new topic for a standalone paragraph", () => {
		const units = parseSyllabusContent(
			[
				"Unit- 1.0: 5 hrs",
				"Preamble paragraph.",
				"",
				"Standalone paragraph.",
				"Continuation of the paragraph.",
			].join("\n"),
		);

		expect(units[0].topics).toEqual([
			"Preamble paragraph.",
			"Standalone paragraph. Continuation of the paragraph.",
		]);
	});

	it("keeps a headingless blob as one unit of paragraph topics", () => {
		const units = parseSyllabusContent(
			[
				"Perform any 10 Experiments",
				"1. Verification of Kirchhoff's laws.",
				"2. Verification of Thevenin's Theorem.",
			].join("\n"),
		);

		expect(units).toHaveLength(1);
		expect(units[0]).toMatchObject({ number: 0, hours: null, title: null });
		expect(units[0].topics).toHaveLength(3);
	});

	it("gives every LE experiment its own topic", () => {
		const units = parseSyllabusContent(
			[
				"LE-1 Diffraction Grating.",
				"LE-2 Newton’s Ring Experiment",
				"LE-3 Resolving Power of Telescope",
			].join("\n"),
		);

		expect(units).toHaveLength(1);
		expect(units[0].topics).toEqual([
			"LE-1 Diffraction Grating.",
			"LE-2 Newton’s Ring Experiment",
			"LE-3 Resolving Power of Telescope",
		]);
	});

	it("keeps a unit that has no topics", () => {
		const units = parseSyllabusContent(
			["Unit- 1.0: Introduction 5 hrs", "Unit- 2.0: Next 5 hrs", "1. Only topic"].join(
				"\n",
			),
		);

		expect(units[0]).toEqual({
			number: 1,
			hours: 5,
			title: "Introduction",
			topics: [],
		});
		expect(units[1].topics).toEqual(["1. Only topic"]);
	});

	it("does not drop a preamble typed before the first heading", () => {
		const units = parseSyllabusContent(
			["Detailed contents:", "Unit- 1.0: Introduction 5 hrs", "1. Topic"].join(
				"\n",
			),
		);

		expect(units[0].number).toBe(0);
		expect(units[0].topics).toEqual(["Detailed contents:"]);
		expect(units[1].number).toBe(1);
	});

	it("returns nothing for empty content", () => {
		expect(parseSyllabusContent("")).toEqual([]);
		expect(parseSyllabusContent("   \n\n  ")).toEqual([]);
	});

	it("drops a stray dot that opens a paragraph", () => {
		const units = parseSyllabusContent(
			["Unit-6.0 7 hrs", ". Programmable logic devices."].join("\n"),
		);

		expect(units[0].topics).toEqual(["Programmable logic devices."]);
	});
});

describe("splitTopic", () => {
	it("cuts a clean comma list into checkable items", () => {
		expect(splitTopic("Overview, Turing test, Intelligent agents.")).toEqual([
			"Overview",
			"Turing test",
			"Intelligent agents.",
		]);
	});

	it("keeps a prose sentence whole", () => {
		const sentence =
			"Use of CAD software to draw basic geometric shapes, apply dimensions, and modify objects.";
		expect(splitTopic(sentence)).toEqual([sentence]);
	});

	it("does not split inside brackets", () => {
		const line =
			"Introduction to Computer Vision, Natural Language Processing, Expert Systems, Robotics, Genetic Algorithm";
		expect(splitTopic(line)).toHaveLength(5);
		expect(splitTopic("Sections (Solid, Hollow), Circular sections, I sections")).toEqual([
			"Sections (Solid, Hollow)",
			"Circular sections",
			"I sections",
		]);
	});

	it("folds an and-tail into the item before it", () => {
		expect(
			splitTopic("Public speaking, Group discussion, Leadership, and body language"),
		).toEqual(["Public speaking", "Group discussion", "Leadership, and body language"]);
	});

	it("leaves a two-part line and a single topic alone", () => {
		expect(splitTopic("Overview, Turing test")).toEqual(["Overview, Turing test"]);
		expect(splitTopic("Only one topic here")).toEqual(["Only one topic here"]);
	});
});

describe("parseSyllabusContent over every branch and semester", () => {
	it("covers all 361 subjects", () => {
		expect(SUBJECTS).toHaveLength(361);
	});

	it("never loses a body line", () => {
		const missing: string[] = [];
		let parsedSubjects = 0;
		let units = 0;
		let topics = 0;

		for (const row of SUBJECTS) {
			const unitsForSubject = parseSyllabusContent(row.content);
			parsedSubjects += 1;
			units += unitsForSubject.length;
			topics += topicTotal(unitsForSubject);

			const blob = allText(unitsForSubject);
			for (const raw of row.content.split(/\r?\n/)) {
				// The parser drops a stray ". " bullet at the head of a paragraph,
				// so compare the line the same way.
				const line = collapse(raw).replace(/^\.\s+/, "");
				if (!line) continue;
				// Headings are allowed to be consumed into the unit label.
				if (HEADING_LINE.test(line)) continue;
				// Lists are split at their commas and semicolons, so compare the
				// words in order rather than the raw punctuation.
				if (!words(blob).includes(words(line))) {
					missing.push(
						`${row.branch}/${row.sem}/${row.subject.code}: ${JSON.stringify(line.slice(0, 100))}`,
					);
				}
			}
		}

		expect(missing).toEqual([]);
		expect(parsedSubjects).toBe(361);
		expect(units).toBeGreaterThan(1000);
		expect(topics).toBeGreaterThan(2000);
	});

	it("gives every subject with content at least one unit", () => {
		const empty = SUBJECTS.filter((row) => row.content.trim()).filter(
			(row) => parseSyllabusContent(row.content).length === 0,
		);
		expect(empty.map((row) => `${row.branch}/${row.sem}/${row.subject.code}`)).toEqual(
			[],
		);
	});

	it("keeps unit numbers and hours sane", () => {
		for (const row of SUBJECTS) {
			for (const unit of parseSyllabusContent(row.content)) {
				expect(Number.isInteger(unit.number)).toBe(true);
				expect(unit.number).toBeGreaterThanOrEqual(0);
				if (unit.hours !== null) {
					expect(Number.isInteger(unit.hours)).toBe(true);
					expect(unit.hours).toBeGreaterThan(0);
					expect(unit.hours).toBeLessThan(40);
				}
				if (unit.title !== null) {
					expect(unit.title).toBe(unit.title.trim());
					expect(unit.title.length).toBeGreaterThan(0);
				}
				for (const topic of unit.topics) {
					expect(topic.length).toBeGreaterThan(0);
					expect(topic).toBe(topic.trim());
				}
			}
		}
	});

	it("reports the parsed shape", () => {
		// The page keeps a practical subject's lines whole: one experiment is
		// one checkbox, so its comma lists are never cut into separate items.
		const parseRow = (row: (typeof SUBJECTS)[number]) =>
			parseSyllabusContent(row.content, {
				splitLists: row.subject.type !== "Practical",
			});
		const units = SUBJECTS.flatMap(parseRow);
		const headless = SUBJECTS.filter(
			(row) => row.content.trim() && parseRow(row).every((unit) => unit.number === 0),
		);
		const emptyContent = SUBJECTS.filter((row) => !row.content.trim());

		console.log(
			`subjects=${SUBJECTS.length} units=${units.length} topics=${topicTotal(units)} headless=${headless.length} empty=${emptyContent.length}`,
		);

		expect(units.length).toBe(1441);
		expect(topicTotal(units)).toBe(7730);
		expect(headless).toHaveLength(125);
		expect(emptyContent).toHaveLength(14);
	});
});
