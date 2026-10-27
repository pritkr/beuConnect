#!/usr/bin/env bun
/**
 * Packs the GEC Sheikhpura register into `src/features/students/roster-data.ts`.
 *
 * The source is the six per-branch registers in `src/data/students/`
 * (`gecs-{cse,ece,ee,mech,civil,met}.csv`, 2022-30 onwards) plus
 * `gecs-archive-2019-2021.csv`. The older `gecsheikhpura*.csv` files in the
 * same folder are the same register under its previous name and only four
 * columns, so this script names the files it reads instead of globbing: a glob
 * would pack every student twice and then fail on the missing columns.
 *
 * Wire format, one branch per key, one session per key inside it:
 *
 *   civil: {
 *     "2024-28": "<reg>|<NAME>\n<reg>|<NAME>|<roll>\n…"
 *   }
 *
 * The roll number is omitted when it equals the registration number (every
 * provisional admission and every archive row), and the session is the map
 * key, so neither is repeated on 1,784 lines. `roster-data.ts` expands it
 * lazily on the app's first read.
 *
 * The register's own `Session` / `Batch` are authoritative. A year-back
 * student can keep a registration year earlier than their current batch, and
 * 38 rows do; the archive has no Batch column, so there the session is derived
 * from the registration number (first two digits, one year earlier for
 * lateral-entry serials >= 900) and checked.
 *
 * An archive row whose registration number also appears in the current
 * register is superseded by the current row: same student, later batch. Those
 * six rows are dropped and reported, never packed twice.
 *
 *   bun scripts/build-students-data.mjs            # pack, verify, write
 *   bun scripts/build-students-data.mjs --check    # report sizes only
 *
 * It refuses to write unless the generated module decodes back to exactly the
 * rows read from the CSVs — same order, names and count.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const NATIVE = join(import.meta.dir, "..");
const DATA = join(NATIVE, "..", "src", "data", "students");
const FILE = join(NATIVE, "src", "features", "students", "roster-data.ts");
const CHECK_ONLY = process.argv.includes("--check");

/** The UI's branch order: the register's largest branches first, MET last. */
const BRANCHES = [
  { slug: "cse", file: "gecs-cse.csv", label: "Computer Science & Engineering" },
  { slug: "ece", file: "gecs-ece.csv", label: "Electronics & Communication Engineering" },
  { slug: "ee", file: "gecs-ee.csv", label: "Electrical Engineering" },
  { slug: "mech", file: "gecs-mech.csv", label: "Mechanical Engineering" },
  { slug: "civil", file: "gecs-civil.csv", label: "Civil Engineering" },
  { slug: "met", file: "gecs-met.csv", label: "Mechatronics Engineering" },
];
const ARCHIVE = "gecs-archive-2019-2021.csv";
/** Archive rows carry no Branch column; the registration number still does. */
const CODE_BRANCH = { "101": "civil", "102": "mech", "103": "ee", "104": "ece", "105": "cse", "106": "met" };

function fail(message) {
  throw new Error(message);
}

/** A small RFC-4180 reader: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(source) {
  const text = source.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function records(file) {
  const rows = parseCsv(readFileSync(join(DATA, file), "utf8"));
  const header = rows.shift() ?? [];
  return rows
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
}

function required(record, key, file) {
  const value = (record[key] ?? "").trim();
  if (!value) fail(`${file}: missing ${key}`);
  return value;
}

/** `2K24` and `2024-28` are two spellings of one batch; both must agree. */
function sessionOfBatch(batch, file) {
  const match = /^2K(\d{2})$/.exec(batch);
  if (!match) fail(`${file}: unexpected Batch ${JSON.stringify(batch)}`);
  const start = 2000 + Number(match[1]);
  return `${start}-${start + 4 - 2000}`;
}

/** The archive has no Batch column: registration year, one back if lateral. */
function sessionOfReg(reg, file) {
  if (!/^\d{11}$/.test(reg)) fail(`${file}: archive registration ${JSON.stringify(reg)} is not 11 digits`);
  const year = 2000 + Number(reg.slice(0, 2));
  const start = Number(reg.slice(8)) >= 900 ? year - 1 : year;
  return `${start}-${start + 4 - 2000}`;
}

