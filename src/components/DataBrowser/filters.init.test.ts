import { beforeEach, describe, expect, test } from "vitest";

import { initFilters, type AppState } from "./filters";

/**
 * Only the dialect of the DOM `initFilters` speaks: four selects that hold
 * options, pick the first when the list is replaced, and refuse a value the
 * list does not carry. No jsdom, no browser.
 */
class FakeSelect {
	options: Array<{ value: string }> = [];
	disabled = true;
	private current = "";
	private listeners: Record<string, Array<() => void>> = {};

	get value(): string {
		return this.current;
	}
	set value(next: string) {
		this.current = this.options.some((option) => option.value === next) ? next : "";
	}

	set innerHTML(html: string) {
		this.options = Array.from(
			html.matchAll(/<option value="([^"]*)"/g),
			(match) => ({ value: match[1] ?? "" }),
		);
		this.current = this.options[0]?.value ?? "";
	}
	get innerHTML(): string {
		return this.options.map((option) => `<option value="${option.value}">`).join("");
	}

	addEventListener(type: string, listener: () => void) {
		(this.listeners[type] ||= []).push(listener);
	}

	fire(type: string) {
		for (const listener of this.listeners[type] || []) listener();
	}

	values(): string[] {
		return this.options.map((option) => option.value);
	}
}

const MANIFEST = {
	"24": {
		"104": ["24/104/sem1_157.json"],
		"105": ["24/105/sem1_157.json", "24/105/sem2_157.json", "24/105/sem2_105.json"],
	},
	"23": {
		"105": ["23/105/sem1_157.json", "23/105/sem3_157.json", "23/105/sem3_105.json"],
	},
};

const COLLEGES = [
	{ CollegeCode: "157", Name: "GEC Sheikhpura" },
	{ CollegeCode: "105", Name: "BIT Gaya" },
];

let selects: Record<string, FakeSelect>;

function installDom() {
	selects = {
		dbBatch: new FakeSelect(),
		dbBranch: new FakeSelect(),
		dbSemester: new FakeSelect(),
		dbCollege: new FakeSelect(),
		dbFilterForm: new FakeSelect(),
	};
	(globalThis as unknown as { document: unknown }).document = {
		getElementById: (id: string) => selects[id] ?? null,
	};
}

function installProfile(profile: object | null) {
	(globalThis as unknown as { window: unknown }).window = {};
	(globalThis as unknown as { localStorage: unknown }).localStorage = {
		getItem: (key: string) =>
			key === "beu_profile" && profile ? JSON.stringify(profile) : null,
	};
}

const PROFILE_2024 = {
	regNo: "24105157098",
	collegeCode: "105",
	branchCode: "105",
	branchPath: "cse",
	batchYear: 2024,
	currentSem: 2,
};

let submitted: AppState[] = [];

beforeEach(() => {
	installDom();
	installProfile(null);
	submitted = [];
	(globalThis as unknown as { fetch: unknown }).fetch = async (url: unknown) => ({
		json: async () => (String(url).includes("manifest") ? MANIFEST : COLLEGES),
	});
});

describe("initFilters", () => {
	test("without a profile it opens GEC Sheikhpura on the newest published table", async () => {
		await initFilters((state) => submitted.push(state));

		expect(selects.dbBatch.value).toBe("24");
		expect(selects.dbBranch.value).toBe("104");
		expect(selects.dbSemester.value).toBe("1");
		expect(selects.dbCollege.value).toBe("157");
		expect(submitted.at(-1)).toEqual({
			batch: "24",
			branch: "104",
			semester: "1",
			college: "157",
			isAllColleges: false,
		});
	});

	test("a saved number opens its own batch, branch, semester and college", async () => {
		installProfile(PROFILE_2024);

		await initFilters((state) => submitted.push(state));

		expect(submitted.at(-1)).toEqual({
			batch: "24",
			branch: "105",
			semester: "2",
			college: "105",
			isAllColleges: false,
		});
	});

	test("the college list leads with the student's college, then Sheikhpura, then A–Z", async () => {
		installProfile(PROFILE_2024);

		await initFilters(() => {});

		expect(selects.dbCollege.values()).toEqual(["105", "157", "all"]);
	});

	test("a saved college the manifest does not carry still falls back to Sheikhpura", async () => {
		installProfile({ ...PROFILE_2024, collegeCode: "999" });

		await initFilters(() => {});

		expect(selects.dbCollege.values()).toEqual(["157", "105", "all"]);
		expect(selects.dbCollege.value).toBe("157");
	});

	test("choosing a different batch re-derives the tables and keeps a college that still exists", async () => {
		installProfile(PROFILE_2024);
		await initFilters(() => {});

		selects.dbBatch.value = "23";
		selects.dbBatch.fire("change");

		expect(selects.dbBranch.value).toBe("105");
		expect(selects.dbSemester.value).toBe("3");
		expect(selects.dbCollege.value).toBe("105");
	});

	test("All colleges stays last, and picking it asks for the combined view", async () => {
		await initFilters((state) => submitted.push(state));

		expect(selects.dbCollege.values().at(-1)).toBe("all");

		selects.dbCollege.value = "all";
		selects.dbCollege.fire("change");

		expect(submitted.at(-1)?.isAllColleges).toBe(true);
		expect(submitted.at(-1)?.college).toBe("all");
	});
});
