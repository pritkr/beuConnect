/**
 * What a share actually carries.
 *
 * The sheet is the system's; the words are ours. A notice shares its title, its
 * link and one app line; a result shares the summary the screen already shows;
 * a PDF shares its link. Nothing here invents a name, a mark, a rank or a
 * paper — these tests hold the two shapes to that: the string the clipboard
 * gets, and the title/body/link split a share target gets.
 *
 * Only the pure builders are imported: `shareOrCopy` asks a real device whether
 * it has a sheet, which is the one thing a unit test here cannot answer.
 */

import { describe, expect, test } from "nsh/test";

import { shareContent, shareText, shareableUrl } from "../../src/lib/share";

const NOTICE = {
  title: "B.Tech 3rd Semester Examination Form",
  url: "https://beu.prit.eu.org/announcements/exam-form/",
  text: "Shared from BEUConnect",
};

describe("shareText", () => {
  test("title, link, then the app line after a blank line", () => {
    expect(shareText(NOTICE)).toBe(
      "B.Tech 3rd Semester Examination Form\nhttps://beu.prit.eu.org/announcements/exam-form/\n\nShared from BEUConnect",
    );
  });

  test("a missing part takes its line with it, never a stray blank line", () => {
    expect(shareText({ url: NOTICE.url })).toBe(NOTICE.url);
    expect(shareText({ title: NOTICE.title, url: NOTICE.url })).toBe(`${NOTICE.title}\n${NOTICE.url}`);
    expect(shareText({ text: NOTICE.text })).toBe(NOTICE.text);
  });

  test("whitespace is not content", () => {
    expect(shareText({ title: "  ", text: "\n\t " })).toBe("");
    expect(shareText({ title: " Notice ", url: " https://example.org/a " })).toBe("Notice\nhttps://example.org/a");
  });

  test("a link the sheet cannot open is still copied as a line", () => {
    expect(shareText({ title: "Paper", url: "/pyqs/cse-sem-4/" })).toBe("Paper\n/pyqs/cse-sem-4/");
  });
});

describe("shareContent", () => {
  test("the link is a link, not a third line of text", () => {
    expect(shareContent(NOTICE)).toEqual({
      title: "B.Tech 3rd Semester Examination Form",
      text: "Shared from BEUConnect",
      url: "https://beu.prit.eu.org/announcements/exam-form/",
    });
  });

  test("a link on its own leaves the body empty for the sheet to fill", () => {
    expect(shareContent({ url: NOTICE.url })).toEqual({ title: null, text: null, url: NOTICE.url });
  });

  test("a title with nothing else to say is the body", () => {
    expect(shareContent({ title: NOTICE.title })).toEqual({ title: NOTICE.title, text: NOTICE.title, url: null });
  });

  test("a link the sheet cannot open rides in the text instead", () => {
    expect(shareContent({ title: "Paper", url: "/pyqs/cse-sem-4/" })).toEqual({
      title: "Paper",
      text: "/pyqs/cse-sem-4/",
      url: null,
    });
  });

  test("nothing to share is null throughout", () => {
    expect(shareContent({})).toEqual({ title: null, text: null, url: null });
  });
});

describe("shareableUrl", () => {
  test("https, http and mailto are links", () => {
    expect(shareableUrl("https://example.org/a")).toBe("https://example.org/a");
    expect(shareableUrl("http://example.org/a")).toBe("http://example.org/a");
    expect(shareableUrl("mailto:hello@example.org")).toBe("mailto:hello@example.org");
  });

  test("anything else is not a link", () => {
    expect(shareableUrl(undefined)).toBe(null);
    expect(shareableUrl("  ")).toBe(null);
    expect(shareableUrl("/pyqs/cse-sem-4/")).toBe(null);
    expect(shareableUrl("javascript:alert(1)")).toBe(null);
    expect(shareableUrl("file:///data/report.pdf")).toBe(null);
  });
});
