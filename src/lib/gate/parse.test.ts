import { describe, expect, it } from "vitest";
import {
	parseGateGroups,
	parseGateSections,
	readSectionTitle,
	splitGateTopics,
	unwrapGateContent,
} from "./parse";

type PaperFile = {
	code?: string;
	sections?: { title?: string; content?: string }[];
};

const PAPERS = Object.entries(
	import.meta.glob("../../assets/data/gate/*.json", {
		eager: true,
		import: "default",
	}) as Record<string, PaperFile>,
).map(([path, data]) => ({ name: path.split("/").pop() ?? path, data }));

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

const words = (value: string) =>
	collapse(value.toLowerCase())
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter(Boolean);

/** The words the parser is allowed to consume as structure, never as content. */
const STRUCTURAL = /^(?:etc|section|xe|xl|[a-z]|\d+)$/;

function parsedWords(groups: ReturnType<typeof parseGateGroups>) {
	return words(
		groups.flatMap((group) => [group.label ?? "", ...group.topics]).join(" "),
	);
}

describe("unwrapGateContent", () => {
	it("keeps a topic that a PDF wrap cut in half", () => {
		expect(
			unwrapGateContent(
				"Sets, relations, functions, partial orders and\nlattices. Monoids, Groups.",
			),
		).toBe(
			"Sets, relations, functions, partial orders and lattices. Monoids, Groups.",
		);
	});

	it("does not break a wrapped line just because it starts with a capital", () => {
		expect(
			unwrapGateContent(
				"Blackbody Radiation and Radiation\nBalance; Modes of Heat Transfer.",
			),
		).toBe(
			"Blackbody Radiation and Radiation Balance; Modes of Heat Transfer.",
		);
	});

	it("starts a new topic at a labelled line", () => {
		expect(
			unwrapGateContent(
				"Prey-predator interactions (Lotka-Voltera equation, etc.)\nCommunity Ecology: Community assembly; species richness.",
			),
		).toBe(
			"Prey-predator interactions (Lotka-Voltera equation, etc.). Community Ecology: Community assembly; species richness.",
		);
	});

	it("re-joins a hyphenated break instead of splitting the word", () => {
		expect(
			unwrapGateContent(
				"relationship between stress and strain-\nrate for fluids",
			),
		).toBe("relationship between stress and strain-rate for fluids");
	});

	it("reads a spaced dash as the list separator it is", () => {
		expect(
			unwrapGateContent("Flow measurements - Venturi meter, orifice meter."),
		).toBe("Flow measurements, Venturi meter, orifice meter.");
	});

	it("drops a bare section marker but keeps the heading under it", () => {
		expect(
			unwrapGateContent(
				"XL-Q Biochemistry\nSection 1\nOrganization of life; Importance of water.",
			),
		).toBe("XL-Q Biochemistry. Organization of life; Importance of water.");
	});
});

describe("splitGateTopics", () => {
	it("cuts a comma list into narrow topics", () => {
		expect(
			splitGateTopics(
				"Sets, relations, functions, partial orders and lattices",
			),
		).toEqual([
			"Sets",
			"Relations",
			"Functions",
			"Partial orders and lattices",
		]);
	});

	it("never splits inside brackets", () => {
		expect(
			splitGateTopics(
				"Number representations and computer arithmetic (fixed, floating point)",
			),
		).toEqual([
			"Number representations and computer arithmetic (fixed, floating point)",
		]);
	});

	it("drops the trailing etc. and the punctuation a list leaves behind", () => {
		expect(splitGateTopics("Boiling, condensation, etc.; ")).toEqual([
			"Boiling",
			"Condensation",
		]);
	});

	it("does not repeat a topic inside one sentence", () => {
		expect(splitGateTopics("Stacks, stacks, queues")).toEqual([
			"Stacks",
			"Queues",
		]);
	});

	it("capitalises a lower-case phrase but leaves a spelled abbreviation alone", () => {
		expect(splitGateTopics("recursion, pH values, mRNA")).toEqual([
			"Recursion",
			"pH values",
			"mRNA",
		]);
	});
});

