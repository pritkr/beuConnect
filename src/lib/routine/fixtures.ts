import type { ParsedRoutine, RoutineIndex, RoutineSourceEntry, RoutineSlot } from "./types";

const DEFAULT_SLOTS: RoutineSlot[] = [
	{ id: 1, label: "Period 1", start: "10:00", end: "11:00" },
	{ id: 2, label: "Period 2", start: "11:00", end: "12:00" },
	{ id: 3, label: "Period 3", start: "12:00", end: "13:00" },
	{ id: 4, label: "Period 4", start: "14:00", end: "15:00" },
	{ id: 5, label: "Period 5", start: "15:00", end: "16:00" },
	{ id: 6, label: "Period 6", start: "16:00", end: "17:00" },
];

const FIXTURE_FETCHED_AT = "2026-04-02T00:00:00.000Z";

const fixtureEntries: RoutineSourceEntry[] = [
	{
		sourceUrl:
			"https://classroutine.free.nf/view_timetable.php?branch=CE&semester=3&batch=2K24&effective_date=2026-04-02&room_no=104",
		branchLabel: "CE",
		semester: 3,
		batchLabel: "2K24",
		queryEffectiveDate: "2026-04-02",
		queryRoomNo: "104",
	},
	{
		sourceUrl:
			"https://classroutine.free.nf/view_timetable.php?branch=CSE-A&semester=3&batch=2K24&effective_date=2026-04-02&room_no=103",
		branchLabel: "CSE-A",
		semester: 3,
		batchLabel: "2K24",
		queryEffectiveDate: "2026-04-02",
		queryRoomNo: "103",
	},
	{
		sourceUrl:
			"https://classroutine.free.nf/view_timetable.php?branch=CSE-B&semester=3&batch=2K24&effective_date=2026-04-02&room_no=105",
		branchLabel: "CSE-B",
		semester: 3,
		batchLabel: "2K24",
		queryEffectiveDate: "2026-04-02",
		queryRoomNo: "105",
	},
];

export const ROUTINE_FIXTURE_INDEX: RoutineIndex = {
	entries: fixtureEntries,
	fetchedAt: FIXTURE_FETCHED_AT,
	isStale: true,
};

