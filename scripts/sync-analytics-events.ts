#!/usr/bin/env bun
/**
 * Writes the app's copy of the GA4 event names.
 *
 * `src/lib/analytics/events.json` is the source of truth: the site imports it,
 * and this script generates `native/src/lib/analytics-events.ts` so the app
 * reports exactly the same strings. Run it after changing the JSON:
 *
 *   bun scripts/sync-analytics-events.ts            # write
 *   bun scripts/sync-analytics-events.ts --check    # fail if stale
 *
 * `src/lib/analytics/taxonomy.test.ts` runs the check as part of `bun test`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src/lib/analytics/events.json");
const target = join(root, "native/src/lib/analytics-events.ts");

const taxonomy = JSON.parse(readFileSync(source, "utf8")) as Record<string, string>;

const names = Object.values(taxonomy);
const invalid = names.filter((name) => !/^[a-z][a-z0-9_]{2,39}$/.test(name));
if (invalid.length > 0) {
	console.error(`Invalid GA4 event names: ${invalid.join(", ")}`);
	process.exit(1);
}
const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicates.length > 0) {
	console.error(`Duplicate GA4 event names: ${[...new Set(duplicates)].join(", ")}`);
	process.exit(1);
}

const rows = Object.entries(taxonomy)
	.map(([key, value]) => `\t${key}: "${value}",`)
	.join("\n");

const generated = `/**
 * GENERATED — do not edit.
 *
 * The app's half of the GA4 vocabulary. \`src/lib/analytics/events.json\` is the
 * source; \`bun scripts/sync-analytics-events.ts\` writes this file, and
 * \`src/lib/analytics/taxonomy.test.ts\` fails when the two disagree.
 *
 * Repeating the object here is deliberate: the app bundles its own strings and
 * never reads a file from the web project at runtime or build time.
 */
export const EVENTS = {
${rows}
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
`;

if (process.argv.includes("--check")) {
	let current = "";
	try {
		current = readFileSync(target, "utf8");
	} catch {
		current = "";
	}
	if (current !== generated) {
		console.error("native/src/lib/analytics-events.ts is stale. Run: bun scripts/sync-analytics-events.ts");
		process.exit(1);
	}
	console.log("analytics events: in sync");
	process.exit(0);
}

writeFileSync(target, generated);
console.log(`analytics events: wrote ${names.length} names to ${target}`);
