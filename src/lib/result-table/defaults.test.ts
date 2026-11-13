import { describe, expect, test } from "vitest";

import { collegeOrder, pickOption, publishedSemester, tableDefaults } from "./defaults";

const params = (query = "") => new URLSearchParams(query);

describe("tableDefaults", () => {
	test("with no profile it opens the newest session and GEC Sheikhpura", () => {
		expect(tableDefaults(params(), null)).toEqual({
			session: "25",
			branch: "cse",
			semester: "1",
			college: "157",
		});
	});

	test("the saved number opens its own batch, branch and college", () => {
		expect(tableDefaults(params(), { batchYear: 2026, branchPath: "ece", collegeCode: "105" })).toEqual({
			session: "26",
			branch: "ece",
			semester: "1",
			college: "105",
		});
	});

	test("the 2024 batch lands on the newest table BEU published, not an empty one", () => {
		// The class is in semester 4; only semesters 1 and 2 have tables.
		expect(tableDefaults(params(), { batchYear: 2024 }).semester).toBe("2");
	});

	test("older batches land on their newest published table", () => {
		expect(tableDefaults(params(), { batchYear: 2023 }).semester).toBe("4");
		expect(tableDefaults(params(), { batchYear: 2022 }).semester).toBe("6");
		expect(tableDefaults(params(), { batchYear: 2025 }).semester).toBe("1");
	});

	test("a batch with no published ladder keeps its class semester", () => {
		expect(tableDefaults(params(), { batchYear: 2021 })).toMatchObject({
			session: "21",
			semester: "8",
		});
	});

	test("URL parameters win over the profile", () => {
		expect(tableDefaults(params("session=23&branch=ece&semester=3&college=105"), {
			batchYear: 2022,
			branchPath: "cse",
			collegeCode: "157",
		})).toEqual({
			session: "23",
			branch: "ece",
			semester: "3",
			college: "105",
		});
	});

	test("an empty parameter falls back to the profile", () => {
		expect(tableDefaults(params("session=&college="), {
			batchYear: 2024,
			branchPath: "cse",
			collegeCode: "157",
		})).toMatchObject({
			session: "24",
			college: "157",
		});
	});
});

describe("publishedSemester", () => {
	test("a published semester is kept", () => {
		expect(publishedSemester("24", "2")).toBe("2");
		expect(publishedSemester("23", "3")).toBe("3");
	});

	test("an unpublished one moves to the newest table", () => {
		expect(publishedSemester("25", "3")).toBe("1");
		expect(publishedSemester("24", "4")).toBe("2");
		expect(publishedSemester("22", "8")).toBe("6");
	});

	test("a session with no ladder is left alone", () => {
		expect(publishedSemester("21", "8")).toBe("8");
	});
});

describe("pickOption", () => {
	const values = ["19", "20", "21", "22", "23", "24", "25", "26"];

	test("a value the control offers is selected", () => {
		expect(pickOption(values, "24", "25")).toBe("24");
	});

	test("a value that is missing falls back", () => {
		expect(pickOption(values, "27", "25")).toBe("25");
		expect(pickOption([], "24", "25")).toBe("25");
	});

	test("a college with no table falls back to GEC Sheikhpura", () => {
		// 105 is a branch code, never a college in the manifest.
		expect(pickOption(["157", "107", "108"], "105", "157")).toBe("157");
	});
});

describe("collegeOrder", () => {
	const codes = ["157", "107", "108", "109", "102"];

	test("with no profile GEC Sheikhpura leads", () => {
		expect(collegeOrder(codes, "157")).toEqual(["157", "107", "108", "109", "102"]);
	});

	test("the student's college leads, then GEC Sheikhpura, then the rest", () => {
		expect(collegeOrder(codes, "108")).toEqual(["108", "157", "107", "109", "102"]);
	});

	test("an empty or unknown preference changes nothing", () => {
		expect(collegeOrder(codes, "")).toEqual(codes);
		expect(collegeOrder(codes, "105")).toEqual(codes);
	});

	test("every code survives exactly once", () => {
		const ordered = collegeOrder(codes, "108");
		expect(new Set(ordered).size).toBe(codes.length);
		expect([...ordered].sort()).toEqual([...codes].sort());
	});
});
