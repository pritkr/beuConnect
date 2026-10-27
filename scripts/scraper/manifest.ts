import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

interface ManifestSlice {
	filename: string;
	lastScraped: number;
	collegeName: string;
	columnWidths: Record<string, number>;
	subjectMap: Record<string, string>;
}

export function writeManifest(
	batch: string,
	branch: string,
	semester: number,
	collegeCode: string,
	collegeName: string,
	filename: string,
	subjectMap: Record<string, string>
) {
	const manifestDir = join(process.cwd(), "public", "data", "manifest", batch, branch);
	if (!existsSync(manifestDir)) {
		mkdirSync(manifestDir, { recursive: true });
	}

	const slicePath = join(manifestDir, `sem${semester}_${collegeCode}.json`);

	// We'll estimate column widths here heuristically
	const columnWidths: Record<string, number> = {
		Session: 60,
		RegNo: 110,
		Name: 180,
		SGPA: 50,
		CGPA: 50,
		StateRank: 65,
		CollegeRank: 75,
		FailAny: 80,
		SGPA_History: 110
	};

	for (const code of Object.keys(subjectMap)) {
		columnWidths[`${code}_ESE`] = 50;
		columnWidths[`${code}_IA`] = 50;
		columnWidths[`${code}_Total`] = 50;
		columnWidths[`${code}_Grade`] = 60;
	}

	const slice: ManifestSlice = {
		filename,
		lastScraped: Date.now(),
		collegeName,
		columnWidths,
		subjectMap
	};

	writeFileSync(slicePath, JSON.stringify(slice));
	
	// Ensure index.json is updated
	updateManifestIndex(batch, branch, semester, collegeCode);
}

function updateManifestIndex(batch: string, branch: string, semester: number, collegeCode: string) {
	const indexDir = join(process.cwd(), "public", "data", "manifest");
	const indexPath = join(indexDir, "index.json");
	
	let index: any = {};
	if (existsSync(indexPath)) {
		try { index = JSON.parse(require("fs").readFileSync(indexPath, "utf-8")); } catch(e){}
	}
	
	if (!index[batch]) index[batch] = {};
	if (!index[batch][branch]) index[batch][branch] = [];
	
	const pathKey = `${batch}/${branch}/sem${semester}_${collegeCode}.json`;
	if (!index[batch][branch].includes(pathKey)) {
		index[batch][branch].push(pathKey);
	}
	
	writeFileSync(indexPath, JSON.stringify(index));
}
