/**
 * Results — route registration.
 *
 * Seven screens, all rendered natively from the JSON/CSV data layer:
 *
 *   results        lookup by registration + semester, native result
 *   results.table  the published branch roster, ranked and virtualized
 *   results.rank   one student's branch + college standing
 *   results.merit  the top of the branch, with medals
 *   results.battle two results compared paper by paper
 *   results.portal the older JSON capture, kept for direct links
 *   results.web    BEU's own result page, read back after the student's captcha
 *
 * Titles read the params they are given, so a header can say "Semester 3
 * result" instead of a bare "Results".
 */

import type { RouteDef, RouteParams } from "../../app/router";
import { BRANCHES } from "./data";
import { ResultsScreen } from "./lookup";
import { ResultTableScreen } from "./table";
import { RankScreen } from "./rank";
import { MeritScreen } from "./merit";
import { BattleScreen } from "./battle";
import { PortalScreen } from "./portal";
import { ResultWebScreen } from "./web";

function str(params: RouteParams, key: string): string {
  const value = params[key];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/** A published semester from params, or 0 when absent / out of range. */
function semFrom(params: RouteParams): number {
  const sem = Math.floor(Number(str(params, "sem")));
  return sem >= 1 && sem <= 8 ? sem : 0;
}

/** A branch code, short name or full name as the compact label. */
function branchLabel(params: RouteParams): string {
  const raw = str(params, "branch");
  if (!raw) return "";
  const value = raw.toLowerCase();
  const found = BRANCHES.find(
    (branch) => branch.code === value || branch.short.toLowerCase() === value || branch.name.toLowerCase() === value,
  );
  return found ? found.short : raw.toUpperCase();
}

export const resultsRoutes: RouteDef[] = [
  {
    name: "results",
    title: (params) => {
      const sem = semFrom(params);
      return sem ? `Semester ${sem} result` : "Results";
    },
    render: (nav) => <ResultsScreen nav={nav} />,
  },
  {
    name: "results.table",
    title: (params) => {
      const branch = branchLabel(params);
      return branch ? `${branch} result table` : "Result table";
    },
    render: (nav) => <ResultTableScreen nav={nav} />,
  },
  {
    name: "results.rank",
    title: (params) => {
      const sem = semFrom(params);
      return sem ? `Rank · Semester ${sem}` : "University rank";
    },
    render: (nav) => <RankScreen nav={nav} />,
  },
  {
    name: "results.merit",
    title: (params) => {
      const sem = semFrom(params);
      return sem ? `Merit · Semester ${sem}` : "Merit list";
    },
    render: (nav) => <MeritScreen nav={nav} />,
  },
  {
    name: "results.battle",
    title: (params) => {
      const sem = semFrom(params);
      return sem ? `Battle · Semester ${sem}` : "Result battle";
    },
    render: (nav) => <BattleScreen nav={nav} />,
  },
  {
    name: "results.portal",
    title: (params) => {
      const sem = semFrom(params);
      return sem ? `BEU portal · Semester ${sem}` : "BEU portal";
    },
    render: (nav) => <PortalScreen nav={nav} />,
  },
  {
    name: "results.web",
    title: (params) => {
      const sem = semFrom(params);
      return sem ? `BEU page · Semester ${sem}` : "BEU result page";
    },
    render: (nav) => <ResultWebScreen nav={nav} />,
  },
];
