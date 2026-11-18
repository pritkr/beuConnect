import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Writes the Android app's copy of the GA4 vocabulary from
 * `src/lib/analytics/events.json`.
 *
 * An event name is a public promise: GA4 keeps it forever, and a name the
 * dashboards do not know is a silent hole in the data. The site and the app
 * therefore share one list — this file is the only place the app's half is
 * allowed to come from, and `taxonomy.test.ts` fails if the two ever disagree.
 *
 *     bun scripts/sync-analytics-events.ts [output path]
 *
 * The app lives in a sibling checkout, so the default output points there. The
 * file is only rewritten when the content actually changes, which keeps the
 * app's build cache warm.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "src/lib/analytics/events.json");

const defaultOutput = path.resolve(
	projectRoot,
	"..",
	"beuconnectaw/native/src/lib/analytics-events.ts",
);
const outputPath = path.resolve(process.argv[2] ?? defaultOutput);

/** The same rule the taxonomy test enforces, checked before anything is written. */
const NAME = /^[a-z][a-z0-9_]{2,39}$/;

const HEADER = `/**
 * GENERATED — do not edit.
 *
 * The app's half of the GA4 vocabulary. \`src/lib/analytics/events.json\` is the
 * source; \`bun scripts/sync-analytics-events.ts\` writes this file, and
 * \`src/lib/analytics/taxonomy.test.ts\` fails when the two disagree.
 *
 * Repeating the object here is deliberate: the app bundles its own strings and
 * never reads a file from the web project at runtime or build time.
 */`;

const raw = await readFile(sourcePath, "utf8");
const events = JSON.parse(raw) as Record<string, unknown>;

const entries = Object.entries(events);
if (entries.length === 0) {
	throw new Error(`${sourcePath} has no events`);
}

const seen = new Set<string>();
const problems: string[] = [];
for (const [key, value] of entries) {
	if (typeof value !== "string") {
		problems.push(`${key}: the value must be a string`);
		continue;
	}
	if (!NAME.test(value)) {
		problems.push(`${key}: "${value}" is not a valid GA4 event name`);
	}
	if (seen.has(value)) {
		problems.push(`${key}: "${value}" repeats an earlier event`);
	}
	seen.add(value);
}
if (problems.length > 0) {
	throw new Error(`Invalid analytics taxonomy:\n  ${problems.join("\n  ")}`);
}

const body = entries
	.map(([key, value]) => `\t${key}: ${JSON.stringify(value)},`)
	.join("\n");

const content = `${HEADER}
export const EVENTS = {
${body}
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
`;

let existing: string | null = null;
try {
	existing = await readFile(outputPath, "utf8");
} catch {
	// A first run in a fresh checkout: nothing to compare against.
}

const label = path.relative(projectRoot, outputPath);
if (existing === content) {
	console.log(`${label} is already in sync (${entries.length} events)`);
} else {
	await writeFile(outputPath, content, "utf8");
	console.log(`Wrote ${label} (${entries.length} events)`);
}
