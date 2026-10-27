/**
 * The result-page reader — `src/features/results/parse-html.ts`, no network.
 *
 * Runs headless: `nsh test qa/unit/result-parse.test.ts`
 *
 * The fixtures are the two pages BEU has actually served, copied down to their
 * class names:
 *
 *  1. the Angular result page (`/result-three`), where labels sit inside
 *     `<strong>` cells, each section is its own table, and the semester is a
 *     column of the SGPA table;
 *  2. the older ASP.NET page, where `<b>Label:</b>` and its value are adjacent
 *     cells and `Cur. CGPA` is a one-cell table of its own.
 *
 * A page that is not a result — the published-exam list, an error body, random
 * markup — has to come back `null`, because saving a half-read result is worse
 * than asking the student to try again.
 */

import { describe, expect, test } from "nsh/test";
import { htmlToText, parseResultHtml } from "../../src/features/results/parse-html";

/** The real result page: one card, THEORY / PRACTICAL tables, SGPA columns. */
const ANGULAR = `<!doctype html><html><head><style>.watermark{color:#c800001a}</style></head><body>
<app-header><nav><a href="/">Home</a></nav></app-header>
<app-result-three>
  <div class="watermark">WEB COPY</div>
  <div class="container p-4 border border-dark bg-white position-relative">
    <div class="watermark-wrapper"><h1 class="watermark-text">BIHAR ENGINEERING UNIVERSITY, PATNA</h1></div>
    <div class="d-flex align-items-center justify-content-between mb-3">
      <img src="assets/beu_logo.jpeg" alt="BEU Logo" width="130">
      <div class="text-center w-100">
        <h3 class="fw-bold text-uppercase">Bihar Engineering University, Patna</h3>
        <h5 class="fw-semibold text-danger">B.Tech 5th Semester Examination 2025</h5>
      </div>
    </div>
    <table class="table table-bordered cutumtableBasicDetails"><tbody>
      <tr>
        <td colspan="2"><strong>Semester:</strong> V</td>
        <td colspan="3"><strong>Examination (Month/Year):</strong> May/2026</td>
      </tr>
      <tr><td><strong>Registration No:</strong></td><td colspan="3" style="font-weight:600">21105157098</td></tr>
      <tr><td><strong>Student Name:</strong></td><td colspan="3" style="font-weight:600">ASHA KUMARI</td></tr>
      <tr>
        <td><strong>Father's Name:</strong></td><td>RAM KUMAR</td>
        <td><strong>Mother's Name:</strong></td><td>SITA DEVI</td>
      </tr>
      <tr><td><strong>College Name:</strong></td><td colspan="3">157 - Government Engineering College, Sheikhpura</td></tr>
      <tr><td><strong>Course Name:</strong></td><td colspan="3">105 - Computer Science &amp; Engineering</td></tr>
    </tbody></table>

    <h6 class="fw-bold text-light p-2 mb-0 bg-secondary">THEORY</h6>
    <table class="table table-bordered table-sm">
      <thead><tr><th>Subject Code</th><th>Subject Name</th><th>ESE</th><th>IA</th><th>Total</th><th>Grade</th><th>Credit</th></tr></thead>
      <tbody>
        <tr><td>105501</td><td>Design and Analysis of Algorithms</td><td>56</td><td>24</td><td>80</td><td>A</td><td>4</td></tr>
        <tr><td>105502</td><td>Computer Networks</td><td>48</td><td>22</td><td>70</td><td>B+</td><td>3</td></tr>
        <tr><td>105503</td><td>Operating Systems</td><td>12</td><td>8</td><td>20</td><td>F</td><td>3</td></tr>
      </tbody>
    </table>

    <h6 class="fw-bold text-light p-2 mb-0 bg-secondary">PRACTICAL</h6>
    <table class="table table-bordered table-sm">
      <thead><tr><th>Subject Code</th><th>Subject Name</th><th>ESE</th><th>IA</th><th>Total</th><th>Grade</th><th>Credit</th></tr></thead>
      <tbody>
        <tr><td>105502P</td><td>Computer Networks Lab</td><td>18</td><td>22</td><td>40</td><td>A</td><td>2</td></tr>
      </tbody>
    </table>

    <h6 class="fw-bold text-light p-2 mb-0 bg-secondary">SGPA / CGPA</h6>
    <table class="table table-bordered text-center table-sm">
      <thead><tr><th>Semester</th><th>I</th><th>II</th><th>III</th><th>IV</th><th>V</th><th>VI</th><th>VII</th><th>VIII</th><th>Cur. CGPA</th></tr></thead>
      <tbody><tr><th>SGPA</th><td>7.80</td><td>8.10</td><td>8.20</td><td>8.30</td><td>8.42</td><td>-</td><td>-</td><td>-</td><td>8.31</td></tr></tbody>
    </table>

    <p class="border border-dark p-2"><strong>Remarks: </strong><span class="fw-bold text-danger">FAIL</span></p>
  </div>
</app-result-three>
<app-footer><p>Call Us: 0612-2385475</p></app-footer>
</body></html>`;

