/**
 * The precomputed search headings are exactly the parsed ones.
 *
 * Search builds its index on the first keystroke. It used to parse every
 * paper's prose there; `data/headings.ts` now carries the same headings so the
 * first query parses none of them. This pins the two together for every bundled
 * pack, and proves the fallback still answers for a paper the table does not
 * carry (a newer live pack, or one whose text changed under the same identity).
 *
 * Runs headless: `nsh test qa/unit/syllabus-headings.test.ts`
 */

import { describe, expect, test } from "nsh/test";

import { BRANCH_META, BRANCH_PACKS, GATE_META, GATE_PACKS } from "../../src/features/syllabus/data/packs";
import { GATE_HEADINGS, SUBJECT_HEADINGS, type SubjectHeadings } from "../../src/features/syllabus/data/headings";
import { precomputedGateHeadings, subjectHeadings } from "../../src/features/syllabus/headings";
import {
  gateSearchHeadings,
  parseGate,
  parseSyllabus,
  searchHeadings,
  type GatePack,
  type Subject,
} from "../../src/features/syllabus/parse";

/** A branch pack's decoded shape, as the search screen sees it. */
interface Pack {
  semesters: Record<string, Subject[]>;
}

function parsedSubjectHeadings(subject: Subject): string[] {
  const content = typeof subject.content === "string" ? subject.content : "";
  return content.length > 0 ? searchHeadings(parseSyllabus(content)) : [];
}

describe("precomputed search headings", () => {
  test("every bundled paper's headings are exactly what the parser produces", () => {
    const seen = new Set<string>();
    const mismatched: string[] = [];
    let papers = 0;
    let headings = 0;

    for (const meta of BRANCH_META) {
      const pack = JSON.parse(BRANCH_PACKS[meta.code]) as Pack;
      for (const semKey of Object.keys(pack.semesters)) {
        const sem = Number(semKey);
        if (!Number.isFinite(sem) || sem <= 0) continue;
        for (const subject of pack.semesters[semKey] ?? []) {
          if (!subject || typeof subject.name !== "string" || typeof subject.code !== "string" || !subject.code) continue;
          const id = `${subject.code}|${subject.name}|${sem}`;
          // The screen keeps one row per paper, and the first branch wins.
          if (seen.has(id)) continue;
          seen.add(id);

          const content = typeof subject.content === "string" ? subject.content : "";
          const row: SubjectHeadings | undefined = SUBJECT_HEADINGS[id];
          const parsed = parsedSubjectHeadings(subject);
          if (row === undefined) mismatched.push(`${id}: missing`);
          else if (row.n !== content.length) mismatched.push(`${id}: stale text length`);
          else if (JSON.stringify(row.h) !== JSON.stringify(parsed)) mismatched.push(`${id}: differs`);
          papers += 1;
          headings += parsed.length;
        }
      }
    }

    expect(mismatched).toEqual([]);
    expect(papers).toBe(Object.keys(SUBJECT_HEADINGS).length);
    expect(papers).toBeGreaterThan(280);
    expect(headings).toBeGreaterThan(500);
  });

  test("every GATE paper's headings are exactly what the parser produces", () => {
    const mismatched: string[] = [];
    let headings = 0;

    for (const meta of GATE_META) {
      const precomputed = precomputedGateHeadings(meta.code);
      const parsed = gateSearchHeadings(parseGate(JSON.parse(GATE_PACKS[meta.code]) as GatePack));
      if (precomputed === null) mismatched.push(`${meta.code}: missing`);
      else if (JSON.stringify(precomputed) !== JSON.stringify(parsed)) mismatched.push(`${meta.code}: differs`);
      headings += parsed.length;
    }

    expect(mismatched).toEqual([]);
    expect(Object.keys(GATE_HEADINGS).length).toBe(GATE_META.length);
    expect(headings).toBeGreaterThan(250);
  });

  test("a paper the table does not carry falls back to parsing", () => {
    const content = "Unit 1 Signals and Systems\n1. Sampling\n2. Filters";

    // A live or new paper: no row, so the headings come from the parser.
    expect(subjectHeadings("999999|Signals and Systems|1", content)).toEqual(["Signals and Systems"]);
    // No source text is an empty list, not a guessed heading.
    expect(subjectHeadings("999999|Signals and Systems|1", undefined)).toEqual([]);

    // A bundled identity whose live text changed is parsed too, not answered
    // from the row its identity would otherwise match.
    const [id] = Object.keys(SUBJECT_HEADINGS);
    if (id === undefined) throw new Error("the headings table is empty");
    expect(subjectHeadings(id, content)).toEqual(["Signals and Systems"]);

    // A GATE code the table does not carry is a miss, and its pack supplies
    // the sections (the XH-Cn parent fallback lives in the screen).
    expect(precomputedGateHeadings("ZZ")).toBe(null);
    const fixture: GatePack = {
      code: "ZZ",
      name: "Test paper",
      sections: [{ title: "Section 1: Signals", content: "Sampling: aliasing" }],
    };
    expect(gateSearchHeadings(parseGate(fixture))).toEqual(["Section 1: Signals"]);
  });
});
