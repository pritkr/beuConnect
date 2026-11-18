import { describe, expect, it } from "vitest";
import { buildCaptchaHTML, buildErrorHTML } from "./htmlBuilder";

const REG = "23105101045";
const EXAM_URL = `https://beu-bih.ac.in/result-two/${encodeURIComponent("B.Tech. 4th Semester Examination, 2025")}?d=abc`;

function errorCardText(html: string): string {
	const start = html.indexOf('<div class="error-card">');
	const end = html.indexOf("</div>", start);
	return html.slice(start, end);
}

describe("buildCaptchaHTML", () => {
	it("opens the matched exam and carries the number onto the link", () => {
		const html = buildCaptchaHTML({
			officialUrl: EXAM_URL,
			examName: "B.Tech. 4th Semester Examination, 2025",
			registrationNo: REG,
			semester: 4,
		});
		expect(html).toContain(`href="${EXAM_URL.replace(/&/g, "&amp;")}"`);
		expect(html).toContain('target="_blank" rel="noopener"');
		expect(html).toContain(`data-copy="${REG}"`);
		expect(html).toContain("Open semester 4 exam");
		expect(html).toContain(`<code>${REG}</code>`);
		expect(html).toContain("<script>");
	});

	it("sends an unpublished semester nowhere near the exam list", () => {
		const html = buildCaptchaHTML({
			officialUrl: "https://beu-bih.ac.in/result-one",
			examName: null,
			status: "not_published",
			registrationNo: REG,
			semester: 4,
		});
		expect(html).toContain("This result is not out yet");
		expect(html).toContain("BEU has not published the semester 4 exam for your batch yet");
		expect(html).not.toContain("result-one");
		expect(html).not.toContain("/result-three");
		expect(html).not.toContain("data-copy");
	});

	it("never shows an exam list next to a matched exam", () => {
		const html = buildCaptchaHTML({
			officialUrl: EXAM_URL,
			examName: "B.Tech. 4th Semester Examination, 2025",
			status: "matched",
			registrationNo: REG,
			semester: 4,
		});
		expect(html).not.toContain("result-one");
		expect(html).not.toContain("All exams");
	});

	it("keeps BEU reachable when its own exam list did not answer", () => {
		const html = buildCaptchaHTML({
			officialUrl: "https://beu-bih.ac.in/result-one",
			status: "unavailable",
			registrationNo: REG,
			semester: 4,
		});
		expect(html).toContain("BEU did not answer");
		expect(html).toContain('href="https://beu-bih.ac.in/result-one"');
		expect(html).not.toContain("data-copy");
	});

	it("drops the number block when there is nothing to copy", () => {
		const html = buildCaptchaHTML({
			officialUrl: "https://beu-bih.ac.in/result-one",
			status: "not_published",
			semester: 2,
		});
		expect(html).not.toContain("data-copy");
		expect(html).not.toContain('class="captcha-number"');
		expect(html).not.toContain("<script>");
	});

	it("shows the number once, as data rather than prose", () => {
		const html = buildCaptchaHTML({
			officialUrl: EXAM_URL,
			status: "matched",
			registrationNo: REG,
			semester: 4,
		});
		// The click-to-open link, the copy button and the code block.
		expect(html.split(REG)).toHaveLength(4);
		expect(errorCardText(html)).not.toContain(REG);
	});

	it("offers a retry without it displacing the primary action", () => {
		const html = buildCaptchaHTML({
			officialUrl: EXAM_URL,
			registrationNo: REG,
			semester: 4,
			retryHref: "/result?reg=23105101045&sem=4",
		});
		expect(html.indexOf("action-primary")).toBeLessThan(html.indexOf("Try again"));
		expect(html).toContain('href="/result?reg=23105101045&amp;sem=4"');
	});

	it("marks itself as a handoff, with the reason the page reports", () => {
		const matched = buildCaptchaHTML({ examName: "B.Tech. 4th Semester Examination, 2025" });
		expect(matched).toContain('data-card-kind="handoff"');
		expect(matched).toContain('data-card-reason="matched"');

		const missing = buildCaptchaHTML({ status: "not_published" });
		expect(missing).toContain('data-card-reason="not_published"');
	});
});

describe("buildErrorHTML", () => {
	it("marks itself as an error, never a handoff", () => {
		const html = buildErrorHTML("Result not found", "Nothing here.", {});
		expect(html).toContain('data-card-kind="error"');
		expect(html).not.toContain("data-card-reason");
	});
});
