import { readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Simple colleges data loader since we can't easily assert json in all environments without flags
async function loadColleges() {
    const path = join(process.cwd(), "src", "data", "colleges.json");
    if (existsSync(path)) {
        return JSON.parse(await readFile(path, "utf-8"));
    }
    return [];
}

function parseCsv(text) {
    const lines = text.trim().split("\n");
    if (lines.length === 0) return [];
    const headers = lines[0].split(",");
    return lines.slice(1).map(line => {
        let inQuotes = false;
        let val = "";
        let values = [];
        for (let char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { values.push(val); val = ""; }
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

async function main() {
    const collegesData = await loadColleges();
    const collegeMap = new Map(collegesData.map(c => [String(c.CollegeCode), c.Name]));
    const dataDir = join(process.cwd(), "public", "data");
    const files = await readdir(dataDir);

    const batches = ["21", "22", "23", "24"];
    const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
    const branches = ["101", "102", "103", "104", "105", "110"];

    for (const session of batches) {
        for (const semester of semesters) {
            for (const branch of branches) {
                const combinedRows = [];
                const seenRegs = new Set();
                
                // Pattern to match: students_{session}_{college}_{branch}_sem{semester}.csv
                // Exclude 'all' files from source to avoid circular merge
                const regex = new RegExp(`^students_${session}_([0-9]+)_${branch}_sem${semester}\\.csv$`);
                const matches = files.filter(f => regex.test(f));

                if (matches.length === 0) continue;

                console.log(`Merging Batch ${session} Sem ${semester} Branch ${branch} (${matches.length} files)...`);

                for (const file of matches) {
                    const matchResult = file.match(regex);
                    const collegeCode = matchResult[1];
                    const collegeName = collegeMap.get(collegeCode) || "Unknown College";
                    const content = await readFile(join(dataDir, file), "utf-8");
                    const rows = parseCsv(content);

                    for (const row of rows) {
                        const regNo = String(row.RegNo || "").trim();
                        if (regNo && !seenRegs.has(regNo)) {
                            seenRegs.add(regNo);
                            combinedRows.push({
                                ...row,
                                CollegeCode: collegeCode,
                                CollegeName: collegeName
                            });
                        }
                    }
                }

                if (combinedRows.length > 0) {
                    // Standard headers + college info
                    const baseHeaders = ["Session", "RegNo", "Name", "SGPA", "Cur. CGPA"];
                    const outputHeaders = [...baseHeaders, "CollegeCode", "CollegeName"];
                    
                    combinedRows.sort((a, b) => {
                        const cgpaA = parseFloat(a["Cur. CGPA"] || a["CGPA"] || "0") || 0;
                        const cgpaB = parseFloat(b["Cur. CGPA"] || b["CGPA"] || "0") || 0;
                        if (cgpaB !== cgpaA) return cgpaB - cgpaA;
                        return String(a.RegNo).localeCompare(String(b.RegNo));
                    });

                    const outputFilename = `students_${session}_all_${branch}_sem${semester}.csv`;
                    await writeFile(join(dataDir, outputFilename), stringifyCsv(combinedRows, outputHeaders) + "\n");
                    console.log(`  -> Saved ${combinedRows.length} students to ${outputFilename}`);
                }
            }
        }
    }
    console.log("\n✅ All merges complete!");
}

main().catch(console.error);