# Analytics

Two surfaces, one vocabulary. The site sends GA4 events through `gtag.js`; the
app batches the same event names to `POST /api/track`, which forwards them with
the Measurement Protocol. The API secret lives in the worker's environment, never
in the APK.

## The taxonomy is one file

`src/lib/analytics/events.json` (repo root) is the only list of event names.

```sh
bun scripts/sync-analytics-events.ts          # regenerate native/src/lib/analytics-events.ts
bun scripts/sync-analytics-events.ts --check  # fails when the two have drifted
```

`/api/track` rejects any name that is not in that list, and
`src/lib/analytics/taxonomy.test.ts` pins the drift in CI. Adding an event is
always: add to `events.json`, run the sync script, use it.

## Configuration

| Where | Variable | What it does |
|---|---|---|
| Site build | `PUBLIC_GA_MEASUREMENT_ID` | `G-…`; without it `Analytics.astro` renders nothing and `beuTrack` is absent |
| Worker | `GA_MEASUREMENT_ID` | the same `G-…`, for the app's forwarded events |
| Worker | `GA_API_SECRET` | Measurement Protocol secret; the app never sees it |

```sh
# site
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX bun run build

# worker (cf, not wrangler)
cf workers secrets update GA_MEASUREMENT_ID --worker beuconnectaw --type secret_text --text "G-…"
cf workers secrets update GA_API_SECRET     --worker beuconnectaw --type secret_text --text "…"
```

Both sides no-op silently when unconfigured, so local development sends nothing.

Live property: `beu connect`, stream `BEU Connect Website`, Measurement ID
`G-6J1BK27JQM`, secret named `BEUConnect native`. The ID is public; the secret
lives only in the worker, so rotating it never breaks an installed app.

## Custom dimensions to register

GA4 drops event parameters that are not registered as custom dimensions. These
twenty-five are registered on the live property under **Admin → Custom
definitions → Custom dimensions** (scope: event):

| Parameter | Fills with |
|---|---|
| `surface` | `web` or `android` — the split between the two clients |
| `feature` | `syllabus`, `pyqs`, `results`, `students`, `tools`, `notices`, … |
| `page_type` | `home`, `lookup`, `subject`, `paper`, `tool`, `data`, `legal` |
| `screen_name` | the app's route, e.g. `results.rank` |
| `action` | the verb inside a feature (`generate`, `copy`, `lookup`) |
| `outcome` | `ok` / `error` |
| `source` | the door a screen was reached from (`home`, `search`, `recent`) |
| `kind` | the row or content type (`notice`, `post`, `branch`) |
| `label` | a filter or control name |
| `sem`, `branch`, `year`, `month` | the course context |
| `branch_name`, `college_name` | the readable label for those codes |
| `subject`, `paper`, `scheme` | the PYQ subject, GATE paper, syllabus scheme |
| `college` | the college code |
| `batch` | the admission year (`2024`, `2025`) |
| `student` | 10 hex characters hashed from the saved registration number |
| `has_profile` | whether the student has saved a registration number |
| `method` | how a share or download happened |
| `platform` | `android`, `macos`, `web` |

Everything else (`query_length`, `papers`, `days_since_install`, …) is a metric
and needs no registration.

## Which report answers what

- **Which feature is used** → *Explore → `feature` as the dimension, `screen_view`
  or `page_view` as the metric*. One row per area, both surfaces comparable
  because the vocabulary is shared.
- **App vs site** → put `surface` on every report; `web` is gtag, `android` is
  the batched `/api/track` path, and the worker stamps it so a client cannot
  mislabel itself.
- **Which branch, semester and batch** → `branch`, `branch_name`, `sem`,
  `batch`, `college`, `college_name`. They ride on every event, not just the
  `page_view`, so a single click can be split by course without a join.
- **Which PYQ subject or GATE paper** → `subject`, `paper`, `scheme`.
- **How many distinct students** → count distinct `student` where
  `has_profile = true`.
- **Where a student gets stuck** → filter `event_name = result_outcome` and split
  by `outcome`; the same for `error_shown`.
- **Do students read or just browse** → `syllabus_topic_toggle` per
  `syllabus_subject_open`, and `pyq_pdf_open` per `pyq_paper_open`.
- **Does search work** → `search_query` against `search_result_open`.

## Privacy rules the code enforces

These are not conventions; they are in the sender.

- **No identity on third-party hosts.** Names and phone numbers are never sent.
  Any run of six or more digits is replaced with `[redacted]` before a payload is
  built, so a registration number can never become a GA4 dimension. The number
  itself reaches only our own surface, as the `x-beu-reg` request header on
  `beu.prit.eu.org`; GitHub, Supabase, GA4 and BEU's portal never receive it.
- **No typed text.** Search sends `query_length` and `words`, never the words.
  The feedback sheet sends its type, never its message.
- **Params are allowlisted.** `trackScreen` forwards only `branch`, `sem`,
  `semester`, `scheme`, `college`, `subject`, `paper`, `batch`, `kind`, `year`,
  `month`, `tab`, `source` and `label`; a route with an unrecognised param sends
  the route and nothing else.
- **The saved number is hashed for counting, and never sent to GA4.** The
  tracker receives a 10-hex FNV digest (`student`) plus the batch, branch and
  college the number encodes — the same dimensions for the same student across
  sessions, so "how many distinct students" is answerable. The number itself
  rides only on our own API as the `x-beu-reg` header, which the worker uses to
  join a request to a student. The `reg` event parameter that 1.2.4 sent was
  removed in 1.2.5; the dimension must also be deleted in GA4 (Admin → Custom
  definitions), because removing the sender stops new values but not the ones
  already stored.
- **The URL is stripped.** The site's `page_view` sends `page_location` without
  its query string, because `/result?reg=…` puts a registration number in it.
- **Opt-out is real.** Settings → About → *Send anonymous usage* clears the queue
  and makes every later call a no-op. The switch is read once at launch, so an
  opted-out student sends nothing even before their first screen.

## What the app sends

- `app_open` once per launch: first open, upgrade, version, build, platform, days
  since install, launch count.
- `screen_view` on every route render, from the shell's single renderer.
- `feature_open` when a Home door is pressed, so the door is counted even if the
  screen itself never paints.
- A handful of action events where a student does the thing the feature exists
  for: a result lookup and its outcome, a saved semester, an attendance mark, a
  subject opened in the syllabus, a topic ticked, a paper opened, a PDF opened, a
  note opened, a notice opened, a search committed, a feedback sent.

## Offline

The app persists up to 40 unsent events (Storage key `beu.analytics.pending`) and
retries on the next launch or the next quiet 20 seconds. A failed batch is put
back at the front of the queue rather than dropped. The site relies on `gtag`,
which keeps its own queue.
