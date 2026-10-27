// profile.ts
// Handles Mode B Drill-Down routing and view generation

export function openProfileView(
    data: {
        regNo: string,
        name: string,
        cgpa: string,
        rank: string,
        sgpaStr: string,
        batch: string,
        college: string
    }
) {
    const tableContainer = document.getElementById("dbTableContainer")!;
    const profileContainer = document.getElementById("dbProfileContainer")!;
    const filterForm = document.getElementById("dbFilterForm") as HTMLFormElement;

    // 1. Swap Views
    tableContainer.style.display = "none";
    profileContainer.style.display = "block";
    
    // Dim the filters to indicate focus
    filterForm.style.opacity = "0.5";
    filterForm.style.pointerEvents = "none";

    // 2. Populate Header
    document.getElementById("pfName")!.textContent = data.name;
    document.getElementById("pfReg")!.textContent = data.regNo;
    document.getElementById("pfCgpa")!.textContent = data.cgpa || "N/A";
    document.getElementById("pfRank")!.textContent = data.rank ? `#${data.rank}` : "N/A";

    // 3. Draw CSS Sparkline immediately
    drawSparkline(data.sgpaStr);

    // 4. Handle history details lazy loading
    const detailsWrap = document.getElementById("pfHistoryDetails") as HTMLDetailsElement;
    const historyContent = document.getElementById("pfHistoryContent")!;
    const historyLoading = document.getElementById("pfHistoryLoading")!;
    const historyError = document.getElementById("pfHistoryError")!;
    
    // Reset state
    detailsWrap.open = false;
    historyContent.innerHTML = "";
    historyLoading.style.display = "none";
    historyError.style.display = "none";

    // Setup one-time loader listener
    const onOpen = async () => {
        if (!detailsWrap.open) return;
        detailsWrap.removeEventListener("toggle", onOpen); // Fire exactly once

        historyLoading.style.display = "block";
        
        try {
            // Using JSON profiler dictionary
            const res = await fetch(`/data/profiles/profiles_${data.batch}_${data.college}.json`);
            if (!res.ok) throw new Error("Historic profiling data not generated for this college batch yet.");
            
            const profileJson = await res.json();
            renderHistoricalRecords(profileJson, data.regNo);
            
            historyLoading.style.display = "none";
        } catch (e: any) {
            historyLoading.style.display = "none";
            historyError.style.display = "block";
            historyError.textContent = e.message;
        }
    };
    detailsWrap.addEventListener("toggle", onOpen);

    // Push State for Android Back Button routing
    history.pushState({ mode: "profile", reg: data.regNo }, "", `#profile-${data.regNo}`);
}

export function closeProfileView() {
    const tableContainer = document.getElementById("dbTableContainer")!;
    const profileContainer = document.getElementById("dbProfileContainer")!;
    const filterForm = document.getElementById("dbFilterForm") as HTMLFormElement;

    profileContainer.style.display = "none";
    tableContainer.style.display = "block";

    filterForm.style.opacity = "1";
    filterForm.style.pointerEvents = "auto";
    
    // Clear hash cleanly
    history.replaceState({}, "", location.pathname + location.search);
}

// ---------------------------------------------------------
// Internal Rendering Logic
// ---------------------------------------------------------

function drawSparkline(sgpaStr: string) {
    const box = document.getElementById("pfSparkline")!;
    if (!sgpaStr || sgpaStr === "null" || sgpaStr.replace(/,/g, "") === "") {
        box.innerHTML = "<small>No History</small>";
        return;
    }

    const marks = sgpaStr.split(",");
    
    // We render 8 CSS bars
    let html = `<div style="display:flex; align-items:flex-end; gap: 4px; height: 30px; margin-top: 5px;">`;
    
    marks.forEach((m, idx) => {
        if (!m || m.trim() === "") {
            // Empty semantic
            html += `<div style="width: 15px; height: 2px; background: var(--pico-muted-border-color);" title="Sem ${idx+1}: N/A"></div>`;
            return;
        }
        
        const val = parseFloat(m);
        // Fail or invalid
        if (isNaN(val) || m.includes("FAIL") || val < 4) {
             html += `<div style="width: 15px; height: 5px; background: var(--pico-del-color);" title="Sem ${idx+1}: FAIL"></div>`;
             return;
        }

        const heightPct = Math.max(10, (val / 10) * 100);
        let color = "var(--pico-primary-background)";
        if (val >= 9.0) color = "#10b981"; // O grade
        if (val < 6.0) color = "#f59e0b"; // Boundary

        html += `<div style="width: 15px; height: ${heightPct}%; background: ${color}; border-radius: 2px 2px 0 0;" title="Sem ${idx+1}: ${val}"></div>`;
    });

    html += `</div>`;
    box.innerHTML = html;
}

