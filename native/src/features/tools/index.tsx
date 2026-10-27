/**
 * Tools — the offline student toolkit, and its route table.
 *
 * Seven screens, each in its own file: SGPA/CGPA/predictor/percentage, the
 * attendance ledger with honest bunk maths, the class routine, the 2026
 * holiday calendar and the campus Wi-Fi helper. The hub is the morning screen
 * that links them.
 *
 * The maths lives in `engine.ts`, the persisted shapes in `state.ts`, the live
 * signals in `store.ts`; the screens only compose them with `src/ui`.
 */

import type { RouteDef } from "../../app/router";
import { AttendanceScreen } from "./attendance";
import { CalculatorScreen } from "./calculator";
import { HolidaysScreen } from "./holidays";
import { ToolsHub } from "./hub";
import { RoutineScreen } from "./routine";
import { WifiScreen } from "./wifi";

export const toolsRoutes: RouteDef[] = [
  {
    name: "tools",
    title: () => "Tools",
    render: (nav) => <ToolsHub nav={nav} />,
  },
  {
    name: "tools.calculator",
    title: () => "Calculator",
    render: () => <CalculatorScreen />,
  },
  {
    name: "tools.attendance",
    title: () => "Attendance",
    render: () => <AttendanceScreen />,
  },
  {
    name: "tools.routine",
    title: () => "Routine",
    render: () => <RoutineScreen />,
  },
  {
    name: "tools.holidays",
    title: () => "Holidays",
    render: () => <HolidaysScreen />,
  },
  {
    name: "tools.wifi",
    title: () => "Wi-Fi help",
    render: () => <WifiScreen />,
  },
  // The More tab and the QA route contract open these by their bare names.
  { name: "attendance", title: () => "Attendance", render: () => <AttendanceScreen /> },
  { name: "routine", title: () => "Routine", render: () => <RoutineScreen /> },
  { name: "holidays", title: () => "Holidays", render: () => <HolidaysScreen /> },
  { name: "wifi", title: () => "Wi-Fi help", render: () => <WifiScreen /> },
];
