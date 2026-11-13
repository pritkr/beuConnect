/**
 * Client helper for the GECS register route.
 *
 * The register answers "who is this registration number" offline of the BEU
 * result portal, which now sits behind a captcha. Callers must treat a miss as
 * normal: only one college is covered.
 */
export interface StudentIdentity {
	regNo: string;
	name: string;
	branch: string;
	branchLabel?: string;
	session?: string;
	rollNo?: string;
	section?: string;
	provisionalReg?: boolean;
}

const memo = new Map<string, StudentIdentity | null>();

export async function fetchStudent(
	regNo: string,
	base: string = import.meta.env.BASE_URL,
): Promise<StudentIdentity | null> {
	const key = regNo.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
	if (!key) return null;
	if (memo.has(key)) return memo.get(key) ?? null;

	try {
		const response = await fetch(
			`${base}api/student?reg=${encodeURIComponent(key)}`,
			{ headers: { accept: "application/json" } },
		);
		if (!response.ok) {
			memo.set(key, null);
			return null;
		}
		const payload = (await response.json()) as {
			status?: number;
			data?: StudentIdentity;
		};
		const student = payload.status === 200 && payload.data ? payload.data : null;
		memo.set(key, student);
		return student;
	} catch {
		memo.set(key, null);
		return null;
	}
}
