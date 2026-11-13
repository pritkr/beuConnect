/**
 * Which address a PDF loads from, per platform.
 *
 * Android's system WebView has no PDF viewer, so the file is handed to Google's
 * document viewer and comes back as HTML. Every other platform the app targets
 * renders the PDF itself and must keep loading the file directly — sending a
 * WKWebView through the remote viewer would add a third party to a screen that
 * never needed one.
 */

import { describe, expect, test } from "nsh/test";

import { isViewerUrl, needsRemotePdf, pdfViewSource } from "../../src/lib/pdf";

const BEU = "https://beu-bih.ac.in/backend/Letter No 2562 Routine.pdf";
const ENCODED = "https%3A%2F%2Fbeu-bih.ac.in%2Fbackend%2FLetter%20No%202562%20Routine.pdf";

describe("needsRemotePdf", () => {
  test("Android and Linux need the remote renderer", () => {
    expect(needsRemotePdf("android")).toBe(true);
    expect(needsRemotePdf("linux")).toBe(true);
  });

  test("the platforms whose WebView paints a PDF do not", () => {
    expect(needsRemotePdf("ios")).toBe(false);
    expect(needsRemotePdf("macos")).toBe(false);
    expect(needsRemotePdf("windows")).toBe(false);
    expect(needsRemotePdf("web")).toBe(false);
  });

  test("the OS name is trimmed and case-folded", () => {
    expect(needsRemotePdf(" Android ")).toBe(true);
    expect(needsRemotePdf("MACOS")).toBe(false);
  });
});

describe("pdfViewSource", () => {
  test("Android gets Google's viewer for the same file, properly encoded", () => {
    // The official paths carry spaces, which a raw URL would truncate.
    expect(pdfViewSource(BEU, "android")).toBe(`https://docs.google.com/viewer?embedded=true&url=${ENCODED}`);
  });

  test("iOS and macOS keep the file's own address", () => {
    expect(pdfViewSource(BEU, "ios")).toBe(BEU);
    expect(pdfViewSource(BEU, "macos")).toBe(BEU);
  });

  test("a viewer address is never wrapped twice", () => {
    const viewer = pdfViewSource(BEU, "android");
    expect(pdfViewSource(viewer, "android")).toBe(viewer);
  });

  test("a non-web address passes through untouched, for the caller to refuse", () => {
    expect(pdfViewSource("javascript:alert(1)", "android")).toBe("javascript:alert(1)");
    expect(pdfViewSource("", "android")).toBe("");
  });

  test("surrounding whitespace is not part of the file address", () => {
    expect(pdfViewSource(`  ${BEU}  `, "ios")).toBe(BEU);
  });
});

describe("isViewerUrl", () => {
  test("only docs.google.com counts", () => {
    expect(isViewerUrl("https://docs.google.com/viewer?url=x")).toBe(true);
    expect(isViewerUrl("https://beu-bih.ac.in/a.pdf")).toBe(false);
    expect(isViewerUrl("not a url")).toBe(false);
  });

  test("a lookalike host is not the viewer", () => {
    expect(isViewerUrl("https://docs.google.com.evil.test/viewer")).toBe(false);
  });
});
