export type NormalizedStudent = {
	RegNo: string;
	Name: string;
	CollegeCode: string;
	CollegeName: string;
	SGPAValue: number | null;
	CGPAValue: number | null;
	SGPAText: string;
	CGPAText: string;
	Rank: number | null;
	CollegeRank: number | null;
};

export function parseCSV(text: string): Array<Record<string, string>> {
	if (text.indexOf('"') === -1) {
		const lines = text.split(/\r?\n/);
		if (lines.length === 0) return [];

		const headers = lines[0].split(',').map((h) => h.trim());
		const result: Array<Record<string, string>> = [];
		const headersLen = headers.length;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;

			const values = line.split(',');
			const item: Record<string, string> = {};
			for (let j = 0; j < headersLen; j++) {
				item[headers[j]] = (values[j] || "").trim();
			}
			result.push(item);
		}
		return result;
	}

	const rows: string[][] = [];
	let currentRow: string[] = [];
	let start = 0;
	let insideQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '"') {
			insideQuotes = !insideQuotes;
		} else if (char === "," && !insideQuotes) {
			let val = text.substring(start, i);
			if (val.startsWith('"') && val.endsWith('"')) {
				val = val.substring(1, val.length - 1).replace(/""/g, '"');
			}
			currentRow.push(val);
			start = i + 1;
		} else if ((char === "\n" || char === "\r") && !insideQuotes) {
			let val = text.substring(start, i);
			if (val.startsWith('"') && val.endsWith('"')) {
				val = val.substring(1, val.length - 1).replace(/""/g, '"');
			}
			currentRow.push(val);
			if (currentRow.length > 1 || currentRow[0] !== "") {
				rows.push(currentRow);
			}
			currentRow = [];
			if (char === "\r" && text[i + 1] === "\n") {
				i++;
			}
			start = i + 1;
		}
	}

	if (start < text.length) {
		let val = text.substring(start);
		if (val.startsWith('"') && val.endsWith('"')) {
			val = val.substring(1, val.length - 1).replace(/""/g, '"');
		}
		currentRow.push(val);
		rows.push(currentRow);
	}

	if (rows.length === 0) return [];

	const headers = rows[0].map((head) => head.trim());
	return rows.slice(1).map((row) => {
		const item: Record<string, string> = {};
		headers.forEach((header, index) => {
			item[header] = (row[index] || "").trim();
		});
		return item;
	});
}