function cleanName(raw, file) {
  const name = raw.trim().replace(/\s+/g, " ").toUpperCase();
  if (!name) fail(`${file}: empty name`);
  if (!/^[A-Z .]+$/.test(name)) fail(`${file}: unexpected character in name ${JSON.stringify(raw)}`);
  if (name.includes("|")) fail(`${file}: name contains the wire separator: ${name}`);
  return name;
}

const students = [];
const seen = new Map();
const dropped = [];

for (const branch of BRANCHES) {
  for (const record of records(branch.file)) {
    const session = required(record, "Session", branch.file);
    const batch = required(record, "Batch", branch.file);
    const declared = required(record, "Branch", branch.file);
    const reg = required(record, "RegNo", branch.file).toUpperCase();
    const roll = required(record, "RollNo", branch.file).toUpperCase().replace(/[,\s]+$/, "");
    const provisional = (record.Provisional ?? "").trim().toLowerCase() === "yes";

    if (reg.includes("|") || roll.includes("|")) fail(`${branch.file}: wire separator in ${reg} / ${roll}`);

    if (declared !== branch.slug) fail(`${branch.file}: ${reg} says branch ${declared}`);
    if (sessionOfBatch(batch, branch.file) !== session) {
      fail(`${branch.file}: ${reg} batch ${batch} is not session ${session}`);
    }
    if (provisional) {
      if (reg !== roll) fail(`${branch.file}: provisional ${reg} has roll ${roll}`);
      if (/^\d{11}$/.test(reg)) fail(`${branch.file}: provisional ${reg} still looks like a BEU number`);
    } else if (!/^\d{11}$/.test(reg)) {
      fail(`${branch.file}: ${reg} is not an 11-digit BEU registration number`);
    }

    if (seen.has(reg)) fail(`${branch.file}: duplicate registration ${reg}`);
    const row = {
      reg,
      name: cleanName(record.Name ?? "", branch.file),
      roll: roll === reg ? "" : roll,
      session,
      branch: branch.slug,
    };
    seen.set(reg, row);
    students.push(row);
  }
}

for (const record of records(ARCHIVE)) {
  const reg = required(record, "RegNo", ARCHIVE).toUpperCase();
  const session = required(record, "Session", ARCHIVE);
  const branch = CODE_BRANCH[reg.slice(2, 5)];
  if (!branch) fail(`${ARCHIVE}: ${reg} has no known branch code`);
  if (sessionOfReg(reg, ARCHIVE) !== session) {
    fail(`${ARCHIVE}: ${reg} derives ${sessionOfReg(reg, ARCHIVE)}, not ${session}`);
  }
  if (seen.has(reg)) {
    dropped.push(reg);
    continue;
  }
  const row = {
    reg,
    name: cleanName(record.Name ?? "", ARCHIVE),
    roll: "",
    session,
    branch,
  };
  seen.set(reg, row);
  students.push(row);
}

const sessions = [...new Set(students.map((row) => row.session))].sort((left, right) => {
  return Number(right.slice(0, 4)) - Number(left.slice(0, 4));
});
const branchCounts = Object.fromEntries(
  BRANCHES.map((branch) => [branch.slug, students.filter((row) => row.branch === branch.slug).length]),
);
const sessionCounts = Object.fromEntries(
  sessions.map((session) => [session, students.filter((row) => row.session === session).length]),
);

const wire = {};
for (const branch of BRANCHES) {
  wire[branch.slug] = {};
  for (const session of sessions) {
    const rows = students
      .filter((row) => row.branch === branch.slug && row.session === session)
      .sort((left, right) => left.name.localeCompare(right.name) || left.reg.localeCompare(right.reg));
    if (rows.length === 0) continue;
    wire[branch.slug][session] = rows.map((row) => [row.reg, row.name, row.roll].filter(Boolean).join("|")).join("\n");
  }
}

