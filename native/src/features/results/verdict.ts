/**
 * Results — the battle verdict, stated only when the data supports it.
 *
 * `data.ts` builds the paper lines and a first verdict. Two things here are
 * deliberately stricter than that first pass:
 *
 *  1. **A paper only counts when both copies carry a total.** A missing total
 *     is missing data, not a loss; awarding it to the side that happens to have
 *     a number makes a battle look decided when it is not.
 *  2. **A winner is only named when something separates the two.** If the
 *     counted papers are level and CGPA or SGPA is absent on one side, the
 *     honest answer is "not enough shared data", not a coin toss.
 *
 * The output is plain sentences for the screen, so the rules are visible to the
 * student and can be asserted without reaching into the screen.
 */

import type { BattleReport } from "./data";
import { fixed } from "./data";

export type BattleOutcome = "a" | "b" | "tie" | "none";
export type DecidedBy = "papers" | "cgpa" | "sgpa" | "none";

export interface BattleVerdict {
  outcome: BattleOutcome;
  /** The badge word: "A wins", "B wins", "Level", "No call". */
  label: string;
  /** The one line a student reads first. */
  headline: string;
  /** Why, and what was left out. */
  explanation: string;
  decidedBy: DecidedBy;
  /** Paper wins, counting only papers both copies carry. */
  winsA: number;
  winsB: number;
  ties: number;
  counted: number;
  /** Papers with no total on at least one side; they do not count. */
  uncounted: number;
  /** The counted paper wins add up to a decision (or a level scoreboard). */
  papersDecided: boolean;
}

/** `"5–3"` with the winner's count first. */
function scoreLine(high: number, low: number): string {
  return `${high}–${low}`;
}

function nameOf(side: BattleReport["a"], fallback: string): string {
  const name = side.data.name.trim();
  return name === "" ? fallback : name;
}

export function battleVerdict(report: BattleReport): BattleVerdict {
  const a = report.a.data;
  const b = report.b.data;
  const nameA = nameOf(report.a, "Student A");
  const nameB = nameOf(report.b, "Student B");

  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  let uncounted = 0;
  for (const line of report.lines) {
    if (line.aValue === null || line.bValue === null) {
      uncounted += 1;
      continue;
    }
    if (line.aValue === line.bValue) ties += 1;
    else if (line.aValue > line.bValue) winsA += 1;
    else winsB += 1;
  }
  const counted = winsA + winsB + ties;

  const cgpaBoth = a.cgpa !== null && b.cgpa !== null;
  const sgpaBoth = a.sgpa !== null && b.sgpa !== null;

  const paperLine =
    counted === 0
      ? "No paper has a total on both sides"
      : `${counted} ${counted === 1 ? "paper counted" : "papers counted"}${
          uncounted > 0 ? `, ${uncounted} left out because one side has no total` : ""
        }`;

  const finish = (
    verdict: Omit<BattleVerdict, "counted" | "uncounted" | "winsA" | "winsB" | "ties" | "papersDecided">,
  ): BattleVerdict => ({
    ...verdict,
    counted,
    uncounted,
    winsA,
    winsB,
    ties,
    papersDecided: counted > 0 && winsA !== winsB,
  });

  if (counted > 0 && winsA !== winsB) {
    const aWon = winsA > winsB;
    const high = Math.max(winsA, winsB);
    const low = Math.min(winsA, winsB);
    return finish({
      outcome: aWon ? "a" : "b",
      label: aWon ? "A wins" : "B wins",
      decidedBy: "papers",
      headline: `${aWon ? nameA : nameB} wins ${scoreLine(high, low)} on papers`,
      explanation: `${paperLine}. A paper counts only when both copies carry a total.`,
    });
  }

  if (cgpaBoth && a.cgpa !== b.cgpa) {
    const aWon = (a.cgpa as number) > (b.cgpa as number);
    return finish({
      outcome: aWon ? "a" : "b",
      label: aWon ? "A wins" : "B wins",
      decidedBy: "cgpa",
      headline: `${aWon ? nameA : nameB} wins on CGPA`,
      explanation: `${paperLine}. CGPA decides: ${fixed(a.cgpa)} against ${fixed(b.cgpa)}.`,
    });
  }

  if (sgpaBoth && a.sgpa !== b.sgpa) {
    const aWon = (a.sgpa as number) > (b.sgpa as number);
    return finish({
      outcome: aWon ? "a" : "b",
      label: aWon ? "A wins" : "B wins",
      decidedBy: "sgpa",
      headline: `${aWon ? nameA : nameB} wins on SGPA`,
      explanation: `${paperLine}. Papers and CGPA do not separate them; SGPA decides: ${fixed(a.sgpa)} against ${fixed(b.sgpa)}.`,
    });
  }

  if (counted > 0 || (cgpaBoth && sgpaBoth)) {
    return finish({
      outcome: "tie",
      label: "Level",
      decidedBy: "none",
      headline: "Level on the numbers both copies carry",
      explanation:
        uncounted > 0
          ? `${paperLine}. Nothing counted separates these two.`
          : "Counted papers, CGPA and SGPA all match.",
    });
  }

  const missing: string[] = [];
  if (!cgpaBoth) missing.push("one copy has no CGPA");
  if (!sgpaBoth) missing.push("one copy has no SGPA");
  return finish({
    outcome: "none",
    label: "No call",
    decidedBy: "none",
    headline: "Not enough shared data to call a winner",
    explanation: `${paperLine}. ${missing.join(", ")}.`,
  });
}
