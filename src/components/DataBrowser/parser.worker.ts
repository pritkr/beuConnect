// Define strict types for the messages
export type WorkerRequest =
    | { type: "LOAD_CSV"; payload: string }
    | { type: "SEARCH"; payload: string }
    | { type: "SORT"; payload: { by: string; direction: "asc" | "desc" } };

export type WorkerResponse =
    | { type: "DATA_LOADED"; payload: { columns: string[]; rowCount: number; initialIndices: number[] } }
    | { type: "SEARCH_RESULTS"; payload: number[] }
    | { type: "SORT_RESULTS"; payload: number[] }
    | { type: "ERROR"; payload: string };

// In-Worker memory isolate state
let columns: string[] = [];
let matrix: string[][] = []; // Array of rows, where each row is an array of cells
let currentSearchIndices: number[] = [];

// Super-fast RFC-4180 strict CSV Parser to prevent any split(',') bugs with internal quotes
function parseRFC4180(text: string): string[][] {
    const result: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;
    
    // Unrolling for loop slightly to avoid excessive closures
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && text[i + 1] === '"') {
                // Escaped double quote ""
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = "";
        } else if (char === '\n' && !inQuotes) {
            // Strip potential \r
            if (currentCell.endsWith('\r')) {
                currentCell = currentCell.slice(0, -1);
            }
            currentRow.push(currentCell.trim());
            result.push(currentRow);
            currentRow = [];
            currentCell = "";
        } else if (char === '\r' && !inQuotes) {
            // Ignored, handled by \n
        } else {
            currentCell += char;
        }
    }
    
    // Add the very last cell/row if EOF doesn't end in newline
    if (currentCell || currentRow.length > 0) {
        if (currentCell.endsWith('\r')) currentCell = currentCell.slice(0, -1);
        currentRow.push(currentCell.trim());
        result.push(currentRow);
    }
    
    return result;
}

// Optimized Search utilizing native string properties
function filterRows(query: string): number[] {
    if (!query) return Array.from({ length: matrix.length }, (_, i) => i);
    
    const searchStr = query.toLowerCase();
    const results: number[] = [];
    const nameColIdx = columns.indexOf("Name");
    const regColIdx = columns.indexOf("RegNo");
    
    // Only search specific hot columns instead of joining the entire row array (saves thousands of allocations)
    for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i];
        let matches = false;
        if (nameColIdx !== -1 && row[nameColIdx]?.toLowerCase().includes(searchStr)) matches = true;
        if (!matches && regColIdx !== -1 && row[regColIdx]?.toLowerCase().includes(searchStr)) matches = true;
        
        if (matches) results.push(i);
    }
    
    return results;
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
    const data = event.data;
    switch (data.type) {
        case "LOAD_CSV": {
            try {
                const rawParsed = parseRFC4180(data.payload);
                if (rawParsed.length === 0) {
                    throw new Error("CSV was entirely empty");
                }
                
                columns = rawParsed[0];
                matrix = rawParsed.slice(1);
                currentSearchIndices = Array.from({ length: matrix.length }, (_, i) => i);
                
                self.postMessage({
                    type: "DATA_LOADED",
                    payload: {
                        columns,
                        rowCount: matrix.length,
                        initialIndices: currentSearchIndices
                    }
                } as WorkerResponse);
            } catch (err: any) {
                self.postMessage({ type: "ERROR", payload: err.message } as WorkerResponse);
            }
            break;
        }
        case "SEARCH": {
            currentSearchIndices = filterRows(data.payload);
            self.postMessage({
                type: "SEARCH_RESULTS",
                payload: currentSearchIndices
            } as WorkerResponse);
            break;
        }
        case "SORT": {
            const { by, direction } = data.payload;
            const colIdx = columns.indexOf(by);
            if (colIdx === -1) {
                // If invalid column, return current indices unchanged
                self.postMessage({ type: "SORT_RESULTS", payload: currentSearchIndices } as WorkerResponse);
                return;
            }

            const GRADE_WEIGHTS: Record<string, number> = {
                "O": 100, "A+": 90, "A": 85, "B+": 80, "B": 70, 
                "C": 60, "D": 50, "P": 40, "F": 10, "AB": 0, "NA": -1
            };
            
            // Map indices for stable parallel sorting, modifying the currentSearch array in place conceptually
            currentSearchIndices.sort((aIdx, bIdx) => {
                const aVal = matrix[aIdx][colIdx] || "";
                const bVal = matrix[bIdx][colIdx] || "";
                
                // Try numeric sort first if they look purely numeric
                const numA = parseFloat(aVal);
                const numB = parseFloat(bVal);
                if (!isNaN(numA) && !isNaN(numB) && aVal.trim().match(/^-?\d*\.?\d+$/)) {
                    return direction === "asc" ? numA - numB : numB - numA;
                }

                // Try semantic grade sort if they map exactly to grades
                if (by.endsWith("_Grade") || (GRADE_WEIGHTS[aVal.toUpperCase()] !== undefined && GRADE_WEIGHTS[bVal.toUpperCase()] !== undefined)) {
                    const weightA = GRADE_WEIGHTS[aVal.toUpperCase()] ?? -2;
                    const weightB = GRADE_WEIGHTS[bVal.toUpperCase()] ?? -2;
                    return direction === "asc" ? weightA - weightB : weightB - weightA;
                }
                
                // Fallback to strict string locale grading
                return direction === "asc"
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            });
            
            self.postMessage({
                type: "SORT_RESULTS",
                payload: currentSearchIndices
            } as WorkerResponse);
            break;
        }
    }
});
