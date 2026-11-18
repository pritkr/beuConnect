# Notices — the university board, announcements, and search

One folder owns all three ways a student hears from BEU:

```
notices/           the board: 200 circulars, filters, unread dots
notices/<id>       one circular, its PDF, and its read toggle
notices.pdf        an allow-listed PDF in a native frame
notices.announcements   product updates, with full-text search
notices.post       one announcement, rendered as markdown
notices.search     notices + announcements in one result list
```

The board is server-rendered HTML on the published site plus a small JSON feed;
there is no separate notices API to integrate. Both are merged by a stable id,
so either one arriving alone still yields a usable list.

## Files

| File | Owns |
|---|---|
| `index.tsx` | `noticesRoutes` — the route table |
| `api.ts` | fetch, parse, merge, cache stamps, read state, recents, post bodies |
| `parts.tsx` | filters, row building, section indices, chips, undo bar, skeleton, row cells |
| `board.tsx` | the notice board screen (virtualised list) |
| `detail.tsx` | one notice: facts, attachment, read/unread, share |
| `feed.tsx` | the announcements list and its unread model |
| `post.tsx` | one announcement body via `TextView` |
| `search.tsx` | shared search over both sources |
| `pdf.tsx` | the WebView frame, its error and "open in browser" fallback |
| `pdf-url.ts` | pure allow-list check (`pdfUrl`, `postPdf`) used by rows and screens |
| `notices.test.ts` | grouping, filtering, search, identity, routes |

## Routes

| Name | Params | Screen |
|---|---|---|
| `notices` | optional `id` | board, or the detail for that id (Home's strip pushes this form) |
| `notices.detail` | `id` | `DetailScreen` |
| `notices.pdf` | `url`, `title` | `PdfScreen` (scope `beu`) |
| `notices.announcements` | — | `AnnouncementsScreen` |
| `notices.post` | `slug` | `PostScreen` |
| `notices.search` | — | `SearchScreen` |

Every name is top-level (`notices`) or under the `notices.` prefix, so the
registry's spread needs no other change. A missing or unknown `id`/`slug` renders
a "not found" state with a way back; `title(params)` always returns a string.

Screens push, never import each other:

```
notices ─┬─ notices.detail ─┬─ notices.pdf
         ├─ notices.announcements ─ notices.post
         └─ notices.search ─┬─ notices.detail
                            └─ notices.post
```

## Data

All requests go through `lib/net.ts` (`SITE` = `https://beu.prit.eu.org`):

| URL | Gives |
|---|---|
| `GET /api/notices/important?limit=20` | `{ items: [{ id, title, date, link, isImportant }] }` — authoritative for "important" |
| `GET /notices/` | `<article class="notice-card" data-title data-category data-course data-semester>` + `<time>` + PDF link |
| `GET /announcements/` | `<article class="post-card">` with `post-meta` (date • author) and `#tags` |
| `GET /announcements/<slug>/` | the post's `post-body` paragraphs (anchors kept as markdown) |

Required `nsh.json` capabilities: `network.hosts` must include
`beu.prit.eu.org`, and `capabilities.webview.hosts` must include the PDF hosts
(`beu-bih.ac.in`, `beu.ac.in`, `beu.prit.eu.org`) plus `clipboard` and
`openUrl`. The folder adds no capability of its own.

Storage keys (all through `readStore` / `writeStore`, hydrated once):

| Key | Shape | Used for |
|---|---|---|
| `beu.cache.notices.board.v1` | `{ at, value }` | last parsed board HTML |
| `beu.cache.notices.important.v1` | `{ at, value }` | last important JSON |
| `beu.cache.announcements.feed.v1` | `{ at, value }` | last feed HTML |
| `beu.cache.announcement.<slug>.v1` | `{ at, value }` | one post page |
| `beu.notices.read.v1` | `string[]` | read ids, newest first, cap 400 |
| `beu.notices.searches.v1` | `string[]` | recent searches, cap 6 |
| `beu.announcements.bodies.v1` | `Record<slug, string[]>` | post bodies, newest 24, searched offline |

Announcement posts share the read list under an `a:` prefix
(`postReadKey(slug)`), so one store answers "unread" for both sources.

## Behaviour

- **Grouping** — date sections (`Today`, `Yesterday`, `Past week`, then the
  month, undated last) or category sections (important, general, the rest), both
  with sticky header indices from `sectionIndices(rows)`. A search collapses the
  list into one "Matches" section, pinned rows first.
- **Filters** — query, course, semester, and a scope (`all` / `unread` /
  `pinned`). All are module-level signals, so a filter survives a detour into a
  detail and back; `resetBoardFilters` clears them.
- **Virtualisation** — every list is a `List` with `class="flex-1"` inside a
  reactive block, rebuilt from `computed(rows)`; rows are addressed by
  `rowCell(nav)` so a cell reads its own row instead of capturing a snapshot.
- **Unread state** — opening a detail marks it read; the detail screen can flip
  it back; "Mark all read" records the previous list and offers a one-shot undo.
- **Attachments** — `pdfUrl` accepts only allow-listed hosts. A safe URL opens
  `notices.pdf`; anything else goes to the system opener and, failing that,
  the clipboard.
- **Share** — a post opens the system sheet (`lib/share`: the title, the link
  and one app line); where the host has none, the same text is copied. `Copy
  link` is still a plain copy, and so is the detail screen's Share.
- **Refresh** — board TTL 5 min, feed TTL 10 min; a stale open refetches in the
  background while the old rows stay on screen. Pull-to-refresh forces both.

## States

| State | Board | Feed / search |
|---|---|---|
| Loading | `NoticesSkeleton` on the very first fetch only | `Loading` with a label |
| Ready | grouped rows + "as of" line | month-grouped cards |
| Error | `ErrorState` + Try again, keeping any rows already held | same |
| Empty | "The board is empty" / "all caught up" / "nothing pinned" / no match — each with its own action | "No announcements yet" / no match |
| Offline | rows stay, `OfflinePanel` with the cache stamp and a retry | same with the feed's stamp |

Offline detection compares the cache stamp with the moment the load started, so
a served-from-cache response is labelled "Offline copy" instead of being passed
off as fresh.

## Test

```sh
./scripts/check.sh test-only src/features/notices/notices.test.ts
```

Covers date and category grouping order and counts, sticky indices, query +
facet + scope filtering, grouped search across both sources, month grouping for
announcements, stable notice ids and merge behaviour, and the route names and
titles.

> Repo convention puts tests in `qa/`; this suite lives here because the brief
> for this area asked for tests inside the feature folder. It is pure logic and
> imports only `api.ts` / `parts.tsx` / `index.tsx`.

## Gaps

- Global, app-wide search belongs to `features/search`; this folder only owns
  `notices.search`. Home's search door opens the former.
- The board has no pagination: `api.ts` caps the merged list at the newest 200
  rows, and there is no "load more" (the site's board itself is a single page).
