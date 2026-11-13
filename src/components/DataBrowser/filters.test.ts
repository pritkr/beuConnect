import { describe, expect, test } from "vitest";

import { orderColleges, pickFirst } from "./filters";

const CODES = ["105", "157", "163", "101"];

describe("orderColleges", () => {
	test("GEC Sheikhpura leads when no college is saved", () => {
		expect(orderColleges(CODES, "")).toEqual(["157", "101", "105", "163"]);
	});

	test("the student's own college leads, then Sheikhpura", () => {
		expect(orderColleges(CODES, "163")).toEqual(["163", "157", "101", "105"]);
	});

	test("a saved Sheikhpura is listed once", () => {
		expect(orderColleges(CODES, "157")).toEqual(["157", "101", "105", "163"]);
	});

	test("a college the manifest does not carry is not invented", () => {
		expect(orderColleges(CODES, "999")).toEqual(["157", "101", "105", "163"]);
		expect(orderColleges(["105", "163"], "157")).toEqual(["105", "163"]);
		expect(orderColleges([], "157")).toEqual([]);
	});
});

describe("pickFirst", () => {
	test("a kept value wins over the profile's", () => {
		expect(pickFirst(["105", "157", "101"], ["101", "105", "157"])).toBe("105");
	});

	test("a value the list dropped falls through to the next candidate", () => {
		expect(pickFirst(["999", "157", "101"], ["101", "157"])).toBe("157");
	});

	test("nothing available is undefined, never a guess", () => {
		expect(pickFirst(["", undefined, "999"], ["101"])).toBeUndefined();
	});

	test("numbers work too, so a semester can be picked the same way", () => {
		expect(pickFirst([Number.NaN, 4, 2], [2, 4])).toBe(4);
		expect(pickFirst([Number.NaN], [1, 2])).toBeUndefined();
	});
});
