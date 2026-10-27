// DataBrowser.ts
// Main Orchestrator for Phase 1 Initial SSG & Shell Layouts

import { initFilters, type AppState } from "./filters.ts";
import { VirtualTable } from "./table.ts";
import type { WorkerRequest, WorkerResponse } from "./parser.worker.ts";
import { openProfileView, closeProfileView } from "./profile.ts";

let worker: Worker;
let tableRender: VirtualTable;

// State handles for the worker payload
let currentColumns: string[] = [];
let activeIndices: number[] = [];
let matrixCache: string[][] = []; // Lightweight mirror copy, strictly just strings. Fast in JS.

export function initDataBrowser() {
    const loadingUI = document.getElementById("dbLoading")!;
    const errorUI = document.getElementById("dbError")!;
    const exportBtn = document.getElementById("dbExportBtn") as HTMLButtonElement;
    const searchInput = document.getElementById("dbSearch") as HTMLInputElement;
    const dbSortBy = document.getElementById("dbSortBy") as HTMLSelectElement;
    const dbSortDir = document.getElementById("dbSortDir") as HTMLSelectElement;

    // 1. Initialize Web Worker via Vite query
    worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const data = event.data;
        if (data.type === "ERROR") {
            errorUI.style.display = "block";
            errorUI.textContent = "Data Error: " + data.payload;
            loadingUI.style.display = "none";
            return;
        }

        if (data.type === "DATA_LOADED") {
            currentColumns = data.payload.columns;
            activeIndices = data.payload.initialIndices;
            
            // Build the Native Virtualizer
            tableRender.initData(currentColumns, activeIndices.length);
            
            loadingUI.style.display = "none";
            exportBtn.disabled = false;
            searchInput.disabled = false;
            dbSortBy.disabled = false;
            dbSortDir.disabled = false;
        }

        if (data.type === "SEARCH_RESULTS" || data.type === "SORT_RESULTS") {
            activeIndices = data.payload;
            tableRender.updateData(activeIndices.length); // Trigger re-render instantly!
        }
    };

    // 2. Initialize Table engine
    tableRender = new VirtualTable("dbTableContainer", 
        (colKey, direction) => {
            // Send SORT to Worker
            worker.postMessage({ type: "SORT", payload: { by: colKey, direction } } as WorkerRequest);
        },
        (startIndex, endIndex) => {
            // Pure string builder loop. Extremely fast!
            let htmlChunks = [];
            
            // Re-use logic: we only render visible columns mapped mathematically
            const visibleIdxs = currentColumns.map((col, i) => {
                if (col.includes("_ESE") || col.includes("_IA") || col.includes("_Total")) return -1;
                if (col === "Type" || col === "MonthYear" || col === "ExamYear") return -1;
                return i;
            }).filter(i => i !== -1);

            for (let i = startIndex; i <= endIndex; i++) {
                const matrixRowId = activeIndices[i];
                if (matrixRowId === undefined) continue;

                const rowStrings = matrixCache[matrixRowId];
                if (!rowStrings) continue;

                // Color Grade semantics dynamically
                let cssClass = "";
                const sgpaText = rowStrings[currentColumns.indexOf("SGPA")] || "";
                if (sgpaText.includes("FAIL")) cssClass = "grade-row-f";
                else if (parseFloat(sgpaText) >= 8.5) cssClass = "grade-row-o";
                else cssClass = "grade-row-default";

                let rowHtml = `<tr class="${cssClass}" data-idx="${matrixRowId}" style="cursor: pointer;">`;
                for (const colArrayRawIdx of visibleIdxs) {
                    const colName = currentColumns[colArrayRawIdx];
                    const val = rowStrings[colArrayRawIdx] || "";
                    
                    let cellStyles = "";
                    if (colName === "RegNo" || colName === "Name") {
                        cellStyles = "class='sticky-col'";
                        if (colName === "Name") cellStyles += " style='left: 100px;'";
                    }
                    
                    rowHtml += `<td ${cellStyles}>${val}</td>`;
                }
                rowHtml += `</tr>`;
                htmlChunks.push(rowHtml);
            }
            return htmlChunks.join("");
        }
    );

    // 2.5 Attach Event Delegator for Profile Drill-Down (Mode B)
    
    document.getElementById("dbTbody")!.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const tr = target.closest("tr[data-idx]");
        if (!tr) return;
        
        const matrixId = parseInt(tr.getAttribute("data-idx") || "-1");
        if (matrixId === -1) return;
        
        const rowStrings = matrixCache[matrixId];
        const state = currentFilterState; // Assuming we saved state from filters

        openProfileView({
            regNo: rowStrings[currentColumns.indexOf("RegNo")] || "",
            name: rowStrings[currentColumns.indexOf("Name")] || "",
            cgpa: rowStrings[currentColumns.indexOf("CGPA")] || "",
            rank: rowStrings[currentColumns.indexOf("CollegeRank")] || "",
            sgpaStr: rowStrings[currentColumns.indexOf("SGPA_History")] || "",
            batch: state?.batch || "24",
            college: state?.isAllColleges ? (rowStrings[currentColumns.indexOf("CollegeCode")] || state.college) : state!.college
        });
    });

    document.getElementById("dbCloseProfileBtn")!.addEventListener("click", () => {
        closeProfileView();
    });

    // Phase 5: Export CSV implementation
    exportBtn.addEventListener("click", () => {
        if (activeIndices.length === 0) return;
        
        let headerRow = currentColumns.join(",");
        let csvLines = [headerRow];
        
        for (const idx of activeIndices) {
            const rowArr = matrixCache[idx];
            if (!rowArr) continue;
            // Re-escape and wrap commas
            const escaped = rowArr.map(colText => {
                const text = colText || "";
                if (text.includes(",") || text.includes('"') || text.includes("\n")) {
                    return `"${text.replace(/"/g, '""')}"`;
                }
                return text;
            });
            csvLines.push(escaped.join(","));
        }
        
        const blob = new Blob([csvLines.join("\n")], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `beuconnect_export_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // 3. Initiate Filter Subsystem (which grabs the JSON manifest and builds dropdowns)
    let currentFilterState: AppState | null = null;
    initFilters((state) => {
        currentFilterState = state;
        // Triggered when dropdowns change and are fully selected
        fetchTargetData(state);
    });

    // 4. Attach Listeners
    searchInput.addEventListener("input", (e) => {
        const val = (e.target as HTMLInputElement).value;
        worker.postMessage({ type: "SEARCH", payload: val } as WorkerRequest);
    });

    const triggerSort = () => {
        worker.postMessage({ type: "SORT", payload: { by: dbSortBy.value, direction: dbSortDir.value } } as WorkerRequest);
    };
    dbSortBy.addEventListener("change", triggerSort);
    dbSortDir.addEventListener("change", triggerSort);

    // File Fetcher bounded to state
    async function fetchTargetData(state: AppState) {
        loadingUI.style.display = "flex";
        errorUI.style.display = "none";
        document.getElementById("dbTableContainer")!.style.display = "none";

        try {
            let rawCSV: string;

            if (state.isAllColleges) {
                // "All Colleges" combined view: fetch all per-college CSVs and merge them
                rawCSV = await fetchAndMergeAllColleges(state);
            } else {
                const filename = `wide_${state.batch}_${state.college}_${state.branch}_sem${state.semester}.csv`;
                const resp = await fetch(`/data/${filename}`);
                if (!resp.ok) throw new Error("Data not generated or missing from server.");
                rawCSV = await resp.text();
            }

            if (!rawCSV || rawCSV.trim().split("\n").length <= 1) {
                throw new Error("No student data found for this combination.");
            }

            matrixCache = parseNativeCache(rawCSV);
            worker.postMessage({ type: "LOAD_CSV", payload: rawCSV } as WorkerRequest);
            
        } catch(err: any) {
            loadingUI.style.display = "none";
            errorUI.style.display = "block";
            errorUI.textContent = "Download Error: " + err.message;
        }
    }

    // Fetch ALL per-college CSVs for a batch+branch+semester and merge into one giant CSV
    async function fetchAndMergeAllColleges(state: AppState): Promise<string> {
        // Discover available college codes from the manifest-derived college list in the filter
        const dbCollege = document.getElementById("dbCollege") as HTMLSelectElement;
        const collegeCodes: string[] = [];
        for (let i = 0; i < dbCollege.options.length; i++) {
            const val = dbCollege.options[i].value;
            if (val && val !== "all") collegeCodes.push(val);
        }

        if (collegeCodes.length === 0) {
            throw new Error("No colleges found in manifest for this combination.");
        }

        let headerLine = "";
        const allDataLines: string[] = [];
        let successCount = 0;

        // Fetch all college CSVs in parallel (max ~30 concurrent, browser handles it)
        const fetches = collegeCodes.map(async (code) => {
            const filename = `wide_${state.batch}_${code}_${state.branch}_sem${state.semester}.csv`;
            try {
                const resp = await fetch(`/data/${filename}`);
                if (!resp.ok) return null;
                return await resp.text();
            } catch {
                return null;
            }
        });

        const results = await Promise.all(fetches);

        for (const csvText of results) {
            if (!csvText) continue;
            const lines = csvText.split(/\r?\n/).filter(l => l.trim());
            if (lines.length === 0) continue;

            // Use the header from the first successful CSV
            if (!headerLine) {
                headerLine = lines[0];
            }

            // Add all data rows (skip header)
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    allDataLines.push(lines[i]);
                }
            }
            successCount++;
        }

        if (successCount === 0) {
            throw new Error("No college data found for this batch/branch/semester combination.");
        }

        console.log(`📦 Merged ${successCount} college CSVs → ${allDataLines.length} total students`);
        return headerLine + "\n" + allDataLines.join("\n");
    }
}

// Local lightweight parallel parser
function parseNativeCache(text: string): string[][] {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    // We can assume the scraper cleanly formats without embedded newlines, though we strictly parsed in Worker.
    return lines.slice(1).map(l => {
        if (!l.includes('"')) return l.split(',');
        // Quick regex array match for CSV strings
        const matches = l.match(/(\".*?\"|[^",\s]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(s => s.replace(/^"|"$/g, '')) : [];
    });
}