/** The older ASP.NET page: label and value in adjacent cells, one table per group. */
const LEGACY = `<html><body><div class="rnd">
  <span id="ContentPlaceHolder1_lblExamName">B.Tech. 1st Semester Examination, 2024</span>
  <table>
    <tr><td><b>Registration No:</b></td><td><span>24101001001</span></td></tr>
    <tr><td><b>Student Name:</b></td><td><span>JOHN DOE</span></td></tr>
    <tr><td><b>Semester:</b></td><td><span id="ContentPlaceHolder1_DataList2_SemesterLabel_0">1</span></td></tr>
    <tr><td><b>Examination Held:</b></td><td><span>Dec 2023</span></td></tr>
    <tr><td><b>College Name:</b></td><td><span>Government Engineering College, Sheikhpura</span></td></tr>
  </table>
  <table id="ContentPlaceHolder1_GridView1">
    <tr align="center"><th>Code</th><th>Name</th><th>ESE</th><th>IA</th><th>Total</th><th>Grade</th><th>Credit</th></tr>
    <tr align="center"><td>101</td><td>MATH</td><td>50</td><td>20</td><td>70</td><td>B</td><td>4</td></tr>
    <tr align="center"><td>102</td><td>PHYSICS</td><td>44</td><td>18</td><td>62</td><td>C</td><td>3</td></tr>
  </table>
  <table><tr><td><strong>SGPA:</strong> <span>8.5</span></td></tr></table>
  <table><tr><th>Cur. CGPA</th></tr><tr><td>8.5</td></tr></table>
  <table><tr><td><strong>Remarks:</strong> <span>PASS</span></td></tr></table>
</div></body></html>`;

/** `/result-one`: the published exam list. Not a result, no marks. */
const EXAM_LIST = `<html><body>
  <h2>Examination Results (use the links below to access results)</h2>
  <table class="table table-bordered table-striped table-hover">
    <thead><tr><th>Examinations Name</th><th>Batch/ Session</th><th>Exam Held</th><th>Published Date</th></tr></thead>
    <tr class="table-secondary"><td colspan="4"><h4>B.Tech</h4></td></tr>
    <tr class="clickable-row"><td>B.Tech 5th Semester Examination 2025</td><td>2023-27</td><td>May/2026</td><td>21/08/2026</td></tr>
    <tr class="clickable-row"><td>B.Tech 3rd Semester Examination 2025</td><td>2024-28</td><td>April/2026</td><td>20/08/2026</td></tr>
  </table>
</body></html>`;

describe("the Angular result page", () => {
  const parsed = parseResultHtml(ANGULAR, { sem: 5 });

  test("reads the student, the exam and the semester", () => {
    expect(parsed).not.toBe(null);
    if (!parsed) return;
    expect(parsed.reg).toBe("21105157098");
    expect(parsed.name).toBe("ASHA KUMARI");
    expect(parsed.fatherName).toBe("RAM KUMAR");
    expect(parsed.motherName).toBe("SITA DEVI");
    expect(parsed.semester).toBe(5);
    expect(parsed.examHeld).toBe("May/2026");
    expect(parsed.examYear).toBe("2026");
  });

  test("splits the college and course codes from their names", () => {
    if (!parsed) return;
    expect(parsed.collegeCode).toBe("157");
    expect(parsed.collegeName).toBe("Government Engineering College, Sheikhpura");
    expect(parsed.course).toBe("Computer Science & Engineering");
  });

  test("reads every paper, with its marks, grade and credit", () => {
    if (!parsed) return;
    expect(parsed.subjects.length).toBe(4);
    const [first, second, third, lab] = parsed.subjects;
    expect(first.code).toBe("105501");
    expect(first.name).toBe("Design and Analysis of Algorithms");
    expect(first.ese).toBe("56");
    expect(first.ia).toBe("24");
    expect(first.total).toBe("80");
    expect(first.grade).toBe("A");
    expect(first.credit).toBe("4");
    expect(first.kind).toBe("theory");
    expect(second.grade).toBe("B+");
    expect(third.grade).toBe("F");
    // The PRACTICAL section decides the kind, not just the code suffix.
    expect(lab.code).toBe("105502P");
    expect(lab.kind).toBe("practical");
    expect(lab.credit).toBe("2");
  });

  test("takes the SGPA of the student's own semester, not the last column", () => {
    if (!parsed) return;
    expect(parsed.sgpa).toBe(8.42);
    expect(parsed.cgpa).toBe(8.31);
    // The page prints every semester it knows, so the trend is complete after
    // one capture: slots I–V filled, the rest still empty.
    expect(parsed.history).toEqual([7.8, 8.1, 8.2, 8.3, 8.42, null, null, null]);
    // The page's own semester is a Roman numeral; without it the column comes
    // from the semester the student asked for.
    const anonymous = ANGULAR.replace("<strong>Semester:</strong> V", "");
    expect(parseResultHtml(anonymous, { sem: 3 })?.sgpa).toBe(8.2);
    expect(parseResultHtml(anonymous, { sem: 4 })?.sgpa).toBe(8.3);
  });

  test("counts credits, marks the backlog and keeps the remarks", () => {
    if (!parsed) return;
    expect(parsed.credits).toBe(12);
    expect(parsed.status).toBe("FAIL");
    expect(parsed.failed).toEqual(["105503"]);
  });

  test("falls back to the params when the page omits them", () => {
    const stripped = ANGULAR.replace(/<tr><td><strong>Registration No:<\/strong><\/td><td[^>]*>21105157098<\/td><\/tr>/, "");
    const parsedStripped = parseResultHtml(stripped, { reg: "21105157098", sem: 5 });
    expect(parsedStripped?.reg).toBe("21105157098");
    expect(parsedStripped?.subjects.length).toBe(4);
  });
});