export function parseScore(rawValue: string): number | null {
	if (!rawValue) return null;
	const normalized = rawValue.replace(/[^0-9.\-]/g, "");
	if (!normalized) return null;
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

export function isLateralRegNo(regNo: string): boolean {
	const numeric = regNo.replace(/\D/g, "");
	if (numeric.length < 3) return false;
	const serialCode = Number.parseInt(numeric.slice(-3), 10);
	return Number.isFinite(serialCode) && serialCode >= 900;
}

export function normalizeRows(
	rows: Array<Record<string, string>>,
	collegeCode: string,
	collegeName: string,
	collegeNameMap?: Map<string, string>
): NormalizedStudent[] {
	if (rows.length === 0) return [];

	const firstRow = rows[0];
	const getActualKey = (keys: string[]): string | undefined => {
		for (const key of keys) {
			if (firstRow[key] !== undefined) return key;
			const lower = key.toLowerCase();
			const found = Object.keys(firstRow).find((candidate) => candidate.toLowerCase() === lower);
			if (found) return found;
		}
		return undefined;
	};

	const regNoKey = getActualKey(["RegNo", "RegistrationNo", "Registration No", "Reg No"]);
	const nameKey = getActualKey(["Name", "StudentName", "Student Name"]);
	const sgpaKey = getActualKey(["SGPA", "Sgpa"]);
	const cgpaKey = getActualKey(["Cur. CGPA", "Cur.CGPA", "Current CGPA", "CGPA"]);
	const collegeCodeKey = getActualKey(["CollegeCode", "College Code"]);
	const collegeNameKey = getActualKey(["CollegeName", "College Name"]);

	return rows
		.map((row) => {
			const regNo = regNoKey && row[regNoKey] ? row[regNoKey].trim() : "";
			const name = nameKey && row[nameKey] ? row[nameKey].trim() : "";
			if (!regNo || !name) return null;

			const sgpaText = sgpaKey && row[sgpaKey] ? row[sgpaKey].trim() : "";
			const cgpaText = cgpaKey && row[cgpaKey] ? row[cgpaKey].trim() : "";
			const mergedCollegeCode = collegeCodeKey && row[collegeCodeKey] ? row[collegeCodeKey].trim() : "";
			const mergedCollegeName = collegeNameKey && row[collegeNameKey] ? row[collegeNameKey].trim() : "";
			const resolvedCollegeCode = mergedCollegeCode || collegeCode;
			const resolvedCollegeName =
				mergedCollegeName
				|| collegeName
				|| (collegeNameMap ? collegeNameMap.get(resolvedCollegeCode) : null)
				|| resolvedCollegeCode;

			return {
				RegNo: regNo,
				Name: name,
				CollegeCode: resolvedCollegeCode,
				CollegeName: resolvedCollegeName,
				SGPAValue: parseScore(sgpaText),
				CGPAValue: parseScore(cgpaText),
				SGPAText: sgpaText || "N/A",
				CGPAText: cgpaText || "N/A",
				Rank: null,
				CollegeRank: null,
			} satisfies NormalizedStudent;
		})
		.filter((row): row is NormalizedStudent => Boolean(row));
}

export function sortRowsByCgpa(rows: NormalizedStudent[]): NormalizedStudent[] {
	return [...rows].sort((a, b) => {
		if (a.CGPAValue === null && b.CGPAValue === null) return a.RegNo.localeCompare(b.RegNo);
		if (a.CGPAValue === null) return 1;
		if (b.CGPAValue === null) return -1;
		if (b.CGPAValue !== a.CGPAValue) return b.CGPAValue - a.CGPAValue;
		if (a.SGPAValue === null && b.SGPAValue === null) return a.RegNo.localeCompare(b.RegNo);
		if (a.SGPAValue === null) return 1;
		if (b.SGPAValue === null) return -1;
		if (b.SGPAValue !== a.SGPAValue) return b.SGPAValue - a.SGPAValue;
		return a.RegNo.localeCompare(b.RegNo);
	});
}

export function assignCgpaRanks(rows: NormalizedStudent[]) {
	let currentRank = 0;
	let rankableCount = 0;
	let previousScore: number | null = null;

	for (const row of rows) {
		if (row.CGPAValue === null) {
			row.Rank = null;
			continue;
		}

		rankableCount += 1;
		if (previousScore === null || Math.abs(row.CGPAValue - previousScore) > 1e-9) {
			currentRank = rankableCount;
			previousScore = row.CGPAValue;
		}
		row.Rank = currentRank;
	}
}

export function assignCollegeRanks(rows: NormalizedStudent[]) {
	const grouped = new Map<string, NormalizedStudent[]>();
	for (const row of rows) {
		const bucket = grouped.get(row.CollegeCode) || [];
		bucket.push(row);
		grouped.set(row.CollegeCode, bucket);
	}

	for (const collegeRows of grouped.values()) {
		let currentRank = 0;
		let rankableCount = 0;
		let previousScore: number | null = null;

		for (const row of collegeRows) {
			if (row.CGPAValue === null) {
				row.CollegeRank = null;
				continue;
			}

			rankableCount += 1;
			if (previousScore === null || Math.abs(row.CGPAValue - previousScore) > 1e-9) {
				currentRank = rankableCount;
				previousScore = row.CGPAValue;
			}
			row.CollegeRank = currentRank;
		}
	}
}
