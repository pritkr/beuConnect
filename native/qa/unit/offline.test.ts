/**
 * Offline packs — who owns which cache key, and what the ledger says.
 *
 * Runs headless, no engine: `nsh test qa/unit/offline.test.ts`
 *
 * The matchers in `src/features/offline/packs.ts` are the single source of
 * truth for the Offline screen, the Storage screen and "clear this pack". A key
 * claimed twice, or a bundled pack claiming one, is how a student loses papers
 * they never chose to delete.
 */

import { describe, expect, test } from "nsh/test";

import type { CacheRow } from "../../src/lib/cache";
import { PACKS, packOf, reportOf, type Facts } from "../../src/features/offline/packs";

/** One real key per downloaded pack, plus keys no pack may claim. */
const OWNED: [string, string][] = [
  ["pyqs.papers.v1.100110", "pyq"],
  ["notes.manifest.v1", "notes"],
  ["notices.board.v1", "notices"],
  ["announcements.feed.v1", "notices"],
  ["pyqs.csv.2024", "tables"],
  ["pyqs.manifest.v1", "tables"],
  ["wide:cse", "tables"],
  ["roster:157", "tables"],
];

const FACTS: Facts = { subjects: 100, papersTotal: 50, papers: 2, gateBranches: 6, gatePapers: 30 };

function row(key: string, bytes: number, at: number): CacheRow {
  return { key, storageKey: `beu.cache.${key}`, bytes, at };
}

describe("offline packs", () => {
  test("every key belongs to exactly one pack, and bundled packs own none", () => {
    const ids = PACKS.map((pack) => pack.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);

    for (const [key, id] of OWNED) {
      const owners = PACKS.filter((pack) => pack.match(key)).map((pack) => pack.id);
      expect(owners).toEqual([id]);
      expect(packOf(key)?.id).toBe(id);
    }

    // A bundled pack is inside the binary: it can never match a device key.
    const bundled = PACKS.filter((pack) => pack.bundled);
    expect(bundled.length).toBe(2);
    for (const pack of bundled) {
      expect(OWNED.filter(([key]) => pack.match(key))).toEqual([]);
    }

    // A key no pack claims is not silently charged to one.
    expect(packOf("profile.v1")).toBe(null);
  });

  test("the ledger counts only the pack's own rows, newest first", () => {
    const rows = [
      row("pyqs.papers.v1.a", 2048, 10),
      row("pyqs.papers.v1.b", 1024, 30),
      row("notes.manifest.v1", 500, 20),
    ];

    const pyq = reportOf(PACKS.find((pack) => pack.id === "pyq")!, rows, FACTS);
    expect(pyq.keys).toBe(2);
    expect(pyq.bytes).toBe(3072);
    expect(pyq.at).toBe(30);
    expect(pyq.detail).toContain("2 of 50 paper sets");

    // Bundled data costs nothing on the device, even when rows exist.
    const syllabus = reportOf(PACKS.find((pack) => pack.id === "syllabus")!, rows, FACTS);
    expect(syllabus.keys).toBe(0);
    expect(syllabus.bytes).toBe(0);
    expect(syllabus.detail).toBe("100 subjects · bundled");
  });
});
