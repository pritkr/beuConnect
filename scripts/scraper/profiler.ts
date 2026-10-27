import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { WideRow } from "./pivot.js";

interface SemesterProfileRecord {
	SGPA: string;
	CGPA: string;
	FailAny: string;
	[subjectSlug: string]: any; 
	// To compress, we will just store grades or total marks if required, 
	// but the spec dictates full profile details for past semesters.
}

interface StudentProfile {
	RegNo: string;
	Name: string;
	SGPA_History: string; 
	History: Record<string, SemesterProfileRecord>; // keys are semester numbers "1", "2", etc.
}

export function writeCollegeProfiles(
	batch: string,
	collegeCode: string,
	rowsBySem: Record<string, WideRow[]>
) {
	const profilesDir = join(process.cwd(), "public", "data", "profiles");
	if (!existsSync(profilesDir)) {
		mkdirSync(profilesDir, { recursive: true });
	}

	const masterMap = new Map<string, StudentProfile>();

	// Iterate over all semesters to build the aggregated JSON
	for (const [semStr, rows] of Object.entries(rowsBySem)) {
		for (const row of rows) {
			if (row.CollegeCode !== collegeCode) continue;

			if (!masterMap.has(row.RegNo)) {
				masterMap.set(row.RegNo, {
					RegNo: row.RegNo,
					Name: row.Name,
					SGPA_History: row.SGPA_History, // Takes the most recent SGPA_History computed
					History: {}
				});
			}

			const record = masterMap.get(row.RegNo)!;
			// Replace with latest SGPA History if available
			if (row.SGPA_History && row.SGPA_History.length > 5 && !row.SGPA_History.startsWith("-|-")) {
				record.SGPA_History = row.SGPA_History;
			}

			// Extract Subject Keys
			const semData: SemesterProfileRecord = {
				SGPA: row.SGPA,
				CGPA: row.CGPA,
				FailAny: row.FailAny,
			};

			const keys = Object.keys(row);
			for (const key of keys) {
				if (key.includes("_Grade") || key.includes("_Total") || key.includes("_ESE") || key.includes("_IA")) {
					semData[key] = row[key];
				}
			}

			record.History[semStr] = semData;
		}
	}

	// Output
	const outPath = join(profilesDir, `profiles_${batch}_${collegeCode}.json`);
	const payload = Object.fromEntries(masterMap);
	writeFileSync(outPath, JSON.stringify(payload));
	console.log(`✅ Wrote Profile Index: ${outPath} (${masterMap.size} students)`);
}
