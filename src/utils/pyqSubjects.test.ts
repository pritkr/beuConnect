import { describe, expect, it } from "vitest";
import { groupPyqPapersByRoute } from "./pyqSubjects";

type Paper = { id: string; data: { metadata: Record<string, any> } };

const paper = (id: string, metadata: Record<string, any>): Paper => ({
	id,
	data: { metadata },
});

const realPapers = Object.entries(
	import.meta.glob("../content/pyqs/**/*.json", { eager: true, import: "default" }) as Record<
		string,
		any
	>,
).map(([id, data]) => ({ id, data }));

const slugsOf = (routes: { slug: string }[]) => routes.map((route) => route.slug);

describe("groupPyqPapersByRoute", () => {
	it("emits every slug in the real corpus exactly once", () => {
		const slugs = slugsOf(groupPyqPapersByRoute(realPapers));
		const duplicates = [...new Set(slugs.filter((slug, index) => slugs.indexOf(slug) !== index))];

		expect(duplicates).toEqual([]);
	});

	it("keeps every real paper on its canonical route", () => {
		const routes = groupPyqPapersByRoute(realPapers);
		const canonicalPages = routes.filter((route) => route.slug === route.canonicalSubject.slug);
		const placed = canonicalPages.reduce((total, route) => total + route.papers.length, 0);

		expect(placed).toBe(realPapers.length);
	});

	it("reserves a canonical slug from another subject's alias", () => {
		const routes = groupPyqPapersByRoute([
			paper("canonical", { subject: "Engineering Physics", year: 2024 }),
			paper("stray", { subject: "Applied Physics", subject_slug: "engineering-physics", year: 2023 }),
		]);

		const canonicalRoute = routes.find((route) => route.slug === "engineering-physics");

		expect(canonicalRoute?.papers.map((entry) => entry.id)).toEqual(["canonical"]);
		expect(canonicalRoute?.canonicalSubject.slug).toBe("engineering-physics");
	});

	it("gives a shared alias to the first subject that asks for it", () => {
		const routes = groupPyqPapersByRoute([
			paper("a", { subject: "Strength of Materials", subject_slug: "som", year: 2024 }),
			paper("b", { subject: "Mechanics of Solids", subject_slug: "som", year: 2023 }),
		]);

		expect(routes.find((route) => route.slug === "som")?.papers.map((entry) => entry.id)).toEqual([
			"a",
		]);
		expect(
			routes.find((route) => route.slug === "mechanics-of-solids")?.papers.map((entry) => entry.id),
		).toEqual(["b"]);
	});

	it("folds spellings of one subject into a single page", () => {
		const routes = groupPyqPapersByRoute([
			paper("amp", { subject: "Computer Networks & Security", subject_slug: "cns", year: 2024 }),
			paper("and", { subject: "Computer Networks And Security", subject_slug: "cns", year: 2023 }),
		]);

		const page = routes.find((route) => route.slug === "computer-networks-and-security");

		expect(page?.papers.map((entry) => entry.id)).toEqual(["amp", "and"]);
		// The old `subject_slug` stays reachable, pointing at the same page.
		expect(routes.find((route) => route.slug === "cns")?.papers).toBe(page?.papers);
	});

	it("sorts papers newest first, then by subject code", () => {
		const routes = groupPyqPapersByRoute([
			paper("old", { subject: "Thermodynamics", subject_slug: "td", subject_code: "101", year: 2021 }),
			paper("new-b", {
				subject: "Thermodynamics",
				subject_slug: "td",
				subject_code: "202",
				year: 2023,
			}),
			paper("new-a", {
				subject: "Thermodynamics",
				subject_slug: "td",
				subject_code: "201",
				year: 2023,
			}),
		]);

		expect(routes[0].papers.map((entry) => entry.id)).toEqual(["new-a", "new-b", "old"]);
	});
});
