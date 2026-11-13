/**
 * The notices area's rules, tested without a screen or a network.
 *
 * Three things a student relies on and a refactor can silently break:
 *
 *   · the board is sectioned by when BEU published it (Today, Yesterday,
 *     Past week, then one section per month), with the count on each heading;
 *   · a search narrows by title, course, semester and category, and groups
 *     its hits under "Matches";
 *   · the JSON feed, the scraped board and the announcement pages merge into
 *     one notice identity, so a row never doubles.
 *
 * Dates are built relative to now, not hard-coded: "Yesterday" must stay
 * yesterday on any day this suite runs.
 */

import { describe, expect, test } from "nsh/test";

import { mergeNotices, noticeId, type Announcement, type Notice } from "./api";
import { noticesRoutes } from "./index";
import { buildNoticeRows, buildPostRows, buildSearchRows, sectionIndices, type ListRow } from "./parts";

/* ── fixtures ─────────────────────────────────────────────────────────── */

/** Local noon `days` before today, as the API's ISO timestamp. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function notice(overrides: Partial<Notice> & { id: string; title: string }): Notice {
  return {
    date: daysAgo(0),
    link: `https://beu.prit.eu.org/notices/${overrides.id}.pdf`,
    important: false,
    category: "General",
    course: "B.Tech",
    semester: "4th",
    source: "BEU Notice",
    ...overrides,
  };
}

const BOARD: Notice[] = [
  notice({ id: "n1", title: "B.Tech 4th Semester Examination 2026 Programme", important: true, category: "Important" }),
  notice({ id: "n2", title: "Hostel allotment for first year students", date: daysAgo(1) }),
  notice({ id: "n3", title: "Semester fee payment window", date: daysAgo(3), course: "MCA", semester: "2nd" }),
  notice({ id: "n4", title: "Convocation 2025 photographs", date: daysAgo(40) }),
  notice({ id: "n5", title: "Notice without a date", date: null }),
];

const POSTS: Announcement[] = [
  {
    slug: "offline-packs",
    title: "Syllabus now works offline",
    publishedAt: "2026-10-20",
    author: "BEUConnect Team",
    excerpt: "Every paper you open stays on the phone.",
    tags: ["offline", "syllabus"],
  },
  {
    slug: "hostel-map",
    title: "Hostel block map added",
    publishedAt: "2026-09-02",
    author: "BEUConnect Team",
    excerpt: "A native map of the campus blocks.",
    tags: ["campus"],
  },
];

function rowText(row: ListRow): string {
  if (row.kind === "group") return `group:${row.label}:${row.count}`;
  if (row.kind === "notice") return `notice:${row.notice.id}`;
  return `post:${row.post.slug}`;
}

/* ── date grouping ────────────────────────────────────────────────────── */

describe("board grouping by date", () => {
  test("today, yesterday, the past week, then months, undated last", () => {
    const rows = buildNoticeRows(BOARD, "", "All", "All", "all", "date");
    const groups = rows.filter((row) => row.kind === "group").map(rowText);
    const forty = new Date(daysAgo(40));
    const older = `${MONTHS[forty.getMonth()]} ${forty.getFullYear()}`;
    expect(groups).toEqual([
      "group:Today:1",
      "group:Yesterday:1",
      "group:Past week:1",
      `group:${older}:1`,
      "group:Undated:1",
    ]);
    // Every notice appears once, under its heading.
    expect(rows.filter((row) => row.kind === "notice")).toHaveLength(BOARD.length);
  });

  test("section headings are the rows the list pins", () => {
    const rows = buildNoticeRows(BOARD, "", "All", "All", "all", "date");
    const indices = sectionIndices(rows);
    expect(indices.length).toBe(5);
    for (const index of indices) expect(rows[index].kind).toBe("group");
    // The first row of the board is a heading, never a notice.
    expect(indices[0]).toBe(0);
  });

  test("grouping by category puts Important above General", () => {
    const rows = buildNoticeRows(BOARD, "", "All", "All", "all", "category");
    const groups = rows.filter((row) => row.kind === "group").map(rowText);
    expect(groups[0]).toBe("group:Important:1");
    expect(groups[1]).toBe("group:General:4");
  });
});

/* ── filtering ────────────────────────────────────────────────────────── */

