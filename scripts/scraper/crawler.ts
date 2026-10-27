import { fetchWithTimeout } from "./utils.js";

// Mirroring the API's Special Cases for JSON endpoints
const SPECIAL_CASES: Record<string, any> = {
	"25-1": {
		year: "2025",
		semester: "I",
		examHeld: "January/2026",
	},
	"22-7": {
		year: "2025",
		semester: "VII",
		examHeld: "February/2026",
	},
	"24-1": { year: "2024", semester: "I", examHeld: "May/2025" },
	"24-2": { year: "2025", semester: "II", examHeld: "November/2025" },
	"23-4": { year: "2025", semester: "IV", examHeld: "December/2025" },
	"22-6": { year: "2025", semester: "VI", examHeld: "November/2025" },
	"23-3": { year: "2024", semester: "III", examHeld: "July/2025" },
	"22-5": { year: "2024", semester: "V", examHeld: "July/2025" },
	"21-8": { year: "2025", semester: "VIII", examHeld: "May/2025" },
};

const SEM_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export interface SubjectRow {
	code: string;
	name: string;
	ese: string;
	ia: string;
	total: string;
	grade: string;
	credit: string;
}

export interface ResultPayload {
	examYear?: string;
	exam_held?: string;
	semester?: string;
	redg_no?: string;
	name?: string;
	father_name?: string;
	mother_name?: string;
	college_code?: string;
	college_name?: string;
	course_code?: string;
	course?: string;
	theorySubjects?: SubjectRow[];
	practicalSubjects?: SubjectRow[];
	sgpa?: Array<string | null>;
	cgpa?: string;
	fail_any?: string;
}

function getSemOffset(semester: number): number {
	if (semester === 1) return 0;
	if (semester === 2 || semester === 3) return 1;
	if (semester === 4 || semester === 5) return 2;
	if (semester === 6 || semester === 7) return 3;
	return 4;
}

function extractNumber(html: string, id: string): string {
	const regex = new RegExp(`id="${id}"[^>]*>([^<]+)<\/span>`, "i");
	const match = html.match(regex);
	return match ? match[1].trim() : "";
}

function extractSubjects(html: string, gridId: string): SubjectRow[] {
	const subjects: SubjectRow[] = [];
	const gridRegex = new RegExp(`<table[^>]*id="${gridId}"[^>]*>([\\s\\S]*?)<\\/table>`, "i");
	const gridMatch = html.match(gridRegex);
	
	if (!gridMatch) return subjects;
	
	const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
	let rowMatch;
	let i = 0;
	while ((rowMatch = rowRegex.exec(gridMatch[1])) !== null) {
		const rowHtml = rowMatch[1];
		// Skip header rows or empty records
		if (rowHtml.includes("<th") || rowHtml.includes("No Record")) continue;
		
		const cellRegex = /<td[^>]*>(?:<span[^>]*>)?([\s\S]*?)(?:<\/span>)?<\/td>/gi;
		const cells = [];
		let cellMatch;
		while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            // Strip inner tags if any remain
			cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
		}
		
		if (cells.length >= 7) {
			subjects.push({
				code: cells[0],
				name: cells[1],
				ese: cells[2],
				ia: cells[3],
				total: cells[4],
				grade: cells[5],
				credit: cells[6]
			});
		}
	}
	return subjects;
}

