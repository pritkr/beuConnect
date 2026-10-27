/**
 * "Ask AI": the prompt, and where it goes.
 *
 * The prompt is the product here. A student taps Ask AI on a topic or a
 * previous-year question because they want the answer an examiner would give,
 * not a generic chat. So each prompt carries the course, the paper and the
 * exact question, and asks for the shape of a full-marks answer: definition,
 * numbered points, a diagram or table, a worked example, and a short version
 * for the last five minutes.
 *
 * The app does not keep its own list of assistants. Android opens the system
 * chooser with the prompt already in the intent (see `AskAiComponent`), so
 * whatever the student installed — Claude, ChatGPT, Gemini, DeepSeek — is one
 * tap away, and a new app appears the day it is installed. Every other platform
 * copies the prompt and opens a web assistant that accepts it in the address.
 */

/** The web assistant used when no native chooser exists. */
const WEB_ASSISTANT = "https://chatgpt.com/?q=";

/** The web address for the prompt, where the site takes it in the query. */
export function webAskLink(prompt: string): string {
  return `${WEB_ASSISTANT}${encodeURIComponent(prompt)}`;
}

/** The house style every prompt ends with: concrete, exam-shaped, no filler. */
const ASK =
  "Answer as a Bihar Engineering University examiner who is also a patient tutor. " +
  "Be concrete, use the subject's own terms, and skip motivational filler. " +
  "If something is ambiguous, state the assumption you made.";

export interface TopicContext {
  /** "Computer Organization & Architecture" */
  subject: string;
  /** "105401" */
  code: string;
  /** 4 */
  sem: number;
  /** "CSE" */
  branch: string;
  /** The topic's own title. */
  topic: string;
  /** The syllabus line, when the pack carries one. */
  body?: string;
}

/** A syllabus topic, answered the way a 7-mark question is marked. */
export function topicPrompt(context: TopicContext): string {
  const lines = [
    `Teach me "${context.topic}" from ${context.subject} (${context.code}), semester ${context.sem}, ${context.branch}, for the BEU exam.`,
    "",
    "Give me, in this order:",
    "1. A precise definition and the core idea in plain English.",
    "2. The points an examiner ticks, as a numbered list.",
    "3. Any diagram, table or derivation, described with its labels.",
    "4. One worked example with numbers if the topic allows it.",
    "5. A model answer for a 7-mark question, then two likely exam questions with brief outlines.",
  ];
  if (context.body && context.body.trim().length > 0) {
    lines.push("", `The syllabus line is: ${context.body.trim()}`);
  }
  lines.push("", ASK);
  return lines.join("\n");
}

export interface PaperContext {
  /** "B.Tech 4th Semester Examination 2025" */
  paper: string;
  /** "Computer Organization & Architecture" */
  subject: string;
  code: string;
  sem: number;
  branch: string;
  year: string;
  /** The question exactly as the paper prints it. */
  question: string;
  /** Marks for that question, 0 when the paper does not say. */
  marks: number;
}

/** One previous-year question: the answer, the marking scheme, a short version. */
export function paperPrompt(context: PaperContext): string {
  const marks = context.marks > 0 ? ` It carries ${context.marks} marks.` : "";
  return [
    `This is a previous-year BEU question from ${context.subject} (${context.code}), semester ${context.sem}, ${context.branch}, in ${context.paper} (${context.year}).${marks}`,
    "",
    `"${context.question.trim()}"`,
    "",
    "Give me:",
    "1. What the examiner is looking for, in one paragraph.",
    "2. A structured full-marks answer with headings, and a diagram or table where it earns marks.",
    "3. The marking scheme, point by point with the marks each point carries.",
    "4. A five-minute version I can write if time runs out.",
    "",
    ASK,
  ].join("\n");
}
