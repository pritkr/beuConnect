# Result corpus — the contract

Status: **shipped in `1.3.3` (2026-11-18)**. This file is the single source for
the endpoint, the row shape, the native read path and the policy. Change it only
with the code.

Read `docs/RESULT_COVERAGE.md` first — it defines the six-step fallback chain
this file inserts into.

## 1. Policy (owner's decision, 2026-11-18)

**Contribution is on by default. There is no consent screen.**

- The student looks up a result. The payload BEU returned is saved locally and
  posted to the corpus. This happens without a prompt, a toggle or a note on the
  result screen.
- The only place the app explains this is the **terms of service**
  (`https://beu.prit.eu.org/terms`, section "Results you look up"). No other
  surface in the app carries that copy — not onboarding, not Settings, not the
  result screen, not the corpus read path.
- A student who does not want their result shared does not use result lookup.
  Every other feature works without it. The ToS says exactly that; there is no
  in-app opt-out and no deletion endpoint. Removal is by email
  (`pritform@gmail.com`, 30 days), as the privacy policy already promises.
- The privacy policy **links** to the ToS section rather than restating it, so
  there is one copy of the sentence. Play requires the disclosure to exist, not
  to be duplicated.

What is stored is only what BEU already publishes to that student: the result
payload for one `(reg, sem)`. No name field is written by the app, no device id,
no account, no IP in a durable column.

## 2. Endpoints

Both live on the Astro worker, `src/pages/api/corpus.ts`, D1 binding `DB` (the
same database as notifications — `cloudflare.config.ts`).

### POST /api/corpus

```json
{ "reg": "24105157010", "sem": 2, "payload": {}, "via": "portal" }
```

`payload` is the BEU `result/get-result` body as captured, normally
`{"status":200,"data":{…}}`.

| Case | Status | Body |
|---|---|---|
| stored (new row, or newer payload for the row) | 200 | `{"status":"stored"}` |
| same row, same `sha`, or older `captured_at` | 200 | `{"status":"duplicate"}` |
| bad reg / sem / payload / size | 400 | `{"status":"invalid","reason":"reg"\|"sem"\|"payload"\|"size"}` |
| over the write guard | 429 | `{"status":"rate"}` |
| no `DB` binding | 503 | `{"status":"unavailable"}` |

Rules:

- `reg`: digits only after stripping spaces and letters, length 8–12, batch
  `21`–`32`, branch in the known set (`101`–`105`, `110`, `161`), college
  3 digits. Reuse the same slice as the app: batch `[0,2)`, branch `[2,5)`,
  college `[5,8)`.
- `sem`: integer 1–8.
- `payload`: a JSON object, serialized ≤ 32 768 bytes, no HTML string, and it
  must contain a result — either a `data` key (the `{status, data}` envelope) or
  a subject/paper collection. Reject `{"status":>=400}` and empty objects.
- `via`: `portal` or `api`, default `portal`.
- `captured_at`: set server-side to `Date.now()`. A later POST for the same
  `(reg, sem)` replaces the payload only when the new `sha256` differs. Never
  delete on a failed validation.
- Write guard: `corpus_writes(ip_hash, bucket, n)` where `bucket` is the hour
  (`floor(now/3600e3)`). `sha256(ip + day_salt)`, first 16 hex chars, pruned
  after 48 h by the same handler. 60 writes per IP per hour; over that, 429.
  A register row also gets at most one successful write per hour regardless
  (`corpus_rows.updated_at`).

### GET /api/corpus?reg=…&sem=…

```
200 {"status":"ok","payload":{…},"capturedAt":1763…,"via":"portal"}
404 {"status":"miss"}
400 {"status":"invalid","reason":"reg"|"sem"}
```

`cache-control: public, max-age=300`, `access-control-allow-origin: *` (the row
is public by design). No `etag` work beyond what the platform adds.

### Schema — `migrations/0002_corpus.sql`

