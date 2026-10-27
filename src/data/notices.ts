export type NoticeCategory =
	| "Result"
	| "Exam"
	| "Admission"
	| "General"
	| "Holiday";

export type NoticeItem = {
	id: string;
	title: string;
	category: NoticeCategory;
	date: string;
	link: string;
	source: string;
};

export const notices: NoticeItem[] = [
	{
		id: "notice-result-sem8",
		title: "B.Tech 8th Semester result updated for multiple colleges",
		category: "Result",
		date: "2025-05-15",
		link: "https://beu-bih.ac.in/result-one",
		source: "BEU Result Portal",
	},
	{
		id: "notice-midterm",
		title: "Mid-term examination timetable published",
		category: "Exam",
		date: "2025-04-10",
		link: "https://beu-bih.ac.in",
		source: "BEU Main Website",
	},
	{
		id: "notice-le-instructions",
		title: "Important guidelines for lateral entry students",
		category: "Admission",
		date: "2025-02-18",
		link: "https://beu-bih.ac.in",
		source: "BEU Circular",
	},
	{
		id: "notice-holiday-holi",
		title: "University holiday declared on account of Holi",
		category: "Holiday",
		date: "2025-03-24",
		link: "https://beu-bih.ac.in",
		source: "Holiday Notification",
	},
	{
		id: "notice-revaluation",
		title: "Revaluation form window open for selected semesters",
		category: "Result",
		date: "2025-06-02",
		link: "https://beu-bih.ac.in",
		source: "Exam Controller Office",
	},
	{
		id: "notice-practical",
		title: "Practical exam reporting timeline released",
		category: "Exam",
		date: "2025-07-12",
		link: "https://beu-bih.ac.in",
		source: "BEU Notice Desk",
	},
	{
		id: "notice-registration",
		title: "Online registration correction window activated",
		category: "General",
		date: "2025-08-05",
		link: "https://beu-bih.ac.in",
		source: "University Admin",
	},
	{
		id: "notice-admit-card",
		title: "Admit card download link enabled for upcoming exams",
		category: "Exam",
		date: "2025-09-01",
		link: "https://beu-bih.ac.in",
		source: "BEU Exam Cell",
	},
	{
		id: "notice-result-share",
		title: "New BEUConnect result share links are now live",
		category: "General",
		date: "2025-09-21",
		link: "/result",
		source: "BEUConnect",
	},
	{
		id: "notice-winter-break",
		title: "Winter break schedule published for affiliated colleges",
		category: "Holiday",
		date: "2025-12-10",
		link: "https://beu-bih.ac.in",
		source: "Holiday Notification",
	},
];
