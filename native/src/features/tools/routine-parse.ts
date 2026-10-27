/**
 * The class routine is published as HTML by the BEU Connect site (which
 * resolves a registration number against the college's timetable source), so
 * the app reads the same page and turns it back into data. Everything here is
 * pure string work: the screen only sees `ParsedRoutine`.
 */

export interface RoutineSlot {
  index: number;
  start: string;
  end: string;
}

/** The two lab batches a merged class is split into. */
export type RoutineGroup = "A" | "B";

/** The other batch's class when one cell holds both. */
export interface RoutineAlternative {
  group: RoutineGroup | null;
  subject: string;
  room: string | null;
}

export interface RoutineClass {
  /** 1-based period number. */
  slot: number;
  start: string;
  end: string;
  subject: string;
  type: string | null;
  room: string | null;
  /** The teacher, when the sheet or the student names one. */
  teacher: string | null;
  /** The lab batch printed for this cell, when the sheet splits the class. */
  group?: RoutineGroup | null;
  /** The other batch's class in a merged cell, kept as a footnote. */
  alternatives?: RoutineAlternative[];
}

export interface RoutineDay {
  day: string;
  classes: RoutineClass[];
}

export interface RoutinePaper {
  abbr: string;
  code: string;
  name: string;
  faculty: string;
  hours: string;
}

export interface ParsedRoutine {
  branchLabel: string;
  semester: string;
  batch: string;
  effectiveFrom: string;
  room: string;
  slots: RoutineSlot[];
  days: RoutineDay[];
  papers: RoutinePaper[];
  sourceUrl: string;
  /** The lab batch the page rendered; `null` for a typed week. */
  labGroup: RoutineGroup | null;
  /** True when the published class is split into lab batches. */
  splitClass: boolean;
  /** The site is serving its own cached copy of the upstream sheet. */
  stale: boolean;
}

export type RoutineParse =
  | { ok: true; routine: ParsedRoutine }
  | { ok: false; message: string };

export const DEFAULT_SLOTS: RoutineSlot[] = [
  { index: 1, start: "10:00", end: "11:00" },
  { index: 2, start: "11:00", end: "12:00" },
  { index: 3, start: "12:00", end: "13:00" },
  { index: 4, start: "14:00", end: "15:00" },
  { index: 5, start: "15:00", end: "16:00" },
  { index: 6, start: "16:00", end: "17:00" },
];

/** Monday first — how a college week reads. */
export const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Position of a day name in the college week; unknown days sort last. */
export function weekIndex(day: string): number {
  const index = WEEK_ORDER.indexOf(day);
  return index < 0 ? WEEK_ORDER.length : index;
}

/** The days of a routine in Monday-first order. */
export function sortedDays(routine: ParsedRoutine): RoutineDay[] {
  return [...routine.days].sort((left, right) => weekIndex(left.day) - weekIndex(right.day));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_match: string, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) ? String.fromCharCode(point) : "";
    });
}

/** Tags out, entities decoded, whitespace collapsed: the visible text. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstGroup(pattern: RegExp, value: string): string {
  const match = pattern.exec(value);
  return match ? match[1] : "";
}

/**
 * A cell's own block, without the other batch's footnote. A merged cell is
 * `<div class="block-subject">…</div><div class="block-meta">…</div>` then one
 * `<div class="block-alt">` per other batch; the footnote can print a room the
 * primary does not, so every read is scoped to this prefix.
 */
function primaryHtml(inner: string): string {
  const cut = inner.search(/<div[^>]*\bblock-alt\b/i);
  return cut < 0 ? inner : inner.slice(0, cut);
}

function roomIn(html: string): string | null {
  const match = /Room\s+([A-Za-z0-9][A-Za-z0-9/_-]*)/i.exec(html);
  return match ? match[1] : null;
}

function groupIn(value: string): RoutineGroup | null {
  const match = /Group\s*([AB])\b/i.exec(value);
  if (!match) return null;
  return match[1].toUpperCase() === "A" ? "A" : "B";
}

