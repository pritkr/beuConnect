# Result corpus — from a captcha dead end to a dataset

Status: **plan, not built**. Written 2026-10-31 against `1.2.5`. Read
`docs/SITE_PARITY.md` §1 and `docs/RESULT_COVERAGE.md` first; this file assumes
both.

## 1. The problem this solves

BEU's result token endpoint returns `403`, so the live path is dead and every
student who has no saved copy and no published CSV row hits a captcha page they
have to solve themselves. That is honest, and it is also the moment the app
stops being better than the website.

But the captcha produces something valuable: a real result, in a clean JSON
shape, on the student's own phone. Today that payload is saved locally, rendered,
and forgotten. Multiply it by a batch and you have the dataset that rank, merit
and every analytics feature needs — the thing no competitor can buy.

**The corpus is the result of one student's captcha, contributed with consent,
read back instantly by the next student in the same batch.**

## 2. What already exists

| Piece | Where | What it does today |
|---|---|---|
| Capture hook | `features/results/portal.tsx` (`CAPTURE_HOOK`) | wraps `fetch`/XHR before page scripts, posts `{url, body}` for `result/get-result` |
| Parser | `features/results/data.ts` (`payloadFrom`) | walks `{status, data}` envelopes up to four levels, returns a typed result |
| Save path | `features/results/data.ts` | writes `result:{reg}:{sem}` through `lib/net` cache |
| Fallback order | `docs/RESULT_COVERAGE.md` | live → fresh cache → any cache → wide CSV → roster → honest miss |
| Published tables | `public/data/wide_*.csv` | 1,308 files, 56 columns, `Source`-less, authoritative where present |

The gap is between "saved on this phone" and "available to anyone". Everything
else is already wired.

## 3. The loop

```
student solves the captcha
        ↓
portal.tsx captures the result JSON
        ↓
        ├── saves locally (today)
        └── asks: "add this to the public table?"   ← new, default OFF
                    ↓ consent
              POST /api/corpus
                    ↓ validate · dedupe · store
              D1 `corpus_rows`
                    ↓
        read path step 5: /api/corpus?reg=&sem=
                    ↓
        every student in that batch gets an instant result
                    ↓
        coverage grows → rank and merit get real
```

## 4. Data model

D1, one table. D1 is the right size: the rows are small (a result is ~5 KB of
JSON), the queries are point lookups and counts, and the free tier covers
100,000 row writes a day — far more than this will ever see.

```sql
CREATE TABLE corpus_rows (
  reg          TEXT NOT NULL,          -- 11 digits, as typed
  sem          INTEGER NOT NULL,       -- 1..8
  batch        INTEGER NOT NULL,       -- derived from reg, 2000+YY
  college      TEXT NOT NULL,          -- reg[5:8]
  branch       TEXT NOT NULL,          -- reg[2:5]
  payload      TEXT NOT NULL,          -- the BEU result JSON, normalised
  sgpa         REAL,
  cgpa         REAL,
  captured_at  INTEGER NOT NULL,
  app_version  TEXT NOT NULL,
  consent_at   INTEGER NOT NULL,       -- when the student agreed
  ip_hash      TEXT,                   -- rate limiting only, never joined to reg
  state        TEXT NOT NULL DEFAULT 'live',  -- live | hidden | rejected
  PRIMARY KEY (reg, sem)
);
CREATE INDEX corpus_coverage ON corpus_rows (batch, college, branch, sem, state);
```

- `PRIMARY KEY (reg, sem)` makes the endpoint idempotent: a re-capture updates
  the row instead of adding a second one.
- `state` is the moderation lever. `hidden` keeps a row for review without
  serving it; `rejected` keeps the audit trail.
- Nothing here is a field BEU does not already publish. No phone, no email, no
  DOB, no gender, no category — the roster purge (`docs/PLAY_STORE.md` §3.4) is
  the precedent and `scripts/verify.py` is the guard.

## 5. Endpoint

`POST /api/corpus` — same worker, no new service.

```jsonc
{
  "reg": "24105157010",
  "sem": 3,
  "payload": { /* the captured BEU response, unchanged */ },
  "consent": true,
  "app_version": "1.2.5"
}
```

Answers: `201 {stored: true}`, `200 {stored: false, reason: "duplicate"}`,
`400 {reason: "shape" | "reg_mismatch" | "sem_mismatch"}`, `429` on rate limit.

Validation, in order — reject at the first failure:

1. `reg` is 11 digits and `sem` is 1–8.
2. `consent === true`. No consent, no row. Not a checkbox buried in settings.
3. `payloadFrom(payload)` returns a result, and its registration number and
   semester match the request. This reuses the parser the app already trusts.
4. At least one paper with a non-empty code and a mark or grade.
5. `SGPA`/`CGPA`, when present, are 0–10.
6. The row is not an obvious outlier against the same `(batch, college, branch,
   sem)` median — flag to `hidden`, never auto-reject. A whole batch is not
   going to fake a 9.8 together.

