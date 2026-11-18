/**
 * Rank lookup over the pre-scraped semester CSVs.
 *
 * Every `students_{batch}_all_{branch}_sem{n}.csv` holds one branch across
 * every college, written by the scrapers in `pythonscripts/`. Ranking is by
 * CGPA — the rule `/rank` and `/result-table` already use — with ties sharing
 * a position, so the numbers here can never disagree with those pages.
 *
 * Rows whose CGPA is `N/A` are a student with no published result, not a
 * student in last place: they are dropped before ranking and out of the
 * denominator, otherwise 44% of the roster would pad every "of N".
 */

export type BranchInfo = { code: string; name: string; short: string };

export const BRANCHES: Record<string, BranchInfo> = {
	"101": { code: "civil", name: "Civil Engineering", short: "Civil" },
	"102": { code: "mech", name: "Mechanical Engineering", short: "Mech" },
	"103": { code: "ee", name: "Electrical Engineering", short: "EE" },
	"104": { code: "ece", name: "Electronics & Communication Engineering", short: "ECE" },
	"105": { code: "cse", name: "Computer Science & Engineering", short: "CSE" },
	"110": { code: "eee", name: "Electrical & Electronics Engineering", short: "EEE" },
	"161": { code: "eee", name: "Electrical & Electronics Engineering", short: "EEE" },
};

const BRANCH_CODES = Object.keys(BRANCHES);
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_FILE_LIMIT = 28;

export type StudentRow = {
	reg: string;
	name: string;
	sgpa: number | null;
	cgpa: number;
	branchCode: string;
	collegeCode: string;
	collegeName: string;
	overallRank?: number;
	branchRank?: number;
};

export type RankData = {
	reg: string;
	name: string;
	branchCode: string;
	branchName: string;
	branchShort: string;
	/** Slug the result table and merit list use: cse, ece, civil… */
	branchSlug: string;
	collegeCode: string;
	collegeName: string;
	semester: number;
	batch: string;
	cgpa: number;
	sgpa: number | null;
	branchRank: number;
	branchTotal: number;
	universityRank: number;
	universityTotal: number;
	/** Percentile band, 1 = best 1%. Never 0: a rank is at least the top 1%. */
	branchTopPercent: number;
};

export type RankResult =
	| { status: "ok"; data: RankData }
	| { status: "invalid" }
	| { status: "no_data" }
	| { status: "not_found" };

/** RFC-4180 lite: quotes, doubled quotes and commas inside them. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (char !== "\r") {
			field += char;
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	return rows;
}

const toNumber = (value: string | undefined): number | null => {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed || trimmed === "-" || trimmed === "N/A" || trimmed === "NULL") return null;
	const parsed = Number.parseFloat(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
};

/* One entry per file, so a burst of lookups for the same semester pays the
   parse once. Isolate memory is small, hence the file count cap and the lean
   row shape: only what ranking and the card actually read. */
const fileCache = new Map<string, { at: number; rows: StudentRow[] }>();

function readCache(key: string): StudentRow[] | null {
	const hit = fileCache.get(key);
	if (!hit) return null;
	if (Date.now() - hit.at > CACHE_TTL_MS) {
		fileCache.delete(key);
		return null;
	}
	return hit.rows;
}

function writeCache(key: string, rows: StudentRow[]) {
	if (fileCache.size >= CACHE_FILE_LIMIT) {
		// Map keeps insertion order: drop the oldest file, not the whole cache.
		const oldest = fileCache.keys().next().value;
		if (oldest !== undefined) fileCache.delete(oldest);
	}
	fileCache.set(key, { at: Date.now(), rows });
}

