// table.ts
// Handles Vanilla JS DOM mutation and high-performance native Virtualization

export interface ColumnDef {
    key: string;
    label: string;
    width: number;
    sortable: boolean;
}

export class VirtualTable {
    private container: HTMLElement;
    private thead: HTMLElement;
    private tbody: HTMLElement;
    
    private columns: string[] = [];
    private visibleColumns: string[] = [];
    
    private itemHeight = 28; // Tightly mapped to compact CSS row height
    private overscan = 20;   // Buffer rows to render outside viewport (increased relative to shorter rows)
    
    private rowCount = 0;
    private renderCallback: (startIndex: number, endIndex: number) => string;
    private onSortRequest: (colKey: string, direction: "asc"|"desc") => void;

    private currentSortCol: string | null = null;
    private currentSortDir: "asc" | "desc" = "desc";

    constructor(
        containerId: string, 
        onSortRequest: (colKey: string, direction: "asc"|"desc") => void,
        renderCallback: (startIndex: number, endIndex: number) => string
    ) {
        this.container = document.getElementById(containerId) as HTMLElement;
        this.thead = document.getElementById("dbThead") as HTMLElement;
        this.tbody = document.getElementById("dbTbody") as HTMLElement;
        this.onSortRequest = onSortRequest;
        this.renderCallback = renderCallback;

        window.addEventListener("scroll", () => this.onScroll(), { passive: true });
        window.addEventListener("resize", () => this.onScroll(), { passive: true });
    }

    public initData(columns: string[], rowCount: number) {
        this.columns = columns;
        this.rowCount = rowCount;
        
        // Define Visibility Logic intuitively. 
        // We hide esoteric Subject marks (_ESE, _IA) by default for cleaner mobile view.
        this.visibleColumns = columns.filter(c => {
            if (c.includes("_ESE") || c.includes("_IA") || c.includes("_Total")) return false;
            if (c === "Type" || c === "MonthYear" || c === "ExamYear") return false;
            return true;
        });

        this.renderHeader();
        this.container.style.display = "block";
        
        // Ensure container is relative for transform logic
        this.container.style.position = "relative";
        
        this.onScroll(); // Fire initial paint
    }

    public updateData(rowCount: number) {
        this.rowCount = rowCount;
        this.onScroll();
    }

    private renderHeader() {
        const tr = document.createElement("tr");
        
        this.visibleColumns.forEach((col, idx) => {
            const th = document.createElement("th");
            th.textContent = col;
            
            // Assign explicit widths to prevent CSS collapse under table-layout: fixed
            th.style.width = "100px"; // Default fallback width
            if (col === "RegNo") th.style.width = "120px";
            else if (col === "Name") th.style.width = "220px";
            else if (col === "FatherName" || col === "MotherName") th.style.width = "200px";
            else if (col === "CollegeCode" || col === "Branch" || col === "Semester") th.style.width = "90px";
            else if (col === "CGPA" || col === "SGPA") th.style.width = "70px";
            else if (col.includes("Grade")) th.style.width = "70px"; // Sub1_Grade etc
            else if (col.includes("Credit")) th.style.width = "70px"; // Sub1_Credit
            else if (col.includes("Name")) th.style.width = "300px"; // Subject names

            // Mark Name & RegNo as sticky
            if (col === "RegNo" || col === "Name") {
                th.classList.add("sticky-col");
                if (col === "Name") th.style.left = "120px"; // Adjust based on RegNo width
            }

            th.addEventListener("click", () => {
                if (this.currentSortCol === col) {
                    this.currentSortDir = this.currentSortDir === "asc" ? "desc" : "asc";
                } else {
                    this.currentSortCol = col;
                    this.currentSortDir = "desc";
                }
                this.onSortRequest(col, this.currentSortDir);
                this.renderHeader(); // Repaint headers to show sort arrows
            });

            if (this.currentSortCol === col) {
                th.textContent += this.currentSortDir === "asc" ? " ↑" : " ⬇";
            }

            tr.appendChild(th);
        });

        this.thead.innerHTML = "";
        this.thead.appendChild(tr);
    }

    private onScroll() {
        requestAnimationFrame(() => {
            const rect = this.container.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            
            // Calculate how far the top of the table is above the viewport top
            // If the table hasn't reached the top, scrollTop is 0
            const scrollTop = Math.max(0, -rect.top);
            
            // Visual height of the table is limited by viewport
            const clientHeight = viewportHeight;

            const totalHeight = this.rowCount * this.itemHeight;
            
            let startIndex = Math.floor(scrollTop / this.itemHeight) - this.overscan;
            let endIndex = Math.floor((scrollTop + clientHeight) / this.itemHeight) + this.overscan;

            startIndex = Math.max(0, startIndex);
            endIndex = Math.min(this.rowCount - 1, endIndex);

            // Set spacer top
            const topSpacerHeight = startIndex * this.itemHeight;
            
            // Inject rows string directly via InnerHTML for extremely fast DOM repaints
            const htmlString = this.renderCallback(startIndex, endIndex);

            // Reconstruct Table Body
            this.tbody.innerHTML = htmlString;
            
            // Offset the tbody virtually by the top spacer height so scrollbars act properly
            this.tbody.style.transform = `translateY(${topSpacerHeight}px)`;

            // Table stays absolutely fixed at the top of the render window so it behaves with window scroll
            const table = this.container.querySelector("table") as HTMLElement;
            table.style.position = "absolute";
            table.style.top = `${topSpacerHeight}px`;
            table.style.left = "0";
            table.style.zIndex = "1";
            table.style.width = "max-content"; // Ensure wide table keeps its width

            // No translateY needed on tbody if we shift the entire table container relative to scroll
            this.tbody.style.transform = "none";

            // Manage global fake table height trick
            const padding = document.getElementById("dbVirtualPadding")!;
            padding.style.display = "block";
            padding.style.height = `${totalHeight}px`;
            padding.style.position = "relative"; 
            padding.style.zIndex = "-1";
            padding.style.pointerEvents = "none";
        });
    }
}
