/**
 * The active syllabus snapshot, bundled or live.
 *
 * Screens call these instead of reading `BRANCH_PACKS` / `GATE_PACKS` directly,
 * so a feed update applies on the next render without a restart and without a
 * new build.
 */

import { liveBranchPack, liveGatePack } from "../data-feed/syllabus";
import { BRANCH_META, BRANCH_PACKS, GATE_META, GATE_PACKS } from "./data/packs";

export { BRANCH_META, GATE_META };

export function branchPack(code: string): string | undefined {
  return liveBranchPack(code) ?? BRANCH_PACKS[code];
}

export function gatePack(code: string): string | undefined {
  return liveGatePack(code) ?? GATE_PACKS[code];
}
