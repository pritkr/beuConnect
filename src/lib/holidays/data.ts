// The 2026 holiday calendar for BEU, in one place.
//
// Both the page (which renders the schedule into the HTML so it is there on the
// first paint) and the browser script (which re-renders it when someone
// searches or flips the teacher toggle) import from here, so the list cannot
// drift between the server and the client.

export type HolidayCategory = "festival" | "national" | "vacation" | "academic";

export type HolidayEntry = {
	id: number;
	name: string;
	start: string;
	end?: string;
	category: HolidayCategory;
	moonBased?: boolean;
	teacherOnly?: boolean;
};

export const HOLIDAYS_2026: readonly HolidayEntry[] = [
	{ id: 1, name: "नव वर्ष", start: "2026-01-01", category: "festival" },
	{ id: 2, name: "मकर संक्रांति", start: "2026-01-14", category: "festival" },
	{ id: 3, name: "बसंत पंचमी", start: "2026-01-23", category: "festival" },
	{ id: 4, name: "कर्पूरी ठाकुर जयंती", start: "2026-01-24", category: "national" },
	{ id: 5, name: "गणतंत्र दिवस", start: "2026-01-26", category: "national" },
	{ id: 6, name: "संत रविदास जयन्ती", start: "2026-02-01", category: "festival" },
	{ id: 7, name: "शब-ए-बरात", start: "2026-02-04", category: "festival", moonBased: true },
	{ id: 8, name: "महाशिवरात्रि", start: "2026-02-15", category: "festival" },
	{ id: 9, name: "होलिकादहन / होली", start: "2026-03-02", end: "2026-03-04", category: "festival" },
	{ id: 10, name: "ईद-उल-फितर (ईद)", start: "2026-03-21", category: "festival", moonBased: true },
	{ id: 11, name: "बिहार दिवस", start: "2026-03-22", category: "national" },
	{ id: 12, name: "सम्राट अशोक जयन्ती (अष्टमी)", start: "2026-03-26", category: "festival" },
	{ id: 13, name: "राम नवमी", start: "2026-03-27", category: "festival" },
	{ id: 14, name: "महावीर जयन्ती", start: "2026-03-31", category: "festival" },
	{ id: 15, name: "गुड फ्राईडे", start: "2026-04-03", category: "festival" },
	{ id: 16, name: "भीमराव अम्बेडकर जयन्ती", start: "2026-04-14", category: "national" },
	{ id: 17, name: "वीर कुंवर सिंह जयन्ती", start: "2026-04-23", category: "national" },
	{ id: 18, name: "जानकी नवमी", start: "2026-04-25", category: "festival" },
	{ id: 19, name: "मई दिवस (श्रम दिवस) / बुद्ध पूर्णिमा", start: "2026-05-01", category: "national" },
	{ id: 20, name: "ईद-उल-जोहा (बकरीद)", start: "2026-05-28", end: "2026-05-29", category: "festival", moonBased: true },
	{ id: 21, name: "मुहर्रम", start: "2026-06-26", end: "2026-06-27", category: "festival", moonBased: true },
	{ id: 22, name: "कबीर जयन्ती", start: "2026-06-29", category: "festival" },
	{ id: 23, name: "चेहल्लुम", start: "2026-08-04", category: "festival" },
	{ id: 24, name: "स्वतंत्रता दिवस", start: "2026-08-15", category: "national" },
	{ id: 25, name: "अंतिम श्रावणी सोमवार", start: "2026-08-24", category: "festival" },
	{ id: 26, name: "हज़रत मोहम्मद साहब का जन्म दिवस", start: "2026-08-26", category: "festival" },
	{ id: 27, name: "रक्षाबंधन", start: "2026-08-28", category: "festival" },
	{ id: 28, name: "श्री कृष्ण जन्माष्टमी", start: "2026-09-04", category: "festival" },
	{ id: 29, name: "विश्वकर्मा पूजा", start: "2026-09-17", category: "festival" },
	{ id: 30, name: "अनन्त चतुर्दशी", start: "2026-09-25", category: "festival" },
	{ id: 31, name: "महात्मा गाँधी जयन्ती", start: "2026-10-02", category: "national" },
	{ id: 32, name: "दुर्गा पूजा (कलश स्थापन) / जय प्रकाश नारायण जयन्ती", start: "2026-10-11", category: "festival" },
	{ id: 33, name: "दुर्गा पूजा / श्रीकृष्ण सिंह जयन्ती", start: "2026-10-17", end: "2026-10-21", category: "vacation" },
	{ id: 34, name: "दीपावली / चित्रगुप्त पूजा / भाई दूज / छठ पूजा", start: "2026-11-08", end: "2026-11-16", category: "vacation" },
	{ id: 35, name: "गुरू नानक जयन्ती / कार्तिक पूर्णिमा", start: "2026-11-24", category: "festival" },
	{ id: 36, name: "डॉ. राजेन्द्र प्रसाद जयन्ती", start: "2026-12-03", category: "national" },
	{ id: 37, name: "क्रिसमस दिवस", start: "2026-12-25", category: "festival" },
	{ id: 38, name: "शीतकालीन अवकाश", start: "2026-12-26", end: "2026-12-31", category: "vacation" },
	{
		id: 39,
		name: "ग्रीष्मावकाश (केवल शिक्षकों के लिए)",
		start: "2026-05-23",
		end: "2026-06-21",
		category: "vacation",
		teacherOnly: true,
	},
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-01-01" → "01 Jan 2026". Written out rather than going through
 * `toLocaleDateString`, which resolves to different output in the Worker
 * runtime and in the browser.
 */
export function formatHolidayDate(iso: string): string {
	const [year, month, day] = iso.split("-");
	return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function holidayCategoryLabel(category: HolidayCategory): string {
	if (category === "national") return "National";
	if (category === "festival") return "Festival";
	if (category === "vacation") return "Vacation";
	return "Academic";
}

export function holidayRangeText(entry: HolidayEntry): string {
	return entry.end
		? `${formatHolidayDate(entry.start)} – ${formatHolidayDate(entry.end)}`
		: formatHolidayDate(entry.start);
}

/** One row of the "Full schedule" list. */
export function holidayRowHTML(entry: HolidayEntry): string {
	return `<article class="holiday-row ${entry.category}"><span class="range num">${holidayRangeText(entry)}</span><span class="name">${entry.name}${entry.moonBased ? " *" : ""}</span><span class="tags"><span>${holidayCategoryLabel(entry.category)}</span>${entry.teacherOnly ? "<span>Teachers only</span>" : ""}</span></article>`;
}

/** The entries the schedule shows for a given search and toggle state, by date. */
export function filterHolidays(
	entries: readonly HolidayEntry[],
	{ query = "", includeTeacherOnly = false }: { query?: string; includeTeacherOnly?: boolean } = {},
): HolidayEntry[] {
	const needle = query.trim().toLowerCase();
	return entries
		.filter((entry) => {
			if (entry.teacherOnly && !includeTeacherOnly) return false;
			if (needle && !entry.name.toLowerCase().includes(needle)) return false;
			return true;
		})
		.toSorted((a, b) => a.start.localeCompare(b.start));
}
