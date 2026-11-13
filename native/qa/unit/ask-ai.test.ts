/**
 * What "Ask AI" actually sends.
 *
 * The prompt is the feature: a student taps Ask AI on a syllabus topic or a
 * previous-year question and the assistant already knows the course, the paper
 * and the marks. These tests hold the prompt to that promise, and hold the
 * handoff to the address that really accepts a prompt in the URL.
 */

import { describe, expect, test } from "nsh/test";

import { paperPrompt, topicPrompt, webAskLink } from "../../src/lib/ask-ai";

const TOPIC = {
  subject: "Computer Organization & Architecture",
  code: "105401",
  sem: 4,
  branch: "CSE",
  topic: "Cache memory mapping",
  body: "Direct, associative and set-associative mapping; hit ratio.",
};

const PAPER = {
  subject: "Computer Organization & Architecture",
  code: "105401",
  sem: 4,
  branch: "CSE",
  paper: "B.Tech 4th Semester Examination 2025",
  year: "2025",
  question: "Explain set-associative mapping with a diagram.",
  marks: 7,
};

describe("topicPrompt", () => {
  test("names the course, the topic and the semester", () => {
    const prompt = topicPrompt(TOPIC);
    expect(prompt).toContain("Cache memory mapping");
    expect(prompt).toContain("Computer Organization & Architecture");
    expect(prompt).toContain("105401");
    expect(prompt).toContain("semester 4");
    expect(prompt).toContain("CSE");
  });

  test("carries the syllabus line when the pack has one", () => {
    expect(topicPrompt(TOPIC)).toContain("set-associative mapping");
  });

  test("asks for a model answer, not a chat", () => {
    const prompt = topicPrompt(TOPIC);
    expect(prompt).toContain("7-mark");
    expect(prompt).toContain("diagram");
    expect(prompt).toContain("numbered list");
  });

  test("a topic with no body still produces a complete prompt", () => {
    const prompt = topicPrompt({ ...TOPIC, body: "" });
    expect(prompt).toContain("Cache memory mapping");
    expect(prompt).not.toContain("The syllabus line is:");
    expect(prompt.trim().length).toBeGreaterThan(200);
  });

  test("a whitespace-only body is not a syllabus line", () => {
    const prompt = topicPrompt({ ...TOPIC, body: "   \n " });
    expect(prompt).not.toContain("The syllabus line is:");
  });
});

describe("paperPrompt", () => {
  test("quotes the question exactly and states the marks", () => {
    const prompt = paperPrompt(PAPER);
    expect(prompt).toContain("Explain set-associative mapping with a diagram.");
    expect(prompt).toContain("7 marks");
    expect(prompt).toContain("B.Tech 4th Semester Examination 2025");
    expect(prompt).toContain("2025");
  });

  test("asks for the marking scheme and a short version", () => {
    const prompt = paperPrompt(PAPER);
    expect(prompt).toContain("marking scheme");
    expect(prompt).toContain("five-minute version");
  });

  test("a question with no printed marks omits the count", () => {
    const prompt = paperPrompt({ ...PAPER, marks: 0 });
    expect(prompt).toContain("Explain set-associative mapping");
    expect(prompt).not.toContain("It carries");
  });
});

describe("webAskLink", () => {
  test("the prompt travels in the address, encoded", () => {
    const prompt = "Explain cache memory mapping & hit ratio.";
    expect(webAskLink(prompt)).toBe(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`);
  });

  test("an empty prompt still produces a usable address", () => {
    expect(webAskLink("")).toBe("https://chatgpt.com/?q=");
  });
});