describe("the older ASP.NET page", () => {
  const parsed = parseResultHtml(LEGACY, { sem: 1 });

  test("reads labels from adjacent cells", () => {
    expect(parsed).not.toBe(null);
    if (!parsed) return;
    expect(parsed.reg).toBe("24101001001");
    expect(parsed.name).toBe("JOHN DOE");
    expect(parsed.semester).toBe(1);
    expect(parsed.examHeld).toBe("Dec 2023");
    expect(parsed.examYear).toBe("2023");
  });

  test("reads the paper table without a section heading", () => {
    if (!parsed) return;
    expect(parsed.subjects.length).toBe(2);
    expect(parsed.subjects[0]).toEqual({
      code: "101",
      name: "MATH",
      kind: "theory",
      ese: "50",
      ia: "20",
      total: "70",
      grade: "B",
      credit: "4",
    });
    expect(parsed.credits).toBe(7);
  });

  test("reads a SGPA label and a one-cell CGPA table", () => {
    if (!parsed) return;
    expect(parsed.sgpa).toBe(8.5);
    expect(parsed.cgpa).toBe(8.5);
    expect(parsed.status).toBe("PASS");
    expect(parsed.failed).toEqual([]);
    // This page has no semester series, so nothing is invented.
    expect(parsed.history).toEqual([null, null, null, null, null, null, null, null]);
  });
});

describe("a page that is not a result", () => {
  test("the published-exam list is not a result", () => {
    expect(parseResultHtml(EXAM_LIST, { sem: 5 })).toBe(null);
  });

  test("an error body is not a result", () => {
    const body = `<html><body><div class="alert alert-danger py-2 small mt-3 mb-0">
      <span class="text-danger">Please complete the CAPTCHA verification.</span>
    </div></body></html>`;
    expect(parseResultHtml(body, { reg: "21105157098", sem: 5 })).toBe(null);
  });

  test("random markup, empty strings and broken tags return null", () => {
    expect(parseResultHtml("<p>Service unavailable</p>", { sem: 5 })).toBe(null);
    expect(parseResultHtml("", { sem: 5 })).toBe(null);
    expect(parseResultHtml("<table><tr><td>hello", { sem: 5 })).toBe(null);
    expect(parseResultHtml("<html><body><table><tr><th>Lang</th><th>Score</th></tr><tr><td>C</td><td>9</td></tr></table></body></html>", { sem: 5 })).toBe(null);
  });

  test("a page with marks but no semester is not saved", () => {
    const noSemester = LEGACY.replace("<tr><td><b>Semester:</b></td><td><span id=\"ContentPlaceHolder1_DataList2_SemesterLabel_0\">1</span></td></tr>", "");
    expect(parseResultHtml(noSemester, { sem: 0 })).toBe(null);
  });
});

describe("htmlToText", () => {
  test("flattens tags, decodes entities and collapses whitespace", () => {
    expect(htmlToText("<p>SGPA&nbsp;/&nbsp;CGPA</p>\n\n <b>8.4</b>")).toBe("SGPA / CGPA 8.4");
    expect(htmlToText("Father&#39;s Name: RAM")).toBe("Father's Name: RAM");
    expect(htmlToText("<div>a</div><div>b</div>")).toBe("a b");
  });
});
