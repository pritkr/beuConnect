// Throwaway — headings longer than 64 chars with no colon separator.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";

const UNIT_RE = /^\s*(unit|module|part|section)\s*[-–:.]?\s*([ivxlcdm]+|\d+(?:\.\d+)?)\s*[.:–-]?\s*(.*)$/i;
const rows: string[] = [];
for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      for (const line of (subject.content ?? "").split("\n")) {
        const m = UNIT_RE.exec(line);
        if (!m) continue;
        const rest = (m[3] ?? "").trim();
        if (rest.length <= 64) continue;
        if (/[:;]|\s[–-]\s/.test(rest.slice(0, 64))) continue;
        rows.push(`${meta.code}|${sem}|${subject.code} :: ${JSON.stringify(rest.slice(0, 130))}`);
      }
    }
  }
}
console.log(rows.length);
console.log(rows.slice(0, 25).join("\n"));
