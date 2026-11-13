import { describe, expect, test } from "vitest";

import { inferCurrentSemester } from "./beuReg";

/** October 2026 — the middle of the odd semester that began in July. */
const OCTOBER_2026 = new Date(2026, 9, 29);

describe("inferCurrentSemester", () => {
	test("counts sessions from the batch's own first semester", () => {
		expect(inferCurrentSemester(2026, OCTOBER_2026)).toBe(1);
		expect(inferCurrentSemester(2025, OCTOBER_2026)).toBe(3);
		expect(inferCurrentSemester(2023, OCTOBER_2026)).toBe(7);
	});

	test("the 2024 batch started in January 2025, a session late", () => {
		expect(inferCurrentSemester(2024, OCTOBER_2026)).toBe(4);
		expect(inferCurrentSemester(2024, new Date(2025, 0, 15))).toBe(1);
		expect(inferCurrentSemester(2024, new Date(2025, 11, 20))).toBe(2);
	});

	test("never runs past semester 8 or below 1", () => {
		expect(inferCurrentSemester(2019, OCTOBER_2026)).toBe(8);
		expect(inferCurrentSemester(2030, OCTOBER_2026)).toBe(1);
		expect(inferCurrentSemester(Number.NaN, OCTOBER_2026)).toBe(1);
	});
});
