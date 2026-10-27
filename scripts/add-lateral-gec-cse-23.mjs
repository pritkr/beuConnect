import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

function parseCsv(text) {
    const lines = text.trim().split("\n");
    if (lines.length === 0) return [];
    const headers = lines[0].split(",");
    return lines.slice(1).map(line => {
        const values = line.split(",");
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
            let val = String(row[h] || "");
            if (val.includes(",")) val = `"${val}"`;
            return val;
        }).join(","))
    ].join("\n");
}

async function fetchResult(regNo) {
    const url = `http://localhost:4321/api/result?format=json&reg=${regNo}&sem=4`;
    for(let i=0; i<3; i++) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.status === 200 && data.data) {
                return data.data;
            }
            if (data.status === 404) return null;
        } catch(e) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}

async function main() {
    const jsonPath = join(process.cwd(), "guardianno", "masked_all.json");
    const csvPath = join(process.cwd(), "public", "data", "students_23_157_105_sem4.csv");
    
    const studentsData = JSON.parse(await readFile(jsonPath, "utf-8"));
    const batch23Students = studentsData.filter(s => s.batch === "2K23");
    
    let existingRows = [];
    if (existsSync(csvPath)) {
        existingRows = parseCsv(await readFile(csvPath, "utf-8"));
    }
    
    const existingRegs = new Set(existingRows.map(r => String(r.RegNo).trim()));
    
    let added = 0;
    for (const student of batch23Students) {
        const regNo = String(student.registration_no);
        if (existingRegs.has(regNo)) {
            // console.log(`Already exists: ${regNo}`);
            continue;
        }
        
        console.log(`Fetching missing student: ${regNo} (${student.name})...`);
        const result = await fetchResult(regNo);
        
        let sgpa = "N/A";
        let cgpa = "N/A";
        
        if (result) {
            sgpa = (result.sgpa && result.sgpa[3] && result.sgpa[3] !== "-") ? result.sgpa[3] : "N/A";
            cgpa = result.cgpa || "N/A";
        } else {
            console.log(`  -> Result not found for ${regNo}`);
        }
        
        existingRows.push({
            Session: "2023-2027",
            RegNo: regNo,
            Name: String(student.name || "").toUpperCase(),
            SGPA: String(sgpa),
            "Cur. CGPA": String(cgpa)
        });
        added++;
        await new Promise(r => setTimeout(r, 200));
    }
    
    existingRows.sort((a, b) => String(a.RegNo).localeCompare(String(b.RegNo)));
    await writeFile(csvPath, stringifyCsv(existingRows) + "\n");
    console.log(`Done. Added ${added} students.`);
}

main().catch(console.error);