```sql
CREATE TABLE IF NOT EXISTS corpus_rows (
  reg         TEXT NOT NULL,
  sem         INTEGER NOT NULL,
  batch       TEXT NOT NULL,
  branch      TEXT NOT NULL,
  college     TEXT NOT NULL,
  payload     TEXT NOT NULL,
  sha         TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  via         TEXT NOT NULL DEFAULT 'portal',
  captured_at INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (reg, sem)
);
CREATE INDEX IF NOT EXISTS idx_corpus_batch ON corpus_rows (batch, branch, sem);
CREATE INDEX IF NOT EXISTS idx_corpus_college ON corpus_rows (college, branch, sem);
CREATE INDEX IF NOT EXISTS idx_corpus_updated ON corpus_rows (updated_at);

CREATE TABLE IF NOT EXISTS corpus_writes (
  ip_hash TEXT NOT NULL,
  bucket  INTEGER NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, bucket)
);
```

`batch`/`branch`/`college` are stored so rank and merit can count coverage
without parsing 32 KB of JSON per row.

### Server-side contribution too

When `/api/result` successfully fetches from the portal path it should POST the
same payload into the corpus inside the worker (a direct D1 insert, not a
subrequest), with `via: "api"`. The live path is upstream-dead as of
2026-11-18, so this is cheap insurance, not the main source.

## 3. Native contribution (`features/results`)

- `captureResult(reg, sem, payload)` keeps doing what it does (local save).
  Immediately after it resolves, fire `contributeCorpus(reg, sem, payload)` —
  `void`, never awaited by the UI, no toast, no banner, no error path. A failure
  is silent by design; the local result is already on screen.
- The same silent post runs after a **live** `/api/result` success, so the two
  paths share it.
- `src/lib/corpus.ts` owns the client: URL, `postJson`, 8 s timeout, one retry
  on a transport error, `fetchJson` for reads, `beu.cache.corpus.{reg}.{sem}`
  for the read cache (30 days, the payload never changes once published).
- No new Storage key outside `beu.` / `beu.cache.`; `lib/net.ts` is the only
  fetch surface.

## 4. Read path

`loadResult` in `features/results/data.ts` becomes:

1. live `/api/result` (one retry)
2. `result:{reg}:{sem}` local cache
3. **corpus** `GET /api/corpus?reg&sem` — only when 1 and 2 miss, 8 s budget
4. wide CSV row
5. college roster (name + SGPA/CGPA only)
6. branch roster for rank only
7. honest miss with the nearest published semester

A corpus hit is written to the local cache under the same key with `source:
"corpus"` and its `capturedAt`, so the next launch paints instantly. The payload
goes through the existing `payloadFrom` — no second parser.

## 5. Tests (`native/qa` and root `vitest`)

| Test | Where | Proves |
|---|---|---|
| reg/sem validation, size cap, envelope extraction | `src/pages/api/corpus.test.ts` (root) | the endpoint accepts what the app sends and rejects the rest |
| upsert: new, duplicate, newer | same | one row per `(reg, sem)`, no data loss |
| client posts silently to the right URL and swallows failure | `native/qa/corpus.test.ts` | no UI path depends on it |
| chain order: cache before corpus before CSV | `native/qa/corpus.test.ts` | a dead corpus never blocks a result |

## 6. Not in scope

- No coverage dashboard, no merge UI, no per-college counts screen.
- No deletion endpoint, no consent toggle, no "shared with 3 students" badge.
- No change to `DATA_SAFETY.md` beyond the row that names this collection; the
  ToS is the canonical sentence.

## 7. Before this ships

1. **Apply the migration to the production database.** `migrations/0002_corpus.sql`
   against the D1 database bound as `DB` (`c0a6953e-1fec-4c75-8a58-4ac0a80e9057`).
   Until it is applied the endpoint fails closed: the app's writes are dropped
   and reads fall through to the CSV path, so nothing breaks and nothing is
   collected.
2. **Deploy the worker** (`bun run deploy`). `GET /api/corpus` on the deployed
   host is the smoke test: a known `(reg, sem)` returns `{"status":"ok",…}` and
   an unknown one returns `404 {"status":"miss"}`.
3. **Optional:** set a `CORPUS_SALT` secret. Without it the rate-limit digest
   uses the day as its salt, which still rotates daily but does not separate two
   deployments writing to the same table.
