/**
 * Syllabus text → units → topics, and the promises the reader makes about it.
 *
 * Runs headless: `nsh test qa/unit/syllabus.test.ts`
 *
 * The parser is the one place a bad PDF copy-paste can silently delete a topic
 * from a paper a student is revising. These tests pin the shapes BEU actually
 * ships — a whole topic list on the unit heading, a "Detailed contents:"
 * caption, a page number glued to a module title, hours written as "lectures"
 * — and then walk every bundled pack to prove no paper with source text ends up
 * with nothing to tick.
 *
 * Fixtures are inline; the pack sweep reads the generated snapshot directly.
 */

import { describe, expect, test } from "nsh/test";

import { BRANCH_PACKS } from "../../src/features/syllabus/data/packs";
import { parseSyllabus, type Subject, type Unit } from "../../src/features/syllabus/parse";

/** Structural words the parser is allowed to strip with a heading. */
const STRUCTURE = new Set(["unit", "module", "chapter", "detailed", "contents"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STRUCTURE.has(word));
}

/** Every word the source printed survives somewhere in the parsed paper. */
function lostWords(source: string, units: Unit[]): string[] {
  const kept = new Set<string>();
  for (const unit of units) {
    for (const word of words(unit.title)) kept.add(word);
    for (const topic of unit.topics) {
      for (const word of words(topic.title)) kept.add(word);
      for (const word of words(topic.body)) kept.add(word);
    }
  }
  return [...new Set(words(source))].filter((word) => !kept.has(word));
}

function subjectOf(branch: string, sem: number, code: string): Subject {
  const pack = JSON.parse(BRANCH_PACKS[branch]) as { semesters: Record<string, Subject[]> };
  const subject = pack.semesters[String(sem)].find((item) => item.code === code);
  if (!subject) throw new Error(`fixture ${branch}|${sem}|${code} is not in the pack`);
  return subject;
}

describe("unit headings", () => {
  test("a heading that carries the whole topic list becomes the unit title plus its topics", () => {
    const units = parseSyllabus(
      "Module 1 Digital Principle: Analog Vs Digital, Number System, Computer Codes, Logic Gates and Boolean Algebra",
    );

    expect(units.length).toBe(1);
    expect(units[0].title).toBe("Digital Principle");
    expect(units[0].topics.map((topic) => topic.title)).toEqual([
      "Analog Vs Digital",
      "Number System",
      "Computer Codes",
      "Logic Gates and Boolean Algebra",
    ]);
  });

  test("a unit with only a heading is kept, even with no topics under it", () => {
    const units = parseSyllabus("Unit 1 Digital Logic\nUnit 2 Data Representation");

    expect(units.map((unit) => unit.title)).toEqual(["Digital Logic", "Data Representation"]);
    expect(units.map((unit) => unit.topics.length)).toEqual([0, 0]);
  });

  test("a page number glued to a module title is stripped, but a number that starts the title is not", () => {
    const pageNumber = parseSyllabus("Module 4 1 Sequential Circuit Blocks\n1. Flip flops");
    expect(pageNumber[0].title).toBe("Sequential Circuit Blocks");

    // "16 and 32 microprocessors" is the paper's subject, not page 16.
    const realNumber = parseSyllabus("Unit 1 16 and 32 microprocessors\n1. Registers");
    expect(realNumber[0].title).toBe("16 and 32 microprocessors");
  });

  test("hours keep the source's own word", () => {
    const lectures = parseSyllabus("Unit 1 Digital Logic (6 lectures)\n1. Boolean algebra");
    expect(lectures[0].hours).toBe("6 lectures");
    expect(lectures[0].title).toBe("Digital Logic");

    const periods = parseSyllabus("Unit 2 Microprocessors 2 periods\n1. 8085 architecture");
    expect(periods[0].hours).toBe("2 periods");
    expect(periods[0].title).toBe("Microprocessors");
  });
});

describe("unit bodies", () => {
  test("a 'Detailed contents:' caption is dropped, not turned into a topic", () => {
    const units = parseSyllabus("Detailed contents:\nUnit 1 Digital Logic\n1. Boolean algebra");

    expect(units.length).toBe(1);
    expect(units[0].topics.map((topic) => topic.title)).toEqual(["Boolean algebra"]);
  });

  test("a prose unit keeps every sentence as its own topic", () => {
    const units = parseSyllabus(
      "Unit 1 Digital Logic\nBoolean algebra is the study of values. Logic gates implement it.",
    );

    expect(units[0].topics.map((topic) => topic.title)).toEqual([
      "Boolean algebra is the study of values",
      "Logic gates implement it",
    ]);
  });

  test("a long numbered topic keeps its readable head and the whole tail in the body", () => {
    const units = parseSyllabus(
      "Unit 2 Memory\n" +
        "1. Memory hierarchy is arranged as registers, cache, main memory and secondary storage, with each level trading speed for size.",
    );

    const topic = units[0].topics[0];
    expect(topic.title.length).toBeLessThanOrEqual(85);
    expect(`${topic.title} ${topic.body}`).toContain("secondary storage");
  });

  test("no word of the source is dropped", () => {
    const source =
      "Unit 1 Digital Principle: Analog Vs Digital, Number System, Computer Codes, Logic Gates and Boolean Algebra\n" +
      "1. Combinational circuits: comparators, multiplexers and decoders.\n" +
      "2. Sequential circuits and flip flops.";
    const units = parseSyllabus(source);

    expect(lostWords(source, units)).toEqual([]);
  });
});

describe("the bundled packs", () => {
  test("every paper that ships source text parses to at least one tickable topic", () => {
    let papers = 0;
    const empty: string[] = [];

    for (const branch of Object.keys(BRANCH_PACKS)) {
      const pack = JSON.parse(BRANCH_PACKS[branch]) as { semesters: Record<string, Subject[]> };
      for (const sem of Object.keys(pack.semesters)) {
        for (const subject of pack.semesters[sem]) {
          if (!(subject.content ?? "").trim()) continue;
          papers += 1;
          const units = parseSyllabus(subject.content);
          if (!units.some((unit) => unit.topics.length > 0)) {
            empty.push(`${branch}|${sem}|${subject.code}`);
          }
        }
      }
    }

    expect(papers).toBeGreaterThan(300);
    expect(empty).toEqual([]);
  });

  test("ECE Sem 4 Digital Circuits keeps the topics printed on its module headings", () => {
    const units = parseSyllabus(subjectOf("ece", 4, "104402").content);

    expect(units.length).toBe(6);
    expect(units[0].title).toBe("Number system");
    expect(units[0].hours).toBe("4 hrs");
    expect(units[0].topics.map((topic) => topic.title)).toEqual(["Binary Codes", "Complements"]);
    // The second module's heading is a title, not a lost topic list.
    expect(units[1].title).toBe("Boolean laws and theorems");
    expect(units[1].topics.some((topic) => topic.body.includes("Karnaugh"))).toBe(true);
  });

  test("Mech Sem 2 Workshop Practices keeps its shop units, hours and every listed exercise", () => {
    const units = parseSyllabus(subjectOf("mech", 2, "100206").content);

    expect(units.length).toBe(6);
    expect(units[0].title).toBe("Sheet Metal Working");
    expect(units[0].hours).toBe("6 hrs");
    expect(units.reduce((sum, unit) => sum + unit.topics.length, 0)).toBeGreaterThan(20);
  });

  test("a paper with no source text is a stub, not invented prose", () => {
    const units = parseSyllabus(subjectOf("cse", 6, "100604P").content);
    expect(units).toEqual([]);
  });
});
