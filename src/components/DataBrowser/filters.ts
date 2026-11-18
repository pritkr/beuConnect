// filters.ts
// Handles downloading the manifest/index.json and populating the dropdown selectors.
// The manifest index maps: { batch: { branch: [ "batch/branch/semN_collegeCode.json", ... ] } }
// We parse the paths to extract available semesters and college codes.

import { getProfile } from "../../utils/profileManager";

/** GEC Sheikhpura — the college this site is built for, and the default scope. */
const HOME_COLLEGE = "157";

/**
 * The student's own college first, then GEC Sheikhpura, then the rest A–Z.
 * A code the manifest does not carry is never invented.
 */
export function orderColleges(codes: string[], preferred: string): string[] {
    const head = [preferred, HOME_COLLEGE]
        .filter((code, index, all) => !!code && codes.includes(code) && all.indexOf(code) === index);
    return [...head, ...codes.filter((code) => !head.includes(code)).sort()];
}

/** The first candidate the list actually carries — a kept value, then the profile's, then the first. */
export function pickFirst<T>(candidates: Array<T | undefined | "">, options: T[]): T | undefined {
    return candidates.find((value): value is T =>
        value !== undefined && value !== "" && options.includes(value as T));
}

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
    const dbBatch = document.getElementById("dbBatch") as unknown as HTMLSelectElement;
    const dbBranch = document.getElementById("dbBranch") as unknown as HTMLSelectElement;
    const dbSemester = document.getElementById("dbSemester") as unknown as HTMLSelectElement;
    const dbCollege = document.getElementById("dbCollege") as unknown as HTMLSelectElement;
    const dbForm = document.getElementById("dbFilterForm") as unknown as HTMLFormElement;

    // Load College Names config
    try {
        const fetchColleges = (await fetch('/src/data/colleges.json').then((r) => r.json())) as Array<{
            CollegeCode: string;
            Name: string;
        }>;
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

    // A saved registration number decides what opens: its batch, branch,
    // semester and college. Without one, GEC Sheikhpura still leads.
    const profile = getProfile();

    // Populate Batches
    const batches = Object.keys(manifestData).sort((a,b) => parseInt(b) - parseInt(a));
    dbBatch.innerHTML = batches.map(b => `<option value="${b}">Batch 20${b}</option>`).join("");
    const savedBatch = profile?.batchYear ? String(profile.batchYear).slice(-2) : "";
    dbBatch.value = pickFirst([savedBatch, batches[0]], batches) ?? "";
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
        const previous = dbBranch.value;
        dbBranch.innerHTML = branches.map(b => `<option value="${b}">${BRANCH_MAP[b] || b}</option>`).join("");
        dbBranch.value = pickFirst([previous, profile?.branchCode || "", branches[0]], branches) ?? "";
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

        const previousSem = parseInt(dbSemester.value, 10);
        const sortedSems = Array.from(semSet).sort((a,b) => b - a); // Highest sem first
        const sem = pickFirst([previousSem, profile?.currentSem, sortedSems[0]], sortedSems);
        dbSemester.innerHTML = sortedSems.map(s => `<option value="${s}">Sem ${s}</option>`).join("");
        if (sem !== undefined) dbSemester.value = String(sem);
        dbSemester.disabled = false;

        // The student's college leads, then GEC Sheikhpura, then the rest A–Z.
        const ordered = orderColleges(Array.from(colSet), profile?.collegeCode || "");

        const previousCollege = dbCollege.value;
        dbCollege.innerHTML = ordered.map(c => `<option value="${c}">${collegeNames[c] || 'College '+c}</option>`).join("") +
                              `<option value="all">All colleges</option>`;
        dbCollege.value = pickFirst([previousCollege, ordered[0], "all"], [...ordered, "all"]) ?? "all";
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
