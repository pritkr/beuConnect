import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) continue;
		const key = token.slice(2);
		const next = argv[index + 1];
		if (!next || next.startsWith("--")) {
			args[key] = "true";
			continue;
		}
		args[key] = next;
		index += 1;
	}
	return args;
}

function csvEscape(value) {
	const stringValue = String(value ?? "");
	return /[",\n\r]/.test(stringValue)
		? `"${stringValue.replaceAll('"', '""')}"`
		: stringValue;
}

function parseCsv(text) {
	const rows = [];
	let currentRow = [];
	let currentValue = "";
	let insideQuotes = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const nextChar = text[index + 1];

		if (char === '"') {
			if (insideQuotes && nextChar === '"') {
				currentValue += '"';
				index += 1;
			} else {
				insideQuotes = !insideQuotes;
			}
		} else if (char === "," && !insideQuotes) {
			currentRow.push(currentValue);
			currentValue = "";
		} else if ((char === "\n" || char === "\r") && !insideQuotes) {
			if (char === "\r" && nextChar === "\n") continue;
			if (currentRow.length > 0 || currentValue) {
				currentRow.push(currentValue);
				rows.push(currentRow);
			}
			currentRow = [];
			currentValue = "";
		} else {
			currentValue += char;
		}
	}

	if (currentRow.length > 0 || currentValue) {
		currentRow.push(currentValue);
		rows.push(currentRow);
	}

	if (rows.length === 0) return [];

	const headers = rows[0].map((value) => value.trim());
	return rows.slice(1).map((row) => {
		const entry = {};
		headers.forEach((header, index) => {
			entry[header] = (row[index] || "").trim();
		});
		return entry;
	});
}

function stringifyCsv(rows) {
	const headers = ["Session", "RegNo", "Name", "SGPA", "Cur. CGPA"];
	return [
		headers.join(","),
		...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
	].join("\n");
}

function normalizeDigits(value) {
	return String(value ?? "").replace(/\D/g, "");
}

function normalizeCode(value) {
	return String(value ?? "").trim();
}

