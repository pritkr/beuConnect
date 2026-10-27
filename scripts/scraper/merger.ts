export function buildSgpaHistoryString(
	currentSgpaArray: (string | null)[] | undefined,
	historicSgpaMap: Record<number, string> // key is semester number (1-8)
): string {
    // If the BEU JSON payload already contains the full array (like Batch 24 direct JSONs)
    if (currentSgpaArray && currentSgpaArray.length === 8) {
        return currentSgpaArray.map(s => s || "-").join("|");
    }

	// For legacy HTML fallbacks, we might only get the current semester's SGPA
	// We merge it with locally cached historicSgpaMap if the JSON failed.
	const history = [];
	for (let sem = 1; sem <= 8; sem++) {
		// Priority: current payload > cached historic > empty slot
		if (currentSgpaArray && currentSgpaArray[sem - 1]) {
			history.push(currentSgpaArray[sem - 1]);
		} else if (historicSgpaMap[sem]) {
			history.push(historicSgpaMap[sem]);
		} else {
			history.push("-");
		}
	}
	return history.join("|");
}
