import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execAsync = promisify(exec);

// Path Configuration
const CSV_PATH = "/home/pk/Desktop/coding/beuconnectaw/public/data/students_25_157_105_sem1.csv";
const PHOTOS_DIR = "/home/pk/Desktop/coding/beuconnectaw/25listextractfrompdf/webpage/photos";
const HTML_OUTPUT_PATH = "/home/pk/Desktop/coding/beuconnectaw/public/data/students_25_157_105_sem1_sorted.html";
const PDF_OUTPUT_PATH = "/home/pk/Desktop/coding/beuconnectaw/public/data/students_25_157_105_sem1_sorted.pdf";
const PROJECT_PDF_PATH = "/home/pk/Desktop/coding/beuconnectaw/students_25_157_105_sem1_sorted.pdf";

// Default SVG avatar data URI for missing photos
const DEFAULT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><rect width="24" height="24" fill="%23f1f5f9"/><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>`;

// CSV Parser Helper
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
		headers.forEach((header, idx) => {
			entry[header] = (row[idx] || "").trim();
		});
		return entry;
	});
}

async function main() {
	try {
		console.log(`Reading CSV file from ${CSV_PATH}...`);
		const rawCsv = await readFile(CSV_PATH, "utf8");

		console.log("Parsing CSV contents...");
		const rawRows = parseCsv(rawCsv);
		
		if (rawRows.length === 0) {
			throw new Error("No data records found in the CSV file.");
		}

		console.log(`Successfully parsed ${rawRows.length} student records.`);

		// Clean and transform data
		const students = rawRows.map((row) => {
			const regNo = row.RegNo || "";
			const name = (row.Name || "").trim().toUpperCase();
			const sgpaStr = row.SGPA || "";
			const cgpaStr = row["Cur. CGPA"] || "";

			// Clean asterisk and parse floats
			const cleanSgpaStr = sgpaStr.replace("*", "").trim();
			const cleanCgpaStr = cgpaStr.replace("*", "").trim();

			const sgpa = Number.parseFloat(cleanSgpaStr) || 0.0;
			const cgpa = Number.parseFloat(cleanCgpaStr) || 0.0;

			const hasBacklog = sgpaStr.includes("*") || cgpaStr.includes("*");

			// Check for student photo
			const photoPath = join(PHOTOS_DIR, `${regNo}.jpg`);
			const hasPhoto = existsSync(photoPath);
			const photoUrl = hasPhoto ? photoPath : DEFAULT_AVATAR;

			return {
				regNo,
				name,
				sgpa,
				cgpa,
				sgpaStr,
				cgpaStr,
				hasBacklog,
				photoUrl,
				hasPhoto
			};
		});

		// Sort: Primary CGPA Descending, Secondary SGPA Descending, Tertiary RegNo Ascending
		console.log("Sorting students based on academic performance...");
		students.sort((a, b) => {
			if (b.cgpa !== a.cgpa) {
				return b.cgpa - a.cgpa;
			}
			if (b.sgpa !== a.sgpa) {
				return b.sgpa - a.sgpa;
			}
			return a.regNo.localeCompare(b.regNo);
		});

		// Calculate Competition Ranks based on CGPA
		console.log("Calculating ranks...");
		let currentRank = 1;
		for (let i = 0; i < students.length; i++) {
			if (i > 0 && students[i].cgpa < students[i - 1].cgpa) {
				currentRank = i + 1; // Competition ranking (skips numbers on ties)
			}
			students[i].rank = currentRank;
		}

		// Calculate stats
		const totalStudents = students.length;
		const topCgpa = Math.max(...students.map((s) => s.cgpa));
		const sumCgpa = students.reduce((sum, s) => sum + s.cgpa, 0);
		const averageCgpa = Number((sumCgpa / totalStudents).toFixed(2));
		const clearStudents = students.filter((s) => !s.hasBacklog).length;
		const passRate = Number(((clearStudents / totalStudents) * 100).toFixed(1));
		const photoCount = students.filter((s) => s.hasPhoto).length;

		console.log("Academic Summary:");
		console.log(`  Total Students: ${totalStudents}`);
		console.log(`  Top CGPA:       ${topCgpa}`);
		console.log(`  Average CGPA:   ${averageCgpa}`);
		console.log(`  Pass Rate:      ${passRate}% (${clearStudents}/${totalStudents} clear)`);
		console.log(`  Photos Found:   ${photoCount}/${totalStudents}`);

		// Generate elegant HTML
		console.log("Generating premium, print-optimized HTML layout with photo integration...");
		const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Academic Rank List - GEC Sheikhpura</title>
	<style>
		/* Core reset and typography */
		*, *::before, *::after {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
		
		body {
			font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
			color: #1e293b;
			background-color: #ffffff;
			line-height: 1.4;
			font-size: 11px;
			padding: 10px 15px;
		}

		/* Decorative Top Banner */
		.banner-line {
			height: 4px;
			background: linear-gradient(90deg, #1e3a8a 0%, #3b82f6 50%, #b45309 100%);
			margin-bottom: 12px;
		}

		/* Header Section */
		.header {
			display: flex;
			justify-content: space-between;
			align-items: flex-end;
			border-bottom: 2px solid #e2e8f0;
			padding-bottom: 10px;
			margin-bottom: 15px;
		}

		.header-title h1 {
			font-size: 16px;
			font-weight: 800;
			color: #0f172a;
			letter-spacing: -0.02em;
			text-transform: uppercase;
		}

		.header-title h2 {
			font-size: 12px;
			font-weight: 600;
			color: #1e3a8a;
			margin-top: 1px;
		}

		.header-title p {
			font-size: 9.5px;
			color: #64748b;
			font-weight: 500;
			margin-top: 2px;
		}

		.header-badge {
			text-align: right;
		}

		.badge {
			display: inline-block;
			background-color: #f1f5f9;
			color: #334155;
			padding: 3px 8px;
			border-radius: 4px;
			font-weight: 700;
			font-size: 8.5px;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			border: 1px solid #e2e8f0;
		}

		/* Stats Grid */
		.stats-container {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 10px;
			margin-bottom: 15px;
		}

		.stat-card {
			background: #f8fafc;
			border: 1px solid #e2e8f0;
			border-radius: 6px;
			padding: 8px 12px;
			text-align: center;
			position: relative;
			overflow: hidden;
		}

		.stat-card::before {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 3px;
			background: #3b82f6;
		}

		.stat-card.top-cgpa::before {
			background: #d97706;
		}

		.stat-card.pass-rate::before {
			background: #10b981;
		}

		.stat-val {
			font-size: 15px;
			font-weight: 800;
			color: #0f172a;
			margin-bottom: 1px;
		}

		.stat-lbl {
			font-size: 8px;
			color: #64748b;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		/* Rank List Table Styling */
		.table-container {
			width: 100%;
			margin-bottom: 15px;
		}

		table {
			width: 100%;
			border-collapse: collapse;
			text-align: left;
			font-size: 9.5px;
		}

		thead {
			display: table-header-group;
		}

		tr {
			page-break-inside: avoid;
		}

		th {
			background-color: #0f172a;
			color: #ffffff;
			font-weight: 700;
			text-transform: uppercase;
			font-size: 8px;
			letter-spacing: 0.05em;
			padding: 8px 10px;
			border: 1px solid #0f172a;
		}

		td {
			padding: 4px 10px;
			border-bottom: 1px solid #e2e8f0;
			color: #334155;
			vertical-align: middle;
		}

		/* Specific Column Alignments and Styles */
		.col-rank {
			text-align: center;
			font-weight: 700;
			width: 7%;
		}

		.col-reg {
			font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
			font-size: 9px;
			letter-spacing: 0.02em;
			color: #475569;
			text-align: center;
			width: 15%;
		}

		.col-name {
			font-weight: 600;
			color: #1e293b;
			text-transform: uppercase;
		}

		/* Student Info Wrapper (Photo + Name) */
		.student-cell {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.student-photo {
			width: 22px;
			height: 22px;
			border-radius: 50%;
			object-fit: cover;
			border: 1px solid #cbd5e1;
			background-color: #f1f5f9;
			display: block;
		}

		.col-sgpa {
			text-align: right;
			font-weight: 600;
			width: 10%;
		}

		.col-cgpa {
			text-align: right;
			font-weight: 800;
			color: #0f172a;
			width: 10%;
		}

		.col-backlog {
			text-align: center;
			width: 8%;
		}

		/* Highlight Row Styles for Ranks 1, 2, 3 */
		.row-rank-1 {
			background-color: #fffbeb !important;
		}
		.row-rank-1 td {
			border-bottom: 1.5px solid #fde047;
			color: #78350f;
		}
		.row-rank-1 .col-cgpa {
			color: #b45309;
		}
		.row-rank-1 .student-photo {
			border: 1.5px solid #d97706;
		}

		.row-rank-2 {
			background-color: #f8fafc !important;
		}
		.row-rank-2 td {
			border-bottom: 1.5px solid #cbd5e1;
			color: #1e293b;
		}
		.row-rank-2 .col-cgpa {
			color: #475569;
		}
		.row-rank-2 .student-photo {
			border: 1.5px solid #64748b;
		}

		.row-rank-3 {
			background-color: #fffaf8 !important;
		}
		.row-rank-3 td {
			border-bottom: 1.5px solid #ffedd5;
			color: #7c2d12;
		}
		.row-rank-3 .col-cgpa {
			color: #9a3412;
		}
		.row-rank-3 .student-photo {
			border: 1.5px solid #b45309;
		}

		/* Circular Medal Badge Styling */
		.rank-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 16px;
			border-radius: 50%;
			font-size: 8px;
			font-weight: 800;
		}

		.badge-gold {
			background-color: #d97706;
			color: #ffffff;
			box-shadow: 0 1px 2px rgba(217, 119, 6, 0.3);
		}

		.badge-silver {
			background-color: #64748b;
			color: #ffffff;
			box-shadow: 0 1px 2px rgba(100, 116, 139, 0.3);
		}

		.badge-bronze {
			background-color: #b45309;
			color: #ffffff;
			box-shadow: 0 1px 2px rgba(180, 83, 9, 0.3);
		}

		/* Backlog Pill Styling */
		.backlog-indicator {
			color: #ef4444;
			font-weight: 800;
			font-size: 11px;
		}

		.backlog-pill {
			display: inline-block;
			background-color: #fee2e2;
			color: #991b1b;
			font-size: 7px;
			font-weight: 700;
			padding: 1px 4px;
			border-radius: 3px;
			text-transform: uppercase;
			border: 0.5px solid #fca5a5;
		}

		.clear-pill {
			display: inline-block;
			background-color: #d1fae5;
			color: #065f46;
			font-size: 7px;
			font-weight: 700;
			padding: 1px 4px;
			border-radius: 3px;
			text-transform: uppercase;
			border: 0.5px solid #6ee7b7;
		}

		/* Zebra Striping */
		tbody tr:nth-child(even):not(.row-rank-1):not(.row-rank-2):not(.row-rank-3) {
			background-color: #f8fafc;
		}

		/* Print margins, page rules, and footers */
		@page {
			size: A4;
			margin: 15mm 15mm 15mm 15mm;
		}

		@media print {
			body {
				-webkit-print-color-adjust: exact;
				print-color-adjust: exact;
			}
		}

		/* Fine Print / Footer Footnote */
		.footnote {
			margin-top: 15px;
			border-top: 1px solid #e2e8f0;
			padding-top: 6px;
			font-size: 7.5px;
			color: #64748b;
			line-height: 1.3;
		}
	</style>
</head>
<body>
	<div class="banner-line"></div>
	
	<div class="header">
		<div class="header-title">
			<h1>Bihar Engineering University, Patna</h1>
			<h2>Government Engineering College, Sheikhpura</h2>
			<p>B.Tech. in Computer Science & Engineering &bull; Semester-I Academic Performance Rank List (Batch 2025-2029)</p>
		</div>
		<div class="header-badge">
			<span class="badge">Session 2025-2029</span>
		</div>
	</div>

	<div class="stats-container">
		<div class="stat-card">
			<div class="stat-val">${totalStudents}</div>
			<div class="stat-lbl">Total Candidates</div>
		</div>
		<div class="stat-card top-cgpa">
			<div class="stat-val">${topCgpa.toFixed(2)}</div>
			<div class="stat-lbl">Highest CGPA</div>
		</div>
		<div class="stat-card">
			<div class="stat-val">${averageCgpa.toFixed(2)}</div>
			<div class="stat-lbl">Class Average</div>
		</div>
		<div class="stat-card pass-rate">
			<div class="stat-val">${passRate}%</div>
			<div class="stat-lbl">Clear Pass Rate</div>
		</div>
	</div>

	<div class="table-container">
		<table>
			<thead>
				<tr>
					<th class="col-rank" style="text-align: center;">Rank</th>
					<th class="col-reg" style="text-align: center;">Reg. Number</th>
					<th class="col-name" style="text-align: left;">Student Name</th>
					<th class="col-sgpa" style="text-align: right;">SGPA</th>
					<th class="col-cgpa" style="text-align: right;">CGPA</th>
					<th class="col-backlog" style="text-align: center;">Status</th>
				</tr>
			</thead>
			<tbody>
				${students
					.map((student) => {
						let rowClass = "";
						let rankBadge = student.rank;

						if (student.rank === 1) {
							rowClass = "row-rank-1";
							rankBadge = '<span class="rank-badge badge-gold">1</span>';
						} else if (student.rank === 2) {
							rowClass = "row-rank-2";
							rankBadge = '<span class="rank-badge badge-silver">2</span>';
						} else if (student.rank === 3) {
							rowClass = "row-rank-3";
							rankBadge = '<span class="rank-badge badge-bronze">3</span>';
						}

						const statusPill = student.hasBacklog
							? '<span class="backlog-pill">Backlog</span>'
							: '<span class="clear-pill">Clear</span>';

						const cgpaDisplay = student.hasBacklog ? `${student.cgpaStr}` : `${student.cgpa.toFixed(2)}`;
						const sgpaDisplay = student.hasBacklog ? `${student.sgpaStr}` : `${student.sgpa.toFixed(2)}`;

						return `
				<tr class="${rowClass}">
					<td class="col-rank">${rankBadge}</td>
					<td class="col-reg">${student.regNo}</td>
					<td class="col-name">
						<div class="student-cell">
							<img class="student-photo" src="${student.photoUrl}" />
							<span>${student.name}</span>
						</div>
					</td>
					<td class="col-sgpa">${sgpaDisplay}</td>
					<td class="col-cgpa">${cgpaDisplay}</td>
					<td class="col-backlog">${statusPill}</td>
				</tr>`;
					})
					.join("")}
			</tbody>
		</table>
	</div>

	<div class="footnote">
		<strong>Disclaimer & Notes:</strong><br>
		1. Ranks are determined strictly based on Current CGPA (descending order) and resolve ties using SGPA. In case of identical CGPA and SGPA, candidates are joint-ranked and listed alphabetically by registration number.<br>
		2. The <strong>*</strong> symbol indicates that the candidate has carry-over papers (backlog) in the corresponding semester, and the SGPA/CGPA is provisional.<br>
		3. Generated on ${new Date().toLocaleDateString("en-IN", {
			day: "numeric",
			month: "long",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		})} by BEUConnect Automated Ranking Pipeline.
	</div>
</body>
</html>`;

		await writeFile(HTML_OUTPUT_PATH, htmlContent, "utf8");
		console.log(`Successfully generated beautiful HTML with photos at: ${HTML_OUTPUT_PATH}`);

		// Compile PDF using wkhtmltopdf
		console.log("Compiling beautiful PDF using wkhtmltopdf...");
		const wkhtmltopdfCommand = [
			"wkhtmltopdf",
			"--enable-local-file-access",
			"--page-size A4",
			"--margin-top 15mm",
			"--margin-bottom 15mm",
			"--margin-left 15mm",
			"--margin-right 15mm",
			"--header-spacing 5",
			"--footer-spacing 5",
			"--footer-font-size 8",
			"--footer-font-name 'system-ui, -apple-system, sans-serif'",
			`--footer-right "Page [page] of [toPage]"`,
			`--footer-left "GEC Sheikhpura • Computer Science & Engineering (2025-2029)"`,
			`"${HTML_OUTPUT_PATH}"`,
			`"${PDF_OUTPUT_PATH}"`,
		].join(" ");

		console.log(`Executing command: ${wkhtmltopdfCommand}`);
		const { stdout, stderr } = await execAsync(wkhtmltopdfCommand);
		if (stdout) console.log(`wkhtmltopdf stdout:\n${stdout}`);
		if (stderr && !stderr.includes("Loading pages")) {
			console.warn(`wkhtmltopdf stderr:\n${stderr}`);
		}

		console.log(`Successfully generated premium sorted PDF with photos at: ${PDF_OUTPUT_PATH}`);

		// Copying PDF to the project root directory for easy access
		console.log(`Copying PDF to project root at: ${PROJECT_PDF_PATH}...`);
		await execAsync(`cp "${PDF_OUTPUT_PATH}" "${PROJECT_PDF_PATH}"`);
		console.log("PDF copied successfully!");

	} catch (error) {
		console.error("An error occurred during pipeline execution:", error);
		process.exit(1);
	}
}

main();