/** The other batch's class in a merged cell, one per `block-alt`. */
function alternativesIn(inner: string): RoutineAlternative[] {
  const out: RoutineAlternative[] = [];
  const pattern = /<div[^>]*\bblock-alt\b[^>]*>([\s\S]*?)<\/div>/gi;
  let match = pattern.exec(inner);
  while (match !== null) {
    const body = match[1];
    const subject = textOf(firstGroup(/<span[^>]*\balt-subject\b[^>]*>([\s\S]*?)<\/span>/i, body));
    if (subject) {
      out.push({
        group: groupIn(textOf(firstGroup(/<span[^>]*\balt-label\b[^>]*>([\s\S]*?)<\/span>/i, body))),
        subject,
        room: roomIn(body),
      });
    }
    match = pattern.exec(inner);
  }
  return out;
}

function headerSlots(table: string): RoutineSlot[] {
  const slots: RoutineSlot[] = [];
  const pattern = /<th[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/gi;
  let match = pattern.exec(table);
  while (match !== null) {
    const label = textOf(match[1]);
    const times = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/.exec(label);
    const index = /P\s*(\d+)/i.exec(label);
    if (times && index) {
      slots.push({ index: Number(index[1]), start: times[1], end: times[2] });
    }
    match = pattern.exec(table);
  }
  return slots.length >= 4 ? slots : DEFAULT_SLOTS;
}

function slotFor(slots: RoutineSlot[], index: number): RoutineSlot {
  return slots.find((slot) => slot.index === index) ?? {
    index,
    start: DEFAULT_SLOTS[Math.min(index, 6) - 1]?.start ?? "",
    end: DEFAULT_SLOTS[Math.min(index, 6) - 1]?.end ?? "",
  };
}

function parseDays(table: string, slots: RoutineSlot[]): RoutineDay[] {
  const days: RoutineDay[] = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row = rowPattern.exec(table);

  while (row !== null) {
    const cellsHtml = row[1];
    const dayCell = /<th[^>]*>([\s\S]*?)<\/th>/i.exec(cellsHtml);
    const day = dayCell ? textOf(dayCell[1]) : "";
    if (!day || /^day$/i.test(day)) {
      row = rowPattern.exec(table);
      continue;
    }

    const classes: RoutineClass[] = [];
    let cursor = 0;
    const cellPattern = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    let cell = cellPattern.exec(cellsHtml);

    while (cell !== null) {
      const attrs = cell[1];
      const inner = cell[2];
      const spanMatch = /colspan="(\d+)"/i.exec(attrs);
      const span = spanMatch ? Math.max(1, Number(spanMatch[1])) : 1;

      // The recess column sits between P3 and P4 and is not a period.
      if (/recess-cell/i.test(attrs)) {
        cell = cellPattern.exec(cellsHtml);
        continue;
      }

      const startIndex = cursor + 1;
      cursor += span;

      if (/slot-block/i.test(attrs)) {
        const own = primaryHtml(inner);
        const subject = textOf(firstGroup(/<div[^>]*block-subject[^>]*>([\s\S]*?)<\/div>/i, own));
        if (subject) {
          const type = textOf(firstGroup(/<span[^>]*type-badge[^>]*>([\s\S]*?)<\/span>/i, own));
          const badge = textOf(firstGroup(/<span[^>]*group-badge[^>]*>([\s\S]*?)<\/span>/i, own));
          const slot = slotFor(slots, startIndex);
          // A `colspan="2"` cell is one class covering two periods: the lab's
          // end is the end of the last period it covers, not of the first.
          const last = span > 1 ? slotFor(slots, startIndex + span - 1) : slot;
          classes.push({
            slot: startIndex,
            start: slot.start,
            end: last.end,
            subject,
            type: type || null,
            room: roomIn(own),
            teacher: null,
            group: groupIn(badge),
            alternatives: alternativesIn(inner),
          });
        }
      }

      cell = cellPattern.exec(cellsHtml);
    }

    if (classes.length > 0) days.push({ day, classes });
    row = rowPattern.exec(table);
  }

  return days;
}

function parsePapers(html: string): RoutinePaper[] {
  const papers: RoutinePaper[] = [];
  const chunks = html.split('class="paper-item"');

  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const abbr = textOf(firstGroup(/<span[^>]*paper-abbr[^>]*>([\s\S]*?)<\/span>/i, chunk));
    const code = textOf(firstGroup(/<span[^>]*paper-code[^>]*>([\s\S]*?)<\/span>/i, chunk));
    const name = textOf(firstGroup(/<h3[^>]*>([\s\S]*?)<\/h3>/i, chunk));
    const faculty = textOf(firstGroup(/<p[^>]*>([\s\S]*?)<\/p>/i, chunk));
    if (!name && !abbr) continue;

    const hoursBlock = firstGroup(/<div[^>]*paper-hours[^>]*>([\s\S]*?)<\/div>/i, chunk);
    const hours = Array.from(hoursBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi))
      .map((match) => textOf(match[1]))
      .filter((value) => value.length > 0)
      .join(" · ");

    papers.push({ abbr, code, name, faculty, hours });
  }

  return papers;
}

