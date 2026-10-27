/**
 * Notices + announcements: the route table.
 *
 * Screens live next to it, one per file: `board` (the university board),
 * `detail` (one notice), `feed` (announcements), `post` (one announcement) and
 * `search` (both at once). Shared state, grouping and rows are in `./parts`;
 * the PDF frame is `./pdf`.
 */

import type { RouteDef } from "../../app/router";
import { param } from "../../app/router";
import { announcements, findNotice } from "./api";
import { NoticesScreen } from "./board";
import { DetailScreen } from "./detail";
import { AnnouncementsScreen } from "./feed";
import { PdfScreen } from "./pdf";
import { PostScreen } from "./post";
import { SearchScreen } from "./search";

export const noticesRoutes: RouteDef[] = [
  {
    name: "notices",
    // Home's ticker pushes `notices` with an id: open that notice directly.
    title: (params) => (params.id ? findNotice(String(params.id))?.title ?? "Notice" : "Notices"),
    render: (nav) => (param(nav, "id") ? <DetailScreen nav={nav} /> : <NoticesScreen nav={nav} />),
  },
  { name: "notices.detail", title: (params) => findNotice(String(params.id ?? ""))?.title ?? "Notice", render: (nav) => <DetailScreen nav={nav} /> },
  { name: "notices.pdf", title: (params) => String(params.title ?? "Official PDF"), render: (nav) => <PdfScreen nav={nav} scope="beu" /> },
  { name: "notices.announcements", title: () => "Announcements", render: (nav) => <AnnouncementsScreen nav={nav} /> },
  { name: "notices.post", title: (params) => announcements().find((post) => post.slug === String(params.slug ?? ""))?.title ?? "Announcement", render: (nav) => <PostScreen nav={nav} /> },
  { name: "notices.search", title: () => "Search", render: (nav) => <SearchScreen nav={nav} /> },
];
