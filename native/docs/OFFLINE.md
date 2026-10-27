# Offline data

What BEUConnect can show with no network, what it costs, and where each piece
lives. The rule is simple: **content a student needs on a bad connection is
already on the phone**, and nothing that costs a lot of data is downloaded
without the student asking for it by name.

## Three tiers

| Tier | What | Cost | Where |
|---|---|---|---|
| **Bundled** | BEU syllabus (all six branches), GATE syllabus and paper links, the PYQ catalog (subjects, codes, years, PDF links) | 0 bytes of device storage — it ships in the binary | `src/features/syllabus/data/`, `src/features/pyqs/catalog-data.ts`, `gate-data.ts` |
| **Seen once** | PYQ questions, result tables, the notes list, the notice board, the Home ticker | Written on first view, then served from disk | `src/lib/cache.ts` |
| **On request** | Every paper for the student's own branch + semester | ~390 KB per subject page, parsed to ~9 KB before it is stored | Settings → Offline data |

Bundled data is regenerated when the catalog changes (`DATA_SNAPSHOT` in
`src/features/syllabus/data/packs.ts`), not at runtime. Nothing in this area
downloads bundled data “to be safe”: it is already in the app.

## Live updates without a store release

The syllabus, the GATE set and the PYQ catalog change during a semester — a
corrected credit, a new paper year, a link that moved. An APK per fix would put
weeks between the correction and the phone, so the same data also arrives as a
feed the app checks at launch:

| Piece | Size | Changes |
|---|---|---|
| `manifest.json` | ~2 KB | every publish |
| `files/<hash>.txt` | 2–90 KB each | only when that payload changes |

The site serves them from `https://beu.prit.eu.org/data/app/`. Payloads are
content-addressed — the name is the first 16 hex of the SHA-256 of the text —
and the manifest lists one hash per table chunk, branch record, GATE record and
PYQ index. `requiredHashes` (`src/features/data-feed/model.ts`) subtracts the
hashes in the generated `src/features/data-feed/bundled.ts`, so the download is
the difference and nothing else:

- a corrected topic re-downloads **one chunk** — prose is chunked by branch and
  semester, so an edit never touches the whole 668 KB table;
- a fixed subject list downloads **one branch record**;
- a new paper year downloads **one PYQ index** (~90 KB);
- a build with nothing new downloads **nothing**: the manifest matches the
  binary and the check ends after the first read.

`hydrateDataFeed()` runs from the shell before the first paint (local only, so
it never delays a launch) and applies a snapshot when every payload it names is
already on disk. `startDataFeed()` then checks at most once an hour, and
Settings → Offline data has a **Check for updates** button that forces one.

A snapshot is applied **whole or not at all**. Branch records carry indexes into
the shared prose table, so half a new table would point every subject at the
wrong paragraph: the manifest is written last, and a manifest whose payloads are
missing at launch is dropped in favour of the bundled copy. Live records are
decoded with the same `decodeBranch` / `decodeGate` the bundle uses, so an
over-the-air record cannot drift in shape from a shipped one. Anything the feed
does not carry stays bundled — a GATE list that failed to download does not cost
the new PYQ catalog.

Keys are `beu.feed.manifest.v1`, `beu.feed.file.<hash>` and `beu.feed.checked`,
outside the `beu.cache.` budget, and capped at 2 MB. Settings → Storage → Live
syllabus & catalog updates clears them and reverts to the data in this build.

### Publishing

```sh
bun scripts/data/publish-feed.ts --site   # write ../public/data/app
bun scripts/data/publish-feed.ts --check  # exit 1 when bundled.ts is stale
```

Run it in the same commit as the data change, then deploy the site. The script
rewrites `src/features/data-feed/bundled.ts` — the hashes this build ships — and
the `public/data/app/` tree, and prunes payloads the new manifest no longer
names. `--check` is part of `./scripts/check.sh`: a stale hash list would make
every phone download its own syllabus. A device still holding the previous
manifest when a payload disappears keeps the data it already has and tries again
on its next check.

## Why papers are stored parsed

One subject page (`https://beu.prit.eu.org/pyqs/<slug>/`) is ~390 KB of
server-rendered HTML carrying every paper that subject has ever had, including
variant sets. The same page parsed into question objects is ~9 KB.

So `loadPaper` fetches the page once, runs `parseAllPapers` (one pass, every
`section.paper-block`), and writes **one cache row per subject**:
`pyqs.papers.v1.<slug>` → `{ at, value: { "<paper-id>": ParsedPaper } }`.

Consequences worth knowing:

- Opening any paper of that subject afterwards is one `Storage` read: no
  network, no HTML parse, no flash of “loading”.
