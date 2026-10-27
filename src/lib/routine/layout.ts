import type {
	ParsedRoutine,
	RoutineBlock,
	RoutineDay,
	RoutineLabGroup,
} from "./types";

/**
 * One `<td>` of a routine row. A `block` cell keeps every block that came from
 * the same table cell: a merged class prints one block per lab batch inside a
 * single cell, so those must never be split into two columns.
 */
export type RoutineCell =
	| { kind: "empty"; span: number }
	| { kind: "block"; span: number; blocks: RoutineBlock[] };

/**
 * A horizontal run of the grid: a stretch of contiguous period ids, or the
 * recess column. Both arms carry `kind`, so the renderer is a plain switch
 * instead of an `"from" in segment` test.
 */
export type RoutineSegment =
	| { kind: "slots"; from: number; to: number }
	| { kind: "break" };

/** IST never observes DST, so a fixed offset is exact. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function isLabGroup(value: unknown): value is RoutineLabGroup {
	return value === "A" || value === "B";
}

/** The batch a block runs for, tolerating `undefined` from older payloads. */
function groupOf(block: RoutineBlock): RoutineLabGroup | null {
	return isLabGroup(block.group) ? block.group : null;
}

function slotSpan(block: RoutineBlock): number {
	return Number.isFinite(block.span) && block.span > 0 ? Math.round(block.span) : 1;
}

/**
 * Splits the period ids into the runs the table is drawn from: one run per
 * contiguous stretch of ids, with the recess column spliced in after
 * `recessAfterSlot`. A break is only emitted when something follows it, so a
 * routine whose recess sits after the last period stays a single run.
 */
export function segmentsFor(
	recessAfterSlot: number | null,
	slotIds: number[],
): RoutineSegment[] {
	const ids = [...new Set(slotIds.filter((id) => Number.isFinite(id) && id > 0))].sort(
		(left, right) => left - right,
	);
	if (ids.length === 0) return [];

	const last = ids[ids.length - 1];
	const breakAfter =
		recessAfterSlot !== null && ids.includes(recessAfterSlot) && recessAfterSlot < last
			? recessAfterSlot
			: null;

	const segments: RoutineSegment[] = [];
	let runStart = ids[0];
	let previous = ids[0];

	const closeRun = () => {
		segments.push({ kind: "slots", from: runStart, to: previous });
	};

	for (const id of ids.slice(1)) {
		if (breakAfter !== null && previous === breakAfter) {
			closeRun();
			segments.push({ kind: "break" });
			runStart = id;
		} else if (id !== previous + 1) {
			closeRun();
			runStart = id;
		}
		previous = id;
	}

	closeRun();
	return segments;
}

/**
 * The cells of one day inside `from..to`. Blocks that start in the same period
 * are one cell (the sheet merges them), blocks that start before `from` are
 * skipped rather than repeated, and gaps are `empty` cells whose spans always
 * add up to exactly `to - from + 1`.
 */
export function buildRowCells(
	day: RoutineDay,
	from: number,
	to: number,
): RoutineCell[] {
	if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];

	const byStart = new Map<number, RoutineBlock[]>();
	const ordered = [...day.blocks].sort((left, right) => left.startSlot - right.startSlot);
	for (const block of ordered) {
		if (!Number.isFinite(block.startSlot)) continue;
		if (block.startSlot < from || block.startSlot > to) continue;
		const bucket = byStart.get(block.startSlot);
		if (bucket) bucket.push(block);
		else byStart.set(block.startSlot, [block]);
	}

	const cells: RoutineCell[] = [];
	let cursor = from;

	for (const [startSlot, blocks] of byStart) {
		// A block already swallowed by a longer neighbour must not be emitted twice.
		if (startSlot < cursor) continue;

		if (startSlot > cursor) {
			cells.push({ kind: "empty", span: startSlot - cursor });
			cursor = startSlot;
		}

		const widest = blocks.reduce((span, block) => Math.max(span, slotSpan(block)), 1);
		const span = Math.min(widest, to - startSlot + 1);
		cells.push({ kind: "block", span, blocks });
		cursor = startSlot + span;
	}

	if (cursor <= to) {
		cells.push({ kind: "empty", span: to - cursor + 1 });
	}

	return cells;
}

/**
 * Reading order for a cell: the student's own batch, then the blocks the whole
 * class attends, then the other batch. Stable, so two ungrouped entries keep
 * the sheet's order (the first one is the primary).
 */
export function orderBlocks(
	blocks: RoutineBlock[],
	labGroup: RoutineLabGroup,
): RoutineBlock[] {
	const rank = (block: RoutineBlock): number => {
		const group = groupOf(block);
		if (group === null) return 1;
		return group === labGroup ? 0 : 2;
	};

	return blocks
		.map((block, index) => ({ block, index, rank: rank(block) }))
		.sort((left, right) => left.rank - right.rank || left.index - right.index)
		.map((entry) => entry.block);
}

/** The block the student reads first, plus the alternatives printed under it. */
export function primaryAndRest(
	blocks: RoutineBlock[],
	labGroup: RoutineLabGroup,
): { primary: RoutineBlock | null; rest: RoutineBlock[] } {
	const ordered = orderBlocks(blocks, labGroup);
	return { primary: ordered[0] ?? null, rest: ordered.slice(1) };
}

/** True when the sheet splits the class into lab batches anywhere in the week. */
export function hasLabGroups(routine: ParsedRoutine): boolean {
	return routine.days.some((day) => day.blocks.some((block) => groupOf(block) !== null));
}

/** Today's weekday in IST as `0=Sunday..6=Saturday`. */
export function istDayIndex(now: Date = new Date()): number {
	return new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000).getUTCDay();
}
