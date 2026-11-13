import type { APIRoute } from "astro";
import { findStudent } from "../../lib/students/register";

export const prerender = false;

const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "public, max-age=3600, s-maxage=86400",
};

const reply = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/**
 * Resolve a registration number against the GECS register.
 *
 *   GET /api/student?reg=24105157010
 *   200 { status: 200, data: { regNo, name, branch, session, ... } }
 *   404 { status: 404, message: "..." }
 *
 * Only the college roster is covered. A miss is normal for other colleges and
 * callers must keep working with the branch and semester they can derive from
 * the number itself.
 */
export const GET: APIRoute = ({ url }) => {
	const raw = url.searchParams.get("reg")?.trim() ?? "";
	const regNo = raw.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();

	if (regNo.length < 6) {
		return reply({ status: 400, message: "Registration number is too short." }, 400);
	}

	const student = findStudent(regNo);
	if (!student) {
		return reply({ status: 404, message: "Not in the register." }, 404);
	}

	return reply({ status: 200, data: student });
};
