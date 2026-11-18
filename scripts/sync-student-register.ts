#!/usr/bin/env bun
/**
 * Build the web student register from the college register dump in ~/gecs-cli.
 *
 * Canonical source (never edited by hand):
 *   ~/gecs-cli/dumps/<stamp>/students_basic_details.csv
 *
 * Only public identity fields are kept. The dump also carries mobile numbers,
 * e-mail addresses, dates of birth and guardian contacts — none of that belongs
 * on a public website, so it is dropped here rather than filtered at render.
 *
 *   bun scripts/sync-student-register.ts [dump.csv]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const DUMPS = resolve(homedir(), "gecs-cli/dumps");

function latestDump(): string {
	if (!existsSync(DUMPS)) {
		throw new Error(`No register dump found at ${DUMPS}`);
	}
	const stamps = readdirSync(DUMPS)
		.filter((name) => /^\d{8}_\d{6}$/.test(name))
		.sort()
		.reverse();
	for (const stamp of stamps) {
		const candidate = resolve(DUMPS, stamp, "students_basic_details.csv");
		if (existsSync(candidate)) return candidate;
	}
	throw new Error(`No students_basic_details.csv under ${DUMPS}`);
}

const source = process.argv[2] ?? latestDump();
const target = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../src/assets/data/students/gecs-register.json",
);

/** Register branch label -> site branch slug and label. */
const BRANCHES: Record<string, { branch: string; label: string; section?: string }> = {
	CE: { branch: "civil", label: "Civil Engineering" },
	CSE: { branch: "cse", label: "Computer Science & Engineering" },
	"CSE-A": { branch: "cse", label: "Computer Science & Engineering", section: "A" },
	"CSE-B": { branch: "cse", label: "Computer Science & Engineering", section: "B" },
	ECE: { branch: "ece", label: "Electronics & Communication Engineering" },
	EE: { branch: "ee", label: "Electrical Engineering" },
	ME: { branch: "mech", label: "Mechanical Engineering" },
	MET: { branch: "met", label: "Mechatronics Engineering" },
};

/** 2K26 seats are still provisional; BEU has not issued registration numbers. */
const REG_NO = /^\d{11}$/;

function splitCsvLine(line: string): string[] {
	const cells: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (char === '"') {
			if (quoted && line[i + 1] === '"') {
				cell += '"';
				i += 1;
			} else {
				quoted = !quoted;
			}
		} else if (char === "," && !quoted) {
			cells.push(cell);
			cell = "";
		} else {
			cell += char;
		}
	}
	cells.push(cell);
	return cells;
}

const text = readFileSync(source, "utf8").replace(/^\uFEFF/, "");
const lines = text.trim().split(/\r?\n/);
const header = splitCsvLine(lines[0]).map((name) => name.trim());

const rows = lines.slice(1).map((line) => {
	const cells = splitCsvLine(line);
	const row: Record<string, string> = {};
	header.forEach((name, index) => {
		row[name] = (cells[index] ?? "").trim();
	});
	return row;
});

let skippedInactive = 0;
let skippedBranch = 0;

const students = rows
	.flatMap((row) => {
		if (row.status && row.status !== "Active") {
			skippedInactive += 1;
			return [];
		}
		const mapped = BRANCHES[row.branch];
		if (!mapped) {
			skippedBranch += 1;
			return [];
		}
		const batch = /^2K(\d{2})$/.exec(row.batch);
		const year = batch ? 2000 + Number(batch[1]) : null;
		if (!year) return [];

		const regNo = (row.registration_no || "").toUpperCase();
		const rollNo = (row.roll_no || "").toUpperCase();
		if (!regNo && !rollNo) return [];

		return [
			{
				regNo: regNo || rollNo,
				rollNo: rollNo || regNo,
				name: row.name,
				branch: mapped.branch,
				branchLabel: mapped.label,
				session: `${year}-${String((year + 4) % 100).padStart(2, "0")}`,
				...(mapped.section ? { section: mapped.section } : {}),
				...(REG_NO.test(regNo) ? {} : { provisionalReg: true }),
			},
		];
	})
	.sort(
		(a, b) =>
			a.session.localeCompare(b.session) ||
			a.branch.localeCompare(b.branch) ||
			a.rollNo.localeCompare(b.rollNo),
	);

const bySession = new Map<string, number>();
for (const student of students) {
	bySession.set(student.session, (bySession.get(student.session) ?? 0) + 1);
}
const latest = [...bySession.keys()].sort().at(-1) ?? "";
const latestStudents = students.filter((student) => student.session === latest);
const latestBranches = new Map<string, number>();
for (const student of latestStudents) {
	latestBranches.set(student.branch, (latestBranches.get(student.branch) ?? 0) + 1);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(students)}\n`);

console.log(`source            ${source}`);
console.log(`target            ${target}`);
console.log(`students          ${students.length}`);
console.log(
	`sessions          ${[...bySession.entries()]
		.sort()
		.map(([session, count]) => `${session}:${count}`)
		.join("  ")}`,
);
console.log(`latest batch      ${latest} (${latestStudents.length})`);
console.log(
	`latest branches   ${[...latestBranches.entries()]
		.sort()
		.map(([branch, count]) => `${branch}:${count}`)
		.join("  ")}`,
);
if (skippedInactive) console.log(`skipped inactive  ${skippedInactive}`);
if (skippedBranch) console.log(`skipped branch    ${skippedBranch}`);
