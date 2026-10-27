/**
 * Decodes the live syllabus snapshot, if one is active.
 *
 * The wire format is the same one `./data/packs.ts` ships, so a feed update is
 * just a newer set of records plus the packed prose they index. A record whose
 * hash matches the binary uses the bundled wire; a changed chunk is read from
 * Storage. Both are decoded with the same `decodeBranch` / `decodeGate`, which
 * is why an over-the-air update cannot drift from a bundled one.
 */

import { decodeBranch, decodeGate, makeTable, type Lookup } from "../syllabus/data/decode";
import { BRANCH_WIRE, GATE_WIRE } from "../syllabus/data/packs";
import { CHUNKS } from "../syllabus/data/table";
import { BUNDLED } from "./bundled";
import { activeFeed, dataVersion } from "./store";

/** Hash → packed text for prose that is already in the binary. */
const BUNDLED_CHUNKS = new Map<string, string>();
for (let i = 0; i < BUNDLED.chunks.length && i < CHUNKS.length; i++) {
  BUNDLED_CHUNKS.set(BUNDLED.chunks[i], CHUNKS[i]);
}

let version = -1;
let table: Lookup | null = null;
const branches = new Map<string, string>();
const gates = new Map<string, string>();

function ensure(): void {
  const current = dataVersion();
  if (current === version) return;
  version = current;
  table = null;
  branches.clear();
  gates.clear();

  const active = activeFeed();
  if (!active) return;
  const { counts, chunks } = active.manifest.syllabus;
  if (counts.length !== chunks.length) return;

  const texts: string[] = [];
  for (const hash of chunks) {
    const text = BUNDLED_CHUNKS.get(hash) ?? active.files.get(hash);
    if (text === undefined) return;
    texts.push(text);
  }
  table = makeTable(texts, counts);
}

/** The branch as JSON, or null when the bundled copy is already current. */
export function liveBranchPack(code: string): string | null {
  ensure();
  const active = activeFeed();
  if (!table || !active) return null;
  const hash = active.manifest.syllabus.branches[code];
  if (!hash) return null;
  const cached = branches.get(code);
  if (cached !== undefined) return cached;
  const wire = hash === BUNDLED.branches[code] ? BRANCH_WIRE[code] : active.files.get(hash);
  if (!wire) return null;
  const value = decodeBranch(code, wire, table);
  branches.set(code, value);
  return value;
}

/** The GATE paper as JSON, or null when the bundled copy is already current. */
export function liveGatePack(code: string): string | null {
  ensure();
  const active = activeFeed();
  if (!table || !active) return null;
  const hash = active.manifest.syllabus.gate[code];
  if (!hash) return null;
  const cached = gates.get(code);
  if (cached !== undefined) return cached;
  const wire = hash === BUNDLED.gate[code] ? GATE_WIRE[code] : active.files.get(hash);
  if (!wire) return null;
  const value = decodeGate(code, wire, table);
  gates.set(code, value);
  return value;
}
