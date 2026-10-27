import gatePapers from "../assets/data/gate-papers.json";

type GatePaper = {
  code: string;
  name: string;
};

const extraSubjects: Record<string, string> = {
  "XH-C1": "Economics (XH-C1)",
  "XH-C2": "English (XH-C2)",
  "XH-C3": "Linguistics (XH-C3)",
  "XH-C4": "Philosophy (XH-C4)",
  "XH-C5": "Psychology (XH-C5)",
  "XH-C6": "Sociology (XH-C6)",
};

const paperList = gatePapers as GatePaper[];

export const gatePyqSubjectOrder: string[] = [
  ...paperList.map((paper) => paper.code),
  ...Object.keys(extraSubjects),
];

export const gatePyqNameByCode: Record<string, string> = {
  ...Object.fromEntries(paperList.map((paper) => [paper.code, paper.name])),
  ...extraSubjects,
};

export function getGatePyqSubjectName(code: string): string {
  return gatePyqNameByCode[code] ?? code;
}
