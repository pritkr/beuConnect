# Site endpoints the app and site share

Base: `https://beu.prit.eu.org`. Only hosts in `native/nsh.json` can be reached
at runtime: `beu.prit.eu.org`, `beu-bih.ac.in`, and the Supabase host (feedback).
Everything below is read through `native/src/lib/net.ts`, never a bare `fetch`.

## Results

```
GET /api/result?reg=<REG>&sem=<1-8>&format=json
```

- `format=json` → `{ status: 200, data: ResultPayload }`.
- `data` carries student info, `theorySubjects`, `practicalSubjects`, `sgpa`,
  `cgpa`, `fail_any`, failed/backlog subjects.
- Optional flags: `carry=true`, `view=official|modern` (HTML views only).
- Can take seconds and occasionally returns 502; cache the result and never
  hammer upstream.
- When BEU requires a captcha (Turnstile), the app uses the captcha page in a
  WebView (`results.web`). The student solves it; the app never does.

## Notices

```
GET /api/notices/important?limit=<1-20>    → { items, fetchedAt }
GET /notices/                               → server-rendered board
GET /announcements/                         → server-rendered feed
```

Important notices are cached upstream for ~60 s.

## Results data (published rosters)

```
GET /data/students_<batch>_all_<branch>_sem<n>.csv   whole branch roster
GET /data/wide_<batch>_<college>_<branch>_sem<n>.csv one student, per paper
GET /data/manifest/index.json                        available datasets
```

`batch` is the two-digit admission year (`21`…`26`), `branch` and `college` are
BEU codes, `sem` is `1`–`8`. Not every combination exists; `COVERAGE` in
`native/src/features/results/data.ts` is the in-app list. `sem0` files are
invalid and ignored.

## PYQs and PDFs

```
GET /pyqs/<subject-slug>/            server-rendered papers, parsed natively
GET /PYQPDFs/<file>.pdf              published paper files
GET /data/pyq-pdfs.json              index of published papers
```

Paper pages are ~390 KB of HTML; the app parses them once to ~9 KB and stores
the parsed form (`pyqs.papers.v1.<slug>`), never the raw HTML.

## Notes, apps and feedback

```
GET  /data/notes.json                 Notes & VVI manifest (docs/NOTES.md)
GET  /data/app/manifest.json          native offline feed manifest
GET  /data/app/files/<hash>.txt       native offline feed chunks
POST /api/feedback                    { type, message, regNo?, contact?, page?, context? }
```

Feedback `type` is one of `bug`, `wrong-data`, `feature`, `other`.

## Other

```
GET /routine?reg=<REG>&group=<G>      per-student timetable (live proxy)
```

## Rules

- Cache with a `cacheKey`; on failure return the last good copy and label it.
- Register every new host in `nsh.json` (`capabilities.network.hosts` for fetch,
  `capabilities.webview.hosts` for a WebView) before using it.
- Respect upstream limits: no loops over semesters or batches without a user
  action behind them.
- The result captcha is the student's to solve. No bypass, no replay, no
  third-party solver.