function pillValues(html: string): string[] {
  const values: string[] = [];
  const pattern = /<span class="meta-pill[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const value = textOf(match[1]);
    if (value) values.push(value);
    match = pattern.exec(html);
  }
  return values;
}

function routineError(html: string): string {
  const message = textOf(firstGroup(/<p[^>]*id="routineStateMessage"[^>]*>([\s\S]*?)<\/p>/i, html));
  if (message) return message;
  return "The published routine could not be read. Open the site once, then try again.";
}

/** The `A`/`B` pill the page marked as current, `null` when it shows none. */
function activeGroup(html: string): RoutineGroup | null {
  const pattern = /<([a-z]+)\b([^>]*\bgroup-choice\b[^>]*)>\s*([AB])\s*<\/\1>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    if (/\bis-active\b/i.test(match[2])) {
      return match[3].toUpperCase() === "A" ? "A" : "B";
    }
    match = pattern.exec(html);
  }
  return null;
}

/** True when the sheet splits the class and the page offers A/B. */
function isSplitClass(html: string): boolean {
  // The page's own `<style>` also mentions `.group-choice`, so only an element
  // with that class counts: a non-split routine must not grow the A/B switch.
  return /<([a-z]+)\b([^>]*\bgroup-choice\b[^>]*)>/i.test(html);
}

/** True when the site says it is serving its own cached upstream copy. */
function isStale(html: string): boolean {
  const pattern = /<([a-z]+)\b([^>]*\bstatus-pill\b[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    if (/cached/i.test(textOf(match[3]))) return true;
    match = pattern.exec(html);
  }
  return false;
}

/** Turns the site's `/routine?reg=…` page into data, or a readable reason. */
export function parseRoutineHtml(html: string, sourceUrl: string): RoutineParse {
  const tableMatch = /<table[^>]*routine-table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tableMatch) return { ok: false, message: routineError(html) };

  const table = tableMatch[0];
  const slots = headerSlots(table);
  const days = parseDays(table, slots);
  if (days.length === 0) {
    return { ok: false, message: "The routine is published but has no classes yet." };
  }

  const pills = pillValues(html);
  const pick = (pattern: RegExp): string => pills.find((pill) => pattern.test(pill)) ?? "";

  return {
    ok: true,
    routine: {
      branchLabel: pills[0] ?? "",
      semester: pick(/^Sem\b/i).replace(/^Sem\s*/i, ""),
      batch: pick(/^2K\d{2}$/i).toUpperCase(),
      effectiveFrom: pick(/^From\b/i).replace(/^From\s*/i, ""),
      room: pick(/^Room\b/i).replace(/^Room\s*/i, ""),
      slots,
      days,
      papers: parsePapers(html),
      sourceUrl,
      labGroup: activeGroup(html),
      splitClass: isSplitClass(html),
      stale: isStale(html),
    },
  };
}