// Fallback HTML Parser for Old Semesters without JSON APIs
function parseLegacyHtml(html: string): ResultPayload | null {
    if (!html.includes("ContentPlaceHolder1_DataList1_RegistrationNoLabel_0")) {
        return null; // Invalid or missing HTML structure
    }

	const sgpaHistory = [];
	const sgpaRegex = /<tr align="center">([\s\S]*?)<td><span id="ContentPlaceHolder1_GridView3_CurCgpaLabel/i;
	const sgpaRowMatch = html.match(sgpaRegex);
	if (sgpaRowMatch) {
		const tdRegex = /<td>([^<]*)<\/td>/gi;
		let tdMatch;
		while ((tdMatch = tdRegex.exec(sgpaRowMatch[1])) !== null) {
			const val = tdMatch[1].trim();
			sgpaHistory.push(val && val !== "-" && val !== "NA" ? val : null);
		}
	}

	return {
		exam_held: extractNumber(html, "ContentPlaceHolder1_DataList2_ExamHeldLabel_0"),
		semester: extractNumber(html, "ContentPlaceHolder1_DataList2_SemesterLabel_0"),
		redg_no: extractNumber(html, "ContentPlaceHolder1_DataList1_RegistrationNoLabel_0"),
		name: extractNumber(html, "ContentPlaceHolder1_DataList1_StudentNameLabel_0"),
		father_name: extractNumber(html, "ContentPlaceHolder1_DataList1_FatherNameLabel_0"),
		mother_name: extractNumber(html, "ContentPlaceHolder1_DataList1_MotherNameLabel_0"),
		college_code: extractNumber(html, "ContentPlaceHolder1_DataList1_CollegeNameLabel_0").split("-")[0]?.trim(),
        college_name: extractNumber(html, "ContentPlaceHolder1_DataList1_CollegeNameLabel_0").split("-")[1]?.trim(),
		course_code: extractNumber(html, "ContentPlaceHolder1_DataList1_CourseNameLabel_0").split("-")[0]?.trim(),
		theorySubjects: extractSubjects(html, "ContentPlaceHolder1_GridView1"),
		practicalSubjects: extractSubjects(html, "ContentPlaceHolder1_GridView2"),
		sgpa: sgpaHistory,
		cgpa: extractNumber(html, "ContentPlaceHolder1_GridView3_CurCgpaLabel_0"),
		fail_any: extractNumber(html, "ContentPlaceHolder1_DataList7_RemarksLabel_0")
	};
}

export async function fetchFullStudentData(regNo: string, semester: number, session: string): Promise<{ found: boolean, data?: ResultPayload }> {
	const batchYY = parseInt(session, 10);
	const specialCase = SPECIAL_CASES[`${batchYY}-${semester}`];

	if (specialCase) {
        // Try JSON direct
		try {
			// 1. Fetch a fresh dynamic single-use token from the university portal
			let token: string | null = null;
			try {
				const tokenResp = await fetchWithTimeout(
					"https://beu-bih.ac.in/backend/v1/result/token",
					{
						headers: {
							accept: "application/json, text/plain, */*",
							referer: "https://beu-bih.ac.in/result-three",
							"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						},
					},
					8000,
				);
				if (tokenResp.ok) {
					const tokenJson = (await tokenResp.json()) as { token?: string };
					token = tokenJson.token || null;
				}
			} catch (err) {
				// fallback silently
			}

			if (token) {
				const jsonUrl = `https://beu-bih.ac.in/backend/v1/result/get-result?year=${specialCase.year}&redg_no=${encodeURIComponent(regNo)}&semester=${specialCase.semester}&exam_held=${encodeURIComponent(specialCase.examHeld)}&token=${encodeURIComponent(token)}`;
				const res = await fetchWithTimeout(jsonUrl, {
					headers: {
						accept: "application/json, text/plain, */*",
						referer: "https://beu-bih.ac.in/",
						"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					},
				});
				const data = await res.json() as any;
				if (res.ok && data.status === 200 && data.data) {
					// PATCH: BEU Backend has a 32-bit integer overflow bug for 2024+ registration numbers!
					// It returns -2147483648 for everyone. We forcefully inject the original regNo.
					data.data.redg_no = regNo;
					return { found: true, data: data.data };
				}
			}
		} catch (e) {
			// fallback silently
		}
	}

    // Try HTML Legacy Direct (Bypass Localhost API)
	const semRoman = SEM_ROMAN[semester - 1];
    const isLateral = parseInt(regNo.slice(-3)) >= 900;
	const effectiveBatchYY = isLateral ? Math.max(0, batchYY - 1) : batchYY;
	const urlYearFull = 2000 + effectiveBatchYY + getSemOffset(semester);

	const legacyUrl = `https://results.beup.ac.in/ResultsBTech${semester === 1 ? '1st' : semester === 2 ? '2nd' : semester === 3 ? '3rd' : semester + 'th'}Sem${urlYearFull}_B20${effectiveBatchYY}Pub.aspx?Sem=${semRoman}&RegNo=${encodeURIComponent(regNo)}`;

	try {
		const res = await fetchWithTimeout(legacyUrl);
		const html = await res.text();
		const parsed = parseLegacyHtml(html);
        if (parsed) return { found: true, data: parsed };
	} catch (e) {
       // Timeout or connection error
	}

	return { found: false };
}
