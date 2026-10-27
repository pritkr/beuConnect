import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
	const headers = ["Session", "RegNo", "Name", "SGPA", "Cur. CGPA", "CollegeCode", "CollegeName"];
	return [
		headers.join(","),
		...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
	].join("\n");
}

function parseScore(value) {
	const normalized = String(value ?? "").trim().replace(/[^0-9.\-]/g, "");
	if (!normalized) return null;
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseFilename(filename) {
	const match = filename.match(/^students_(\d+)_(\d+)_(\d+)_sem(\d+)\.csv$/);
	if (!match) return null;
	const [, session, college, branch, semester] = match;
	return { session, college, branch, semester };
}

function buildMergedFilename({ session, branch, semester }) {
	return `students_${session}_all_${branch}_sem${semester}.csv`;
}

const rootDir = process.cwd();
const dataDir = join(rootDir, "public", "data");
const collegesPath = join(rootDir, "src", "data", "colleges.json");

await mkdir(dataDir, { recursive: true });

const colleges = JSON.parse(await readFile(collegesPath, "utf8"));
const collegeNameMap = new Map(colleges.map((college) => [String(college.CollegeCode), String(college.Name)]));

const filenames = (await readdir(dataDir)).sort();
const groups = new Map();

for (const filename of filenames) {
	if (filename.includes("_all_")) continue;
	const parsed = parseFilename(filename);
	if (!parsed) continue;
	const key = `${parsed.session}|${parsed.branch}|${parsed.semester}`;
	const entries = groups.get(key) || [];
	entries.push({ filename, ...parsed });
	groups.set(key, entries);
}

let written = 0;

for (const entries of groups.values()) {
	const mergedRows = [];

	for (const entry of entries) {
		const rows = parseCsv(await readFile(join(dataDir, entry.filename), "utf8"));
		for (const row of rows) {
			mergedRows.push({
				Session: String(row.Session || "").trim(),
				RegNo: String(row.RegNo || "").trim(),
				Name: String(row.Name || "").trim(),
				SGPA: String(row.SGPA || "").trim(),
				"Cur. CGPA": String(row["Cur. CGPA"] || "").trim(),
				CollegeCode: entry.college,
				CollegeName: collegeNameMap.get(entry.college) || entry.college,
			});
		}
	}

	const dedupedRows = [...new Map(mergedRows.map((row) => [row.RegNo, row])).values()].sort((left, right) => {
		const cgpaDiff = (parseScore(right["Cur. CGPA"]) ?? -Infinity) - (parseScore(left["Cur. CGPA"]) ?? -Infinity);
		if (cgpaDiff !== 0) return cgpaDiff;
		const sgpaDiff = (parseScore(right.SGPA) ?? -Infinity) - (parseScore(left.SGPA) ?? -Infinity);
		if (sgpaDiff !== 0) return sgpaDiff;
		return String(left.RegNo || "").localeCompare(String(right.RegNo || ""));
	});

	const outputFilename = buildMergedFilename(entries[0]);
	await writeFile(join(dataDir, outputFilename), `${stringifyCsv(dedupedRows)}\n`, "utf8");
	console.log(`Wrote ${dedupedRows.length} rows -> ${outputFilename}`);
	written += 1;
}

console.log(`Done. Wrote ${written} merged result-table CSV files.`);
