import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const STANDARD_BRANCHES = new Set(["101", "102", "103", "104", "105", "110"]);
const BRANCH_SCAN_LIMIT = {
	"105": 130,
};

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

function formatSessionLabel(session) {
	const yy = Number.parseInt(session, 10);
	const startYear = 2000 + yy;
	return `${startYear}-${startYear + 4}`;
}

function buildFilename(session, college, branch, semester) {
	return `students_${session}_${college}_${branch}_sem${semester}.csv`;
}

function getScanLimit(branch) {
	return BRANCH_SCAN_LIMIT[branch] ?? 70;
}

function parseReferenceRegistrations(reportText, session) {
	const pattern = new RegExp(`\\b(${session}\\d{9})\\b`, "g");
	const byFile = new Map();
	for (const match of reportText.matchAll(pattern)) {
		const reg = match[1];
		const branch = reg.slice(2, 5);
		if (!STANDARD_BRANCHES.has(branch)) continue;
		const college = reg.slice(5, 8);
		const filename = buildFilename(session, college, branch, 2);
		if (!byFile.has(filename)) byFile.set(filename, new Set());
		byFile.get(filename).add(reg);
	}
	return byFile;
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

	for (let attempt = 1; attempt <= retries; attempt += 1) {
		try {
			const response = await fetch(target, { headers: { accept: "application/json" } });
			const text = await response.text();
			const payload = text ? JSON.parse(text) : null;
			if (response.ok && payload?.status === 200 && payload?.data) {
				return payload.data;
			}
		} catch {}
		await sleep(250 * attempt);
	}

	return null;
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
const session = args.session || "24";
const semester = Number.parseInt(args.semester || "2", 10);
const concurrency = Number.parseInt(args.concurrency || "12", 10);
const retries = Number.parseInt(args.retries || "4", 10);
const apiBase = args["api-base"] || "http://127.0.0.1:4333/api/result";
const pdfPath = args.pdf || "2024-28 — BEU Rank Report — 2nd Sem.pdf";

const dataDir = join(process.cwd(), "public", "data");
await mkdir(dataDir, { recursive: true });

const extractedReportPath = join(
	"/tmp",
	`${basename(pdfPath)}.txt`.replace(/[^a-zA-Z0-9_.-]/g, "_"),
);
execFileSync("pdftotext", [pdfPath, extractedReportPath], { cwd: process.cwd() });
const reportText = await readFile(extractedReportPath, "utf8");

const reportByFile = parseReferenceRegistrations(reportText, session);
const existingSem2Files = (await readdir(dataDir)).filter((name) =>
	new RegExp(`^students_${session}_(\\d+)_(\\d+)_sem${semester}\\.csv$`).test(name),
);

const allFiles = new Set(reportByFile.keys());
for (const filename of existingSem2Files) {
	const branch = filename.split("_")[3];
	if (STANDARD_BRANCHES.has(branch)) allFiles.add(filename);
}

const recoveredExtras = [];
const restoredFiles = [];

for (const filename of [...allFiles].sort()) {
	const [, , college, branch] = filename.replace(`_sem${semester}.csv`, "").split("_");
	const filePath = join(dataDir, filename);
	const referenceRegs = reportByFile.get(filename) ?? new Set();

	let existingRows = [];
	try {
		existingRows = parseCsv(await readFile(filePath, "utf8"));
	} catch {
		existingRows = [];
	}

	const rowByReg = new Map(
		existingRows.map((row) => [String(row.RegNo || "").trim(), row]),
	);

	let foundAny = false;
	let consecutiveFailures = 0;
	let scanned = 0;
	const limit = getScanLimit(branch);

	for (let serial = 1; serial <= limit; serial += 1) {
		const regNo = `${session}${branch}${college}${String(serial).padStart(3, "0")}`;
		const existingRow = rowByReg.get(regNo);
		if (
			existingRow &&
			(existingRow.SGPA || "").trim().toUpperCase() !== "N/A" &&
			(existingRow["Cur. CGPA"] || "").trim().toUpperCase() !== "N/A"
		) {
			foundAny = true;
			consecutiveFailures = 0;
			continue;
		}

		scanned += 1;
		const data = await fetchResult({ apiBase, regNo, semester, retries });
		if (!data) {
			consecutiveFailures += 1;
			if (foundAny && consecutiveFailures >= 7) break;
			continue;
		}

		foundAny = true;
		consecutiveFailures = 0;
		rowByReg.set(regNo, {
			Session: formatSessionLabel(session),
			RegNo: regNo,
			Name: String(data.name || "").trim().toUpperCase(),
			SGPA: getSemesterSgpa(data, semester),
			"Cur. CGPA": String(data.cgpa || "N/A").trim() || "N/A",
		});
		if (!referenceRegs.has(regNo)) {
			recoveredExtras.push({ filename, regNo });
		}
	}

	const finalRows = [...rowByReg.values()]
		.filter((row) => (row.RegNo || "").startsWith(`${session}${branch}${college}`))
		.sort((left, right) => String(left.RegNo).localeCompare(String(right.RegNo)));

	if (existingRows.length === 0 && finalRows.length > 0) {
		restoredFiles.push(filename);
	}

	await writeFile(filePath, `${stringifyCsv(finalRows)}\n`, "utf8");
	console.log(`${filename}: wrote ${finalRows.length} rows after scanning ${scanned} registrations`);
	await sleep(80);
	}

const recoveredExtrasPath = join("/tmp", `beu-sem${semester}-recovered-extras-${session}.json`);
await writeFile(
	recoveredExtrasPath,
	`${JSON.stringify({ restoredFiles, recoveredExtras }, null, 2)}\n`,
	"utf8",
);

console.log(`Reference-assisted API sync complete. Restored files: ${restoredFiles.length}, extra students recovered: ${recoveredExtras.length}`);
console.log(`Details saved to ${recoveredExtrasPath}`);
