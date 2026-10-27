export interface ParsedBeuRegNo {
	regNo: string;
	numericReg: string;
	collegeCode: string;
	collegeName: string;
	branchCode: string;
	branchName: string;
	branchPath: string;
	batchYear: number;
	currentSem: number;
	isLateral: boolean;
	rollNumber: number;
}

export const collegeMap: Record<string, string> = {
	"102": "Vidya Vihar Institute of Technology, Purnea",
	"103": "Netaji Subhas Institute of Technology, Bihta",
	"106": "Sityog Institute of Technology, Aurangabad",
	"107": "Muzaffarpur Institute of Technology, Muzaffarpur",
	"108": "Bhagalpur College of Engineering, Bhagalpur",
	"109": "Nalanda College of Engineering, Chandi",
	"110": "Gaya College of Engineering, Gaya",
	"111": "Darbhanga College of Engineering, Darbhanga",
	"113": "Motihari College of Engineering, Motihari",
	"115": "Azmet Institute of Technology, Kishanganj",
	"117": "Lok Nayak Jai Prakash Institute of Technology, Chapra",
	"118": "Buddha Institute of Technology, Gaya",
	"119": "Adwaita Mission Institute of Technology, Banka",
	"121": "Moti Babu Institute of Technology, Forbesganj",
	"122": "Exalt College of Engineering & Technology, Vaishali",
	"123": "Siwan Engineering & Technical Institute, Siwan",
	"124": "Sershah Engineering College, Sasaram",
	"125": "RRSDCE, Begusarai",
	"126": "Bakhtiyarpur College of Engineering, Patna",
	"127": "Sitamarhi Institute of Technology, Sitamarhi",
	"128": "B. P. Mandal College of Engineering, Madhepura",
	"129": "Katihar Engineering College, Katihar",
	"130": "Supaul College of Engineering, Supaul",
	"131": "Purnea College of Engineering, Purnea",
	"132": "Saharsa College of Engineering, Saharsa",
	"133": "Government Engineering College, Jamui",
	"134": "Government Engineering College, Banka",
	"135": "Government Engineering College, Vaishali",
	"136": "Mothers Institute of Technology, Bihta",
	"139": "R.P. Sharma Institute of Technology, Patna",
	"140": "Maulana Azad College of Engineering & Technology, Patna",
	"141": "Government Engineering College, Nawada",
	"142": "Government Engineering College, Kishanganj",
	"144": "Government Engineering College, Munger",
	"145": "Government Engineering College, Sheohar",
	"146": "Government Engineering College, West Champaran",
	"147": "Government Engineering College, Aurangabad",
	"148": "Government Engineering College, Kaimur",
	"149": "Government Engineering College, Gopalganj",
	"150": "Government Engineering College, Madhubani",
	"151": "Government Engineering College, Siwan",
	"152": "Government Engineering College, Jehanabad",
	"153": "Government Engineering College, Arwal",
	"154": "Government Engineering College, Khagaria",
	"155": "Government Engineering College, Buxar",
	"156": "Government Engineering College, Bhojpur",
	"157": "Government Engineering College, Sheikhpura",
	"158": "Government Engineering College, Lakhisarai",
	"159": "Government Engineering College, Samastipur",
	"165": "Shri Phanishwar Nath Renu Engineering College, Araria",
	"166": "Millia Kishanganj College of Engineering and Technology, Kishanganj",
	"167": "Millia Institute of Technology, Purnia",
	"168": "Prabhu Kailash Engineering College, Aurangabad",
	"169": "CIPET, Bihta",
	"170": "Dr. Ashok Gagan College, Bihta",
	"171": "Hi-tech Polytechnic College, Bettiah, West Champaran",
	"172": "Rajeev College of Professional Education, Sitamarhi",
	"173": "IMPACT, Patna",
	"174": "Rungta Institute of Technology and Management, Araria",
	"175": "J. P College of Engineering, Nalanda",
};

export const branchMap: Record<string, string> = {
	"101": "Civil Engineering",
	"102": "Mechanical Engineering",
	"103": "Electrical Engineering",
	"104": "Electronics & Communication Engineering",
	"105": "Computer Science & Engineering",
	"106": "Information Technology",
	"107": "Leather Technology Engineering",
	"110": "Electrical & Electronics Engineering",
	"161": "Mechatronics Engineering",
};

export const branchPathMap: Record<string, string> = {
	"101": "civil",
	"102": "mech",
	"103": "ee",
	"104": "ece",
	"105": "cse",
	"110": "eee",
	"151": "cse",
	"152": "cse",
	"153": "cse",
	"154": "cse",
	"155": "cse",
	"156": "cse",
	"157": "cse",
	"161": "eee",
	"163": "ece",
};

const batchToSemMap: Record<number, number> = {
	2025: 2,
	2024: 4,
	2023: 5,
	2022: 8,
	2021: 8,
};

export function normalizeRegNo(regNo: string): string {
	return regNo.trim().toUpperCase();
}

export function inferLateralEntry(numericReg: string): boolean {
	if (numericReg.length < 3) return false;
	const rollNumber = Number.parseInt(numericReg.slice(-3), 10);
	return Number.isFinite(rollNumber) && rollNumber >= 900;
}

export function inferCurrentSemester(batchYear: number): number {
	const mappedSemester = batchToSemMap[batchYear];
	if (mappedSemester !== undefined) return mappedSemester;
	return batchYear < 2021 ? 8 : 1;
}

export function parseBeuRegNo(regNo: string): ParsedBeuRegNo | null {
	const normalizedReg = normalizeRegNo(regNo);
	if (!normalizedReg) return null;

	const numericReg = normalizedReg.replace(/\D/g, "");
	if (numericReg.length < 10) return null;

	const batchPrefix = numericReg.slice(0, 2);
	let batchYear = Number.parseInt(`20${batchPrefix}`, 10);
	if (!Number.isFinite(batchYear)) return null;

	const branchCode = numericReg.slice(2, 5);
	const collegeCode = numericReg.slice(5, 8);
	const rollNumber = Number.parseInt(numericReg.slice(-3), 10);
	const isLateral = inferLateralEntry(numericReg);

	if (!Number.isFinite(rollNumber)) return null;
	if (isLateral) batchYear -= 1;

	return {
		regNo: normalizedReg,
		numericReg,
		collegeCode,
		collegeName: collegeMap[collegeCode] || `College ${collegeCode}`,
		branchCode,
		branchName: branchMap[branchCode] || `Branch ${branchCode}`,
		branchPath: branchPathMap[branchCode] || "cse",
		batchYear,
		currentSem: inferCurrentSemester(batchYear),
		isLateral,
		rollNumber,
	};
}
