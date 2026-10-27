import { existsSync } from "fs";
import { readFile, writeFile, readdir, mkdir } from "fs/promises";
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

function stringifyCsv(rows, headers) {
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
    const url = `http://localhost:4321/api/result?format=json&reg=${regNo}&sem=${sem}`;
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

async function discoverRangeParallel(startReg, endReg, sem, existingRegs, concurrency, session, ingestExisting, threshold) {
    const discovered = [];
    let rangesToTry = [];
    
    for (let reg = startReg; reg <= endReg; reg++) {
        rangesToTry.push(reg);
    }

    const batchSize = Math.max(8, concurrency); 
    let consecutiveMisses = 0;

    for (let i = 0; i < rangesToTry.length; i += batchSize) {
        const batch = rangesToTry.slice(i, i + batchSize);
        const results = await mapLimit(batch, concurrency, async (reg) => {
            const regStr = String(reg);
            if (existingRegs.has(regStr) && !ingestExisting) return null;

            const res = await fetchResult(regStr, sem);
            if (res.found) {
                console.log(`FOUND! ${regStr} (${res.data.name})`);
                if (!existingRegs.has(regStr)) {
                    return {
                        RegNo: regStr,
                        Name: res.data.name.toUpperCase(),
                        SGPA: (res.data.sgpa && res.data.sgpa[sem-1] && res.data.sgpa[sem-1] !== "-") ? res.data.sgpa[sem-1] : "N/A",
                        "Cur. CGPA": res.data.cgpa || "N/A"
                    };
                }
            }
            return null;
        });

        const foundInBatch = results.filter(Boolean);
        discovered.push(...foundInBatch);

        if (!ingestExisting) {
            let batchMisses = 0;
            for(const reg of batch) {
                const regStr = String(reg);
                if (!existingRegs.has(regStr)) {
                    const found = foundInBatch.some(f => f.RegNo === regStr);
                    if (!found) batchMisses++;
                }
            }

            if (foundInBatch.length === 0 && batchMisses > 0) {
                consecutiveMisses += batchMisses;
                if (consecutiveMisses >= threshold) {
                    console.log(`  -> >= ${threshold} consecutive misses. Stopping range scan early.`);
                    break;
                }
            } else if (foundInBatch.length > 0) {
                consecutiveMisses = 0;
            }
        }
    }
    return discovered;
}

async function processBranch(session, college, branch, semester, concurrency, ingestExisting, threshold) {
	const csvName = `students_${session}_${college}_${branch}_sem${semester}.csv`;
	const csvPath = join(process.cwd(), "public/data", csvName);
	
	let existingRows = [];
	if (existsSync(csvPath)) {
		existingRows = parseCsv(await readFile(csvPath, "utf-8"));
	}
	const existingRegs = new Set(existingRows.map(r => String(r.RegNo).trim()));
	
	console.log(`\nStarting discovery: Session ${session}, College ${college}, Branch ${branch}, Sem ${semester}`);
	
	const regStart = parseInt(`${session}${branch}${college}001`, 10);
	const regEnd = parseInt(`${session}${branch}${college}150`, 10);
	const newRegulars = await discoverRangeParallel(regStart, regEnd, semester, existingRegs, concurrency, session, ingestExisting, threshold);
	
	const lateralSession = parseInt(session, 10) + 1;
	const latStart = parseInt(`${lateralSession}${branch}${college}901`, 10);
	const latEnd = parseInt(`${lateralSession}${branch}${college}950`, 10);
	const newLaterals = await discoverRangeParallel(latStart, latEnd, semester, existingRegs, concurrency, session, ingestExisting, threshold);
	
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
		await writeFile(csvPath, stringifyCsv(existingRows, ["Session", "RegNo", "Name", "SGPA", "Cur. CGPA"]) + "\n");
		console.log(`Saved! Added ${allNew.length} new students to ${csvName}.`);
	}
}

