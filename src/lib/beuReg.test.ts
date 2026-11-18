import { describe, expect, it } from "vitest";
import { inferCurrentSemester } from "./beuReg";

const autumn = new Date("2026-10-28T00:00:00Z");
const spring = new Date("2026-03-01T00:00:00Z");

describe("inferCurrentSemester", () => {
	it("puts the 2024 batch in semester 4 this autumn, because its session started in January", () => {
		expect(inferCurrentSemester(2024, autumn)).toBe(4);
	});

	it("keeps the 2024 batch in semester 3 last spring", () => {
		expect(inferCurrentSemester(2024, spring)).toBe(3);
	});

	it("puts a July-started batch in semester 1 in its first autumn", () => {
		expect(inferCurrentSemester(2026, autumn)).toBe(1);
	});

	it("advances every other batch on the July cycle", () => {
		expect(inferCurrentSemester(2023, autumn)).toBe(7);
		expect(inferCurrentSemester(2025, autumn)).toBe(3);
	});

	it("never leaves the 1-8 range", () => {
		expect(inferCurrentSemester(2020, autumn)).toBe(8);
		expect(inferCurrentSemester(2027, autumn)).toBe(1);
		expect(inferCurrentSemester(Number.NaN, autumn)).toBe(1);
	});
});
