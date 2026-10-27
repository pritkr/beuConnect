export type OgPageConfig = {
	slug: string;
	prefixes: string[];
	imageTitle: string;
	imageDescription: string;
	seoDescription?: string;
	imageAlt: string;
};

export const DEFAULT_META_TITLE =
	"BEUConnect | Fast BEU Results, Syllabus & PYQs";

export const DEFAULT_META_DESCRIPTION =
	"Ad-free Bihar Engineering University platform for BEU results, syllabus, PYQs, rank tables, attendance tracking, and student tools.";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const OG_PAGE_CONFIG: OgPageConfig[] = [
	{
		slug: "home",
		prefixes: ["/"],
		imageTitle: "BEUConnect",
		imageDescription: "Fast BEU Results, Syllabus, PYQs and student tools.",
		seoDescription: DEFAULT_META_DESCRIPTION,
		imageAlt: "BEUConnect social preview card",
	},
	{
		slug: "result",
		prefixes: ["/result"],
		imageTitle: "BEU Results",
		imageDescription: "Check BEU results instantly with a faster, cleaner UI.",
		seoDescription:
			"Check Bihar Engineering University results instantly with a fast, ad-free BEU result checker.",
		imageAlt: "BEU Results social preview card",
	},
	{
		slug: "result-table",
		prefixes: ["/result-table"],
		imageTitle: "Result Leaderboards",
		imageDescription:
			"Explore college-wise and branch-wise result tables and ranks.",
		seoDescription:
			"View BEU result tables, college ranks, branch ranks, and leaderboard-style merit data.",
		imageAlt: "BEU result leaderboard social preview card",
	},
	{
		slug: "syllabus",
		prefixes: ["/syllabus"],
		imageTitle: "BEU Syllabus",
		imageDescription: "Branch-wise official syllabus with clean semester navigation.",
		seoDescription:
			"Browse branch-wise Bihar Engineering University syllabus with quick semester navigation.",
		imageAlt: "BEU syllabus social preview card",
	},
	{
		slug: "pyqs",
		prefixes: ["/pyqs"],
		imageTitle: "BEU PYQs",
		imageDescription: "Previous year question papers for BEU subjects in one place.",
		seoDescription:
			"Find BEU previous year question papers for multiple branches and semesters in one place.",
		imageAlt: "BEU PYQs social preview card",
	},
	{
		slug: "gate-syllabus",
		prefixes: ["/gate-syllabus"],
		imageTitle: "GATE Syllabus",
		imageDescription: "Official subject-wise GATE syllabus with cleaner access.",
		seoDescription:
			"Browse official GATE syllabus for all major subjects with a clean, fast interface.",
		imageAlt: "GATE syllabus social preview card",
	},
	{
		slug: "gate-pyqs",
		prefixes: ["/gate-pyqs"],
		imageTitle: "GATE PYQs",
		imageDescription: "Official GATE previous year question papers with fast access.",
		seoDescription:
			"Explore official GATE previous year question papers with a clean, fast interface.",
		imageAlt: "GATE PYQs social preview card",
	},
	{
		slug: "attendance",
		prefixes: ["/attendance"],
		imageTitle: "Attendance Tracker",
		imageDescription: "Track attendance, plan bunks, and stay safe on shortage.",
		seoDescription:
			"Track class attendance, predict shortage risk, and manage bunks with the BEU attendance tracker.",
		imageAlt: "Attendance tracker social preview card",
	},
	{
		slug: "calculator",
		prefixes: ["/calculator"],
		imageTitle: "SGPA Calculator",
		imageDescription: "Calculate and predict BEU SGPA and CGPA quickly.",
		seoDescription:
			"Use the BEU SGPA calculator to calculate and predict SGPA and CGPA quickly.",
		imageAlt: "SGPA calculator social preview card",
	},
	{
		slug: "listofstudents",
		prefixes: ["/listofstudents"],
		imageTitle: "Student Lists",
		imageDescription: "Explore college-wise student lists with branch and batch filters.",
		seoDescription:
			"Browse college-wise BEU student lists with branch and batch-wise access.",
		imageAlt: "Student list social preview card",
	},
	{
		slug: "notice-board",
		prefixes: ["/notice-board"],
		imageTitle: "Notice Board",
		imageDescription: "Track important BEU notices and updates in one place.",
		seoDescription:
			"Stay updated with BEU notices and announcements from one clean notice board.",
		imageAlt: "Notice board social preview card",
	},
];

export function resolveOgPage(pathname: string): OgPageConfig {
	const exact = OG_PAGE_CONFIG.find(
		(entry) => entry.prefixes[0] !== "/" && pathname === entry.prefixes[0],
	);
	if (exact) return exact;

	const matched = OG_PAGE_CONFIG.find(
		(entry) =>
			entry.prefixes[0] !== "/" &&
			entry.prefixes.some((prefix) => pathname.startsWith(prefix)),
	);

	return matched ?? OG_PAGE_CONFIG[0];
}

export function resolveOgImagePath(pathname: string): string {
	return `/og/${resolveOgPage(pathname).slug}.png`;
}

export function resolveMetaDescription(
	pathname: string,
	description?: string,
): string {
	return description ?? resolveOgPage(pathname).seoDescription ?? DEFAULT_META_DESCRIPTION;
}

export function resolveMetaTitle(title?: string): string {
	if (!title) return DEFAULT_META_TITLE;
	if (/beuconnect/i.test(title)) return title;
	return `${title} | BEUConnect`;
}

export function getDefaultStructuredData(url: string) {
	const siteRoot = new URL("/", url).toString();
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: "BEUConnect",
		description: DEFAULT_META_DESCRIPTION,
		url: siteRoot,
		inLanguage: "en-IN",
		potentialAction: {
			"@type": "SearchAction",
			target: `${siteRoot}result?reg={registrationNumber}`,
			"query-input": "required name=registrationNumber",
		},
	};
}
