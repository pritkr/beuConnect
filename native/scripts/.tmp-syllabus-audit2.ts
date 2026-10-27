// Throwaway audit 2 — shapes of the loss.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";
import { parseSyllabus } from "../src/features/syllabus/parse.ts";

const UNIT_RE = /^\s*(unit|module|part|section)\s*[-–:.]?\s*([ivxlcdm]+|\d+(?:\.\d+)?)\s*[.:–-]?\s*(.*)$/i;

const stats = { inline: [] as string[], inlineExample: "" as string, noUnits: [] as string[], shortUnits: [] as string[] };
for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      const content: string = subject.content ?? "";
      const where = `${meta.code}|${sem}|${subject.code}`;
      const units = parseSyllabus(content);
      if (!units.length) {
        if (content) stats.noUnits.push(`${where} :: ${JSON.stringify(content.slice(0, 80))}`);
        continue;
      }
      const inlineLines = content.split("\n").filter((line) => {
        const m = UNIT_RE.exec(line);
        return m !== null && (m[3] ?? "").length > 90;
      });
      if (inlineLines.length) stats.inline.push(`${where} (${inlineLines.length} heading lines, ${inlineLines[0].length} chars)`);
    }
  }
}
console.log("inline-heading subjects:", stats.inline.length);
console.log(stats.inline.slice(0, 40).join("\n"));
console.log("\nno units but content:", stats.noUnits.length);
console.log(stats.noUnits.slice(0, 15).join("\n"));
