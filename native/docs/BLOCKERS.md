# Blockers

Ranked, evidence-first, 2026-11-18; re-ranked when the corpus, the college
rosters and the attendance backup landed. The gate is the count — `./scripts/check.sh
test` is the only number that matters here; a red gate outranks everything below.

What each level means:

| Level | Meaning | Ships? |
|---|---|---|
| **S0** | A shipped capability cannot be reached, or the release exposes personal data | No |
| **S1** | A core task fails for a common case; a documented workaround exists | No |
| **S2** | A release risk or a dead surface that costs bytes and maintenance | Only with a dated plan |
| **S3** | Copy, naming or documentation drift with no user-visible break | Yes |

## Ranked

| # | ID | Severity | Area | What is wrong | Evidence |
|---:|---|---|---|---|---|
| 1 | B3 | **S1** | Results | The live path is upstream-broken: `/api/result` answers 503 `upstream_captcha` and BEU's token endpoint 403; only the in-WebView captcha, a saved copy, the shared corpus or a published CSV can produce a result | §1 |
| 2 | B4 | **S2** | Release | APK is 17,754,172 B against an 18,500,000 B budget — **745,828 B (4.0 %) headroom**; one bundled asset can still close that gap | `docs/size-history.json`, `./scripts/size-report.sh` |
| 3 | B8 | **S2** | Release | The Play side is not published: the listing URL returns 404 and the Data safety answers in `docs/DATA_SAFETY.md` are not entered in Play Console yet | §2 |
| 4 | B9 | **S2** | Privacy | The pre-2026-10-30 roster blob (with phone, DOB, gender, category) is still reachable in commit `4963c60`; the current file is clean, the history is not | §3 |
| 5 | B10 | **S3** | Data | Three CSV readers exist: `src/lib/csv.ts` (roster + tables), `features/results/data.ts` and `features/pyqs/pdf-build.ts`. Behaviour agrees today; a fix in one is not a fix in the others | §4 |
| 6 | B11 | **S3** | Docs | `TAB_ROUTES` in `qa/routes.contract.ts` lists four roots and leaves `more` to `SHELL_ROUTES`, while the tab bar draws five tabs | §4 |

## 1. B3 — the live result path depends on the captcha

Probed 2026-11-18:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://beu.prit.eu.org/api/result?reg=…&sem=3&format=json'   # 503
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://beu-bih.ac.in/backend/v1/result/token'                # 403 Access denied.
```

The app degrades in the documented order — live, saved copy, shared corpus,
published CSV — then offers `results.portal`, which loads BEU's page in a
WebView and captures the result the student's own captcha produces
(`docs/SITE_PARITY.md` §1). Since 1.3.3 the corpus also answers for a result
another student has already captured, so a common paper no longer needs the
captcha. A result nobody has captured still does. Nothing in QA can fix the
upstream; the gate is rubric **A8** (complete the captcha flow on a real phone)
plus the 10-second "the challenge did not load" probe the screen already reports.

## 2. B8 — the Play side is a release task, not a bug

`docs/PLAY_STORE.md` §3–§5 is the sequence; two items are still open:

- **The listing is not live.** `https://play.google.com/store/apps/details?id=org.beuconnect.app`
  returns 404, so the Share row's Play link is dead for every student until the
  first upload.
- **Data safety is written but not entered.** `docs/DATA_SAFETY.md` is the
  answer sheet, corrected for the corpus (§2.1), the analytics/FCM collection,
  the campus Wi-Fi credential and the capped `WRITE_EXTERNAL_STORAGE`
  declaration. Play Console still needs those values typed in.

Neither is a code defect. Both block a store release.

## 3. B9 — the old roster blob is still in git history

`build-students-data.py` now writes identity and affiliation only; the committed
file and `verify.py` are clean. The six sensitive keys (`phone`,
`guardianPhone`, `email`, `dob`, `gender`, `category`) remain in the blob from
before 2026-10-30, so a clone can still read them. Closing it needs a history
rewrite and a force push to the public repository — an owner decision, not an
agent one.

## 4. The S3s — drift with no user-visible break

- **B10, three CSV readers.** `src/lib/csv.ts` was written for the college
  rosters and is the one to extend; `features/results/data.ts` and
  `features/pyqs/pdf-build.ts` carry their own, written earlier. Consolidating
  them changes parsing under the table, rank, merit and paper screens at once,
  so it needs its own change and its own fixtures.
- **B11, tab naming.** `TAB_ROUTES` lists four roots and leaves `more` to
  `SHELL_ROUTES`, while the tab bar draws five tabs. The tests are consistent
  (the shell reads `TABS` from `tabbar.tsx`), so this is naming debt.

## 5. Closed in this pass

- **B5 (was S2) — `results.web` now has a door.** The portal's error phase
  pushes it (`features/results/portal.tsx`), so the page-walker is reachable
  without a code path that only QA knows.
- **B6 (was S2) — attendance has a JSON backup.** `features/tools/attendance-io.ts`
  reads and writes the website's `{ version: 2, settings, subjects }` envelope,
  the card exports through the system share sheet and refuses an unreadable file
  before it applies anything. `docs/SITE_PARITY.md` #8 is done.
- **B1, B2, B7** — closed in the 2026-10-30 pass: the students directory has
  two doors, the roster is PII-free, and the stale counts in `qa/README.md`,
  `qa/AGENTS.md` and `PLAY_STORE.md` were corrected.
- **The simulator is gone.** It was untracked work in progress with no route and
  no door; it was deleted rather than shipped, and the store listing no longer
  claims it.
