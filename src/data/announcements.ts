export type AnnouncementPost = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: string;
  tags: string[];
  highlight?: boolean;
  body: string[];
};

// Add new blog/announcement entries here.
// Keep `publishedAt` in YYYY-MM-DD for correct sorting.
export const announcementPosts: AnnouncementPost[] = [
  {
    slug: "welcome-to-beuconnect-announcements",
    title: "Welcome to BEUConnect Announcements",
    excerpt:
      "This is the new update hub for product changes, roadmap drops, and quick student-facing announcements.",
    publishedAt: "2026-02-25",
    author: "BEUConnect Team",
    tags: ["product", "launch"],
    highlight: true,
    body: [
      "This page is now the single place for every platform update and short blog entry.",
      "Use it to publish release notes, feature announcements, exam-season updates, and roadmap decisions.",
      "Each new post will automatically appear on the homepage latest slider.",
    ],
  },
  {
    slug: "result-table-performance-upgrade",
    title: "Result Table Performance Upgrade",
    excerpt:
      "Result table pages now render faster with cleaner data transforms and lighter client-side work.",
    publishedAt: "2026-02-24",
    author: "BEUConnect Team",
    tags: ["results", "performance"],
    body: [
      "We reduced redundant processing on result table pages and tightened rendering logic.",
      "This gives smoother navigation for large college datasets.",
    ],
  },
  {
    slug: "syllabus-navigation-fix",
    title: "Syllabus Navigation Fix Deployed",
    excerpt:
      "Branch-to-semester syllabus links now consistently respect base path routing.",
    publishedAt: "2026-02-23",
    author: "BEUConnect Team",
    tags: ["syllabus", "fix"],
    body: [
      "We fixed a link path issue that affected nested syllabus navigation in some base URL setups.",
      "All syllabus links now use consistent base path handling.",
    ],
  },
];

export const sortedAnnouncementPosts = [...announcementPosts].sort(
  (a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

export const latestAnnouncementPosts = (count = 5): AnnouncementPost[] =>
  sortedAnnouncementPosts.slice(0, count);
