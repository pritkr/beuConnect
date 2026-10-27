import { describe, it, expect } from 'vitest';
import { calculateGrade, calculateSgpa, calculateQuickCgpa, calculateTargetSgpa } from './engine';

describe('Calculator Engine', () => {
    describe('calculateGrade', () => {
        it('should return F if ESE marks are below 35% threshold for 100 marks', () => {
            // ESE < 24.5. Even if total > 35, it's F.
            expect(calculateGrade(100, 30, 20)).toBe('F');
        });

        it('should calculate grade correctly based on total percentage', () => {
            expect(calculateGrade(100, 25, 65)).toBe('A+'); // 90
            expect(calculateGrade(100, 20, 60)).toBe('A');  // 80
            expect(calculateGrade(100, 15, 55)).toBe('B');  // 70
        });

        it('should fail the 35-40% band: 40% is the pass mark, 35% is only the ESE floor', () => {
            // 38% overall with a valid ESE mark is still a fail.
            expect(calculateGrade(100, 10, 28)).toBe('F');
            // 40% exactly passes.
            expect(calculateGrade(100, 10, 30)).toBe('P');
        });

        it('should handle 50 marks correctly', () => {
            expect(calculateGrade(50, 15, 10)).toBe('F'); // ESE < 10.5 -> F
            expect(calculateGrade(50, 10, 25)).toBe('B'); // 35/50 = 70% -> B
        });
    });

    describe('calculateSgpa', () => {
        it('should correctly calculate SGPA', () => {
            const subjects = [
                { credit: 4, grade: 'A+' }, // 40
                { credit: 3, grade: 'A' },  // 27
                { credit: 2, grade: 'B' },  // 16
            ];
            // Total points: 83, Total credits: 9. SGPA = 9.222...
            const result = calculateSgpa(subjects);
            expect(result.sgpa).toBeCloseTo(9.22, 2);
            expect(result.totalCredits).toBe(9);
        });

        it('should handle empty subjects', () => {
            expect(calculateSgpa([])).toEqual({ sgpa: 0, totalCredits: 0 });
        });
    });

    describe('calculateQuickCgpa', () => {
        it('should combine CGPA and new SGPA correctly', () => {
            const result = calculateQuickCgpa(8.0, 100, 9.0, 20);
            // (800 + 180) / 120 = 980 / 120 = 8.166...
            expect(result.cgpa).toBeCloseTo(8.17, 2);
            expect(result.totalCredits).toBe(120);
        });
    });

    describe('calculateTargetSgpa', () => {
        it('should return success when possible', () => {
            const result = calculateTargetSgpa(7.5, 80, 8.0, 20);
            expect(result).toEqual({ type: 'success', requiredSgpa: 10.0 });
        });

        it('should return secured if target is already hit', () => {
            const result = calculateTargetSgpa(8.5, 80, 6.5, 20);
            expect(result).toEqual({ type: 'secured' });
        });

        it('should return impossible perfect if targeting 10 after dropping points', () => {
            const result = calculateTargetSgpa(9.9, 80, 10.0, 20);
            expect(result).toEqual({ type: 'impossible_perfect' });
        });

        it('should return impossible this sem and calculate sems needed', () => {
            const result = calculateTargetSgpa(7.0, 80, 8.5, 20);
            expect(result.type).toBe('impossible_this_sem');
            if (result.type === 'impossible_this_sem') {
                expect(result.semsNeeded).toBeGreaterThan(0);
            }
        });
    });
});
