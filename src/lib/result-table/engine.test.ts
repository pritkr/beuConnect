import { describe, it, expect } from 'vitest';
import { parseCSV, parseScore, normalizeRows, sortRowsByCgpa, assignCgpaRanks, assignCollegeRanks } from './engine';

describe('Result Table Engine', () => {
    describe('parseCSV', () => {
        it('should correctly parse simple CSV', () => {
            const csv = "RegNo,Name,SGPA\n123,John,8.5\n456,Jane,9.0";
            expect(parseCSV(csv)).toEqual([
                { RegNo: "123", Name: "John", SGPA: "8.5" },
                { RegNo: "456", Name: "Jane", SGPA: "9.0" }
            ]);
        });

        it('should correctly parse CSV with quotes', () => {
            const csv = 'RegNo,Name,SGPA\n123,"John, Doe",8.5';
            expect(parseCSV(csv)).toEqual([
                { RegNo: "123", Name: "John, Doe", SGPA: "8.5" }
            ]);
        });
    });

    describe('parseScore', () => {
        it('should extract valid numbers', () => {
            expect(parseScore("8.56")).toBe(8.56);
            expect(parseScore("FAIL")).toBeNull();
            expect(parseScore("NA")).toBeNull();
            expect(parseScore("")).toBeNull();
        });
    });

    describe('Ranking Logic', () => {
        it('should sort rows correctly and handle ties', () => {
            const rows = [
                { RegNo: "3", Name: "Alice", CollegeCode: "101", CollegeName: "A", SGPAValue: 8.0, CGPAValue: 8.5, SGPAText: "8.0", CGPAText: "8.5", Rank: null, CollegeRank: null },
                { RegNo: "1", Name: "Bob", CollegeCode: "101", CollegeName: "A", SGPAValue: 9.0, CGPAValue: 9.0, SGPAText: "9.0", CGPAText: "9.0", Rank: null, CollegeRank: null },
                { RegNo: "2", Name: "Charlie", CollegeCode: "102", CollegeName: "B", SGPAValue: 8.5, CGPAValue: 9.0, SGPAText: "8.5", CGPAText: "9.0", Rank: null, CollegeRank: null }
            ];

            const sorted = sortRowsByCgpa(rows);
            
            expect(sorted[0].RegNo).toBe("1"); // Bob (CGPA 9.0, SGPA 9.0)
            expect(sorted[1].RegNo).toBe("2"); // Charlie (CGPA 9.0, SGPA 8.5)
            expect(sorted[2].RegNo).toBe("3"); // Alice (CGPA 8.5)

            assignCgpaRanks(sorted);
            expect(sorted[0].Rank).toBe(1);
            expect(sorted[1].Rank).toBe(1); // Tie in CGPA => Same Rank! Wait, wait, is it?
            // The algorithm: if previousScore == row.CGPAValue => keep currentRank.
            // Charlie and Bob have the SAME CGPA (9.0). So Charlie gets rank 1 too.
            expect(sorted[1].Rank).toBe(1);
            expect(sorted[2].Rank).toBe(3); // Alice gets rank 3 because there are 2 people ahead.
        });
    });
});
