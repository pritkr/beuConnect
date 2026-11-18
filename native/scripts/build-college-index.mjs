#!/usr/bin/env bun
/**
 * Builds the college roster index — which `(batch, college, branch)` pairs BEU
 * has actually published a `students_*.csv` for, and which semesters each one
 * carries.
 *
 * Why an index at all: the app bundles one register (GEC Sheikhpura) and the
 * site publishes 1,345 college-specific rosters. The APK cannot carry them, so
 * it carries the map and fetches a roster on demand (`docs/DATA_BREADTH.md` §3).
 *
 * The source is the site's `public/data/students_<batch>_<college>_<branch>_sem<n>.csv`,
 * read by name — not from `manifest/index.json`, whose paths 404
 * (`docs/RESULT_COVERAGE.md`). A name that does not match is skipped and
 * counted; it never becomes a URL the app can build.
 *
 *   bun scripts/build-college-index.mjs            # write the module
 *   bun scripts/build-college-index.mjs --check    # fail on drift, write nothing
 *
 * The output is `src/features/students/college-index.ts`, generated, never
 * hand-edited. `generatedAt` is the only line `--check` ignores: the data is
 * the check, so a re-run on a new day still passes.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const NATIVE = join(import.meta.dir, "..");
const DATA = join(NATIVE, "..", "public", "data");
const FILE = join(NATIVE, "src", "features", "students", "college-index.ts");
const CHECK = process.argv.includes("--check");

/** `students_21_107_101_sem8.csv` — the only shape this reads. */
const NAME = /^students_(\d{2})_(\d{3})_(\d{3})_sem(\d)\.csv$/;

/** Ascending numbers, no duplicates. */
function add(list, value) {
	if (!list.includes(value)) list.push(value);
}

function scan() {
	const colleges = {};
	let skipped = 0;
	let files = 0;

	for (const name of readdirSync(DATA)) {
		if (!name.startsWith("students_") || !name.endsWith(".csv")) continue;
		const match = NAME.exec(name);
		if (!match) {
			// `students_<batch>_all_<branch>_sem<n>.csv` is the branch-wide file,
			// which is a different URL and not indexed here.
			if (!name.includes("_all_")) skipped += 1;
			continue;
		}
		const [, batch, college, branch, sem] = match;
		// Six `sem0` files exist and are the enrollment register, not a semester
		// (`Session,RegNo,Name,Branch`, no SGPA). They are not a result, so they
		// are counted and dropped rather than offered as a semester.
		if (Number(sem) < 1 || Number(sem) > 8) {
			skipped += 1;
			continue;
		}
		files += 1;
		const byBatch = (colleges[college] ??= {});
		const byBranch = (byBatch[batch] ??= {});
		add((byBranch[branch] ??= []), Number(sem));
	}

	// Stable output: every level sorted, semesters ascending.
	const sorted = {};
	for (const college of Object.keys(colleges).sort()) {
		const byBatch = {};
		for (const batch of Object.keys(colleges[college]).sort()) {
			const byBranch = {};
			for (const branch of Object.keys(colleges[college][batch]).sort()) {
				byBranch[branch] = colleges[college][batch][branch].sort((a, b) => a - b);
			}
			byBatch[batch] = byBranch;
		}
		sorted[college] = byBatch;
	}

	let pairs = 0;
	let sems = 0;
	for (const college of Object.values(sorted)) {
		for (const batch of Object.values(college)) {
			for (const list of Object.values(batch)) {
				pairs += 1;
				sems += list.length;
			}
		}
	}

	return { index: sorted, skipped, files, pairs, sems };
}

const { index, skipped, files, pairs, sems } = (() => {
	// The published CSVs are private: the public repository ships this module
	// and not the `public/data/students_*.csv` it was built from. A check there
	// has nothing to compare against, so it passes instead of failing the gate;
	// a build still refuses, because writing an empty index would erase every
	// roster URL.
	if (!existsSync(DATA) || !readdirSync(DATA).some((name) => NAME.test(name))) {
		if (CHECK) {
			console.log(`${DATA} has no published rosters; skipping the index check.`);
			process.exit(0);
		}
		console.error(`${DATA} has no published rosters; nothing to build.`);
		process.exit(1);
	}
	return scan();
})();
const json = JSON.stringify(index);
const gzip = gzipSync(json).byteLength;

const stamp = process.env.SOURCE_DATE_EPOCH
	? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString().slice(0, 10)
	: new Date().toISOString().slice(0, 10);

const header = `/* eslint-disable */
/**
 * GENERATED — do not hand-edit.
 *
 * Which college rosters BEU has published: college → batch → branch → the
 * semesters that exist, read from the site's \`public/data/students_*.csv\`
 * names on ${stamp}. ${files} roster files, ${pairs} distinct
 * (college, batch, branch) pairs, ${sems} semesters.
 *
 * The app uses this as a map, never as data: an entry means a URL exists, and
 * a missing entry means it does not. Regenerate with
 * \`bun scripts/build-college-index.mjs\` (\`--check\` fails on drift).
 */
`;

const body = `export const COLLEGE_INDEX_SNAPSHOT = ${JSON.stringify(stamp)};
/** Names that looked like a roster and were not one: reported, never indexed. */
export const COLLEGE_INDEX_SKIPPED = ${skipped};
export const COLLEGE_INDEX: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>>
> = ${json.split(",").join(", ")};
`;

const next = `${header}${body}`;

console.log(
	`${files} files · ${pairs} pairs · ${sems} semesters · ${Object.keys(index).length} colleges · ` +
		`${skipped} skipped · ${json.length} B raw · ${gzip} B gzip`,
);

if (gzip > 24_576) {
	console.error(`college-index gzip is ${gzip} B, over the 24 KB budget.`);
	process.exit(1);
}

if (CHECK) {
	let current = "";
	try {
		current = readFileSync(FILE, "utf8");
	} catch {
		console.error(`${FILE} is missing; run without --check.`);
		process.exit(1);
	}
	const strip = (text) => text.replace(/on \d{4}-\d{2}-\d{2}\./, "on DATE.");
	if (strip(current) !== strip(next)) {
		console.error("college-index.ts is stale; regenerate it (bun scripts/build-college-index.mjs).");
		process.exit(1);
	}
	console.log("college-index.ts is up to date.");
	process.exit(0);
}

const before = (() => {
	try {
		return readFileSync(FILE, "utf8");
	} catch {
		return "";
	}
})();
if (before === next) {
	console.log("unchanged.");
	process.exit(0);
}
writeFileSync(FILE, next);
console.log(`wrote ${FILE}`);