- A semester of ~20 subjects is a few hundred KB, which is why “download my
  course” fits comfortably inside the cache budget.
- The raw HTML is never persisted. It would cost ~10 MB for the same semester.
- A bundle older than 30 days is refreshed in the background the next time a
  paper from it is opened. If the fetch fails, the old copy still serves: a
  2023 paper does not change.

## Keys and ownership

Cache rows are always `beu.cache.<key>` with the shape `{ at, value }`
(`src/lib/cache.ts`). The packs in `src/features/offline/packs.ts` are the
single source of truth for who owns which key; the Offline screen, the Storage
screen and every clear action read the same matchers.

| Pack | Keys | Clearable |
|---|---|---|
| BEU syllabus | — (bundled) | no |
| GATE syllabus & papers | — (bundled) | no |
| BEU PYQ papers | `pyqs.papers.v1.*` | yes |
| Notes & VVI | `notes.*` | yes |
| Notices & announcements | `notices.*`, `announcements.*` | yes |
| Result tables | `pyqs.csv.*`, `pyqs.manifest.v1`, `wide:*`, `roster:*` | yes |

`Storage` allows 5 MB for the whole app, shared with the student's profile,
attendance, read marks and bookmarks. The cache therefore takes a **budget**,
`CACHE_BUDGET` (3.5 MB), and `writeEntry` evicts the oldest rows before it would
cross that line. It never touches a key outside `beu.cache.`.

## Stale-while-revalidate

`fetchText`/`fetchJson` take `revalidate: true`: when a copy exists it is
returned immediately and refreshed in the background. Screens that can tolerate
a slightly old answer (the notice board, the table index, result tables, notes)
use it, so they paint from disk on a train and are current again a moment later
on Wi-Fi. A failed refresh is silent — the copy on screen is already good.

`cacheMaxAge: 0` means “never expires”; the copy is served whenever the network
fails, however old it is. That is the right setting for anything published once
(a result table, a paper).

## Notices are live, not bundled

The board and the announcements feed are read from the site on every launch and
whenever a screen opens them. Nothing about them ships inside the app, so a
notice published or corrected on the site reaches every installed device with
no store release.

- The board is treated as fresh for **5 minutes** (`BOARD_TTL`), the
  announcements feed for **10 minutes** (`ANNOUNCEMENT_TTL`). Opening Home,
  Notices, Search or the announcements screen after that starts a background
  refresh while the rows already on screen stay put.
- Pull-to-refresh fetches immediately, whatever the age.
- The last good board is kept forever on the device and served when the site
  cannot be reached; the screen says it is an offline copy and how old it is.
- Read state is the device's, not the site's: `beu.notices.read.v1` holds the
  ids that were opened, so unread badges survive a relaunch and an offline one.
  The newest 24 announcement bodies are kept beside it, so search still matches
  a post's full text with no signal.

So the worst case with no network is the last board that was seen, and the
worst case online is one stale window — not an app update.

## The launch warm-up

`startOfflineWarmup()` runs once from `src/app/shell.tsx`, delayed 4 s so the
first screen paints and settles, and at most once every 30 minutes. It fetches
only the small feeds — notice board, notes manifest, dataset index — and only
for a student who has completed their profile. It never downloads papers.

Papers arrive when a paper is opened, when the student taps **Download** on a
subject in the PYQ shelf, or when they tap **Download &lt;branch&gt; · Sem &lt;n&gt;**
on Settings → Offline data. The shelf row and the subject header both show an
**Offline** badge once that subject's papers are on the phone; the course
button is sequential on purpose (one page at a time keeps the progress line
honest and does not trip a rate limit), skips subjects already fresh on the
device, and counts a failed subject instead of aborting the run.

## The screen

`settings.offline` (`src/features/offline/index.tsx`) is a ledger, not a
toggle:

- the hero card is the only place that spends data, and it names the course;
- bundled rows show counts and cannot be cleared;
- downloaded rows show count, size and when they were last updated, with a
  destructive action that states exactly what it removes and what the student
  loses.

## Testing

- `qa/unit/offline.test.ts` — pack ownership, byte accounting, the ledger.
- `qa/data.test.ts` — the bundled snapshots the offline tiers read.
- `qa/screens.test.tsx` — the main screens mount at 320 pt with the network
  down and still show their cached copy.
- `./scripts/check.sh test` — types, build and the suite under one lock.

To add a pack: add one entry to `PACKS` with a matcher that no other pack
claims, then add a matching group to `src/features/settings/storage.tsx` using
the full key (`beu.cache.…`). The unit test's ownership table is the place to
pin the new key.
