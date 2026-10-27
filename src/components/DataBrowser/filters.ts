// filters.ts
// Handles downloading the manifest/index.json and populating the dropdown selectors.
// The manifest index maps: { batch: { branch: [ "batch/branch/semN_collegeCode.json", ... ] } }
// We parse the paths to extract available semesters and college codes.

export interface AppState {
    batch: string;
    branch: string;
    semester: string;
    college: string;
    isAllColleges: boolean;
}

export interface ManifestNode {
    [batch: string]: {
        [branch: string]: string[];
    };
}

let manifestData: ManifestNode = {};

// Constants mapped from legacy configs
const BRANCH_MAP: Record<string, string> = {
    "105": "Computer Science & Engineering",
    "104": "Electronics & Communication Engg",
    "103": "Electrical Engineering",
    "102": "Mechanical Engineering",
    "101": "Civil Engineering",
    "110": "Electrical & Electronics Engg",
    "161": "EEE (Specialization)"
};

// We will fetch the actual colleges from the original config to resolve names
let collegeNames: Record<string, string> = {};

export async function initFilters(onFilterSubmit: (state: AppState) => void) {
    const dbBatch = document.getElementById("dbBatch") as HTMLSelectElement;
    const dbBranch = document.getElementById("dbBranch") as HTMLSelectElement;
    const dbSemester = document.getElementById("dbSemester") as HTMLSelectElement;
    const dbCollege = document.getElementById("dbCollege") as HTMLSelectElement;
    const dbForm = document.getElementById("dbFilterForm") as HTMLFormElement;

    // Load College Names config
    try {
        const fetchColleges = await fetch('/src/data/colleges.json').then(r => r.json());
        for (const col of fetchColleges) {
            collegeNames[col.CollegeCode] = col.Name;
        }
    } catch(e) {
        console.warn("Could not load college names", e);
    }

    // Load Manifest
    try {
        // Cache bust the manifest request
        const res = await fetch(`/data/manifest/index.json?v=${Date.now()}`);
        manifestData = await res.json();
    } catch(e) {
        console.error("Failed to load manifest", e);
        return;
    }

    // Populate Batches
    const batches = Object.keys(manifestData).sort((a,b) => parseInt(b) - parseInt(a));
    dbBatch.innerHTML = batches.map(b => `<option value="${b}">Batch 20${b}</option>`).join("");
    dbBatch.disabled = false;

    // Trigger cascading updates
    dbBatch.addEventListener("change", () => updateBranches());
    dbBranch.addEventListener("change", () => updateCollegeOptions());
    dbSemester.addEventListener("change", () => submitFilters());
    dbCollege.addEventListener("change", () => submitFilters());

    // Populate Initial
    updateBranches();

    function updateBranches() {
        const batch = dbBatch.value;
        const branches = manifestData[batch] ? Object.keys(manifestData[batch]).sort() : [];
        dbBranch.innerHTML = branches.map(b => `<option value="${b}">${BRANCH_MAP[b] || b}</option>`).join("");
        dbBranch.disabled = false;
        
        updateCollegeOptions();
    }

    function updateCollegeOptions() {
        const batch = dbBatch.value;
        const branch = dbBranch.value;
        const paths = manifestData[batch]?.[branch] || [];

        // Paths look like: "21/105/sem8_157.json"
        // We derive unique Semesters and Colleges from these paths
        const colSet = new Set<string>();
        const semSet = new Set<number>();

        paths.forEach(p => {
            const matches = p.match(/sem(\d+)_(\w+)\.json/);
            if (matches) {
                semSet.add(parseInt(matches[1], 10));
                colSet.add(matches[2]);
            }
        });

        const sortedSems = Array.from(semSet).sort((a,b) => b - a); // Highest sem first
        dbSemester.innerHTML = sortedSems.map(s => `<option value="${s}">Sem ${s}</option>`).join("");
        dbSemester.disabled = false;

        const sortedCols = Array.from(colSet).sort();
        dbCollege.innerHTML = `<option value="all">🏫 All Colleges (Combined)</option>` + 
                              sortedCols.map(c => `<option value="${c}">${collegeNames[c] || 'College '+c}</option>`).join("");
        dbCollege.disabled = false;

        submitFilters();
    }

    function submitFilters() {
        if (!dbBatch.value || !dbBranch.value || !dbSemester.value || !dbCollege.value) return;
        
        onFilterSubmit({
            batch: dbBatch.value,
            branch: dbBranch.value,
            semester: dbSemester.value,
            college: dbCollege.value,
            isAllColleges: dbCollege.value === "all"
        });
    }
}
