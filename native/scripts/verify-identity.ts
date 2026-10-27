#!/usr/bin/env bun
/**
 * Deterministic check of the identity path Home depends on.
 *
 * No app runtime, no WebView, no screenshots: it repeats exactly what
 * `src/features/results/identity.ts` does — registration number → batch +
 * branch, newest published roster first, `RegNo` match — against the live CSV,
 * and prints the name, CGPA and college the app will show.
 *
 *   bun scripts/verify-identity.ts                 # the maintainer's number
 *   bun scripts/verify-identity.ts 24105157010 2   # any number, first semester to try
 *
 * Exit 0 when a row was found, 1 when it was not, 2 on a network/format failure.
 */

const SITE = "https://beu.prit.eu.org";

/** Same split as `parseReg`: SS=year, BBB=branch, CCC=college. */
function parseReg(raw: string) {
  const numeric = raw.replace(/\D/g, "");
  if (numeric.length < 8) return null;
  return { numeric, batch: numeric.slice(0, 2), branch: numeric.slice(2, 5), college: numeric.slice(5, 8) };
}

/** The published rosters for this batch + branch, newest first. Mirrors COVERAGE. */
const COVERAGE: Record<string, Record<string, number[]>> = {
  "21": { "101": [1, 2, 3, 4, 5, 6, 7, 8], "102": [1, 2, 3, 4, 5, 6, 7, 8], "103": [1, 2, 3, 4, 5, 6, 7, 8], "104": [1, 2, 3, 4, 5, 6, 7, 8], "105": [1, 8], "110": [8] },
  "22": { "101": [1, 2, 3, 4, 5, 6], "102": [1, 2, 3, 4, 5, 6], "103": [1, 2, 3, 4, 5, 6], "104": [1, 2, 3, 4, 5, 6], "105": [1, 2, 3, 4, 5, 6], "110": [5, 6] },
  "23": { "101": [1, 2, 3, 4], "102": [1, 2, 3, 4], "103": [1, 2, 3, 4], "104": [1, 2, 3, 4], "105": [1, 2, 3, 4], "110": [3, 4] },
  "24": { "101": [1, 2], "102": [1, 2], "103": [1, 2], "104": [1, 2], "105": [1, 2], "110": [1, 2] },
  "25": { "101": [1], "102": [1], "103": [1], "104": [1], "105": [1], "161": [1] },
};

const reg = process.argv[2] ?? "24105157010";
const info = parseReg(reg);
if (!info) {
  console.error(`✗ ${reg} is not a registration number (needs at least 8 digits)`);
  process.exit(2);
}

const sems = (COVERAGE[info.batch]?.[info.branch] ?? []).slice().sort((a, b) => b - a).slice(0, 3);
if (sems.length === 0) {
  console.error(`✗ no roster is published for batch ${info.batch}, branch ${info.branch}`);
  process.exit(2);
}

/** A CSV line split on commas, honouring the quoted college name. */
function fields(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      out.push(field);
      field = "";
    } else field += char;
  }
  out.push(field);
  return out;
}

for (const sem of sems) {
  const url = `${SITE}/data/students_${info.batch}_all_${info.branch}_sem${sem}.csv`;
  process.stdout.write(`→ ${url}\n`);
  let text: string;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  ${response.status} ${response.statusText}`);
      continue;
    }
    text = await response.text();
  } catch (error) {
    console.error(`  ${(error as Error).message}`);
    process.exitCode = 2;
    continue;
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = fields(lines[0]).map((name) => name.trim());
  const regAt = header.findIndex((name) => /^(RegNo|RegistrationNo|Reg No)$/i.test(name));
  const nameAt = header.findIndex((name) => /^(Name|StudentName)$/i.test(name));
  const cgpaAt = header.findIndex((name) => /CGPA/i.test(name));
  const sgpaAt = header.findIndex((name) => /^SGPA$/i.test(name));
  const collegeAt = header.findIndex((name) => /^CollegeName$/i.test(name));

  for (const line of lines.slice(1)) {
    const row = fields(line);
    if (row[regAt]?.trim() !== info.numeric) continue;
    const name = row[nameAt]?.trim() ?? "";
    const shown = name === name.toUpperCase() ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : name;
    console.log(`✓ semester ${sem}: ${shown} · SGPA ${row[sgpaAt] || "—"} · CGPA ${row[cgpaAt] || "—"} · ${row[collegeAt] ?? ""}`);
    process.exit(0);
  }
  console.error(`  ${info.numeric} is not in this roster`);
  process.exitCode = 1;
}

process.exit(process.exitCode ?? 1);
