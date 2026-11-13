import { BRANCH_META, BRANCH_PACKS } from "../src/features/syllabus/data/packs";
import type { BranchPack } from "../src/features/syllabus/parse";
for (const meta of BRANCH_META) {
  const pack = JSON.parse(BRANCH_PACKS[meta.code]) as BranchPack;
  console.log(meta.code, Object.keys(pack.semesters).join(","));
}
