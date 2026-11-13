# Blockers

Ranked, evidence-first, 2026-10-28; re-ranked 2026-10-30 when B1 and B2 were closed. The
suite was **green** when this was written (`./qa/run-tests.sh`, exit 0) and again
on the re-rank (406/406); a red gate outranks everything below.

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
| 1 | B3 | **S1** | Results | The live path is upstream-broken: `/api/result` returns 502 and BEU's token endpoint 403; only the in-WebView captcha, a saved copy, or a published CSV can produce a result | §1 |
| 2 | B4 | **S2** | Release | APK is 12,110,647 B against a 12,300,000 B budget — **1.54 % headroom**; the next bundled asset fails the size gate | `docs/SIZE.md`, `./scripts/size-report.sh` |
| 3 | B5 | **S2** | Results | `results.web` is registered, tested and allowed to open BEU's page, but no screen links to it: a second result path that ships bytes and no student can reach | `grep -rn '"results.web"' src` → only its own registration |
| 4 | B6 | **S2** | Tools | Attendance has no JSON import/export (the site does); counts sync from the GECS register instead — an accepted deviation, not a bug, but it is the one parity gap a student can notice | `docs/SITE_PARITY.md` #8 |
| 5 | B7 | **S3** | Docs | Stale counts and claims: `qa/README.md` and `qa/AGENTS.md` said ~130 tests (the suite passes over 200) and "8 mounted areas" (harness lists 13); `PLAY_STORE.md` rows 1–2 described the AAB and API 36 as unbuilt after both landed | fixed in this pass, §2 |

## 1. B3 — the live result path depends on the captcha

Probed 2026-10-28:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://beu.prit.eu.org/api/result?reg=…&sem=3&format=json'   # 502
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://beu-bih.ac.in/backend/v1/result/token'                # 403 Access denied.
```

The app degrades in the documented order — live, saved copy, published CSV —
then offers `results.portal`, which loads BEU's page in a WebView and captures
the result the student's own captcha produces (`docs/SITE_PARITY.md` §1). That
is honest but it is still a manual step for a student with no cache and no CSV
row. Nothing in QA can fix the upstream; the risk is unproven device behaviour,
so the gate is rubric **A8** (complete the captcha flow on a real phone) plus
the 10-second "the challenge did not load" probe the screen already reports.

## 2. Fixed in this pass (B1, B2, B7)

- **B2 (was S0) — the roster no longer carries personal data as of 2026-10-30.**
  `build-students-data.py` serializes identity and affiliation only: `id, name,
  rollNo, regNo, provisionalReg, batch, session, branch, branchLabel, section,
  guardian, hosteller, admissionType, status`. The six sensitive keys (`phone`,
  `guardianPhone`, `email`, `dob`, `gender`, `category`) are read from the
  private dump and dropped. Three guards hold it: `PRIVATE_FIELDS` +
  `assert_private_free()` before any write, `--check` against the committed file
  and `verify.py` in the data check. The file went 471,724 → 346,726 B; `--check`
  is green and the retained fields are byte-identical to the old records.
  Two items remain open: the old blob is still in commit `4963c60`, so a full
  purge needs a history rewrite and a force push, and Play still needs a privacy
  policy plus its Data safety declaration (`docs/PLAY_STORE.md` §4).

- **B1 (was S0) — the students directory is reachable as of 2026-10-30.** Both
  doors named in the fix are now in feature code, not QA:

  ```sh
  grep -n 'route: "students"' src/app/more.tsx src/features/search/rank.ts
  # src/app/more.tsx:47:  { title: "Student register", … route: "students", … }
  # src/features/search/rank.ts:  { title: "Student register", … route: "students", … }
  ```

  More's row sits under **Results & records**; the search tile is in
  `DESTINATIONS`, which the search screen pushes through `nav.push(target.route)`
  (`src/features/search/index.tsx:368`). No students screen is a harness-only
  mount any more. `docs/SITE_PARITY.md` #17 stays **partial** for a different
  reason — only the GEC Sheikhpura roster is bundled, so another college's own
  roster is still reachable only as a dataset. That is a data gap, not a door.

- `PLAY_STORE.md` §1 rows 1–3 now match the tree: `build-android-host.sh` and
  `bundle-android.sh` link **API 36**, `bundle-android.sh` builds a signed
  `.aab` with bundletool, and `App.play.tsx` sets the Play channel so Share and
  Update point at the listing. The two real Play blockers left are B2 and the
  listing assets in §4 of that file.
- `qa/README.md` / `qa/AGENTS.md`: test count and mounted-area count re-stated
  without a number that will drift again.
- `qa/routes.contract.ts`: `notes.file` was never a route (notes pushes
  `pyqs.pdf`); the contract was exported but **read by no test**, while its
  header promised missing names become `test.todo`. It is now consumed by
  `qa/registry.test.ts`, so a required name that is missing shows up in the run.

## 3. Watch, not ranked

- `src/features/simulator/` is untracked work in progress (created 2026-10-27
  22:30). The module defines `results.simulate`, but it is not merged and
  nothing pushes it. If it lands, register it in `registry.tsx`, add the door in
  the same change, and run `bun qa/scan-push-targets.mjs`; an unregistered
  screen is exactly how B5 happened.
- `TAB_ROUTES` in `qa/routes.contract.ts` lists four roots and leaves `more` to
  `SHELL_ROUTES`, while the tab bar draws five tabs. The tests are consistent
  (shell reads `TABS` from `tabbar.tsx`), so this is naming debt, not a bug.
