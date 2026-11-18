import { describe, it, expect } from 'vitest';
import {
	filterHolidays,
	formatHolidayDate,
	holidayRangeText,
	holidayRowHTML,
	HOLIDAYS_2026,
} from './data';

describe('Holiday data', () => {
	it('formats dates the same in the Worker and in the browser', () => {
		expect(formatHolidayDate('2026-01-01')).toBe('01 Jan 2026');
		expect(formatHolidayDate('2026-08-26')).toBe('26 Aug 2026');
		expect(formatHolidayDate('2026-12-31')).toBe('31 Dec 2026');
	});

	it('gives a range only to entries that span days', () => {
		const single = HOLIDAYS_2026.find((h) => h.id === 5)!;
		const range = HOLIDAYS_2026.find((h) => h.id === 9)!;
		expect(holidayRangeText(single)).toBe('26 Jan 2026');
		expect(holidayRangeText(range)).toBe('02 Mar 2026 – 04 Mar 2026');
	});

	it('hides teacher-only entries until they are asked for', () => {
		const students = filterHolidays(HOLIDAYS_2026);
		const teachers = filterHolidays(HOLIDAYS_2026, { includeTeacherOnly: true });
		expect(students).toHaveLength(HOLIDAYS_2026.length - 1);
		expect(students.some((h) => h.teacherOnly)).toBe(false);
		expect(teachers).toHaveLength(HOLIDAYS_2026.length);
	});

	it('searches the names as they are written', () => {
		expect(filterHolidays(HOLIDAYS_2026, { query: 'होली' }).map((h) => h.id)).toEqual([9]);
		expect(filterHolidays(HOLIDAYS_2026, { query: '  republic ' })).toHaveLength(0);
		expect(filterHolidays(HOLIDAYS_2026, { query: 'दिवस' }).length).toBeGreaterThan(1);
	});

	it('returns the schedule in date order', () => {
		const starts = filterHolidays(HOLIDAYS_2026).map((h) => h.start);
		expect(starts).toEqual([...starts].sort());
	});

	it('renders the row the page ships with', () => {
		const row = holidayRowHTML(HOLIDAYS_2026.find((h) => h.id === 7)!);
		expect(row).toContain('04 Feb 2026');
		expect(row).toContain('शब-ए-बरात *');
		expect(row).toContain('Festival');
		expect(row).toContain('class="holiday-row festival"');
	});
});