`GET /api/corpus?reg=&sem=` returns the same shape as `/api/result` with
`"source": "corpus"`, so the app's existing parser handles it unchanged.

Rate limit: 10 writes per `ip_hash` per hour, 3 per `reg` per day.

## 6. Consent, in the app

After a capture succeeds and before the result renders, one card:

> **Add this to the public table?**
> It's your result, published by BEU already. Sharing it means the next student
> in your batch doesn't have to solve a captcha. You can take it back anytime.

Two buttons: **Add it** / **Not now**. The choice is per capture, stored under
`beu.corpus.consent`, and the result renders either way — never gate the result
on the answer.

Settings → About gets one line: *"Results you shared: N · Remove all"*.
Removal calls `DELETE /api/corpus?reg=` and clears the local flag.

## 7. Read path change

One new step, inserted before the honest miss:

```
1 live /api/result
2 fresh cache (<10 min)
3 any cache
4 published wide CSV
5 corpus  ← new: GET /api/corpus?reg=&sem=
6 honest "not published" + offer the portal
```

A corpus row renders with a badge: **"Shared by a student · not BEU's copy"**,
and a link to the official page. Never present a corpus row as official, and
never let it overwrite a wide CSV row — official wins on every conflict.

## 8. Publication

Two tracks, in this order:

1. **API-first (week 1).** Rows are served from D1 at step 5. No CSV changes, no
   deploy of data, reversible in one command.
2. **Baked (later).** A monthly job merges `state='live'` rows into
   `public/data/wide_*.csv` where no official row exists, adds a
   `Source=corpus` column value, and commits the diff. This is what makes the
   corpus survive the API being down, and what feeds `result-table` and
   `merit-list` without a query.

Do not start with the baked track. It is irreversible in a way the API is not.

## 9. Coverage, made visible

A new screen `results.coverage` (door: Results → the miss state, and More):

- per batch → college → branch → semester: how many rows exist vs how many
  students the roster says are in that branch;
- "Your result is missing" → the portal flow, with the consent card;
- a leaderboard is tempting here. Don't. It rewards fake rows.

The honest metric is **hit rate**: of all lookups that had no official row, how
many resolved from the corpus. That number is the feature.

## 10. Metrics

| Event | Params | Answers |
|---|---|---|
| `corpus_offer` | `sem`, `batch`, `branch` | how often we ask |
| `corpus_accept` | `sem`, `batch`, `branch` | consent rate (expect 10–30 %) |
| `corpus_result` | `source`, `outcome` | hit rate at step 5 |
| `corpus_revoke` | `rows` | trust |

All of these are already in the GA4 vocabulary rules (`docs/ANALYTICS.md`): add
them to `src/lib/analytics/events.json`, run the sync script, use them.

## 11. Work breakdown

| # | Work | Done when |
|---|---|---|
| 1 | D1 binding + `corpus_rows` migration | `cf d1 execute` creates the table in staging |
| 2 | `POST /api/corpus` + validation | a curl with a real captured payload returns 201, a replay returns duplicate |
| 3 | `GET /api/corpus` + `source: "corpus"` | the app's parser renders it with no changes |
| 4 | Consent card in `results/portal.tsx` | the result renders whichever button is pressed |
| 5 | Read path step 5 + provenance badge | a second device resolves a result it never fetched |
| 6 | Revoke from Settings → About | `DELETE` removes the row, the badge stops |
| 7 | Moderation: `hidden` + a review query | an outlier never reaches a student |
| 8 | Coverage screen | counts match a `SELECT COUNT(*)` |

Phase 1 is items 1–6 and is the whole feature. 7–8 are the parts that keep it
honest once it has volume.

## 12. Risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| Fake rows | a corpus row is unverifiable by construction | schema + cross-field checks, outlier → `hidden`, official row always wins, revoke + report |
| Someone scrapes the corpus | it is a list of results by registration number | it is the same data BEU publishes; rate limit reads, no bulk endpoint, no auth bypass |
| Legal (DPDP) | republishing third-party personal data | already the site's posture for `wide_*`; consent recorded per row, deletion honoured, policy names it (`/privacy` §"Public data we republish") |
| D1 limits | free tier write cap | 10 writes/IP/hour; the real volume is a few thousand rows a semester |
| The corpus is empty for months | consent rate is low early | it compounds per batch; show the coverage screen so the gap is visible, not hidden |
| A contributed row disagrees with BEU later | two sources of truth | official CSV wins on every read; corpus never overwrites |

## 13. What this unlocks

Once a batch has coverage, three things stop being aspirational:

- `results.rank` and `results.merit` for batches with no published roster;
- `result-table` for colleges outside GEC Sheikhpura;
- subject difficulty analytics — the roadmap item that needs marks, not SGPA.

That is the moat: not the screen, the rows.