describe("parseGateGroups", () => {
	it("groups the topics under the label that introduces them", () => {
		expect(
			parseGateGroups(
				[
					"Discrete Mathematics: Propositional logic. Sets, relations.",
					"Graphs: connectivity, matching.",
				].join("\n"),
			),
		).toEqual([
			{
				label: "Discrete Mathematics",
				topics: ["Propositional logic", "Sets", "Relations"],
			},
			{ label: "Graphs", topics: ["Connectivity", "Matching"] },
		]);
	});

	it("keeps a long sentence fragment as body text instead of a heading", () => {
		const groups = parseGateGroups(
			"Applications of common engineering materials to the design of machine elements: bearings.",
		);
		expect(groups).toEqual([
			{
				label: null,
				topics: [
					"Applications of common engineering materials to the design of machine elements: bearings",
				],
			},
		]);
	});

	it("reads a subject heading of the combined papers as a divider", () => {
		expect(
			parseGateGroups(
				"XE-B Fluid Mechanics\nFluid Properties: density, viscosity.",
			),
		).toEqual([
			{ label: "Fluid Mechanics", topics: [] },
			{ label: "Fluid Properties", topics: ["Density", "Viscosity"] },
		]);
	});

	it("returns nothing for a missing or empty paragraph", () => {
		expect(parseGateGroups("")).toEqual([]);
		expect(parseGateGroups(undefined)).toEqual([]);
		expect(parseGateGroups("   \n \n")).toEqual([]);
	});
});

describe("readSectionTitle", () => {
	it("separates the section number from its name", () => {
		expect(
			readSectionTitle("Section 3: Computer Organization and Architecture"),
		).toEqual({
			number: 3,
			title: "Computer Organization and Architecture",
		});
	});

	it("keeps a title that is not numbered", () => {
		expect(readSectionTitle("General Aptitude")).toEqual({
			number: null,
			title: "General Aptitude",
		});
	});
});

describe("parseGateSections over every paper", () => {
	const parsed = PAPERS.map((paper) => ({
		...paper,
		sections: parseGateSections(paper.data.sections),
	})).filter((paper) => paper.sections.length);

	it("covers every paper that ships an outline", () => {
		expect(parsed).toHaveLength(22);
	});

	it("gives every section at least one topic", () => {
		const empty = parsed.flatMap((paper) =>
			paper.sections
				.filter((section) => section.count === 0)
				.map((section) => `${paper.name}: ${section.title}`),
		);
		expect(empty).toEqual([]);
	});

	it("cut the outline into short topics rather than whole paragraphs", () => {
		const lengths = parsed
			.flatMap((paper) => paper.sections)
			.flatMap((section) => section.groups)
			.flatMap((group) => group.topics)
			.map((topic) => topic.split(/\s+/).length)
			.sort((a, b) => a - b);

		const share = (limit: number) =>
			lengths.filter((length) => length <= limit).length / lengths.length;

		expect(lengths.length).toBe(5746);
		expect(share(6)).toBeGreaterThan(0.9);
		expect(lengths[lengths.length - 1]).toBeLessThan(30);
	});

	it("never loses a word of the outline to the cut", () => {
		const lost: string[] = [];

		for (const paper of parsed) {
			const source = paper.data.sections ?? [];
			paper.sections.forEach((section, index) => {
				const kept = new Set(parsedWords(section.groups));
				for (const word of words(String(source[index]?.content ?? ""))) {
					if (!kept.has(word) && !STRUCTURAL.test(word)) {
						lost.push(`${paper.name}/${section.title}: ${word}`);
					}
				}
			});
		}

		expect(lost).toEqual([]);
	});

	it("keeps labels and topics tidy", () => {
		for (const paper of parsed) {
			for (const section of paper.sections) {
				expect(section.title).toBe(collapse(section.title));
				for (const group of section.groups) {
					if (group.label !== null) {
						expect(group.label).toBe(group.label.trim());
						expect(group.label.length).toBeLessThanOrEqual(60);
						expect(group.label.split(/\s+/).length).toBeLessThanOrEqual(6);
					}
					for (const topic of group.topics) {
						expect(topic).toBe(topic.trim());
						expect(topic.length).toBeGreaterThan(0);
						expect(topic).not.toMatch(/^[,;:.]/);
						expect(topic).not.toMatch(/[,;:.]$/);
						expect(topic).not.toMatch(/\s{2,}/);
					}
				}
			}
		}
	});
});