/** Today's weekday as the routine spells it (`Monday`). */
export function dayName(date: Date = new Date()): string {
  return DAY_NAMES[date.getDay()];
}

/** Minutes since midnight, from a `HH:MM` clock time. */
export function clockMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

export type ClassMoment = "now" | "next" | "later" | "past";

/** Where a class sits relative to the current minute of the day. */
export function classMoment(item: RoutineClass, nowMinutes: number, nextSlot: number | null): ClassMoment {
  const start = clockMinutes(item.start);
  const end = clockMinutes(item.end);
  // A period without a time (added by hand, or published blank) cannot be
  // "now" or "past": it stays ahead of the student until it is given one.
  if (start < 0) return nextSlot === item.slot ? "next" : "later";
  if (start <= nowMinutes && nowMinutes < end) return "now";
  if (start > nowMinutes) return nextSlot === item.slot ? "next" : "later";
  return "past";
}

/* ------------------------------------------------------------ hand editing */

/**
 * A blank Monday-to-Sunday week with the six standard periods, for a student
 * whose routine is not published: the editor starts from the same grid the
 * site uses, so every period already has a time.
 */
export function blankRoutine(): ParsedRoutine {
  return {
    branchLabel: "My routine",
    semester: "",
    batch: "",
    effectiveFrom: "",
    room: "",
    slots: DEFAULT_SLOTS.map((slot) => ({ ...slot })),
    days: WEEK_ORDER.map((day) => ({ day, classes: [] })),
    papers: [],
    sourceUrl: "",
    labGroup: null,
    splitClass: false,
    stale: false,
  };
}

