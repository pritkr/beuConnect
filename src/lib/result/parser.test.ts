import { describe, it, expect } from 'vitest';
import { normalizeFailedSubjects, extractLegacyResultMarkup, parseLegacyHtmlToJson } from './parser';

describe('Result Parser', () => {
    describe('parseLegacyHtmlToJson', () => {
        it('should correctly parse legacy HTML into JSON', () => {
            const html = `
                <html><body><div class="rnd">
                    <span id="ContentPlaceHolder1_lblExamName">B.Tech. 1st Semester Examination, 2024</span>
                    <table>
                        <tr>
                            <td><b>Registration No:</b></td><td><span>24101001001</span></td>
                        </tr>
                        <tr>
                            <td><b>Student Name:</b></td><td><span>JOHN DOE</span></td>
                        </tr>
                        <tr>
                            <td><b>Semester:</b></td><td><span id="ContentPlaceHolder1_DataList2_SemesterLabel_0">1</span></td>
                        </tr>
                    </table>
                    <table id="ContentPlaceHolder1_GridView1">
                        <tr align="center"><th>Code</th><th>Name</th><th>ESE</th><th>IA</th><th>Total</th><th>Grade</th><th>Credit</th></tr>
                        <tr align="center">
                            <td>101</td><td>MATH</td><td>50</td><td>20</td><td>70</td><td>B</td><td>4</td>
                        </tr>
                    </table>
                    <table>
                        <tr><td><strong>SGPA:</strong> <span>8.5</span></td></tr>
                    </table>
                    <table>
                        <tr><th>Cur. CGPA</th></tr>
                        <tr><td>8.5</td></tr>
                    </table>
                    <table>
                        <tr><td><strong>Remarks:</strong> <span>PASS</span></td></tr>
                    </table>
                </div></body></html>
            `;
            const result = parseLegacyHtmlToJson(html);
            expect(result).not.toBeNull();
            expect(result?.name).toBe('JOHN DOE');
            expect(result?.redg_no).toBe('24101001001');
            expect(result?.semester).toBe('1');
            expect(result?.theorySubjects?.[0].name).toBe('MATH');
            expect(result?.sgpa?.[0]).toBe('8.5');
            expect(result?.cgpa).toBe('8.5');
            expect(result?.fail_any).toBe('PASS');
        });
    });
});
