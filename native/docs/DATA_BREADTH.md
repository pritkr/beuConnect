# Data breadth — 53 colleges already exist, the app ships one

Status: **plan, not built**. Written 2026-10-31 against `1.2.5`.

## 1. What the data says

Counted from `public/data/` on 2026-10-31:

| | Count | Size |
|---|---|---|
| Result tables (`wide_*.csv`, 56 columns) | 1,308 files | 13 MB |
| Rosters (`students_*.csv`, ranked rows) | 1,452 files | 8.5 MB |
| College codes | **53** (52 colleges + `all`) | — |
| Branch codes | 7 (`101`–`105`, `110`, `161`) | — |
| Batches | 5 (`21`–`25`) | — |
| Everything in `public/data` | 2,764 files | 23 MB |

The largest single college — GEC Sheikhpura (`157`) — is **141 files, 804 KB**,
and its bundled roster is 346,726 B of JSON that gzips to **33 KB**.

Meanwhile the app bundles exactly **one** roster: GEC Sheikhpura, 1,323 students
(`native/assets/data/students-gecs.json`). Every other college is reachable only
as a dataset in the data browser, and its rank and merit screens have nothing to
rank.

**This is not a scraping problem. The data for 52 more colleges is already
published. It is a delivery problem.**

## 2. Why it can't be bundled

The APK is **17,479,740 B** against an **18,500,000 B** budget — 1,020,260 B of
headroom (`docs/SIZE.md`). The whole dataset is 23 MB, larger than the app. Even
the single largest college pack (804 KB) would take 79% of the remaining
headroom.

So breadth has exactly one shape: **the APK ships an index, the data arrives on
demand, and what arrives stays cached.**

## 3. The pack model

A **college pack** is everything needed for one college at one batch:

```
pack(batch, college) =
  roster/{branch}/sem{N}.csv      ← rank, merit, directory
  wide/{branch}/sem{N}.csv        ← papers, SGPA, CGPA, official ranks
  meta.json                       ← counts, bytes, sha, generated_at
```

- **Budget:** 0.5–1 MB on disk per college-batch, ~150–250 KB gzipped. GEC
  Sheikhpura is the top of that range; most will be smaller.
- **Fetch:** first time a student opens their college, or explicitly from the
  college screen. One request, resumable by file.
- **Cache:** `Storage` under `beu.pack.{batch}.{college}.{file}`, with a
  `meta.json` holding the sha. Verify before use; a mismatch refetches one file,
  not the pack.
- **Evict:** a cap of **25 MB** across packs, least-recently-used first. The
  student's own college is pinned and never evicted.
- **Offline:** a downloaded pack is complete for that college — no partial
  screens. That is the whole point of a pack over per-screen fetches.

The pieces already exist: `features/offline` for the budget and the UI,
`features/data-feed/store` for the manifest state, `lib/net` for cache and
timeouts.

## 4. The manifest is broken; fix it first

`docs/RESULT_COVERAGE.md` records that `/data/manifest/index.json` lists paths
that **404** (`24/105/sem1_157.json` under two prefixes), so nothing may build
URLs from it. A pack model cannot exist on top of a manifest nobody can trust.

New shape, one file per college-batch, plus one index:

```jsonc
// /data/packs/index.json  (~5 KB gzipped)
{
  "generated_at": "2026-10-31T00:00:00Z",
  "packs": [
    { "batch": 24, "college": "157", "files": 141, "bytes": 804000,
      "gzip": 210000, "sha": "…", "path": "/data/packs/24/157/" }
  ]
}
```

The generator is a script under `scripts/` that walks `public/data`, groups by
`(batch, college)`, writes the per-pack `meta.json`, and appends the index. It
runs in the data pipeline, never by hand (`scripts/AGENTS.md`).

Acceptance: every path in the index returns 200; a test walks the index and
fails on a 404. That test is the difference between a manifest and a wish.

## 5. Phases

| # | Work | Done when |
|---|---|---|
| 1 | Manifest generator + the 404 test | `bun qa/…` fails today, passes after |
| 2 | `lib/packs.ts`: fetch, verify, cache, evict | a pack downloads once and survives a relaunch |
| 3 | College picker in onboarding + Settings | a student from college `117` lands on their own branch |
| 4 | Roster screens read from the pack | `students.branch` works for a non-GECS college |
| 5 | `results.rank` / `results.merit` from a pack | a rank renders for a batch with no bundled roster |
| 6 | Coverage screen: which colleges have a pack, which don't | counts match the index |
| 7 | Background refresh when `generated_at` moves | a stale pack updates without a reinstall |

Phases 1–4 are the feature. 5 is what makes it worth downloading; 6–7 are
maintenance.

## 6. Metrics

| Event | Answers |
|---|---|
| `pack_offer` | how often a college with no bundle is opened |
| `pack_download` (`outcome`, `bytes`, `ms`) | whether the network can carry it |
| `pack_hit` | downloads that were used, not just fetched |
| `college_selected` (`college`, `source`) | whether the picker is used or ignored |

The number that matters: **share of students whose college resolves to a pack.**
Today it is 1 of 52. The target for the first quarter is the top ten colleges by
result-table traffic — measured, not guessed.

## 7. Risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| Device storage | 25 MB of packs on a 32 GB phone | LRU cap, pinned own college, visible in Settings → Storage |
| Data cost | a pack on 2G is real money | gzip, per-file fetch, "download on Wi-Fi" default |
| Stale packs | a new semester publishes, the pack doesn't | `generated_at` check on open, background refresh |
| Manifest drift | the exact failure that exists today | the 404 test in the pipeline, not a doc |
| Privacy | rosters are the sensitive file | the same projection as `students-gecs.json`: identity and affiliation only, `verify.py` guard |
| Rank across colleges | different colleges publish different columns | rank within a pack only; never mix colleges in one ranking without a stated basis |

## 8. Why this order

The corpus (`docs/RESULT_CORPUS.md`) makes results exist where BEU publishes
none. Breadth makes the ones that already exist reachable. They meet at the same
place: a student from any BEU college opens the app and their branch, rank and
merit are already there.

Breadth first is the cheaper win — the data is already published, the work is
delivery. The corpus is the compounding one. Do 1–4 here, then start the corpus;
they share the manifest and the offline layer, so neither is wasted.
