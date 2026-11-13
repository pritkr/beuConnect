/**
 * One glyph per branch, whichever identifier the caller holds.
 *
 * A branch travels through the app under three different ids — the syllabus,
 * notes and planner use slugs (`cse`), the result tables and the data feed use
 * BEU's numeric codes (`105`), and the college register adds Mechatronics
 * (`met`) — so the rail, the filter chips and the register row resolve through
 * this one table and a branch never draws two different marks on two screens.
 *
 * An unknown branch returns `undefined` on purpose: a wrong glyph is worse than
 * no glyph, and every caller treats the icon as optional.
 */

import type { IconName } from "./icons";

const BY_KEY: Record<string, IconName> = {
  civil: "hard-hat",
  cse: "code-alt",
  ece: "broadcast",
  ee: "bolt-circle",
  eee: "plug",
  mech: "cog",
  met: "bot",
  it: "laptop",
  common: "book-open",
};

/** BEU's numeric branch codes, as the result tables and the data feed print them. */
const BY_CODE: Record<string, string> = {
  "101": "civil",
  "102": "mech",
  "103": "ee",
  "104": "ece",
  "105": "cse",
  "110": "eee",
  "161": "eee",
};

export function branchIcon(branch: string): IconName | undefined {
  const key = branch.trim().toLowerCase();
  return BY_KEY[key] ?? BY_KEY[BY_CODE[key] ?? ""];
}