async function main() {
    try {
        const args = parseArgs(process.argv.slice(2));
        const session = args.session || "23";
        const semester = parseInt(args.semester || "4", 10);
        const concurrency = parseInt(args.concurrency || "8", 10);
        const targetCollege = args.college;
        const useAllCombos = args.all === "true";
        const ingestExisting = args["ingest-existing"] === "true";
        const threshold = parseInt(args.threshold || "25", 10);
        const resume = args.resume === "true";

        console.log(`Job Config: session=${session}, sem=${semester}, resume=${resume}, all=${useAllCombos}`);

        let uniqueCombos = [];
        if (args.college && args.branch) {
            uniqueCombos = [{ college: args.college, branch: args.branch }];
        } else if (useAllCombos) {
            const ALL_COLLEGES = ["107","108","109","110","111","113","117","118","119","122","123","124","125","126","127","128","129","130","131","132","133","134","135","136","139","140","141","142","144","145","146","147","148","149","150","151","152","153","154","155","156","157","158","159","165"];
            const ALL_BRANCHES = ["101", "102", "103", "104", "105", "110"];
            for (const c of ALL_COLLEGES) {
                if (targetCollege && c !== targetCollege) continue;
                for (const b of ALL_BRANCHES) {
                    uniqueCombos.push({ college: c, branch: b });
                }
            }
        } else {
            const files = await readdir(join(process.cwd(), "public/data"));
            const combos = new Set();
            const regex = new RegExp(`^students_${session}_([a-zA-Z0-9]+)_(\\d+)_sem\\d\\.csv$`);
            for (const file of files) {
                const match = file.match(regex);
                if (match) {
                    const college = match[1];
                    const branch = match[2];
                    if (!targetCollege || college === targetCollege) combos.add(`${college}-${branch}`);
                }
            }
            uniqueCombos = Array.from(combos).map(c => {
                const [college, branch] = c.split("-");
                return { college, branch };
            });
        }
        
        uniqueCombos.sort((a, b) => {
            if (a.college === "157" && b.college !== "157") return -1;
            if (b.college === "157" && a.college !== "157") return 1;
            if (a.college === "157" && b.college === "157") {
                return a.branch.localeCompare(b.branch);
            }
            if (a.branch === "105" && b.branch !== "105") return -1;
            if (b.branch === "105" && a.branch !== "105") return 1;
            return a.college.localeCompare(b.college) || a.branch.localeCompare(b.branch);
        });

        if (resume) {
            const dataDir = join(process.cwd(), "public/data");
            const existingFiles = await readdir(dataDir);
            const processedCombos = new Set();
            const fileRegex = new RegExp(`^students_${session}_(\\d+)_(\\d+)_sem${semester}\\.csv$`);
            
            for (const file of existingFiles) {
                const match = file.match(fileRegex);
                if (match) {
                    const content = await readFile(join(dataDir, file), "utf-8");
                    if (content.trim().split("\n").length > 1) {
                        processedCombos.add(`${match[1]}-${match[2]}`);
                    }
                }
            }
            
            console.log(`Resuming: Found ${processedCombos.size} existing CSVs for session ${session} sem ${semester}.`);
            const originalCount = uniqueCombos.length;
            uniqueCombos = uniqueCombos.filter(c => !processedCombos.has(`${c.college}-${c.branch}`));
            console.log(`Filtered ${originalCount - uniqueCombos.length} already done combos. ${uniqueCombos.length} remaining.`);
        }

        console.log(`Starting loop over ${uniqueCombos.length} combinations.`);

        for (const { college, branch } of uniqueCombos) {
            await processBranch(session, college, branch, semester, concurrency, ingestExisting, threshold);
        }
        console.log(`\n✅ Finished mission student discovery for all combos!`);
    } catch (err) {
        console.error("FATAL ERROR in main loop:", err);
        process.exit(1);
    }
}

main().catch(err => {
    console.error("Unhandled promise rejection in main:", err);
    process.exit(1);
});