function renderHistoricalRecords(profileJson: any, targetReg: string) {
    const historyContent = document.getElementById("pfHistoryContent")!;
    let htmlChunks = [];

    // The JSON mapper exposes `semNumber`: [ { RegNo, ... }, ... ]
    const semestersStr = Object.keys(profileJson).sort((a,b) => parseInt(b) - parseInt(a));
    
    if (semestersStr.length === 0) {
        historyContent.innerHTML = "<p>No historic data tracked for this identity.</p>";
        return;
    }

    for (const sem of semestersStr) {
        // Fast Array Find bounded to target
        const record = profileJson[sem].find((r: any) => r.RegNo === targetReg);
        
        htmlChunks.push(`<article style="padding: 1rem; margin-bottom: 1rem; border: 1px solid var(--pico-table-border-color); background: var(--pico-form-element-background-color);">`);
        htmlChunks.push(`<h4 style="margin-bottom: 0.5rem; font-size: 1.1rem; border-bottom: 1px solid var(--pico-muted-border-color); padding-bottom: 0.5rem;">Semester ${sem}</h4>`);
        
        if (!record) {
             htmlChunks.push(`<p style="color: var(--pico-muted-color); font-size: 0.9rem;">Record missing or not participating in this semester.</p>`);
        } else {
             htmlChunks.push(`<div class="grid" style="margin-bottom: 1rem;">`);
             htmlChunks.push(`<div><small>SGPA</small><br><strong>${record.SGPA}</strong></div>`);
             htmlChunks.push(`<div><small>Month/Year</small><br>${record.MonthYear || "N/A"}</div>`);
             htmlChunks.push(`<div><small>Total Marks</small><br>${record.Total_Marks || "N/A"}</div>`);
             htmlChunks.push(`</div>`);
             
             // Subjects Table
             htmlChunks.push(`<details><summary><small>View Subjects</small></summary>`);
             htmlChunks.push(`<div style="overflow-x: auto; margin-top: 0.5rem;">`);
             htmlChunks.push(`<table class="striped" style="font-size: 0.8rem; margin: 0;"><thead><tr><th>Code</th><th>Subject</th><th>ESE</th><th>IA</th><th>Total</th><th>Grade</th></tr></thead><tbody>`);
             
             // Hunt for valid subjects in this record mapping dynamically
             // Format from WideRow:  subjectCode_Grade, subjectCode_Total, etc.
             const subjectCodes = new Set<string>();
             Object.keys(record).forEach(k => {
                 if (k.endsWith("_Total")) subjectCodes.add(k.replace("_Total", ""));
             });

			 // Ensure we actually found subjects (fallback to simple iterator over _Grade)
			 if (subjectCodes.size === 0) {
				 Object.keys(record).forEach(k => {
					 if (k.endsWith("_Grade")) subjectCodes.add(k.replace("_Grade", ""));
				 });
			 }
             
             for (const code of Array.from(subjectCodes)) {
                 const grade = record[`${code}_Grade`] || "";
                 const ese = record[`${code}_ESE`] || "";
                 const ia = record[`${code}_IA`] || "";
                 const total = record[`${code}_Total`] || "";
                 const subName = record[`${code}_Name`] || code; // Assume name was injected via mapper or default to code
                 
                 // If total is empty and grade is empty, it's not a real subject entry
                 if (!total && !grade) continue;

                 htmlChunks.push(`<tr>`);
                 htmlChunks.push(`<td><b>${code}</b></td>`);
                 htmlChunks.push(`<td>${subName}</td>`);
                 htmlChunks.push(`<td>${ese}</td>`);
                 htmlChunks.push(`<td>${ia}</td>`);
                 htmlChunks.push(`<td>${total}</td>`);
                 
                 let gradeColor = "";
                 if(grade.startsWith("F") || grade === "AB") gradeColor = "color: var(--pico-del-color); font-weight: bold;";
                 else if(grade === "O") gradeColor = "color: #10b981; font-weight: bold;";
                 
                 htmlChunks.push(`<td style="${gradeColor}">${grade}</td>`);
                 htmlChunks.push(`</tr>`);
             }
             
             htmlChunks.push(`</tbody></table></div></details>`);
        }
        
        htmlChunks.push(`</article>`);
    }

    historyContent.innerHTML = htmlChunks.join("");
}