describe("board filtering", () => {
  test("a query searches titles, courses and semesters, case-insensitively", () => {
    const exam = buildNoticeRows(BOARD, "EXAMINATION", "All", "All", "all", "date");
    expect(rowText(exam[0])).toBe("group:Matches:1");
    expect(exam.slice(1).map(rowText)).toEqual(["notice:n1"]);

    const course = buildNoticeRows(BOARD, "mca", "All", "All", "all", "date");
    expect(course.slice(1).map(rowText)).toEqual(["notice:n3"]);
  });

  test("course and semester chips narrow the board, one facet at a time", () => {
    const mca = buildNoticeRows(BOARD, "", "MCA", "All", "all", "date");
    expect(mca.filter((row) => row.kind === "notice").map(rowText)).toEqual(["notice:n3"]);

    const second = buildNoticeRows(BOARD, "", "All", "2nd", "all", "date");
    expect(second.filter((row) => row.kind === "notice").map(rowText)).toEqual(["notice:n3"]);
  });

  test("the pinned scope keeps only Important notices; a miss is empty", () => {
    const pinned = buildNoticeRows(BOARD, "", "All", "All", "pinned", "date");
    expect(pinned.filter((row) => row.kind === "notice").map(rowText)).toEqual(["notice:n1"]);

    // Nothing matches: the screen shows its own empty state, so the list is empty.
    expect(buildNoticeRows(BOARD, "no-such-notice", "All", "All", "all", "date")).toEqual([]);
  });
});

/* ── search across both sources ───────────────────────────────────────── */

describe("search over notices and announcements", () => {
  test("notices are grouped before announcements", () => {
    const rows = buildSearchRows("hostel", BOARD, POSTS);
    expect(rowText(rows[0])).toBe("group:Notices:1");
    expect(rowText(rows[1])).toBe("notice:n2");
    expect(rowText(rows[2])).toBe("group:Announcements:1");
    expect(rowText(rows[3])).toBe("post:hostel-map");
  });

  test("one letter is not a search", () => {
    expect(buildSearchRows("h", BOARD, POSTS)).toEqual([]);
    expect(buildSearchRows("  ", BOARD, POSTS)).toEqual([]);
  });

  test("an announcement's tags and excerpt are searchable", () => {
    const byTag = buildSearchRows("offline", BOARD, POSTS);
    expect(byTag.some((row) => rowText(row) === "post:offline-packs")).toBe(true);
    const byExcerpt = buildSearchRows("phone", BOARD, POSTS);
    expect(byExcerpt.some((row) => rowText(row) === "post:offline-packs")).toBe(true);
  });

  test("the announcement feed is sectioned by month", () => {
    const rows = buildPostRows(POSTS, "");
    expect(rowText(rows[0])).toBe("group:October 2026:1");
    expect(rowText(rows[2])).toBe("group:September 2026:1");
  });
});

/* ── identity and merging ─────────────────────────────────────────────── */

describe("notice identity", () => {
  test("the same title and date always hash to the same id", () => {
    const date = daysAgo(2);
    expect(noticeId("A circular", date)).toBe(noticeId("A circular", date));
    expect(noticeId("A circular", date)).not.toBe(noticeId("A circular", daysAgo(3)));
    expect(noticeId("A circular", date)).not.toBe(noticeId("Another circular", date));
  });

  test("the JSON feed marks a scraped row Important, and the newest leads", () => {
    const scraped = notice({ id: "scraped", title: "Same circular", date: daysAgo(2) });
    const feed = notice({
      id: noticeId(scraped.title, scraped.date),
      title: scraped.title,
      date: scraped.date,
      important: true,
      category: "Important",
    });
    const merged = mergeNotices([scraped, notice({ id: "newer", title: "Newer", date: daysAgo(0) })], [feed]);
    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe("Newer");
    const same = merged.find((item) => item.title === "Same circular");
    expect(same?.important).toBe(true);
    expect(same?.link).toBe(scraped.link);
  });
});

/* ── routes ───────────────────────────────────────────────────────────── */

describe("notices routes", () => {
  test("every route is namespaced, unique, and names itself without params", () => {
    const names = noticesRoutes.map((route) => route.name);
    expect(names).toEqual([
      "notices",
      "notices.detail",
      "notices.pdf",
      "notices.announcements",
      "notices.post",
      "notices.search",
    ]);
    expect(new Set(names).size).toBe(names.length);
    for (const route of noticesRoutes) {
      // `title` runs before data arrives: junk params must never throw.
      for (const params of [{}, { id: "missing" }, { slug: "missing" }, { title: undefined }]) {
        expect(route.title(params).length).toBeGreaterThan(0);
      }
    }
    expect(noticesRoutes[0].title({})).toBe("Notices");
  });
});