async function loadBranch(
	origin: string,
	batch: string,
	branchCode: string,
	semester: number,
): Promise<StudentRow[]> {
	const key = `${batch}_${branchCode}_${semester}`;
	const cached = readCache(key);
	if (cached) return cached;

	const url = `${origin}/data/students_${batch}_all_${branchCode}_sem${semester}.csv`;
	const response = await fetch(url).catch(() => null);
	if (!response?.ok) {
		writeCache(key, []);
		return [];
	}

	const table = parseCsv(await response.text());
	if (table.length < 2) {
		writeCache(key, []);
		return [];
	}

	const header = table[0].map((cell) => cell.trim());
	const regAt = header.indexOf("RegNo");
	const nameAt = header.indexOf("Name");
	const sgpaAt = header.indexOf("SGPA");
	const cgpaAt = header.indexOf("Cur. CGPA");
	const collegeAt = header.indexOf("CollegeCode");
	const collegeNameAt = header.indexOf("CollegeName");

	const rows: StudentRow[] = [];
	for (let i = 1; i < table.length; i++) {
		const row = table[i];
		if (!row || row.length < 4) continue;
		const reg = (row[regAt] || "").replace(/\D/g, "");
		const cgpa = toNumber(row[cgpaAt]);
		if (!reg || cgpa === null) continue;
		rows.push({
			reg,
			name: (row[nameAt] || "").replace(/\s+/g, " ").trim(),
			sgpa: toNumber(row[sgpaAt]),
			cgpa,
			branchCode,
			collegeCode: (row[collegeAt] || "").trim(),
			collegeName: (row[collegeNameAt] || "").trim(),
		});
	}

	writeCache(key, rows);
	return rows;
}

/** Competition ranking: equal CGPA keeps the earlier position. */
function assignRanks(students: StudentRow[], into: "overallRank" | "branchRank", pool?: string) {
	const group = pool ? students.filter((row) => row.branchCode === pool) : students;

	let rank = 0;
	for (let i = 0; i < group.length; i++) {
		if (i === 0 || Math.abs(group[i].cgpa - group[i - 1].cgpa) > 1e-9) {
			rank = i + 1;
		}
		group[i][into] = rank;
	}
}

export async function lookupRank(
	origin: string,
	regNo: string,
	semester: number,
): Promise<RankResult> {
	const digits = regNo.replace(/\D/g, "").slice(0, 11);
	if (digits.length < 8 || !Number.isInteger(semester) || semester < 1 || semester > 8) {
		return { status: "invalid" };
	}

	const batch = digits.slice(0, 2);

	const files = await Promise.all(
		BRANCH_CODES.map((code) => loadBranch(origin, batch, code, semester)),
	);

	const seen = new Set<string>();
	const students: StudentRow[] = [];
	for (const rows of files) {
		for (const row of rows) {
			if (seen.has(row.reg)) continue;
			seen.add(row.reg);
			students.push(row);
		}
	}

	if (students.length === 0) return { status: "no_data" };

	students.sort((a, b) => {
		if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa;
		const aSgpa = a.sgpa ?? -1;
		const bSgpa = b.sgpa ?? -1;
		if (bSgpa !== aSgpa) return bSgpa - aSgpa;
		return a.reg.localeCompare(b.reg);
	});

	assignRanks(students, "overallRank");
	for (const code of BRANCH_CODES) assignRanks(students, "branchRank", code);

	const student = students.find((row) => row.reg === digits);
	if (!student) return { status: "not_found" };

	const branch = BRANCHES[student.branchCode];
	const branchRank = student.branchRank ?? 0;
	const branchTotal = students.reduce(
		(total, row) => (row.branchCode === student.branchCode ? total + 1 : total),
		0,
	);

	return {
		status: "ok",
		data: {
			reg: student.reg,
			name: student.name,
			branchCode: student.branchCode,
			branchName: branch?.name ?? "Engineering",
			branchShort: branch?.short ?? "Branch",
			branchSlug: branch?.code ?? "cse",
			collegeCode: student.collegeCode,
			collegeName: student.collegeName,
			semester,
			batch,
			cgpa: student.cgpa,
			sgpa: student.sgpa,
			branchRank,
			branchTotal,
			universityRank: student.overallRank ?? 0,
			universityTotal: students.length,
			branchTopPercent:
				branchTotal > 0 ? Math.max(1, Math.round((branchRank / branchTotal) * 100)) : 0,
		},
	};
}