export const ROUTINE_FIXTURE_DETAILS: Record<string, ParsedRoutine> = {
	[fixtureEntries[0].sourceUrl]: {
		title: "Timetable - CE Sem 3",
		heading: "GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA",
		subheading: "Time Table of Branch CE | Semester 3 | Batch 2K24",
		effectiveFrom: "05-03-2026",
		roomLabel: "104",
		slots: DEFAULT_SLOTS,
		days: [
			{
				day: "Monday",
				blocks: [
					{ startSlot: 1, span: 1, subject: "SG", type: "L", room: null, durationLabel: null },
					{ startSlot: 2, span: 1, subject: "Maths-III", type: "L", room: null, durationLabel: null },
					{ startSlot: 3, span: 1, subject: "MTE", type: "L", room: null, durationLabel: null },
					{ startSlot: 4, span: 1, subject: "IKS", type: "L", room: null, durationLabel: null },
					{ startSlot: 5, span: 2, subject: "LIBRARY", type: null, room: null, durationLabel: "2 hrs" },
				],
			},
			{
				day: "Tuesday",
				blocks: [
					{ startSlot: 1, span: 1, subject: "Maths-III", type: "L", room: null, durationLabel: null },
					{ startSlot: 2, span: 1, subject: "MTE", type: "L", room: null, durationLabel: null },
					{ startSlot: 3, span: 1, subject: "FM", type: "L", room: null, durationLabel: null },
					{ startSlot: 4, span: 2, subject: "MTE LAB", type: null, room: "Others", durationLabel: "2 hrs" },
					{ startSlot: 6, span: 1, subject: "IKS", type: "L", room: null, durationLabel: null },
				],
			},
			{
				day: "Wednesday",
				blocks: [
					{ startSlot: 1, span: 1, subject: "Maths-III", type: "L", room: null, durationLabel: null },
					{ startSlot: 2, span: 1, subject: "MTE", type: "L", room: null, durationLabel: null },
					{ startSlot: 3, span: 1, subject: "SM", type: "L", room: null, durationLabel: null },
					{ startSlot: 4, span: 2, subject: "FM LAB", type: null, room: "111", durationLabel: "2 hrs" },
					{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
				],
			},
			{
				day: "Thursday",
				blocks: [
					{ startSlot: 1, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
					{ startSlot: 2, span: 1, subject: "SG", type: "L", room: null, durationLabel: null },
					{ startSlot: 3, span: 1, subject: "Maths-III", type: "T", room: null, durationLabel: null },
					{ startSlot: 4, span: 2, subject: "SG LAB", type: null, room: "17", durationLabel: "2 hrs" },
					{ startSlot: 6, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				],
			},
			{
				day: "Friday",
				blocks: [
					{ startSlot: 1, span: 1, subject: "SM", type: "L", room: null, durationLabel: null },
					{ startSlot: 2, span: 1, subject: "FM", type: "L", room: null, durationLabel: null },
					{ startSlot: 3, span: 1, subject: "SG", type: "L", room: null, durationLabel: null },
					{ startSlot: 4, span: 3, subject: "SM LAB", type: null, room: "23", durationLabel: "3 hrs" },
				],
			},
			{
				day: "Saturday",
				blocks: [
					{ startSlot: 1, span: 1, subject: "SM", type: "L", room: null, durationLabel: null },
					{ startSlot: 2, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
					{ startSlot: 3, span: 1, subject: "FM", type: "L", room: null, durationLabel: null },
					{ startSlot: 4, span: 1, subject: "IKS", type: "L", room: null, durationLabel: null },
					{ startSlot: 5, span: 2, subject: "MENTOR MEETING", type: null, room: null, durationLabel: "2 hrs" },
				],
			},
		],
		papers: [
			{ abbr: "FM", code: "101305", name: "Fluid Mechanics", faculty: "Ms. Premlata Vidyarthy (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "IKS", code: "101307", name: "Indian Knowledge System", faculty: "Mr. Arvind Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "0" },
			{ abbr: "Maths-III", code: "101302", name: "Engineering Mathematics-III", faculty: "Dr. Nida Fatima (Guest AP)", lectureHours: 3, tutorialHours: 1, practicalHours: "0" },
			{ abbr: "MTE", code: "101306", name: "Materials, Testing & Evaluation", faculty: "Mr. Anand Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "SG", code: "101304", name: "Surveying and Geomatics", faculty: "Dr. Avinash Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "SM", code: "101301", name: "Solid Mechanics", faculty: "Ms. Pooja (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "UHV", code: "101303", name: "Universal Human Values", faculty: "Mr. Vinod Kumar (Guest AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "0" },
		],
		sourceUrl: fixtureEntries[0].sourceUrl,
		fetchedAt: FIXTURE_FETCHED_AT,
		isStale: true,
	},
	[fixtureEntries[1].sourceUrl]: {
		title: "Timetable - CSE-A Sem 3",
		heading: "GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA",
		subheading: "Time Table of Branch CSE-A | Semester 3 | Batch 2K24",
		effectiveFrom: "05-03-2026",
		roomLabel: "103",
		slots: DEFAULT_SLOTS,
		days: [
			{ day: "Monday", blocks: [
				{ startSlot: 1, span: 1, subject: "DM", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "OS", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "DSA LAB", type: null, room: "109", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Tuesday", blocks: [
				{ startSlot: 1, span: 1, subject: "DSA", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DM", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "OS", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "OS LAB", type: null, room: "109", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Wednesday", blocks: [
				{ startSlot: 1, span: 1, subject: "DSA", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DE", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "OS", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 1, subject: "DM", type: "T", room: null, durationLabel: null },
				{ startSlot: 5, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Thursday", blocks: [
				{ startSlot: 1, span: 1, subject: "OOPJ", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DSA", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "DM", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "OOPJ LAB", type: null, room: "109", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Friday", blocks: [
				{ startSlot: 1, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "OOPJ", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "DE", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "DE LAB", type: null, room: "Others", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Saturday", blocks: [
				{ startSlot: 1, span: 1, subject: "REMEDIAL", type: null, room: null, durationLabel: "1 hrs" },
				{ startSlot: 2, span: 1, subject: "DE", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "OOPJ", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "MENTOR MEETING", type: null, room: null, durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
		],
		papers: [
			{ abbr: "DE", code: "105301", name: "Digital Electronics", faculty: "Mr. Sandeep Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "DM", code: "105304", name: "Discrete Mathematics and Graph Theory", faculty: "Mr. Nitish Kumar (Guest AP)", lectureHours: 3, tutorialHours: 1, practicalHours: "0" },
			{ abbr: "DSA", code: "105302", name: "Data Structure and Algorithms", faculty: "Mr. Md. Zaki Anwer (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "IKS", code: "105307", name: "Indian Knowledge System", faculty: "Ms. Manisha Rani (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "0" },
			{ abbr: "OOPJ", code: "105303", name: "Object Oriented Programming using JAVA", faculty: "Mr. Ankit Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "OS", code: "105305", name: "Operating System", faculty: "Mr. Anand Raj (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "UHV", code: "105306", name: "Universal Human Values", faculty: "Ms. Babli Kumari (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "0" },
		],
		sourceUrl: fixtureEntries[1].sourceUrl,
		fetchedAt: FIXTURE_FETCHED_AT,
		isStale: true,
	},
	[fixtureEntries[2].sourceUrl]: {
		title: "Timetable - CSE-B Sem 3",
		heading: "GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA",
		subheading: "Time Table of Branch CSE-B | Semester 3 | Batch 2K24",
		effectiveFrom: "05-03-2026",
		roomLabel: "105",
		slots: DEFAULT_SLOTS,
		days: [
			{ day: "Monday", blocks: [
				{ startSlot: 1, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DSA", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "DM", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 3, subject: "DE LAB", type: null, room: "Others", durationLabel: "3 hrs" },
			] },
			{ day: "Tuesday", blocks: [
				{ startSlot: 1, span: 1, subject: "OS", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DSA", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "DM", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "DSA LAB", type: null, room: "7", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Wednesday", blocks: [
				{ startSlot: 1, span: 1, subject: "OOPJ", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "OS", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "DM", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "OS LAB", type: null, room: "109", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Thursday", blocks: [
				{ startSlot: 1, span: 1, subject: "DSA", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DE", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "OS", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				{ startSlot: 5, span: 2, subject: "MENTOR MEETING", type: null, room: null, durationLabel: "2 hrs" },
			] },
			{ day: "Friday", blocks: [
				{ startSlot: 1, span: 1, subject: "OOPJ", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "DE", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "DM", type: "T", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "OOPJ LAB", type: null, room: "109", durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
			{ day: "Saturday", blocks: [
				{ startSlot: 1, span: 1, subject: "DE", type: "L", room: null, durationLabel: null },
				{ startSlot: 2, span: 1, subject: "OOPJ", type: "L", room: null, durationLabel: null },
				{ startSlot: 3, span: 1, subject: "UHV", type: "L", room: null, durationLabel: null },
				{ startSlot: 4, span: 2, subject: "LIBRARY", type: null, room: null, durationLabel: "2 hrs" },
				{ startSlot: 6, span: 1, subject: "SPORTS", type: null, room: null, durationLabel: "1 hrs" },
			] },
		],
		papers: [
			{ abbr: "DE", code: "105301", name: "Digital Electronics", faculty: "Dr. Sundaram (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "3(2h)" },
			{ abbr: "DM", code: "105304", name: "Discrete Mathematics and Graph Theory", faculty: "Dr. Nida Fatima (Guest AP)", lectureHours: 3, tutorialHours: 1, practicalHours: "0" },
			{ abbr: "DSA", code: "105302", name: "Data Structure and Algorithms", faculty: "Mr. Md. Zaki Anwer (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "IKS", code: "105307", name: "Indian Knowledge System", faculty: "Mr. Niraj Nirmal (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "0" },
			{ abbr: "OOPJ", code: "105303", name: "Object Oriented Programming using JAVA", faculty: "Mr. Ankit Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "OS", code: "105305", name: "Operating System", faculty: "Mr. Anand Raj (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "2(2h)" },
			{ abbr: "UHV", code: "105306", name: "Universal Human Values", faculty: "Mr. Neeraj Kumar (AP)", lectureHours: 3, tutorialHours: 0, practicalHours: "0" },
		],
		sourceUrl: fixtureEntries[2].sourceUrl,
		fetchedAt: FIXTURE_FETCHED_AT,
		isStale: true,
	},
};
