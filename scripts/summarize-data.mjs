import { readFile, readdir } from "fs/promises";
import { join } from "path";

async function main() {
    const dataDir = join(process.cwd(), "public", "data");
    const files = await readdir(dataDir);
    const summary = {};

    const allFiles = files.filter(f => f.startsWith("students_") && f.includes("_all_") && f.endsWith(".csv"));

    for (const file of allFiles) {
        const parts = file.replace(".csv", "").split("_");
        // students_{session}_all_{branch}_sem{semester}.csv
        const session = parts[1];
        const branch = parts[3];
        const semester = parts[4].replace("sem", "");

        const content = await readFile(join(dataDir, file), "utf-8");
        const lines = content.trim().split("\n");
        if (lines.length < 2) continue;

        const headers = lines[0].split(",");
        const collegeCodeIdx = headers.indexOf("CollegeCode");
        
        const students = lines.length - 1;
        const collegeCodes = new Set();
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",");
            if (collegeCodeIdx !== -1 && values[collegeCodeIdx]) {
                collegeCodes.add(values[collegeCodeIdx]);
            }
        }

        if (!summary[session]) summary[session] = {};
        if (!summary[session][semester]) summary[session][semester] = {};
        
        summary[session][semester][branch] = {
            students,
            colleges: collegeCodes.size
        };
    }

    console.log("Data Completion Summary (Combined 'all' files):");
    for (const session of Object.keys(summary).sort()) {
        console.log(`\nBatch ${2000 + parseInt(session)}-${2000 + parseInt(session) + 4} (Session ${session}):`);
        for (const semester of Object.keys(summary[session]).sort()) {
            console.log(`  Sem ${semester}:`);
            let totalStudents = 0;
            let branchesFound = 0;
            let collegesRepresented = new Set();
            
            for (const branch of Object.keys(summary[session][semester]).sort()) {
                const data = summary[session][semester][branch];
                totalStudents += data.students;
                branchesFound++;
                // Note: colleges represented might vary by branch, we'll just track the max or total unique
            }
            console.log(`    Total Students: ${totalStudents} across ${branchesFound} branches`);
            // Show details for some branches
            for (const branch of Object.keys(summary[session][semester]).sort()) {
                const data = summary[session][semester][branch];
                console.log(`    - Branch ${branch}: ${data.students} students from ${data.colleges} colleges`);
            }
        }
    }
}

main().catch(console.error);
