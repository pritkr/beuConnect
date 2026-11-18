/**
 * A pathname is a page; a feature is a thing a student came to use.
 *
 * GA4 groups by page path, which is too granular to answer "is Syllabus used
 * more than Results?" — one feature is 40 paths and another is one. This maps
 * every route back to the feature folder that owns it, so both the site and the
 * app report the same `feature` value for the same intent.
 */

export type Feature =
	| "home"
	| "syllabus"
	| "pyqs"
	| "results"
	| "students"
	| "tools"
	| "notices"
	| "gate"
	| "data"
	| "search"
	| "feedback"
	| "settings"
	| "not_found";

export type PageType =
	| "home"
	| "index"
	| "detail"
	| "tool"
	| "data"
	| "not_found";

/** Ordered: the first prefix that matches wins, so put specific ones first. */
const PREFIXES: ReadonlyArray<readonly [string, Feature]> = [
	["/syllabus", "syllabus"],
	["/pyqs", "pyqs"],
	["/gate-syllabus", "gate"],
	["/gate-pyqs", "gate"],
	["/result", "results"],
	["/rank", "results"],
	["/merit-list", "results"],
	["/battle", "results"],
	["/listofstudents", "students"],
	["/calculator", "tools"],
	["/attendance", "tools"],
	["/routine", "tools"],
	["/holidays", "tools"],
	["/holidays-calendar", "tools"],
	["/wifi", "tools"],
	["/data-browser", "data"],
	["/notices", "notices"],
	["/notice-board", "notices"],
	["/announcements", "notices"],
	["/search", "search"],
	["/feedback", "feedback"],
	["/settings", "settings"],
	["/404", "not_found"],
];

/** The feature that owns `pathname` (a pathname always belongs to something). */
export function featureOf(pathname: string): Feature {
	const path = normalise(pathname);
	if (path === "/" || path === "") return "home";
	for (const [prefix, feature] of PREFIXES) {
		if (path === prefix || path.startsWith(`${prefix}/`)) return feature;
	}
	return "home";
}

/**
 * What kind of page this is, which is what makes "opens" comparable across
 * features: a syllabus subject page and a result page are both `detail`.
 */
export function pageTypeOf(pathname: string): PageType {
	const path = normalise(pathname);
	if (path === "/" || path === "") return "home";
	if (path === "/404") return "not_found";
	if (path === "/data-browser") return "data";
	if (
		[
			"/calculator",
			"/attendance",
			"/routine",
			"/holidays",
			"/holidays-calendar",
			"/wifi",
			"/battle",
		].includes(path)
	) {
		return "tool";
	}
	if (path === "/result") return "tool";
	// `/pyqs/algorithms`, `/syllabus/cse/3`, `/listofstudents/gecs/cse`
	return path.split("/").filter(Boolean).length >= 2 ? "detail" : "index";
}

function normalise(pathname: string): string {
	const trimmed = (pathname || "/").split("?")[0].split("#")[0];
	return trimmed.length > 1 && trimmed.endsWith("/")
		? trimmed.slice(0, -1)
		: trimmed;
}
