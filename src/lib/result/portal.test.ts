import { describe, expect, it } from "vitest";
import {
	buildPortalExamUrl,
	buildPortalResultUrl,
	candidateFromExam,
	parsePortalExamList,
	resolveOfficialExamLink,
	resolvePortalExam,
	selectPortalExam,
	type PortalCourse,
	type PortalExam,
} from "./portal";

const REG = "23105101045";

const exam = (overrides: Partial<PortalExam> = {}): PortalExam => ({
	examName: "B.Tech. 4th Semester Examination, 2025",
	session: "2023-27",
	batchYear: "2025",
	examHeld: "December/2025",
	semId: 4,
	examId: "250104",
	publishDate: "2026-03-20T00:00:00.000Z",
	...overrides,
});

const courses: PortalCourse[] = [
	{
		courseid: 3,
		courseName: "B.Tech",
		exams: [
			exam(),
			exam({
				examName: "B.Tech 4th Semester Supplementary Examination 2026",
				batchYear: "2026",
				examHeld: "August/2026",
				examId: "2601094",
				publishDate: "2026-10-22T00:00:00.000Z",
			}),
			exam({
				examName: "B.Tech 4th Semester Examination 2024",
				session: "2022-26",
				batchYear: "2024",
				examHeld: "February/2025",
				examId: "240104",
				publishDate: "2025-05-22T00:00:00.000Z",
			}),
			exam({
				examName: "B.Tech 8th Semester Supplementary Examination 2026",
				session: "2022-26",
				batchYear: "2026",
				examHeld: "August/2026",
				examId: "2601098",
				semId: 8,
				publishDate: "2026-10-22T00:00:00.000Z",
			}),
		],
	},
	{
		courseid: 2,
		courseName: "M.Tech",
		exams: [
			exam({
				examName: "M.Tech 4th Semester Examination 2026",
				session: "2024-26",
				examId: "260304",
			}),
		],
	},
];

describe("selectPortalExam", () => {
	it("picks the batch's regular exam over a newer supplementary one", () => {
		expect(selectPortalExam(courses, 4, 2023)?.examId).toBe("250104");
	});

	it("uses the supplementary exam when it is the only one for the batch", () => {
		expect(selectPortalExam(courses, 8, 2022)?.examId).toBe("2601098");
	});

	it("never borrows another batch's exam", () => {
		expect(selectPortalExam(courses, 4, 2021)).toBeNull();
	});

	it("stays within B.Tech", () => {
		// The M.Tech row's session starts with 2024, so only the course filter
		// can keep it out.
		expect(selectPortalExam(courses, 4, 2024)).toBeNull();
		expect(selectPortalExam(courses, 4, 2023)?.examName).toContain("B.Tech");
	});

	it("returns nothing when the semester was never published", () => {
		expect(selectPortalExam(courses, 6, 2023)).toBeNull();
	});
});

describe("buildPortalExamUrl", () => {
	it("builds the same /result-two link the portal's exam list builds", () => {
		const link = exam();
		const [base, query] = buildPortalExamUrl(link).split("?d=");
		expect(base).toBe(
			`https://beu-bih.ac.in/result-two/${encodeURIComponent(link.examName)}`,
		);
		const payload = JSON.parse(atob(decodeURIComponent(query)));
		expect(payload).toEqual({
			semester: 4,
			session: "2025",
			exam_held: "December/2025",
			exam_id: "250104",
		});
	});
});

describe("candidateFromExam", () => {
	it("turns a published exam into the request the portal sends itself", () => {
		expect(candidateFromExam(exam(), 4)).toEqual({
			year: "2025",
			semester: "IV",
			examHeld: "December/2025",
			examId: "250104",
		});
	});

	it("refuses an exam with no held date, which could not be requested", () => {
		expect(candidateFromExam(exam({ examHeld: "" }), 4)).toBeNull();
	});
});

describe("resolvePortalExam", () => {
	it("finds the batch's own exam for a semester", async () => {
		const read = await resolvePortalExam(
			4,
			2023,
			async () => new Response(JSON.stringify(courses), { status: 200 }),
		);
		expect(read).toEqual({ ok: true, exam: expect.objectContaining({ examId: "250104" }) });
	});

	it("separates 'nothing published' from 'the list did not answer'", async () => {
		const nothing = await resolvePortalExam(
			6,
			2023,
			async () => new Response(JSON.stringify(courses), { status: 200 }),
		);
		expect(nothing).toEqual({ ok: true, exam: null });

		const down = await resolvePortalExam(4, 2023, async () => new Response("", { status: 500 }));
		expect(down).toEqual({ ok: false });
	});
});

describe("buildPortalResultUrl", () => {
	const candidate = candidateFromExam(exam(), 4);
	if (!candidate) throw new Error("the fixture exam must produce a candidate");

	it("carries the exam id the portal's own request sends", () => {
		expect(buildPortalResultUrl(candidate, REG, "token")).toContain("exam_id=250104");
	});

	it("leaves the parameter out when the id is unknown", () => {
		const { examId: _examId, ...withoutId } = candidate;
		expect(buildPortalResultUrl(withoutId, REG, "token")).not.toContain("exam_id");
	});
});

describe("parsePortalExamList", () => {
	it("keeps the fields the link needs and drops unusable rows", () => {
		const parsed = parsePortalExamList([
			{
				courseid: 3,
				courseName: "B.Tech",
				exams: [
					{
						examName: "B.Tech. 2nd Semester Examination, 2025",
						session: "2024-28",
						batchYear: "2025",
						examHeld: "November/2025",
						semId: 2,
						examId: "250102N",
						publishDate: "2026-03-13T00:00:00.000Z",
					},
					{ examName: "", semId: 2 },
					{ examName: "Broken semester", semId: 99 },
					{ examName: "No exam id", semId: 2, batchYear: "2025", examHeld: "May/2026" },
				],
			},
			{ courseName: "No exams", exams: [] },
		]);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].exams).toHaveLength(1);
		expect(parsed[0].exams[0]).toMatchObject({
			examName: "B.Tech. 2nd Semester Examination, 2025",
			session: "2024-28",
			batchYear: "2025",
			semId: 2,
			examId: "250102N",
		});
		expect(parsePortalExamList(null)).toEqual([]);
	});
});

describe("resolveOfficialExamLink", () => {
	it("says BEU did not answer when the list cannot be read", async () => {
		const link = await resolveOfficialExamLink(
			4,
			2023,
			async () => new Response("", { status: 500 }),
		);
		expect(link).toEqual({
			url: "https://beu-bih.ac.in/result-one",
			examName: null,
			status: "unavailable",
		});
	});

	it("reports an unpublished semester as unpublished, not as a link", async () => {
		const link = await resolveOfficialExamLink(
			4,
			2023,
			async () => new Response(JSON.stringify(courses), { status: 200 }),
		);
		expect(link.status).toBe("matched");

		const missing = await resolveOfficialExamLink(
			6,
			2023,
			async () => new Response(JSON.stringify(courses), { status: 200 }),
		);
		expect(missing).toEqual({
			url: "https://beu-bih.ac.in/result-one",
			examName: null,
			status: "not_published",
		});
	});

	it("returns the exact exam when the list answers", async () => {
		const link = await resolveOfficialExamLink(
			4,
			2023,
			async () => new Response(JSON.stringify(courses), { status: 200 }),
		);
		expect(link.examName).toBe("B.Tech. 4th Semester Examination, 2025");
		expect(link.status).toBe("matched");
		expect(link.url).toContain(
			`/result-two/${encodeURIComponent("B.Tech. 4th Semester Examination, 2025")}?d=`,
		);
	});
});
