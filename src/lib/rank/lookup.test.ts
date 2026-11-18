import { describe, expect, it } from "vitest";
import { parseCsv } from "./lookup";

describe("parseCsv", () => {
	it("keeps a quoted comma inside one field", () => {
		const rows = parseCsv(
			'Name,CollegeName\nKUMAR ADITYANATH,"Government Engineering College, Sheikhpura"\n',
		);
		expect(rows).toEqual([
			["Name", "CollegeName"],
			["KUMAR ADITYANATH", "Government Engineering College, Sheikhpura"],
		]);
	});

	it("reads a doubled quote as one quote", () => {
		expect(parseCsv('a,"say ""hi""",c\n')[0]).toEqual(["a", 'say "hi"', "c"]);
	});

	it("does not choke on CRLF, blank cells or a missing trailing newline", () => {
		expect(parseCsv("a,b\r\n1,,3\r\n4,5,6")).toEqual([
			["a", "b"],
			["1", "", "3"],
			["4", "5", "6"],
		]);
	});
});
