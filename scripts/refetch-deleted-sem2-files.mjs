import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TARGET_FILES = [
	"students_24_102_102_sem2.csv",
	"students_24_102_104_sem2.csv",
	"students_24_102_105_sem2.csv",
	"students_24_102_110_sem2.csv",
	"students_24_103_101_sem2.csv",
	"students_24_103_102_sem2.csv",
	"students_24_103_104_sem2.csv",
	"students_24_103_105_sem2.csv",
	"students_24_103_110_sem2.csv",
	"students_24_106_101_sem2.csv",
	"students_24_106_102_sem2.csv",
	"students_24_106_103_sem2.csv",
	"students_24_106_105_sem2.csv",
	"students_24_166_102_sem2.csv",
	"students_24_167_101_sem2.csv",
	"students_24_167_105_sem2.csv",
	"students_24_169_102_sem2.csv",
	"students_24_170_101_sem2.csv",
	"students_24_170_105_sem2.csv",
];

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

function stringifyCsv(rows) {
	const headers = ["Session", "RegNo", "Name", "SGPA", "Cur. CGPA"];
	return [
		headers.join(","),
		...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
	].join("\n");
}

function formatSessionLabel(session) {
	const yy = Number.parseInt(session, 10);
	const startYear = 2000 + yy;
	return `${startYear}-${startYear + 4}`;
}

function parseFilename(filename) {
	const match = filename.match(/^students_(\d+)_(\d+)_(\d+)_sem(\d+)\.csv$/);
	if (!match) throw new Error(`Invalid target filename: ${filename}`);
	const [, session, college, branch, semester] = match;
	return { session, college, branch, semester: Number.parseInt(semester, 10) };
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

function matchesTargetResult(data, { regNo, college, branch }) {
	return (
		normalizeDigits(data?.redg_no) === normalizeDigits(regNo)
		&& normalizeCode(data?.college_code) === normalizeCode(college)
		&& normalizeCode(data?.course_code) === normalizeCode(branch)
	);
}

function getSemesterSgpa(data, semester) {
	const values = Array.isArray(data?.sgpa) ? data.sgpa : [];
	const direct = values[semester - 1];
	if (direct && direct !== "-") return String(direct);
	const fallback = values.findLast((value) => value && value !== "-");
	return fallback ? String(fallback) : "N/A";
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
const concurrency = Number.parseInt(args.concurrency || "12", 10);
const fileConcurrency = Number.parseInt(args["file-concurrency"] || "4", 10);
const retries = Number.parseInt(args.retries || "4", 10);
const maxSerial = Number.parseInt(args["max-serial"] || "220", 10);
const chunkSize = Number.parseInt(args["chunk-size"] || "20", 10);
const stopAfterMisses = Number.parseInt(args["stop-after-misses"] || "25", 10);
const initialStopAfterMisses = Number.parseInt(args["initial-stop-after-misses"] || "60", 10);
const only = String(args.only || "")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const outDir = join(process.cwd(), "public", "data");
const targetFiles = only.length > 0 ? TARGET_FILES.filter((filename) => only.includes(filename)) : TARGET_FILES;

if (targetFiles.length === 0) {
	throw new Error("No target files selected. Check --only values.");
}

await mkdir(outDir, { recursive: true });


async function scanAndWriteFile(filename) {
	const { session, college, branch, semester } = parseFilename(filename);
	const rows = [];
	let foundAny = false;
	let consecutiveMisses = 0;
	let missingCount = 0;
	let errorCount = 0;
	let mismatchCount = 0;

	console.log(`${filename}: scanning API registrations`);

	for (let start = 1; start <= maxSerial; start += chunkSize) {
		const serials = [];
		for (let serial = start; serial < start + chunkSize && serial <= maxSerial; serial += 1) {
			serials.push(serial);
		}

		const batchResults = await mapLimit(serials, concurrency, async (serial) => {
			const regNo = `${session}${branch}${college}${String(serial).padStart(3, "0")}`;
			const result = await fetchResult({ apiBase, regNo, semester, retries });
			return { regNo, result };
		});

		for (const { regNo, result } of batchResults) {
			if (result.kind === "missing") {
				consecutiveMisses += 1;
				missingCount += 1;
				continue;
			}

			if (result.kind !== "success") {
				errorCount += 1;
				continue;
			}

			if (!matchesTargetResult(result.data, { regNo, college, branch })) {
				consecutiveMisses += 1;
				mismatchCount += 1;
				continue;
			}

			foundAny = true;
			consecutiveMisses = 0;
			rows.push({
				Session: formatSessionLabel(session),
				RegNo: normalizeDigits(result.data.redg_no) || regNo,
				Name: normalizeName(result.data.name),
				SGPA: getSemesterSgpa(result.data, semester),
				"Cur. CGPA": String(result.data.cgpa || "N/A").trim() || "N/A",
			});
		}

		console.log(
			`  ${filename}: scanned up to ${Math.min(start + chunkSize - 1, maxSerial)}, rows ${rows.length}, misses ${missingCount}, mismatches ${mismatchCount}, errors ${errorCount}`,
		);

		if (foundAny && consecutiveMisses >= stopAfterMisses) {
			break;
		}

		if (!foundAny && consecutiveMisses >= initialStopAfterMisses) {
			break;
		}
	}

	const dedupedRows = [...new Map(rows.map((row) => [row.RegNo, row])).values()].sort(
		(left, right) => left.RegNo.localeCompare(right.RegNo),
	);

	await writeFile(join(outDir, filename), `${stringifyCsv(dedupedRows)}\n`, "utf8");
	console.log(
		`${filename}: wrote ${dedupedRows.length} API rows (${missingCount} misses, ${mismatchCount} mismatches, ${errorCount} errors)`,
	);
	await sleep(100);

	return {
		filename,
		rows: dedupedRows.length,
		misses: missingCount,
		mismatches: mismatchCount,
		errors: errorCount,
	};
}

console.log(
	`Refetching ${targetFiles.length} deleted sem2 files with file concurrency ${fileConcurrency}, request concurrency ${concurrency}, initial miss stop ${initialStopAfterMisses}, and trailing miss stop ${stopAfterMisses}`,
);

const results = await mapLimit(targetFiles, fileConcurrency, scanAndWriteFile);
const totalRows = results.reduce((sum, entry) => sum + entry.rows, 0);
const totalMisses = results.reduce((sum, entry) => sum + entry.misses, 0);
const totalMismatches = results.reduce((sum, entry) => sum + entry.mismatches, 0);
const totalErrors = results.reduce((sum, entry) => sum + entry.errors, 0);

console.log(
	`Completed deleted sem2 refetch: ${totalRows} total API rows across ${results.length} files (${totalMisses} misses, ${totalMismatches} mismatches, ${totalErrors} errors)`,
);
