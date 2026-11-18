/**
 * The PYQ parser reads the site's *current* paper markup, and keys each paper
 * the way the catalogue looks it up.
 *
 * This is the one test that would have caught the 2025 outage: the site moved
 * from `section-group`/`q-box` to `paper-section`/`question`, and the parser
 * kept returning "the site has no such paper" for every paper on the page.
 * The shared fixture (`qa/fixtures/paper-page.ts`) is the live shape.
 *
 * It also pins the two identity rules the cache depends on:
 *
 *  - a page id is `paper-<code>-<year>[-variant]`, the catalogue id is
 *    `<year>[_variant]`, and the cache key is `<code>-<catalogue id>`;
 *  - the same year+variant can exist under two codes on one page, so an id
 *    without its code must never match a different code's paper.
 *
 * Runs headless: `nsh test qa/unit/paper-parse.test.ts`
 */

import { describe, expect, test } from "nsh/test";

import {
  catalogueId,
  pageAnchor,
  paperBlock,
  paperBlockCount,
  paperKey,
  parseAllPapers,
  parsePaperHtml,
} from "../../src/features/pyqs/paper-parse";
import { PAPER_PAGE_HTML as PAGE } from "../fixtures/paper-page";

describe("pyq paper parser", () => {
  test("parses every block of the current markup, and keys it by code + catalogue id", () => {
    const parsed = parseAllPapers(PAGE);
    expect(parsed.map((entry) => entry.id)).toEqual(["100403-2025", "100403-2024_v2"]);
    expect(paperBlockCount(PAGE)).toBe(3); // the third has no sections: counted, not cached
  });

  test("reads the head, the instructions and the question tree", () => {
    const paper = parseAllPapers(PAGE)[0].paper;
    expect(paper.found).toBe(true);
    expect(paper.title).toBe("B.Tech Examination, 2025");
    expect(paper.year).toBe(2025);
    expect(paper.code).toBe("100403");
    expect(paper.time).toBe("3 hours");
    expect(paper.fullMarks).toBe("70");
    expect(paper.instructions).toEqual(["Attempt five questions.", "Marks are in the right-hand margin."]);
    expect(paper.sections.length).toBe(1);
    expect(paper.questionCount).toBe(2);

    const [q1, q2] = paper.sections[0].questions;
    expect(q1.number).toBe("Q1");
    expect(q1.text).toBe("Explain the working of a PN junction diode.");
    expect(q1.marks).toBe(5);
    expect(q1.subs.map((sub) => [sub.label, sub.text, sub.marks])).toEqual([
      ["a)", "Forward bias", 2],
      ["b)", "Reverse bias", 3],
    ]);
    expect(q2.options.map((option) => [option.label, option.text])).toEqual([
      ["a)", "10101.001"],
      ["b)", "10101.010"],
    ]);
  });

  test("finds a variant by catalogue id and code", () => {
    const target = { id: "2024_v2", code: "100403", year: 2024, variant: "v2", title: "B.Tech Examination, 2024" };
    expect(paperBlock(PAGE, target)).not.toBe("");
    const paper = parsePaperHtml(PAGE, target);
    expect(paper.found).toBe(true);
    expect(paper.title).toBe("B.Tech Examination, 2024");
    expect(paper.questionCount).toBe(1);
  });

  test("never returns another code's paper with the same year and variant", () => {
    const wrong = { id: "2024_v2", code: "100209", year: 2024, variant: "v2", title: "B.Tech Examination, 2024" };
    expect(paperBlock(PAGE, wrong)).toBe("");
    expect(parsePaperHtml(PAGE, wrong).found).toBe(false);
  });

  test("maps page ids to catalogue ids, including cross-listed codes", () => {
    expect(catalogueId("paper-100403-2025", "100403")).toBe("2025");
    expect(catalogueId("paper-100403-2024-v2", "100403")).toBe("2024_v2");
    expect(catalogueId("paper-100403-2023-special", "100403")).toBe("2023_special");
    expect(catalogueId("paper-100203-2020", "100103/100203")).toBe("2020");
    expect(paperKey("100103", "2020")).toBe("100103-2020");
    // The way back: "Open on the site" must land on the paper's own block.
    expect(pageAnchor("100403", "2025")).toBe("paper-100403-2025");
    expect(pageAnchor("100403", "2024_v2")).toBe("paper-100403-2024-v2");
    expect(pageAnchor("100403", "2023_special")).toBe("paper-100403-2023-special");
  });

  test("a block with no sections is absent, not a made-up paper", () => {
    const paper = parsePaperHtml(PAGE, { id: "2023", code: "100403", year: 2023, variant: "", title: "" });
    expect(paper.found).toBe(false);
    expect(paper.sections).toEqual([]);
    expect(paper.questionCount).toBe(0);
  });
});
