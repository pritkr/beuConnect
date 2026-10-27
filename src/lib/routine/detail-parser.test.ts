import { describe, expect, it } from "vitest";
import { parseRoutineDetailHtml } from "./detail-parser";
import type { ParsedRoutine, RoutineBlock } from "./types";

const SOURCE_URL =
	"http://classroutine.free.nf/view_timetable.php?branch=CSE&semester=4&batch=2K24&effective_date=2026-10-27&room_no=107";
const FETCHED_AT = "2026-10-27T09:00:00.000Z";

/** Verbatim header from every live page, including the `12-00` typo. */
const HEADER_ROW = `<tr>
	<th>Day</th>
	<th>Period 1<br>10:00-11:00</th>
	<th>Period 2<br>11:00-12-00</th>
	<th>Period 3<br>12:00-13:00</th>
	<th>RECESS<br>13:00-14:00</th>
	<th>Period 4<br>14:00-15:00</th>
	<th>Period 5<br>15:00-16:00</th>
	<th>Period 6<br>16:00-17:00</th>
</tr>`;

const RECESS_CELL = `<td class="recess-cell">🍽️<br>RECESS</td>`;

interface PageOptions {
	headerRow?: string;
	infoBarHtml?: string;
	legendHtml?: string;
}

function buildPage(rows: string, options: PageOptions = {}): string {
	const {
		headerRow = HEADER_ROW,
		infoBarHtml = `<div class="info-bar">
			<span>📅 Effective From: 24-08-2026</span>
			<span>🏢 Room No: 107</span>
		</div>`,
		legendHtml = "",
	} = options;

	return `<!DOCTYPE html>
<html>
<head><title>Timetable - CSE Sem 4</title></head>
<body>
	<div class="container">
		<h1 style="font-size: 36px;">GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA</h1>
		<h2 style="font-size: 24px;"><strong>Time Table of  Branch CSE | Semester 4 | Batch 2K24</strong></h2>
		${infoBarHtml}
		<table>
			<thead>${headerRow}</thead>
			<tbody>${rows}</tbody>
		</table>
		${legendHtml}
	</div>
</body>
</html>`;
}

function parse(rows: string, options: PageOptions = {}): ParsedRoutine {
	return parseRoutineDetailHtml(
		buildPage(rows, options),
		SOURCE_URL,
		FETCHED_AT,
		false,
	);
}

function row(day: string, cells: string): string {
	return `<tr><td class="day-cell">${day}</td>${cells}</tr>`;
}

function lectureCell(
	abbr: string,
	faculty: string,
	badge = `<span class="type-badge">L</span>`,
): string {
	return `<td style="text-align: center;">
		<div class="entry">
			<div class="abbr">${abbr}</div>
			<div class="faculty-short">${faculty}</div>
			<div class="group-info">${badge}</div>
		</div>
	</td>`;
}

/** Copied from CSE sem 4, Tuesday. Two entries, one cell, one colspan. */
const BIFURCATED_CELL = `<td colspan="2" class="bifurcated-merged" style="text-align: center;">
	<div class="entry">
		<div class="abbr">DBMS Lab</div>
		<div class="faculty-short">Ms. Manisha Rani (AP)</div>
		<span class="group-info"><div><span class="bifurcated-badge">LAB Group A  -  Room No : 7</span></div></span>
	</div>
	<div class="entry">
		<div class="abbr">DAA Lab</div>
		<div class="faculty-short">Mr. Md. Zaki Anwer (AP)</div>
		<span class="group-info"><div><span class="bifurcated-badge">LAB Group B  -  Room No : 109</span></div></span>
	</div>
</td>`;

const SPORTS_CELL = `<td colspan="1" class="timetable-cell filler-cell" style="text-align: center;">
	<div class="filler-content">
		<div class="filler-header" style="font-size: 16px; font-weight: bold; color: #4b5563; margin-bottom: 4px;">
			SPORTS
		</div>
	</div>
	<div class="group-info">1 hrs</div>
</td>`;

function blockAt(blocks: RoutineBlock[], index: number): RoutineBlock {
	const block = blocks[index];
	if (!block) throw new Error(`expected a block at index ${index}`);
	return block;
}

