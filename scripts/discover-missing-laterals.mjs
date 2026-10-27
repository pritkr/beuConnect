import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith("--")) {
			args[argv[i].slice(2)] = argv[i+1];
			i++;
		}
	}
	return args;
}

function parseCsv(text) {
	const lines = text.trim().split("\n");
	if (lines.length === 0) return [];
	const headers = lines[0].split(",");
	return lines.slice(1).map(line => {
		let inQuotes = false;
		let val = "";
		let values = [];
		for(let char of line) {
			if(char === '"') inQuotes = !inQuotes;
			else if(char === ',' && !inQuotes) { values.push(val); val = ""; }
			else val += char;
		}
		values.push(val);
		const row = {};
		headers.forEach((h, i) => row[h] = values[i]);
		return row;
	});
}

function stringifyCsv(rows) {
	const headers = ["Session", "RegNo", "Name", "SGPA", "Cur. CGPA"];
	return [
		headers.join(","),
		...rows.map(row => headers.map(h => {
			let val = String(row[h] || "").trim();
			if (val.includes(",")) val = `"${val}"`;
			return val;
		}).join(","))
    ].join("\n");
}

async function fetchResult(regNo, sem) {
    const url = `http://127.0.0.1:4321/api/result?format=json&reg=${regNo}&sem=${sem}`;
    for(let i=0; i<3; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (res.ok && data.status === 200 && data.data) return { found: true, data: data.data };
            if (data.status === 404 || data.message?.includes("Invalid registration")) return { found: false };
        } catch(e) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return { found: false };
}

async function discoverRange(startReg, endReg, sem, existingRegs) {
	const discovered = [];
	let consecutiveMisses = 0;
	
	for (let reg = startReg; reg <= endReg; reg++) {
		const regStr = String(reg);
		if (existingRegs.has(regStr)) {
			console.log(`[Skip] ${regStr} already in CSV.`);
			continue;
		}
		
		process.stdout.write(`Probing ${regStr}... `);
		const result = await fetchResult(regStr, sem);
		
		if (result.found) {
			console.log(`FOUND! (${result.data.name})`);
			discovered.push({
				RegNo: regStr,
				Name: result.data.name.toUpperCase(),
				SGPA: (result.data.sgpa && result.data.sgpa[sem-1] && result.data.sgpa[sem-1] !== "-") ? result.data.sgpa[sem-1] : "N/A",
				"Cur. CGPA": result.data.cgpa || "N/A"
			});
			consecutiveMisses = 0;
		} else {
			console.log("Not found.");
			consecutiveMisses++;
			// Early exit if 8 misses in a row to save time, assuming no more laterals/regulars
			if (consecutiveMisses >= 8) {
				console.log(`  -> 8 consecutive misses. Stopping range scan early.`);
				break;
			}
		}
		await new Promise(r => setTimeout(r, 200));
	}
	return discovered;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const session = args.session;
	const college = args.college;
	const branch = args.branch;
	const semester = parseInt(args.semester, 10);
	
	if (!session || !college || !branch || !semester) {
		console.error("Usage: bun run scripts/discover-missing-laterals.mjs --session 23 --college 157 --branch 105 --semester 4");
		process.exit(1);
	}
	
	const csvName = `students_${session}_${college}_${branch}_sem${semester}.csv`;
	const csvPath = join(process.cwd(), "public", "data", csvName);
	
	let existingRows = [];
	if (existsSync(csvPath)) {
		existingRows = parseCsv(await readFile(csvPath, "utf-8"));
	}
	const existingRegs = new Set(existingRows.map(r => String(r.RegNo).trim()));
	
	console.log(`Starting discovery for Session ${session}, College ${college}, Branch ${branch}, Sem ${semester}`);
	
	// 1. Regular range: YY BB CCC 001 -> YY BB CCC 150
	const regStart = parseInt(`${session}${branch}${college}001`, 10);
	const regEnd = parseInt(`${session}${branch}${college}150`, 10);
	console.log(`\n--- Probing Regulars (${regStart} to ${regEnd}) ---`);
	const newRegulars = await discoverRange(regStart, regEnd, semester, existingRegs);
	
	// 2. Lateral range: (YY+1) BB CCC 901 -> (YY+1) BB CCC 950
	const lateralSession = parseInt(session, 10) + 1;
	const latStart = parseInt(`${lateralSession}${branch}${college}901`, 10);
	const latEnd = parseInt(`${lateralSession}${branch}${college}950`, 10);
	console.log(`\n--- Probing Laterals (${latStart} to ${latEnd}) ---`);
	const newLaterals = await discoverRange(latStart, latEnd, semester, existingRegs);
	
	const allNew = [...newRegulars, ...newLaterals];
	if (allNew.length > 0) {
		const sessionLabel = `20${session}-20${parseInt(session, 10) + 4}`;
		for (const row of allNew) {
			existingRows.push({
				Session: sessionLabel,
				RegNo: row.RegNo,
				Name: row.Name,
				SGPA: String(row.SGPA),
				"Cur. CGPA": String(row["Cur. CGPA"])
			});
		}
		
		existingRows.sort((a, b) => String(a.RegNo).localeCompare(String(b.RegNo)));
		await writeFile(csvPath, stringifyCsv(existingRows) + "\n");
		console.log(`\nSaved! Added ${allNew.length} new students to ${csvName}.`);
	} else {
		console.log("\nNo new students discovered.");
	}
}

main().catch(console.error);