/** A deep copy, so editing never mutates the parsed (or persisted) original. */
export function cloneRoutine(routine: ParsedRoutine): ParsedRoutine {
  return {
    ...routine,
    slots: routine.slots.map((slot) => ({ ...slot })),
    days: routine.days.map((day) => ({
      day: day.day,
      classes: day.classes.map((item) => ({
        ...item,
        alternatives: (item.alternatives ?? []).map((entry) => ({ ...entry })),
      })),
    })),
    papers: routine.papers.map((paper) => ({ ...paper })),
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** `HH:MM` or empty — an unreadable time never reaches the renderer. */
function asClock(value: unknown): string {
  const text = asString(value).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${hours < 10 ? "0" : ""}${hours}:${match[2]}`;
}

function asGroup(value: unknown): RoutineGroup | null {
  const text = asString(value).trim().toUpperCase();
  return text === "A" || text === "B" ? text : null;
}

function asAlternatives(value: unknown): RoutineAlternative[] {
  if (!Array.isArray(value)) return [];
  const out: RoutineAlternative[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const subject = asString(item.subject).trim().slice(0, 80);
    if (!subject) continue;
    out.push({
      group: asGroup(item.group),
      subject,
      room: asString(item.room).trim().slice(0, 24) || null,
    });
    if (out.length >= 3) break;
  }
  return out;
}

function asSlot(value: unknown, fallback: number): RoutineSlot {
  const item = (value ?? {}) as Record<string, unknown>;
  const index = Number(item.index);
  return {
    index: Number.isFinite(index) && index > 0 ? Math.round(index) : fallback,
    start: asClock(item.start),
    end: asClock(item.end),
  };
}

/**
 * Turns anything read from storage (or a hand-built object) into a routine the
 * screens can trust. `null` when the shape is not a routine at all, so the
 * caller can fall back to its default instead of crashing mid-render.
 */
export function sanitiseRoutine(value: unknown): ParsedRoutine | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.days)) return null;

  const slots: RoutineSlot[] = [];
  if (Array.isArray(raw.slots)) {
    raw.slots.forEach((entry, index) => slots.push(asSlot(entry, index + 1)));
  }

  const days: RoutineDay[] = [];
  for (const entry of raw.days) {
    if (!entry || typeof entry !== "object") continue;
    const day = entry as Record<string, unknown>;
    const name = asString(day.day).trim();
    if (!name) continue;

    const classes: RoutineClass[] = [];
    if (Array.isArray(day.classes)) {
      for (const classEntry of day.classes) {
        if (!classEntry || typeof classEntry !== "object") continue;
        const item = classEntry as Record<string, unknown>;
        const subject = asString(item.subject).trim();
        if (!subject) continue;
        const slot = Number(item.slot);
        classes.push({
          slot: Number.isFinite(slot) && slot > 0 ? Math.round(slot) : classes.length + 1,
          start: asClock(item.start),
          end: asClock(item.end),
          subject: subject.slice(0, 80),
          type: asString(item.type).trim().slice(0, 24) || null,
          room: asString(item.room).trim().slice(0, 24) || null,
          teacher: asString(item.teacher).trim().slice(0, 40) || null,
          group: asGroup(item.group),
          alternatives: asAlternatives(item.alternatives),
        });
      }
    }
    classes.sort((left, right) => left.slot - right.slot);
    days.push({ day: name, classes });
  }

  const papers: RoutinePaper[] = [];
  if (Array.isArray(raw.papers)) {
    for (const entry of raw.papers) {
      if (!entry || typeof entry !== "object") continue;
      const paper = entry as Record<string, unknown>;
      papers.push({
        abbr: asString(paper.abbr).slice(0, 24),
        code: asString(paper.code).slice(0, 24),
        name: asString(paper.name).slice(0, 120),
        faculty: asString(paper.faculty).slice(0, 120),
        hours: asString(paper.hours).slice(0, 60),
      });
    }
  }

  return {
    branchLabel: asString(raw.branchLabel).slice(0, 60),
    semester: asString(raw.semester).slice(0, 12),
    batch: asString(raw.batch).slice(0, 12),
    effectiveFrom: asString(raw.effectiveFrom).slice(0, 40),
    room: asString(raw.room).slice(0, 24),
    slots: slots.length > 0 ? slots : DEFAULT_SLOTS.map((slot) => ({ ...slot })),
    days,
    papers,
    sourceUrl: asString(raw.sourceUrl).slice(0, 200),
    labGroup: asGroup(raw.labGroup),
    splitClass: raw.splitClass === true,
    stale: raw.stale === true,
  };
}

/** The time a period number is scheduled at, for a new row. */
export function slotAt(slots: readonly RoutineSlot[], index: number): RoutineSlot {
  return slots.find((slot) => slot.index === index) ?? { index, start: "", end: "" };
}

/** The next free period number for a day, so added rows never collide. */
export function nextSlotIndex(classes: readonly RoutineClass[]): number {
  let highest = 0;
  for (const item of classes) highest = Math.max(highest, item.slot);
  return highest + 1;
}


/* ---------------------------------------------------------------- sharing */

/**
 * The week as plain text: what a student pastes into the class group when
 * someone asks for the timetable. Periods in clock order, one line each.
 */
export function weekAsText(routine: ParsedRoutine): string {
  const lines: string[] = [];
  const head = [
    routine.branchLabel,
    routine.semester ? `Sem ${routine.semester}` : "",
    routine.batch,
  ]
    .filter(Boolean)
    .join(" · ");
  if (head) lines.push(head);

  const meta = [
    routine.effectiveFrom ? `From ${routine.effectiveFrom}` : "",
    routine.room ? `Room ${routine.room}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (meta) lines.push(meta);
  if (routine.splitClass && routine.labGroup) lines.push(`Lab group ${routine.labGroup}`);

  for (const day of sortedDays(routine)) {
    lines.push("", day.day);
    if (day.classes.length === 0) {
      lines.push("  Free");
      continue;
    }
    for (const item of [...day.classes].sort((left, right) => left.slot - right.slot)) {
      const time = item.start ? `${item.start}${item.end ? `-${item.end}` : ""}` : `P${item.slot}`;
      const subject = item.type ? `${item.subject} (${item.type})` : item.subject;
      const bits = [time, subject];
      if (item.room) bits.push(`Room ${item.room}`);
      lines.push(`  ${bits.join(" · ")}`);
    }
  }

  return lines.join("\n").trim();
}
