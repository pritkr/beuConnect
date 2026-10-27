// Throwaway — shows every heading line that carries inline content.
import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs.ts";

const UNIT_RE = /^\s*(unit|module|part|section)\s*[-–:.]?\s*([ivxlcdm]+|\d+(?:\.\d+)?)\s*[.:–-]?\s*(.*)$/i;
const limit = Number(process.argv[2] ?? 6);

for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]);
  let shown = 0;
  for (const [sem, list] of Object.entries(pack.semesters)) {
    for (const subject of list as any[]) {
      if (shown >= limit) break;
      const lines = (subject.content ?? "").split("\n");
      for (const line of lines) {
        const m = UNIT_RE.exec(line);
        if (!m) continue;
        const rest = (m[3] ?? "").trim();
        if (rest.length < 80) continue;
        console.log(`--- ${meta.code}|${sem}|${subject.code} heading: ${JSON.stringify(m[0].slice(0, 40))}`);
        console.log(`    rest: ${JSON.stringify(rest.slice(0, 320))}`);
        shown++;
        break;
      }
    }
  }
}