describe("parseRoutineDetailHtml - grid cursors", () => {
	it("parses a two-day page and keeps both entries of a bifurcated cell", () => {
		const routine = parse(
			row(
				"Monday",
				[
					lectureCell("COA", "Mr. Niraj Nirmal (AP)"),
					lectureCell("ETC", "Mr. Sandesh Kumar Maurya (Guest AP)"),
					lectureCell("FLAT", "Dr. Surjeet Kumar (AP)"),
					RECESS_CELL,
					BIFURCATED_CELL,
					SPORTS_CELL,
				].join(""),
			) +
				row(
					"Tuesday",
					[
						lectureCell("COA", "Mr. Niraj Nirmal (AP)"),
						lectureCell("FLAT", "Dr. Surjeet Kumar (AP)"),
						lectureCell("ETC", "Mr. Sandesh Kumar Maurya (Guest AP)"),
						RECESS_CELL,
						lectureCell("DAA", "Mr. Md. Zaki Anwer (AP)"),
						SPORTS_CELL.replace('colspan="1"', 'colspan="2"'),
					].join(""),
				),
		);

		expect(routine.days).toHaveLength(2);
		expect(routine.days.map((day) => day.day)).toEqual(["Monday", "Tuesday"]);

		const monday = routine.days[0].blocks;
		expect(monday).toHaveLength(6);
		expect(monday.map((block) => block.startSlot)).toEqual([1, 2, 3, 4, 4, 6]);

		const groupA = blockAt(monday, 3);
		expect(groupA).toMatchObject({
			startSlot: 4,
			span: 2,
			subject: "DBMS Lab",
			type: "LAB",
			room: "7",
			faculty: "Ms. Manisha Rani (AP)",
			group: "A",
			durationLabel: null,
		});

		const groupB = blockAt(monday, 4);
		expect(groupB).toMatchObject({
			startSlot: 4,
			span: 2,
			subject: "DAA Lab",
			type: "LAB",
			room: "109",
			faculty: "Mr. Md. Zaki Anwer (AP)",
			group: "B",
		});

		const sports = blockAt(monday, 5);
		expect(sports).toMatchObject({
			startSlot: 6,
			span: 1,
			subject: "SPORTS",
			type: null,
			room: null,
			durationLabel: "1 hrs",
			faculty: null,
			group: null,
		});

		const tuesday = routine.days[1].blocks;
		expect(tuesday).toHaveLength(5);
		expect(tuesday.map((block) => block.startSlot)).toEqual([1, 2, 3, 4, 5]);
		expect(blockAt(tuesday, 4)).toMatchObject({
			startSlot: 5,
			span: 2,
			subject: "SPORTS",
		});
	});

	it("keeps both entries of a lab-merged cell with a 3-period span", () => {
		const labCell = `<td colspan="3" class="lab-merged" style="text-align: center;">
			<div class="entry">
				<div class="abbr">DE Lab</div>
				<div class="faculty-short">Dr. Sundaram (AP)</div>
				<span class="group-info">
					<div><span class="lab-badge">LAB  -  Room No : Others</span></div>
					<div class="group-info">3 hrs</div>
				</span>
			</div>
			<div class="entry">
				<div class="abbr">MM</div>
				<span class="group-info">
					<div><span class="lab-badge">LAB  -  Room No : Others</span></div>
					<div class="group-info">3 hrs</div>
				</span>
			</div>
		</td>`;

		const routine = parse(
			row(
				"Friday",
				[
					lectureCell("OOPS", "Mr. Ankit Kumar (AP)"),
					lectureCell("OS", "Mr. Anand Raj (AP)"),
					lectureCell("DE", "Dr. Sundaram (AP)"),
					RECESS_CELL,
					labCell,
				].join(""),
			),
		);

		const blocks = routine.days[0].blocks;
		expect(blocks).toHaveLength(5);
		expect(blockAt(blocks, 3)).toMatchObject({
			startSlot: 4,
			span: 3,
			subject: "DE Lab",
			type: "LAB",
			room: "Others",
			durationLabel: "3 hrs",
			faculty: "Dr. Sundaram (AP)",
			group: null,
		});
		expect(blockAt(blocks, 3).group).toBeNull();
		expect(blockAt(blocks, 4)).toMatchObject({
			startSlot: 4,
			span: 3,
			subject: "MM",
			type: "LAB",
			room: "Others",
			durationLabel: "3 hrs",
			faculty: null,
			group: null,
		});
	});

	it("keeps the duration nested behind a lab badge (the old parser dropped it)", () => {
		const labCell = `<td colspan="2" class="lab-merged" style="text-align: center;">
			<div class="entry">
				<div class="abbr">EGD LAB</div>
				<div class="faculty-short">Mr. Amit Kumar Singh (AP)</div>
				<span class="group-info">
					<div><span class="lab-badge">LAB  -  Room No : Workshop Building</span></div>
					<div class="group-info">2 hrs</div>
				</span>
			</div>
		</td>`;

		const routine = parse(row("Monday", labCell));
		expect(blockAt(routine.days[0].blocks, 0)).toMatchObject({
			startSlot: 1,
			span: 2,
			subject: "EGD LAB",
			type: "LAB",
			room: "Workshop Building",
			durationLabel: "2 hrs",
		});
	});

	it("reads a tutorial badge that carries an extra class", () => {
		const routine = parse(
			row(
				"Wednesday",
				lectureCell(
					"EM-II",
					"Mr. Nitish Kumar (Guest AP)",
					`<span class="type-badge tutorial">T</span>`,
				),
			),
		);

		expect(blockAt(routine.days[0].blocks, 0)).toMatchObject({
			subject: "EM-II",
			type: "T",
			span: 1,
			group: null,
		});
	});

	it("reads a filler cell as a block without inventing a room or type", () => {
		const routine = parse(row("Saturday", SPORTS_CELL));
		expect(routine.days[0].blocks).toEqual([
			{
				startSlot: 1,
				span: 1,
				subject: "SPORTS",
				type: null,
				room: null,
				durationLabel: "1 hrs",
				faculty: null,
				group: null,
			},
		]);
	});

	it("advances the cursor over empty cells, quoted or not", () => {
		const emptyCell = `<td style="text-align: center;">
		</td>`;
		const nbspCell = `<td colspan=2 style="text-align: center;">&nbsp;</td>`;

		const routine = parse(
			row(
				"Monday",
				[
					lectureCell("COA", "Mr. Niraj Nirmal (AP)"),
					emptyCell,
					nbspCell,
					lectureCell("DAA", "Mr. Md. Zaki Anwer (AP)"),
				].join(""),
			),
		);

		const blocks = routine.days[0].blocks;
		expect(blocks).toHaveLength(2);
		expect(blockAt(blocks, 1)).toMatchObject({
			startSlot: 5,
			span: 1,
			subject: "DAA",
		});
	});

	it("falls back to the first text line when a cell has no entry markup", () => {
		const routine = parse(
			row("Thursday", `<td style="text-align: center;">SELF STUDY</td>`),
		);

		expect(blockAt(routine.days[0].blocks, 0)).toMatchObject({
			subject: "SELF STUDY",
			type: null,
			room: null,
			durationLabel: null,
			faculty: null,
		});
	});
});

