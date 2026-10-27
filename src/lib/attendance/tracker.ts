export type AttendanceAction = 'present' | 'absent' | 'manual';

export interface HistoryEntry {
    action: AttendanceAction;
    prevAttended: number;
    prevTotal: number;
    timestamp: number;
}

export interface Subject {
    id: string;
    name: string;
    attended: number;
    total: number;
    history: HistoryEntry[];
}

export interface AppSettings {
    targetPercentage: number;
}

export interface StatusResult {
    percent: number;
    msg: string;
    type: 'safe' | 'danger' | 'neutral';
    bunkable: number;
    required: number;
}

export class AttendanceState {
    public subjects: Subject[];
    public settings: AppSettings;

    constructor(initialSubjects: Subject[] = [], initialSettings: AppSettings = { targetPercentage: 75 }) {
        this.subjects = initialSubjects.map(s => ({
            ...s,
            history: s.history || []
        }));
        this.settings = initialSettings;
    }

    addSubject(id: string, name: string) {
        this.subjects.push({
            id,
            name,
            attended: 0,
            total: 0,
            history: []
        });
    }

    deleteSubject(id: string) {
        this.subjects = this.subjects.filter(s => s.id !== id);
    }

    manualUpdateSubject(id: string, name: string, attended: number, total: number) {
        const subject = this.subjects.find(s => s.id === id);
        if (subject) {
            subject.history.push({
                action: 'manual',
                prevAttended: subject.attended,
                prevTotal: subject.total,
                timestamp: Date.now()
            });

            subject.name = name;
            subject.attended = Math.min(attended, total); // ensure safety
            subject.total = total;
        }
    }

    updateAttendance(id: string, action: AttendanceAction) {
        const subject = this.subjects.find(s => s.id === id);
        if (!subject) return false;

        subject.history.push({
            action,
            prevAttended: subject.attended,
            prevTotal: subject.total,
            timestamp: Date.now()
        });

        if (subject.history.length > 20) subject.history.shift();

        if (action === 'present') {
            subject.attended += 1;
            subject.total += 1;
        } else if (action === 'absent') {
            subject.total += 1;
        }

        if (subject.attended > subject.total) {
            subject.attended = subject.total;
        }
        return true;
    }

    undoAction(id: string): boolean {
        const subject = this.subjects.find(s => s.id === id);
        if (subject && subject.history.length > 0) {
            const lastAction = subject.history.pop();
            if (lastAction) {
                subject.attended = lastAction.prevAttended;
                subject.total = lastAction.prevTotal;
                return true;
            }
        }
        return false;
    }

    calculateStatus(attended: number, total: number): StatusResult {
        if (total === 0) return { percent: 0, msg: 'No classes yet', type: 'neutral', bunkable: 0, required: 0 };

        const percent = (attended / total) * 100;
        const targetRatio = this.settings.targetPercentage / 100;

        const required = Math.ceil(Math.max(0, (targetRatio * total - attended) / (1 - targetRatio)));
        // Fix for bunkable: when targetRatio is close to 1, we must avoid Infinity
        let bunkable = 0;
        if (targetRatio > 0 && percent >= this.settings.targetPercentage) {
            bunkable = Math.floor(Math.max(0, (attended / targetRatio) - total));
        }

        let msg = '';
        let type: 'safe' | 'danger' | 'neutral' = 'safe';

        if (percent >= this.settings.targetPercentage) {
            if (bunkable > 0) {
                msg = `On track. You can safely bunk ${bunkable} classes.`;
            } else if (percent > this.settings.targetPercentage) {
                msg = `On track. Don't miss the next class.`;
            } else {
                msg = `Exactly ${this.settings.targetPercentage}%. Don't miss the next class.`;
            }
            type = 'safe';
        } else {
            msg = `Critical. Attend the next ${required} classes to reach ${this.settings.targetPercentage}%.`;
            type = 'danger';
        }

        return { percent: Math.round(percent), msg, type, bunkable, required };
    }
}
