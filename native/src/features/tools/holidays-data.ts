/**
 * BEU's 2026 academic and festival calendar, copied from the university
 * calendar that powers `beu.prit.eu.org/holidays-calendar` so the app can show
 * the grid and the countdown with no network at all.
 *
 * The university's own sheet ships beside this file as
 * `assets/holidays-2026.png` (shown first on the Holidays screen; a two-tone
 * reduction of the scan at `beu.prit.eu.org/holidays-2026.png`); these entries are that
 * sheet typed out, so a date here that is not on the sheet is a bug.
 *
 * `name` keeps the university's wording (Hindi), `label` is the English line
 * the app shows above it so a student who does not read Hindi still knows
 * which break is coming.
 */

export type HolidayCategory = "festival" | "national" | "vacation" | "academic";

export interface Holiday {
  id: number;
  label: string;
  name: string;
  start: string;
  end?: string;
  category: HolidayCategory;
  /** Dates that follow a lunar sighting and can move by a day. */
  moonBased?: boolean;
  teacherOnly?: boolean;
}

export const HOLIDAY_SOURCE = "BEU academic calendar 2026";

export const HOLIDAY_YEAR = 2026;

export const HOLIDAYS_2026: readonly Holiday[] = [
  { id: 1, label: "New Year", name: "नव वर्ष", start: "2026-01-01", category: "festival" },
  { id: 2, label: "Makar Sankranti", name: "मकर संक्रांति", start: "2026-01-14", category: "festival" },
  { id: 3, label: "Vasant Panchami", name: "बसंत पंचमी", start: "2026-01-23", category: "festival" },
  { id: 4, label: "Karpoori Thakur Jayanti", name: "कर्पूरी ठाकुर जयंती", start: "2026-01-24", category: "national" },
  { id: 5, label: "Republic Day", name: "गणतंत्र दिवस", start: "2026-01-26", category: "national" },
  { id: 6, label: "Sant Ravidas Jayanti", name: "संत रविदास जयन्ती", start: "2026-02-01", category: "festival" },
  { id: 7, label: "Shab-e-Barat", name: "शब-ए-बरात", start: "2026-02-04", category: "festival", moonBased: true },
  { id: 8, label: "Maha Shivratri", name: "महाशिवरात्रि", start: "2026-02-15", category: "festival" },
  { id: 9, label: "Holika Dahan / Holi", name: "होलिकादहन / होली", start: "2026-03-02", end: "2026-03-04", category: "festival" },
  { id: 10, label: "Eid-ul-Fitr", name: "ईद-उल-फितर (ईद)", start: "2026-03-21", category: "festival", moonBased: true },
  { id: 11, label: "Bihar Diwas", name: "बिहार दिवस", start: "2026-03-22", category: "national" },
  { id: 12, label: "Samrat Ashok Jayanti", name: "सम्राट अशोक जयन्ती (अष्टमी)", start: "2026-03-26", category: "festival" },
  { id: 13, label: "Ram Navami", name: "राम नवमी", start: "2026-03-27", category: "festival" },
  { id: 14, label: "Mahavir Jayanti", name: "महावीर जयन्ती", start: "2026-03-31", category: "festival" },
  { id: 15, label: "Good Friday", name: "गुड फ्राईडे", start: "2026-04-03", category: "festival" },
  { id: 16, label: "Ambedkar Jayanti", name: "भीमराव अम्बेडकर जयन्ती", start: "2026-04-14", category: "national" },
  { id: 17, label: "Veer Kunwar Singh Jayanti", name: "वीर कुंवर सिंह जयन्ती", start: "2026-04-23", category: "national" },
  { id: 18, label: "Janaki Navami", name: "जानकी नवमी", start: "2026-04-25", category: "festival" },
  { id: 19, label: "May Day / Buddha Purnima", name: "मई दिवस (श्रम दिवस) / बुद्ध पूर्णिमा", start: "2026-05-01", category: "national" },
  { id: 20, label: "Eid-ul-Adha (Bakrid)", name: "ईद-उल-जोहा (बकरीद)", start: "2026-05-28", end: "2026-05-29", category: "festival", moonBased: true },
  { id: 21, label: "Muharram", name: "मुहर्रम", start: "2026-06-26", end: "2026-06-27", category: "festival", moonBased: true },
  { id: 22, label: "Kabir Jayanti", name: "कबीर जयन्ती", start: "2026-06-29", category: "festival" },
  { id: 23, label: "Chehallum", name: "चेहल्लुम", start: "2026-08-04", category: "festival" },
  { id: 24, label: "Independence Day", name: "स्वतंत्रता दिवस", start: "2026-08-15", category: "national" },
  { id: 25, label: "Last Shravani Somwar", name: "अंतिम श्रावणी सोमवार", start: "2026-08-24", category: "festival" },
  { id: 26, label: "Prophet Muhammad's birthday", name: "हज़रत मोहम्मद साहब का जन्म दिवस", start: "2026-08-26", category: "festival" },
  { id: 27, label: "Raksha Bandhan", name: "रक्षाबंधन", start: "2026-08-28", category: "festival" },
  { id: 28, label: "Krishna Janmashtami", name: "श्री कृष्ण जन्माष्टमी", start: "2026-09-04", category: "festival" },
  { id: 29, label: "Vishwakarma Puja", name: "विश्वकर्मा पूजा", start: "2026-09-17", category: "festival" },
  { id: 30, label: "Anant Chaturdashi", name: "अनन्त चतुर्दशी", start: "2026-09-25", category: "festival" },
  { id: 31, label: "Gandhi Jayanti", name: "महात्मा गाँधी जयन्ती", start: "2026-10-02", category: "national" },
  { id: 32, label: "Durga Puja begins / JP Narayan Jayanti", name: "दुर्गा पूजा (कलश स्थापन) / जय प्रकाश नारायण जयन्ती", start: "2026-10-11", category: "festival" },
  { id: 33, label: "Durga Puja / Sri Krishna Singh Jayanti", name: "दुर्गा पूजा / श्रीकृष्ण सिंह जयन्ती", start: "2026-10-17", end: "2026-10-21", category: "vacation" },
  { id: 34, label: "Diwali / Bhai Dooj / Chhath Puja", name: "दीपावली / चित्रगुप्त पूजा / भाई दूज / छठ पूजा", start: "2026-11-08", end: "2026-11-16", category: "vacation" },
  { id: 35, label: "Guru Nanak Jayanti / Kartik Purnima", name: "गुरू नानक जयन्ती / कार्तिक पूर्णिमा", start: "2026-11-24", category: "festival" },
  { id: 36, label: "Dr Rajendra Prasad Jayanti", name: "डॉ. राजेन्द्र प्रसाद जयन्ती", start: "2026-12-03", category: "national" },
  { id: 37, label: "Christmas", name: "क्रिसमस दिवस", start: "2026-12-25", category: "festival" },
  { id: 38, label: "Winter vacation", name: "शीतकालीन अवकाश", start: "2026-12-26", end: "2026-12-31", category: "vacation" },
  {
    id: 39,
    label: "Summer vacation",
    name: "ग्रीष्मावकाश (केवल शिक्षकों के लिए)",
    start: "2026-05-23",
    end: "2026-06-21",
    category: "vacation",
    teacherOnly: true,
  },
];