describe("parseRoutineDetailHtml - header", () => {
	it("parses the 12-00 typo and locates the recess column", () => {
		const routine = parse(
			row("Monday", lectureCell("COA", "Mr. Niraj Nirmal (AP)")),
		);

		expect(routine.slots).toEqual([
			{ id: 1, label: "Period 1", start: "10:00", end: "11:00" },
			{ id: 2, label: "Period 2", start: "11:00", end: "12:00" },
			{ id: 3, label: "Period 3", start: "12:00", end: "13:00" },
			{ id: 4, label: "Period 4", start: "14:00", end: "15:00" },
			{ id: 5, label: "Period 5", start: "15:00", end: "16:00" },
			{ id: 6, label: "Period 6", start: "16:00", end: "17:00" },
		]);
		expect(routine.slots[1].end).toBe("12:00");
		expect(routine.recessAfterSlot).toBe(3);
	});

	it("reports no recess column when the header has none", () => {
		const headerRow = `<tr>
			<th>Day</th>
			<th>Period 1<br>10:00-11:00</th>
			<th>Period 2<br>11:00-12-00</th>
			<th>Period 3<br>12:00-13:00</th>
			<th>Period 4<br>13:00-14:00</th>
		</tr>`;

		const routine = parse(row("Monday", ""), { headerRow });
		expect(routine.slots).toHaveLength(4);
		expect(routine.recessAfterSlot).toBeNull();
	});

	it("does not hard-code slot 3 when the recess moves", () => {
		const headerRow = `<tr>
			<th>Day</th>
			<th>Period 1<br>10:00-11:00</th>
			<th>Period 2<br>11:00-12:00</th>
			<th>RECESS<br>12:00-13:00</th>
			<th>Period 3<br>13:00-14:00</th>
			<th>Period 4<br>14:00-15:00</th>
			<th>Period 5<br>15:00-16:00</th>
		</tr>`;

		const routine = parse(row("Monday", ""), { headerRow });
		expect(routine.slots).toHaveLength(5);
		expect(routine.recessAfterSlot).toBe(2);
	});

	it("falls back to the standard six periods when fewer than four parse", () => {
		const headerRow = `<tr>
			<th>Day</th>
			<th>Period 1<br>10:00-11:00</th>
			<th>Period 2<br>11:00-12:00</th>
			<th>RECESS<br>12:00-13:00</th>
			<th>Period 3<br>13:00-14:00</th>
		</tr>`;

		const routine = parse(row("Monday", ""), { headerRow });
		expect(routine.slots).toHaveLength(6);
		expect(routine.slots[0].label).toBe("Period 1");
		expect(routine.recessAfterSlot).toBe(2);
	});
});

