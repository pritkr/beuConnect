import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { mapLimit, parseArgs } from "./scraper/utils.ts";
import { fetchFullStudentData } from "./scraper/crawler.ts";
import { buildSgpaHistoryString } from "./scraper/merger.ts";
import { pivotResultPayload, computeDenseRanks, type WideRow } from "./scraper/pivot.ts";
import { writeCollegeProfiles } from "./scraper/profiler.ts";
import { writeManifest } from "./scraper/manifest.ts";

async function processBranch(session: string, college: string, branch: string, semester: number, concurrency: number) {
	console.log(`\n🚀 Starting build-data: ${session} | ${college} | ${branch} | Sem ${semester} (Conn: ${concurrency})`);

	const filename = `wide_${session}_${college}_${branch}_sem${semester}.csv`;
	const dataDir = join(process.cwd(), "public", "data");
	const filePath = join(dataDir, filename);

	// Instant Resume Logic: Skip if already exists
	if (existsSync(filePath)) {
		console.log(`⏩ Skipping ${filename} (Already exists)`);
		return;
	}

    const historicSgpaMap = {};

	// ⚡️ "Don't duplicate effort" - Read discovered RegNos from existing students_*.csv pipeline!
	const backupFilename = filename.replace("wide_", "students_");
	const backupFilePath = join(dataDir, backupFilename);
	
	let fetchTasks: string[] = [];
	if (existsSync(backupFilePath)) {
		const backupData = require("fs").readFileSync(backupFilePath, "utf8");
		// Parse CSV intelligently
		const lines = backupData.split("\n").map((l: string) => l.trim()).filter((l: string) => l);
		// Assuming format: Session,RegNo,Name,...
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split(",");
			if (parts.length >= 2 && parts[1]) {
				fetchTasks.push(parts[1].replace(/['"]/g, ""));
			}
		}
		console.log(`📦 Loaded ${fetchTasks.length} highly optimized RegNos from backup ${backupFilename}`);
	} else {
		// Fallback Brute-Force discovery (which duplicates effort & misses laterals)
		const maxStudents = 150;
		for (let i = 1; i <= maxStudents; i++) {
			fetchTasks.push(`${session}${branch}${college}${i.toString().padStart(3, '0')}`);
		}
		console.log(`⚠️ Backup not found. Brute-forcing 150 slots for ${college}-${branch}.`);
	}
    
    let missedSequential = 0;
	// Throttled mapLimit concurrency (e.g. 8)
	const results = await mapLimit(fetchTasks, concurrency, async (regNo) => {
        // Halt chunk if too many failed matches cleanly to optimize speed (only applies to brute-force)
        if (!existsSync(backupFilePath) && missedSequential > 20) return null; 

		const match = await fetchFullStudentData(regNo, semester, session);
		if (match.found && match.data) {
            missedSequential = 0;
			return match.data;
		}
		
        if (!existsSync(backupFilePath)) missedSequential++;
		return null;
	});

	const validPayloads = results.filter(Boolean) as any[];

	if (validPayloads.length === 0) {
		console.log(`⚠️ No results found for ${college}-${branch}`);
		return;
	}

	let subjectMap: Record<string, string> = {};
	const sessionLabel = `20${session}-20${parseInt(session)+4}`;

	// Pivot into Wide Rows
	const wideRows: WideRow[] = validPayloads.map(payload => {
		// Populate dictionary string mapping for frontend column titles
		if (payload.theorySubjects) {
			payload.theorySubjects.forEach((s: any) => { if (s.code) subjectMap[s.code] = s.name; });
		}
		if (payload.practicalSubjects) {
			payload.practicalSubjects.forEach((s: any) => { if (s.code) subjectMap[s.code] = s.name; });
		}

		const sgpaStr = buildSgpaHistoryString(payload.sgpa, historicSgpaMap);
		return pivotResultPayload(payload, sessionLabel, sgpaStr);
	});

	// Ranks
	computeDenseRanks(wideRows, "CGPA", "StateRank");
	computeDenseRanks(wideRows, "CGPA", "CollegeRank"); // Scoped to college since we iterate by college

	// Write Wide_CSV Export
	const cols = Object.keys(wideRows[0]);
	const csvContent = [
		cols.join(","),
		...wideRows.map(row => cols.map(c => row[c] || "").join(","))
	].join("\n");

	if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
	
	writeFileSync(filePath, csvContent);
	console.log(`✅ Exported Wide_CSV: ${filename} (${wideRows.length} rows)`);

	// Mode B Json Profiler currently bypassed per user request
    const wrapper = { [semester.toString()]: wideRows };
	// writeCollegeProfiles(session, college, wrapper);

	// Registration Manifest
	writeManifest(session, branch, semester, college, wideRows[0].CollegeCode, filename, subjectMap);
}

// CLI Execution Context
async function main() {
	const args = parseArgs(process.argv.slice(2));
	const concurrency = parseInt(args.concurrency || "8", 10); // Throttle concurrency to prevent IP Ban from WAF!
	const mode = args.mode || "single"; // "single" or "full"

	console.log(`High-Speed Scraper Initializing... (0ms mapping gap, ${concurrency}x concurrency bounded).`);
	
    // Ensure require polyfills
	// @ts-ignore
    globalThis.require = (m: string) => import(m);

	if (mode === "full") {
		console.log("🔥 Full Exhaustive Mode Triggered! Loading config...");
		const { readFileSync } = await import("fs");
		const { join } = await import("path");
		
		const collegesPath = join(process.cwd(), "src", "data", "colleges.json");
		const configPath = join(process.cwd(), "src", "assets", "data", "config.json");
		
		const colleges = JSON.parse(readFileSync(collegesPath, "utf-8"));
		const config = JSON.parse(readFileSync(configPath, "utf-8"));
		
		// Map out the targeted configuration matrix
		// Map out the targeted configuration matrix tightly requested by user
		const targetCombos = [
			{ session: "22", sem: 5 },
			{ session: "23", sem: 3 },
			{ session: "24", sem: 1 }
		];

		const branches = config.branches.map((b: any) => b.code === "cse" ? "105" : 
					     b.code === "ece" ? "104" : 
					     b.code === "ee" ? "103" : 
					     b.code === "mech" ? "102" : 
					     b.code === "civil" ? "101" : "110");
					     
		const collegeCodes = colleges.map((c: any) => c.CollegeCode);

		console.log(`Matrix: Strictly bounded to latest JSON APIs: ${targetCombos.length} Combos | ${collegeCodes.length} Colleges | ${branches.length} Branches`);
		
		for (const combo of targetCombos) {
			const { session, sem } = combo;
			for (const branch of branches) {
				for (const college of collegeCodes) {
					try {
						await processBranch(session, college, branch, sem, concurrency);
					} catch (err: any) {
						console.error(`❌ Global Loop Error for ${session}-${college}-${branch}-${sem}:`, err.message);
					}
				}
			}
		}
	} else {
		// Single run mode fallback
		const session = args.session || "24";
		const semester = parseInt(args.semester || "2", 10);
		const college = args.college || "157"; // Test college
		const branch = args.branch || "105";
		await processBranch(session, college, branch, semester, concurrency);
	}
	
    console.log("Job Pipeline Complete!");
}

main().catch(console.error);