export function holidaySpan(holiday: Holiday): string {
  return holiday.end ? `${holiday.start} → ${holiday.end}` : holiday.start;
}

/** Number of calendar days the holiday covers (a vacation counts its range). */
export function holidayDays(holiday: Holiday): number {
  if (!holiday.end) return 1;
  const start = Date.parse(`${holiday.start}T12:00:00`);
  const end = Date.parse(`${holiday.end}T12:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/** Every holiday touching `iso`, in calendar order. */
export function holidaysOn(iso: string, includeTeacherOnly = false): Holiday[] {
  return HOLIDAYS_2026.filter((holiday) => {
    if (holiday.teacherOnly && !includeTeacherOnly) return false;
    const end = holiday.end ?? holiday.start;
    return iso >= holiday.start && iso <= end;
  });
}

/** The next holiday starting on or after `iso` (an ongoing one counts). */
export function nextHoliday(iso: string, includeTeacherOnly = false): Holiday | null {
  let best: Holiday | null = null;
  for (const holiday of HOLIDAYS_2026) {
    if (holiday.teacherOnly && !includeTeacherOnly) continue;
    const end = holiday.end ?? holiday.start;
    if (end < iso) continue;
    if (!best || holiday.start < best.start) best = holiday;
  }
  return best;
}

export function categoryLabel(category: HolidayCategory): string {
  if (category === "national") return "National";
  if (category === "festival") return "Festival";
  if (category === "vacation") return "Vacation";
  return "Academic";
}

export function categoryDot(category: HolidayCategory): string {
  if (category === "national") return "bg-accent";
  if (category === "festival") return "bg-primary";
  if (category === "vacation") return "bg-chart-3";
  return "bg-chart-4";
}

export function categoryText(category: HolidayCategory): string {
  if (category === "national") return "text-accent";
  if (category === "festival") return "text-primary";
  if (category === "vacation") return "text-chart-3";
  return "text-chart-4";
}
