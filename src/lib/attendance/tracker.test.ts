import { describe, it, expect } from 'vitest';
import { AttendanceState } from './tracker';

describe('Attendance State', () => {
    it('should add a subject', () => {
        const state = new AttendanceState();
        state.addSubject('1', 'Math');
        expect(state.subjects.length).toBe(1);
        expect(state.subjects[0].name).toBe('Math');
    });

    it('should calculate attendance status correctly', () => {
        const state = new AttendanceState([], { targetPercentage: 75 });
        const status = state.calculateStatus(6, 10);
        expect(status.percent).toBe(60);
        expect(status.type).toBe('danger');
        // 75% of (10+r) = 6+r => 7.5 + 0.75r = 6 + r => 1.5 = 0.25r => r = 6
        expect(status.required).toBe(6);
    });

    it('should track and undo history', () => {
        const state = new AttendanceState();
        state.addSubject('1', 'Math');
        state.updateAttendance('1', 'present'); // 1/1
        expect(state.subjects[0].attended).toBe(1);
        state.undoAction('1');
        expect(state.subjects[0].attended).toBe(0);
        expect(state.subjects[0].total).toBe(0);
    });
});
