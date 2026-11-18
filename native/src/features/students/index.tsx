/**
 * Students — route registration.
 *
 * Six screens over one register that ships with the app, so the whole feature
 * works offline:
 *
 *   students          search the register, grouped by batch
 *   students.colleges every BEU college: the register first, the rest A–Z
 *   students.college  the college's branches, with their counts
 *   students.branch   one branch, newest batch first
 *   students.student  one student, with the hand-off to Result and Rank
 *   students.leads    the top CGPA holders of one batch, from BEU's roster
 *
 * Titles read their params, so a header names the branch or the student instead
 * of repeating "Students" six times.
 */

import type { RouteDef, RouteParams } from "../../app/router";
import { displayName } from "../results/data";
import { shortCollegeName } from "../results/colleges";
import { COLLEGE_CODE, branchBySlug, studentByReg } from "./data";
import { StudentsScreen } from "./students";
import { CollegesScreen } from "./colleges";
import { CollegeScreen } from "./college";
import { BranchScreen } from "./branch";
import { StudentScreen } from "./student";
import { LeadsScreen } from "./leads";

function str(params: RouteParams, key: string): string {
  const value = params[key];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export const studentsRoutes: RouteDef[] = [
  {
    name: "students",
    title: () => "Students",
    render: (nav) => <StudentsScreen nav={nav} />,
  },
  {
    name: "students.colleges",
    title: () => "Colleges",
    render: (nav) => <CollegesScreen nav={nav} />,
  },
  {
    name: "students.college",
    title: (params) => {
      const code = str(params, "college");
      return code ? shortCollegeName(code) : shortCollegeName(COLLEGE_CODE);
    },
    render: (nav) => <CollegeScreen nav={nav} />,
  },
  {
    name: "students.branch",
    title: (params) => {
      const branch = branchBySlug(str(params, "branch"));
      if (!branch) return "Branch";
      const session = str(params, "session");
      return session ? `${branch.short} · ${session}` : `${branch.short} students`;
    },
    render: (nav) => <BranchScreen nav={nav} />,
  },
  {
    name: "students.student",
    title: (params) => {
      const student = studentByReg(str(params, "reg"));
      return student ? displayName(student.name) : "Student";
    },
    render: (nav) => <StudentScreen nav={nav} />,
  },
  {
    name: "students.leads",
    title: () => "Top by CGPA",
    render: (nav) => <LeadsScreen nav={nav} />,
  },
];
