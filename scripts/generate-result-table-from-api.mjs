import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SEM_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) continue;
		const key = token.slice(2);
		const nextToken = argv[index + 1];
		if (!nextToken || nextToken.startsWith("--")) {
			args[key] = "true";
			continue;
		}
		args[key] = nextToken;
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

function formatSessionLabel(session) {
	const numericSession = Number.parseInt(session, 10);
	const startYear = 2000 + numericSession;
	return `${startYear}-${startYear + 4}`;
}

function getRomanIndex(value) {
	const normalized = String(value || "").trim().toUpperCase();
	const index = SEM_ROMAN.indexOf(normalized);
	return index >= 0 ? index : null;
}

function getSemesterSgpa(data, semester) {
	const sgpaValues = Array.isArray(data?.sgpa) ? data.sgpa : [];
	const directValue = sgpaValues[semester - 1];
	if (directValue && directValue !== "-") return String(directValue);

	const semesterIndex = getRomanIndex(data?.semester);
	if (semesterIndex !== null) {
		const derivedValue = sgpaValues[semesterIndex];
		if (derivedValue && derivedValue !== "-") return String(derivedValue);
	}

	const fallbackValue = [...sgpaValues].reverse().find((value) => value && value !== "-");
	return fallbackValue ? String(fallbackValue) : "N/A";
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchResult({ apiBase, semester, regNo, retries }) {
	const requestUrl = new URL(apiBase);
	requestUrl.searchParams.set("reg", regNo);
	requestUrl.searchParams.set("sem", String(semester));
	requestUrl.searchParams.set("format", "json");

	for (let attempt = 1; attempt <= retries; attempt += 1) {
		try {
			const response = await fetch(requestUrl, {
				headers: { accept: "application/json" },
			});
			const rawText = await response.text();
			let payload = null;

			try {
				payload = rawText ? JSON.parse(rawText) : null;
			} catch {
				if (attempt === retries) {
					return {
						kind: "error",
						reason: response.ok
							? "Received a non-JSON API response"
							: `Upstream returned HTTP ${response.status}`,
					};
				}
				await sleep(250 * attempt);
				continue;
			}

			if (!response.ok && response.status >= 500) {
				if (attempt === retries) {
					return {
						kind: "error",
						reason: payload?.message || `Upstream returned HTTP ${response.status}`,
					};
				}
				await sleep(250 * attempt);
				continue;
			}

			if (response.ok && payload?.status === 200 && payload?.data) {
				return { kind: "success", data: payload.data };
			}

			if (payload?.status === 404) {
				return { kind: "missing", reason: payload?.message || "Record not found." };
			}

			if (payload?.htmlFallback) {
				return { kind: "missing", reason: payload?.message || "HTML fallback only." };
			}

			if (attempt === retries) {
				return {
					kind: "error",
					reason: payload?.message || `Unexpected API response (${response.status}).`,
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
	let nextIndex = 0;

	async function worker() {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) return;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}

	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

const args = parseArgs(process.argv.slice(2));
const session = args.session || "24";
const semester = Number.parseInt(args.semester || "2", 10);
const sourceSemester = Number.parseInt(args["source-semester"] || String(Math.max(1, semester - 1)), 10);
const concurrency = Number.parseInt(args.concurrency || "8", 10);
const retries = Number.parseInt(args.retries || "3", 10);
const apiBase = args["api-base"] || process.env.RESULT_API_BASE || "http://127.0.0.1:4333/api/result";
const overwrite = args.overwrite === "true";
const collegeCode = args.college || "[a-zA-Z0-9]+";

if (!Number.isFinite(semester) || semester < 1 || semester > 8) {
	throw new Error(`Invalid --semester value: ${args.semester || ""}`);
}

if (!Number.isFinite(sourceSemester) || sourceSemester < 1 || sourceSemester > 8) {
	throw new Error(`Invalid --source-semester value: ${args["source-semester"] || ""}`);
}

const dataDir = join(process.cwd(), "public", "data");
await mkdir(dataDir, { recursive: true });
const filenamePattern = new RegExp(`^students_${session}_(${collegeCode})_(\\d+)_sem${sourceSemester}\\.csv$`);
const allFilenames = await readdir(dataDir);
const sourceFilenames = allFilenames.filter((name) => filenamePattern.test(name)).sort();

if (sourceFilenames.length === 0) {
	throw new Error(`No source files found for session ${session} semester ${sourceSemester} in ${dataDir}`);
}

console.log(`Generating semester ${semester} result-table data from ${sourceFilenames.length} source files using ${apiBase}`);

let totalFetched = 0;
let totalMissing = 0;
let totalUnavailable = 0;

for (const sourceFilename of sourceFilenames) {
	const sourceFilePath = join(dataDir, sourceFilename);
	const outputFilename = sourceFilename.replace(`_sem${sourceSemester}.csv`, `_sem${semester}.csv`);
	const outputFilePath = join(dataDir, outputFilename);
	const sourceRows = parseCsv(await readFile(sourceFilePath, "utf8"));

	let existingRows = [];
	if (!overwrite && existsSync(outputFilePath)) {
		existingRows = parseCsv(await readFile(outputFilePath, "utf8"));
	}
	const existingByReg = new Map(existingRows.map((row) => [String(row.RegNo || "").trim(), row]));
	const pendingRows = sourceRows.filter((row) => !existingByReg.has(String(row.RegNo || "").trim()));

	if (pendingRows.length === 0 && existingRows.length > 0) {
		console.log(`Skipping ${outputFilename} (already complete)`);
		continue;
	}

	console.log(`Processing ${outputFilename} (${pendingRows.length}/${sourceRows.length} pending)`);
	const fetchedRows = await mapLimit(pendingRows, concurrency, async (row, index) => {
		const regNo = String(row.RegNo || "").trim();
		const fallbackName = String(row.Name || "").trim().toUpperCase();
		const result = await fetchResult({ apiBase, semester, regNo, retries });
		const position = index + 1;

		if (result.kind === "success") {
			totalFetched += 1;
			if (position % 20 === 0 || position === pendingRows.length) {
				console.log(`  ${outputFilename}: ${position}/${pendingRows.length}`);
			}
			return {
				Session: formatSessionLabel(session),
				RegNo: regNo,
				Name: String(result.data.name || fallbackName).trim().toUpperCase(),
				SGPA: getSemesterSgpa(result.data, semester),
				"Cur. CGPA": String(result.data.cgpa || "N/A").trim() || "N/A",
			};
		}

		if (result.kind === "missing") {
			totalMissing += 1;
			console.warn(`  Missing result for ${regNo}: ${result.reason}`);
			return {
				Session: formatSessionLabel(session),
				RegNo: regNo,
				Name: fallbackName,
				SGPA: "N/A",
				"Cur. CGPA": "N/A",
			};
		}

		totalUnavailable += 1;
		console.warn(`  Unavailable result for ${regNo}: ${result.reason}. Writing N/A row.`);
		return {
			Session: formatSessionLabel(session),
			RegNo: regNo,
			Name: fallbackName,
			SGPA: "N/A",
			"Cur. CGPA": "N/A",
		};
	});

	const mergedRows = [
		...existingRows,
		...fetchedRows.filter(Boolean),
	].sort((left, right) => String(left.RegNo || "").localeCompare(String(right.RegNo || "")));

	await writeFile(outputFilePath, `${stringifyCsv(mergedRows)}\n`, "utf8");
	console.log(`Wrote ${mergedRows.length} rows -> ${outputFilename}`);
	await sleep(100);
}

console.log(`Done. Success: ${totalFetched}, missing: ${totalMissing}, unavailable: ${totalUnavailable}`);
