export const BEU_GRADES: Record<string, number> = {
    'A+': 10,
    'A': 9,
    'B': 8,
    'C': 7,
    'D': 6,
    'P': 5,
    'F': 0,
};

export function calculateGrade(totalMarks: number, ia: number, ese: number): string {
    if (isNaN(ia) || isNaN(ese)) return '-';
    
    // Enforce valid bounds (though UI should handle this, good to be safe)
    const maxIa = totalMarks === 100 ? 30 : 20;
    const maxEse = totalMarks === 100 ? 70 : 30;
    const validIa = Math.min(Math.max(0, ia), maxIa);
    const validEse = Math.min(Math.max(0, ese), maxEse);

    const perc = ((validIa + validEse) / totalMarks) * 100;
    
    // BEU Passing Threshold: Must score at least 35% in ESE
    // For 100 marks (70 ESE): 24.5. For 50 marks (30 ESE): 10.5.
    const minEseRequired = totalMarks === 100 ? 24.5 : 10.5;

    if (validEse < minEseRequired) {
        return 'F';
    }

    if (perc >= 90) return 'A+';
    if (perc >= 80) return 'A';
    if (perc >= 70) return 'B';
    if (perc >= 60) return 'C';
    if (perc >= 50) return 'D';
    // 40% aggregate, not 35%: the 35% above is the ESE floor alone. A paper at
    // 38% with a valid ESE is a fail, which is what BEU's own result sheets show.
    if (perc >= 40) return 'P';

    return 'F';
}

export function calculateSgpa(subjects: { credit: number; grade: string }[]): { sgpa: number; totalCredits: number; } {
    let totalCredits = 0;
    let totalPoints = 0;

    for (const sub of subjects) {
        if (!isNaN(sub.credit) && sub.grade && BEU_GRADES.hasOwnProperty(sub.grade)) {
            totalCredits += sub.credit;
            totalPoints += sub.credit * BEU_GRADES[sub.grade];
        }
    }

    if (totalCredits === 0) return { sgpa: 0, totalCredits: 0 };
    return { sgpa: totalPoints / totalCredits, totalCredits };
}

export function calculateQuickCgpa(currentCgpa: number, currentCredits: number, newSgpa: number, newCredits: number): { cgpa: number; totalCredits: number } {
    if (currentCredits + newCredits === 0) return { cgpa: 0, totalCredits: 0 };
    const totalPoints = (currentCgpa * currentCredits) + (newSgpa * newCredits);
    const totalCredits = currentCredits + newCredits;
    return { cgpa: totalPoints / totalCredits, totalCredits };
}

export type TargetResult = 
    | { type: 'success'; requiredSgpa: number }
    | { type: 'impossible_perfect' }
    | { type: 'secured' }
    | { type: 'impossible_this_sem'; semsNeeded: number };

export function calculateTargetSgpa(currentCgpa: number, previousCredits: number, targetCgpa: number, semesterCredits: number): TargetResult {
    if (targetCgpa === 10 && currentCgpa < 10) {
        return { type: 'impossible_perfect' };
    }

    const requiredTotalPts = targetCgpa * (previousCredits + semesterCredits);
    const currPts = currentCgpa * previousCredits;
    const reqSgpa = (requiredTotalPts - currPts) / semesterCredits;

    if (reqSgpa <= 10 && reqSgpa >= 0) {
        return { type: 'success', requiredSgpa: reqSgpa };
    } else if (reqSgpa < 0) {
        return { type: 'secured' };
    } else {
        const additionalCredits = (previousCredits * (targetCgpa - currentCgpa)) / (10 - targetCgpa);
        const semsNeeded = Math.ceil(additionalCredits / semesterCredits);
        return { type: 'impossible_this_sem', semsNeeded };
    }
}