function normalizeName(value) {
	return String(value ?? "")
		.trim()
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function parseFilename(filename) {
	const match = filename.match(/^students_(\d+)_(\d+)_(\d+)_sem(\d+)\.csv$/);
	if (!match) throw new Error(`Invalid data filename: ${filename}`);
	const [, session, college, branch, semester] = match;
	return { session, college, branch, semester: Number.parseInt(semester, 10) };
}

function hasNA(row) {
	return ["Name", "SGPA", "Cur. CGPA"].some(
		(key) => String(row[key] || "").trim().toUpperCase() === "N/A",
	);
}

function getSemesterSgpa(data, semester) {
	const values = Array.isArray(data?.sgpa) ? data.sgpa : [];
	const direct = values[semester - 1];
	if (direct && direct !== "-") return String(direct);
	const fallback = values.findLast((value) => value && value !== "-");
	return fallback ? String(fallback) : "N/A";
}

function matchesTargetResult(data, { regNo, college, branch }) {
	return (
		normalizeDigits(data?.redg_no) === normalizeDigits(regNo)
		&& normalizeCode(data?.college_code) === normalizeCode(college)
		&& normalizeCode(data?.course_code) === normalizeCode(branch)
	);
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchResult({ apiBase, regNo, semester, retries }) {
	const target = new URL(apiBase);
	target.searchParams.set("reg", regNo);
	target.searchParams.set("sem", String(semester));
	target.searchParams.set("format", "json");
	target.searchParams.set("scan", "true");

	for (let attempt = 1; attempt <= retries; attempt += 1) {
		try {
			const response = await fetch(target, { headers: { accept: "application/json" } });
			const text = await response.text();
			let payload = null;

			try {
				payload = text ? JSON.parse(text) : null;
			} catch {
				if (attempt === retries) {
					return {
						kind: "error",
						reason: response.ok
							? "Received a non-JSON API response"
							: `API returned HTTP ${response.status}`,
					};
				}
				await sleep(250 * attempt);
				continue;
			}

			if (response.ok && payload?.status === 200 && payload?.data) {
				return { kind: "success", data: payload.data };
			}

			if (payload?.status === 404 || payload?.htmlFallback) {
				return { kind: "missing", reason: payload?.message || "Record not found." };
			}

			if (!response.ok && response.status >= 500) {
				if (attempt === retries) {
					return {
						kind: "error",
						reason: payload?.message || `API returned HTTP ${response.status}`,
					};
				}
				await sleep(250 * attempt);
				continue;
			}

			if (attempt === retries) {
				return {
					kind: "error",
					reason: payload?.message || `Unexpected API response (${response.status})`,
				};
			}
		} catch (error) {
			if (attempt === retries) {
				return {
					kind: "error",
					reason: error instanceof Error ? error.message : "Unknown fetch error",
				};
			}
		}

		await sleep(250 * attempt);
	}

	return { kind: "error", reason: "Unknown failure" };
}

async function mapLimit(items, limit, mapper) {
	const results = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (true) {
			const current = cursor;
			cursor += 1;
			if (current >= items.length) return;
			results[current] = await mapper(items[current], current);
		}
	}

	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

const args = parseArgs(process.argv.slice(2));
const apiBase = args["api-base"] || "http://127.0.0.1:4333/api/result";
const session = args.session || "24";
const semester = Number.parseInt(args.semester || "2", 10);
const fileConcurrency = Number.parseInt(args["file-concurrency"] || "4", 10);
const rowConcurrency = Number.parseInt(args.concurrency || "8", 10);
const retries = Number.parseInt(args.retries || "4", 10);
const dataDir = join(process.cwd(), "public", "data");

const allFiles = (await readdir(dataDir))
	.filter((name) => new RegExp(`^students_${session}_(\\d+)_(\\d+)_sem${semester}\\.csv$`).test(name))
	.sort();

let totalFilesTouched = 0;
let totalRetried = 0;
let totalRecovered = 0;
let totalMissing = 0;
let totalErrors = 0;
let totalMismatches = 0;

console.log(
	`Refetching only N/A rows in ${allFiles.length} semester ${semester} files with file concurrency ${fileConcurrency} and row concurrency ${rowConcurrency}`,
);

await mapLimit(allFiles, fileConcurrency, async (filename) => {
	const filePath = join(dataDir, filename);
	const rows = parseCsv(await readFile(filePath, "utf8"));
	const pendingIndexes = rows
		.map((row, index) => (hasNA(row) ? index : -1))
		.filter((index) => index >= 0);

	if (pendingIndexes.length === 0) return;

	totalFilesTouched += 1;
	const { college, branch, semester: fileSemester } = parseFilename(filename);
	console.log(`${filename}: retrying ${pendingIndexes.length} N/A rows`);

	const updates = await mapLimit(pendingIndexes, rowConcurrency, async (rowIndex, index) => {
		const row = rows[rowIndex];
		const regNo = String(row.RegNo || "").trim();
		const result = await fetchResult({ apiBase, regNo, semester: fileSemester, retries });
		const position = index + 1;

		if (position % 10 === 0 || position === pendingIndexes.length) {
			console.log(`  ${filename}: ${position}/${pendingIndexes.length}`);
		}

		if (result.kind === "missing") {
			return { rowIndex, kind: "missing" };
		}

		if (result.kind !== "success") {
			return { rowIndex, kind: "error", reason: result.reason };
		}

		if (!matchesTargetResult(result.data, { regNo, college, branch })) {
			return { rowIndex, kind: "mismatch" };
		}

		return {
			rowIndex,
			kind: "success",
			row: {
				...row,
				Name: normalizeName(result.data.name) || String(row.Name || "").trim().toUpperCase(),
				SGPA: getSemesterSgpa(result.data, fileSemester),
				"Cur. CGPA": String(result.data.cgpa || "N/A").trim() || "N/A",
			},
		};
	});

	let recovered = 0;
	let missing = 0;
	let errors = 0;
	let mismatches = 0;

	for (const update of updates) {
		totalRetried += 1;
		if (update.kind === "success") {
			rows[update.rowIndex] = update.row;
			recovered += 1;
			totalRecovered += 1;
			continue;
		}
		if (update.kind === "missing") {
			missing += 1;
			totalMissing += 1;
			continue;
		}
		if (update.kind === "mismatch") {
			mismatches += 1;
			totalMismatches += 1;
			continue;
		}
		errors += 1;
		totalErrors += 1;
	}

	await writeFile(filePath, `${stringifyCsv(rows)}\n`, "utf8");
	console.log(
		`${filename}: recovered ${recovered}/${pendingIndexes.length} (${missing} missing, ${mismatches} mismatches, ${errors} errors)`,
	);
});

console.log(
	`Done. Files touched: ${totalFilesTouched}, retried: ${totalRetried}, recovered: ${totalRecovered}, missing: ${totalMissing}, mismatches: ${totalMismatches}, errors: ${totalErrors}`,
);