const DECODE = `/** One packed row, before the app adds the batch label. */
export interface WireStudent {
  reg: string;
  name: string;
  /** The class roll number; "" when it is the registration number. */
  roll: string;
  session: string;
  branch: string;
}

let cache: WireStudent[] | null = null;

/** Expands the packed register on first read; later calls reuse the array. */
export function decodeRoster(): WireStudent[] {
  if (cache) return cache;
  const rows: WireStudent[] = [];
  for (const branch of Object.keys(WIRE)) {
    for (const session of Object.keys(WIRE[branch])) {
      for (const line of WIRE[branch][session].split("\\n")) {
        if (!line) continue;
        const [reg, name, roll] = line.split("|");
        rows.push({ reg, name, roll: roll ?? reg, session, branch });
      }
    }
  }
  cache = rows;
  return rows;
}`;

const header = `/* eslint-disable */
/**
 * GENERATED — do not hand-edit.
 *
 * GEC Sheikhpura's register: ${students.length} students across ${BRANCHES.length} branches and
 * ${sessions.length} batches, packed from \`src/data/students/gecs-*.csv\` on ${new Date().toISOString().slice(0, 10)}.
 *
 * One line per student, \`reg|NAME|roll\` (roll omitted when it is the reg),
 * grouped by branch and then by batch. The batch is the map key; the app
 * derives the registration year, lateral-entry state and batch label. The
 * register's Session/Batch columns are authoritative, because a year-back
 * student can carry a registration year earlier than their current batch.
 *
 * Regenerate with \`bun scripts/build-students-data.mjs\`.
 */
export const ROSTER_SNAPSHOT = "${new Date().toISOString().slice(0, 10)}";
export const ROSTER_COLLEGE = "157";
export const ROSTER_TOTAL = ${students.length};

/** Newest first. */
export const ROSTER_SESSIONS: string[] = ${JSON.stringify(sessions)};
export const ROSTER_SESSION_COUNTS: Record<string, number> = ${JSON.stringify(sessionCounts)};
export const ROSTER_BRANCH_COUNTS: Record<string, number> = ${JSON.stringify(branchCounts)};

const WIRE: Record<string, Record<string, string>> = ${JSON.stringify(wire, null, 2)};

${DECODE}
`;

const scratch = join(tmpdir(), `beu-students-verify-${process.pid}.ts`);
writeFileSync(scratch, header);
const module = await import(`${pathToFileURL(scratch).href}?v=${Date.now()}`);
const decoded = module.decodeRoster();

const expected = [...students].sort((left, right) => {
  const branchOrder = BRANCHES.findIndex((branch) => branch.slug === left.branch) - BRANCHES.findIndex((branch) => branch.slug === right.branch);
  if (branchOrder !== 0) return branchOrder;
  const sessionOrder = sessions.indexOf(left.session) - sessions.indexOf(right.session);
  if (sessionOrder !== 0) return sessionOrder;
  return left.name.localeCompare(right.name) || left.reg.localeCompare(right.reg);
});
const actual = decoded.map((row) => ({ ...row, roll: row.roll === row.reg ? "" : row.roll }));
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  fail(`round-trip mismatch: ${expected.length} rows in, ${actual.length} rows out — refusing to write`);
}

const kb = (size) => `${(size / 1024).toFixed(1)} KB`;
const sourceSize = (() => {
  try {
    return readFileSync(FILE);
  } catch {
    return Buffer.alloc(0);
  }
})();
console.log(`roster      ${students.length} students · ${BRANCHES.length} branches · ${sessions.length} batches`);
console.log(`  ${Object.entries(branchCounts).map(([slug, count]) => `${slug} ${count}`).join(" · ")}`);
console.log(`  ${sessions.map((session) => `${session} ${sessionCounts[session]}`).join(" · ")}`);
if (dropped.length > 0) console.log(`  dropped ${dropped.length} archive duplicate(s): ${dropped.join(", ")}`);
console.log(`  round-trip identical · module ${kb(sourceSize.length)} → ${kb(Buffer.byteLength(header))}`);

if (CHECK_ONLY) process.exit(0);
writeFileSync(FILE, header);
console.log(`wrote ${FILE}`);
