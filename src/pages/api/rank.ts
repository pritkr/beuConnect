import type { APIRoute } from "astro";
import { lookupRank } from "../../lib/rank/lookup";

export const prerender = false;

const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	/* A student's rank is fixed until the CSVs are re-scraped, so the edge may
	   hold it far longer than the browser. */
	"cache-control": "public, max-age=300, s-maxage=3600",
};

const reply = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/**
 * Where one CGPA places a student.
 *
 *   GET /api/rank?reg=23101108080&sem=4
 *   200 { status: 200, data: { branchRank, branchTotal, universityRank, ... } }
 *   400 { status: 400, message: "..." }   unusable register or semester
 *   404 { status: 404, message: "..." }   no stored result data for it
 *
 * Only semesters that carry a CGPA are answerable: the scrapers write the
 * roster for every semester but fill CGPA in for the latest one, so an older
 * semester honestly has nothing to rank.
 */
export const GET: APIRoute = async ({ url }) => {
	const raw = url.searchParams.get("reg") ?? "";
	const semester = Number.parseInt(url.searchParams.get("sem") ?? "", 10);

	const result = await lookupRank(url.origin, raw, semester);

	if (result.status === "ok") {
		return reply({ status: 200, data: result.data });
	}

	if (result.status === "invalid") {
		return reply({ status: 400, message: "Enter a registration number and a semester." }, 400);
	}

	return reply(
		{
			status: 404,
			message:
				result.status === "not_found"
					? "This registration number is not in the stored result data."
					: "No stored result data for this semester yet.",
		},
		404,
	);
};