describe("parseRoutineDetailHtml - page chrome", () => {
	it("reads the title, headings and info bar", () => {
		const routine = parse(
			row("Monday", lectureCell("COA", "Mr. Niraj Nirmal (AP)")),
		);

		expect(routine.title).toBe("Timetable - CSE Sem 4");
		expect(routine.heading).toBe("GOVERNMENT ENGINEERING COLLEGE SHEIKHPURA");
		expect(routine.subheading).toBe(
			"Time Table of Branch CSE | Semester 4 | Batch 2K24",
		);
		expect(routine.effectiveFrom).toBe("24-08-2026");
		expect(routine.roomLabel).toBe("107");
		expect(routine.sourceUrl).toBe(SOURCE_URL);
		expect(routine.fetchedAt).toBe(FETCHED_AT);
		expect(routine.isStale).toBe(false);
	});

	it("treats room 0 as no room", () => {
		const routine = parse(row("Monday", ""), {
			infoBarHtml: `<div class="info-bar">
				<span>📅 Effective From: 24-08-2026</span>
				<span>🏢 Room No: 0</span>
			</div>`,
		});

		expect(routine.roomLabel).toBeNull();
	});
});

describe("parseRoutineDetailHtml - papers", () => {
	it("de-duplicates legend cards on abbr + code and keeps P-suffixed codes", () => {
		const papers = (
			abbr: string,
			code: string,
			name: string,
			faculty: string,
		) => `
			<div class="legend-card">
				<div class="legend-header">
					<span class="legend-abbr">${abbr}</span>
					<span class="legend-code">${code}</span>
				</div>
				<div class="legend-name">${name}</div>
				<div class="legend-faculty">${faculty}</div>
				<div class="legend-hours">
					<span>L:1</span>
					<span>T:0</span>
					<span>P:0</span>
				</div>
			</div>`;

		const legendHtml = `<div class="legend-section">
			<div class="legend-grid">
				${papers("BM", "161304", "Basic Mechatronics", "Dr. Kamal Kant (AP)")}
				${papers("BM", "161304", "Basic Mechatronics", "Dr. Sunita Sinha (AP)")}
				${papers("BM", "161304", "Basic Mechatronics", "Dr. Kamal Kant (AP)")}
				<div class="legend-card">
					<div class="legend-header">
						<span class="legend-abbr">CN Lab</span>
						<span class="legend-code">105406P</span>
					</div>
					<div class="legend-name">Computer Networks Lab</div>
					<div class="legend-faculty">Ms. Manisha Rani (AP)</div>
					<div class="legend-hours">
						<span>L:0</span>
						<span>T:0</span>
						<span>P:2(2h)</span>
					</div>
				</div>
			</div>
		</div>`;

		const routine = parse(row("Monday", ""), { legendHtml });

		expect(routine.papers).toHaveLength(2);
		expect(routine.papers[0]).toMatchObject({
			abbr: "BM",
			code: "161304",
			name: "Basic Mechatronics",
			faculty: "Dr. Kamal Kant (AP)",
			lectureHours: 1,
			tutorialHours: 0,
			practicalHours: "0",
		});
		expect(routine.papers[1]).toMatchObject({
			abbr: "CN Lab",
			code: "105406P",
			practicalHours: "2(2h)",
		});
	});
});
