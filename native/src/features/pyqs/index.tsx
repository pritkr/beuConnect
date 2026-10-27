/**
 * PYQ + data-browser feature entry.
 *
 * Exactly the routes the shell links to: the BEU shelf (`pyqs`), a paper
 * (`pyqs.paper`), that paper's subject page in the WebView (`pyqs.site`), GATE
 * papers and the PDF WebView (`pyqs.gate`), the dataset index (`data`) and one
 * dataset's table (`data.table`).
 */

import type { RouteDef } from "../../app/router";
import { browseRoutes } from "./browse";
import { paperRoutes } from "./paper";
import { gateRoutes } from "./gate";
import { dataRoutes } from "./data";
import { dataTableRoutes } from "./data-table";

export const pyqsRoutes: RouteDef[] = [
  ...browseRoutes,
  ...paperRoutes,
  ...gateRoutes,
  ...dataRoutes,
  ...dataTableRoutes,
];
