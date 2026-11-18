// The SGPA subject row, in one place.
//
// The page renders five rows on the server so the calculator is complete in the
// first frame (adding them from script pushed the result panel below the fold
// and cost /calculator a measurable CLS), and the browser builds the same row
// again for "Add subject". Both sides call this function, so the markup cannot
// drift between the two.

export const CREDIT_OPTIONS_HTML = Array.from({ length: 19 }, (_, i) => {
	const value = (i * 0.5 + 1).toFixed(1);
	return `<option value="${value}"${value === "3.0" ? " selected" : ""}>${value}</option>`;
}).join("");

export function sgpaRowHTML(index: number): string {
	return `<div class="dynamic-row" role="group" aria-label="Subject ${index}">
	<div class="col-name"><input type="text" placeholder="Subject ${index}" aria-label="Subject name"></div>
	<div class="col-credit"><select class="sgpa-credit" aria-label="Credits">${CREDIT_OPTIONS_HTML}</select></div>
	<div class="col-total"><select class="sgpa-total" aria-label="Maximum marks"><option value="100">100</option><option value="50">50</option></select></div>
	<div class="col-marks marks-group">
		<input type="number" class="sgpa-ia" placeholder="IA" aria-label="Internal marks" min="0" max="30">
		<input type="number" class="sgpa-ese" placeholder="ESE" aria-label="End-semester marks" min="0" max="70">
		<span class="grade-badge"></span>
	</div>
	<div class="col-action"><button type="button" class="btn-remove" aria-label="Remove subject"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m16.192 6.344-4.243 4.242-4.242-4.242-1.414 1.414L10.535 12l-4.242 4.242 1.414 1.414 4.242-4.242 4.243 4.242 1.414-1.414L13.364 12l4.242-4.242z"/></svg></button></div>
</div>`;
}

/** How many rows the SGPA view starts with. */
export const DEFAULT_SGPA_ROWS = 5;
