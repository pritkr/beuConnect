# Play Store

What stands between this tree and a listing at
`play.google.com/store/apps/details?id=org.beuconnect.app`, in the order the
work has to happen. `RELEASE.md` still owns the APK channel; this file owns the
store channel and does not replace it.

Written 2026-10-28 against Play's rules in force on that date.

## 1. Blockers

Two things fail a Play review today. The rest of this file is how each one is
closed.

| # | Play requirement | In this tree | Fix |
|---|---|---|---|
| 1 | Target API 36 for new apps and updates since 2026-08-31 | `build-android-host.sh` and `bundle-android.sh` link `--target-sdk-version 36` against `platforms/android-36` | none — landed 2026-10-28 |
| 2 | New apps ship as an **AAB** | `scripts/bundle-android.sh` builds, signs and validates `.nsh/out/BEUConnect-<version>.aab` with bundletool; `--install` proves the splits launch | built 2026-11-18: `.nsh/out/BEUConnect-1.3.3.aab`, 17,690,546 B, versionCode 14 (§3.2) |
| 3 | No self-update or link to an APK outside Play (Device & Network Abuse) | `App.play.tsx` sets the Play channel before boot; Share and Update return `PLAY_LISTING`, so the AAB contains no off-Play path | build the AAB with `bundle-android.sh`, never the APK entry (§3.3) |
| 4 | No third-party personal data published or bundled | the APK carries only `reg\|name\|roll`; the repo roster is identity + affiliation only as of 2026-10-30 (contact, DOB, gender and caste are dropped by the generator) | §3.4 |
| 5 | Privacy policy, Data safety, content rating, 512 px icon, feature graphic, screenshots | privacy policy is live; the icon, feature graphic and five 1080 px screenshots are built; Data safety answers are written; neither form is submitted | §4 |

Already compliant, do not re-litigate: `libnsh.so` LOAD segments are
`p_align 0x4000`, so the 16 KB page-size rule is met; the package is arm64-only
(64-bit requirement); `minSdk 28`; `org.beuconnect.app` is a clean package id;
the app has no ads, no analytics SDK, no account and no restricted permission.

## 2. Account and track (start this first — it gates the date)

As of 2026-10-28 there is **no Play Console account**. Nothing else in this file
can start until there is one, and the clock on the closed test starts only when a
build is on the closed track, so this is the first task and not a formality.

### 2.1 Which account type

| Decision | Effect |
|---|---|
| Personal account created after 2023-11-13 | **12 testers opted in, continuously for 14 days**, in closed testing before production access |
| Organisation account (D-U-N-S) | no closed-test minimum; verification takes 1–3 weeks |
| Personal account created before 2023-11-13 | no closed-test minimum |

A personal account created now is the after-2023 case, so the 12-tester rule
applies. The organisation route trades the 14 days for a D-U-N-S number: a
registered legal entity, a 1–3 week wait, and the account is then tied to that
entity rather than to a person. For a student project with no registered company
this is not available — **personal is the only path**, and the 14 days are the
longest pole in the plan.

If the 12-tester rule applies it is the longest pole by far: a build has to be
on the closed track on day 1 for production to be possible on day 15. Nothing in
§3 shortens it, so the account and the first closed-test upload come before
listing polish.

### 2.2 Creating it

Do this in one sitting on a desktop browser — the Console is not usable on a
phone, and the form does not survive a half-finished mobile session.

| Step | What it needs | Time |
|---|---|---|
| 1. Google account | a **dedicated** account, not a personal one. The owner of this account can never be transferred cleanly, and its name is what appears on the listing | minutes |
| 2. `play.google.com/console` → sign up | developer name, contact email, phone | minutes |
| 3. Pay the registration fee | $25 one-time. Prepaid cards are rejected; the card's billing name and address become the **Google Payments profile**, which is what verification checks the ID against | minutes |
| 4. Identity verification | official government photo ID whose name matches the Payments profile, proof of address, phone OTP | 1–2 days, up to 5 |
| 5. Device verification | the **Play Console mobile app** on a physical, non-rooted Android 10+ phone | minutes |
| 6. Developer profile | developer name, email, website, address. **All public on the listing** | minutes |

Step 5 is the one that is easy to miss: a new personal account cannot make an
app available on Play until it has proved, through the Console app, that it has
access to a real device. An emulator does not satisfy it, so this is the one part
of the setup that cannot be done sitting at the desktop.

Two things that cost a week if done in the wrong order:

- **The developer name is permanent-ish and public.** It appears under the app
  title as "BEUConnect — Syllabus & PYQ by <name>". Pick the name that should
  represent the project, not the Google account's display name, before step 2.
- **The Payments address must match the ID.** For a personal account Google takes
  the legal name and address from the Payments profile created at step 3, so a
  card registered to a different address than the address proof is a rejected
  submission, and only a limited number of attempts are allowed.
- **Verification gates publishing, not uploading.** While verification runs the
  account is limited: builds and the listing can be prepared, nothing can go
  live on a track. So the AAB (§3.2) and the listing (§4) can be finished in
  parallel with the wait.

The 12 testers are real Google accounts that must open the opt-in link, install
from Play and stay installed. An emulator or a second account on the same phone
does not count, and the 14 days reset if the tester count drops below 12. Recruit
16 (§5) because churn on a 14-day test is normal.

Cost to launch: $25, no recurring fee. The Console does not charge for uploads,
the tracks or the review.

## 3. Engineering

### 3.1 Target API 36

```sh
sdkmanager "platforms;android-36" "build-tools;36.0.0"
```

Then in `scripts/build-android-host.sh`: `PLATFORM=…/platforms/android-36/android.jar`
and `--target-sdk-version 36`. Keep `--min-sdk-version 28`.

Behaviour to re-check on an **API 36 image**, not the API 35 one on this
machine:

- edge-to-edge is enforced for target 36 — the status bar colour and the tab
  bar's bottom inset are the two places it shows as content under the system
  bars;
- predictive back (`enableOnBackInvokedCallback` is already set);
- the PDF page and the results WebView still render.

`nsh 0.3.0`'s runtime is the risk here, not the app code: if it breaks on 36 the
fix belongs upstream or in `android/`, not in a screen.

### 3.2 The AAB

`scripts/bundle-android.sh` builds it, one ABI, from the same host as the APK.
`aapt2` emits the proto-format module bundletool wants, so no Gradle is needed:

1. `build-android-host.sh` with `ENTRY=App.play.tsx` and `SUFFIX=-play` → the
   same dex and assets as the shipping APK, one channel flag apart.
2. `aapt2 link --proto-format` → a proto APK containing `AndroidManifest.xml`
   (proto), `resources.pb` and `res/`.
3. Module zip: `manifest/`, `resources.pb`, `res/`, `dex/classes.dex`,
   `assets/nsh/*`, `lib/arm64-v8a/libnsh.so`.
4. `bundletool build-bundle --modules=base.zip --output=BEUConnect.aab`.
5. `jarsigner` with the **upload key** — Play rejects an unsigned bundle, and an
   `.aab` is a zip of modules, so it is JAR signing, not `apksigner`.
6. `bundletool validate`; `--install` then builds the split APKs, signs them
   with the **app-signing** key and runs `install-apks` on the connected device.

Proven on 2026-10-28 with bundletool 1.18.3: a bundle built this way validates,
dumps `targetSdkVersion 36`, `versionCode 3`, `versionName 1.2.0` and the base
module's res, dex, assets and `lib/arm64-v8a/libnsh.so`, and its split APKs
install over the signed app and launch.

Rebuilt on 2026-11-18 for 1.3.3 / versionCode 14: `.nsh/out/BEUConnect-1.3.3.aab`,
**17,690,546 B**, signed with the upload key and validated. That run also fixed
a link gap the APK path did not have: `aapt2` now compiles every
`android/libs/*.aar` resource archive, because the manifest reads
`@integer/google_play_services_version` from play-services-basement and the Play
link previously passed only `android/res`.

`bundletool` is a jar pinned at `1.18.3` and cached under `~/.nsh/tools/`. The
manifest keeps `extractNativeLibs="true"` — identical to the shipping APK, one
less variable. Revisit `false` (uncompressed, aligned libs) only after the first
upload works.

`release.sh` still stops at the APK; the `.aab` is its own command for now. Add
the `--play` path once the store track exists and a version bump no longer
needs the APK tested first.

### 3.3 One app, two channels

Play forbids an app that updates itself or links to an APK outside Play. The
Share and Update rows do both, so the Play build must not contain them.

- `src/lib/channel.ts`: module-level `github` / `play`, `setChannel()`,
  `isPlay()`, `PLAY_LISTING`.
- `App.play.tsx`: calls `setChannel("play")` before `boot()`. `boot()` lives in
  `src/app/boot.ts`, shared with `App.tsx`; the build scripts already accept
  `ENTRY`, so `ENTRY=App.play.tsx` is the whole mechanism.
- In `"play"`: `checkForUpdates()` returns null without a request,
  `startUpdateCheck()` is a no-op, `UpdateRow` / `UpdatePanel` / `UpdateBadge`
  render nothing, and the share text names the listing.

No generated source, no second `nsh.json`, no build-time constant that drifts
from the code.

Measured on the 1.2.0 bundle rather than assumed: `bundle.nshc` still contains
the strings `api.github.com`, `github.com/pritkr/beuconnect` and
`BEUConnect.apk`, because a channel flag removes a code *path*, not the bytes.
The path is dead — `checkForUpdates()` returns before `fetchLatestRelease`, and
`startUpdateCheck()` returns before both — so a Play install makes no request
and shows no row. That is a behavioural claim, which is the one Play's Device &
Network Abuse policy makes. Do not restate it as "the URL is not in the APK".

### 3.4 The register file — fixed 2026-10-30, history purge still open

The shipped bundle is clean: `src/features/students/roster-data.ts` is packed from
the ten-column site CSVs and carries `reg|name|roll` only — no phone, email, DOB
or category reaches `assets/nsh/bundle.nshc`. Verified against the built APK, not
assumed from the source.

`assets/data/students-gecs.json`, committed to a public repository, used to hold
`phone`, `guardianPhone`, `email`, `dob`, `gender` and `category` for every
student. `category` is a caste field — sensitive personal data under India's
DPDP Act. Nothing in either the app or the site read those fields.

`build-students-data.py` now projects the JSON to the fields that have a
consumer: `id, name, rollNo, regNo, provisionalReg, batch, session, branch,
branchLabel, section, guardian, hosteller, admissionType, status`. The six
sensitive keys are read from the private dump and never serialized; the file
dropped from 471,724 to 346,726 bytes and `--check` is green. Guards:
`PRIVATE_FIELDS` + `assert_private_free()` before a write, `--check` against the
committed file, and `scripts/verify.py` in the data check.

A wider scan the same day found student mobile numbers in a `ContactNo` column
in six public result-table CSVs (`public/data/students_25_157_*_sem0.csv`) and
six extractor outputs under `pythonscripts/`. The column was removed, the
extractor no longer writes it, and `verify.py` now fails on any public CSV whose
header carries a contact, email, DOB, gender or caste column. The deployed site
keeps serving the old files until the next web deploy.

Two items remain before the repository is linked from the listing:

- ~~the pre-fix blob is still in commit `4963c60`~~ — **purged 2026-10-31.** All
  142 refs were rewritten with `git-filter-repo`: the roster blob lost `phone`,
  `guardianPhone`, `email`, `dob`, `gender` and `category`, and every
  `ContactNo` column was dropped from the six `public/data` CSVs and the six
  `pythonscripts/` extractor outputs. Verified over every ref before the force
  push and again after it: no ref contains `4963c60`, and no CSV in history has
  a `ContactNo` header. The old commits are unreachable from the repository,
  but **may still exist in GitHub's object cache and in forks** — the remaining
  step is a GitHub Support request to purge them, plus noting that any fork made
  before 2026-10-31 still contains the data. This stops the spread; it does not
  undo the exposure.
- a privacy policy and the Data safety declaration — **both done 2026-10-31.**
  Policy at `src/pages/privacy.astro`, deployed to
  `https://beu.prit.eu.org/privacy/`; the form answers are `docs/DATA_SAFETY.md`.
  The URL is live and returns 200; the remaining form work is entering the
  answers from that file into Play Console.

### 3.5 Version and signing

- `nsh.json` → `"version": "1.3.3", "build": 14`. versionCode is monotonic
  forever; 14 clears the last build 13.
- Mirror both in `src/lib/app-info.ts` (it is not generated).
- **Play App Signing, existing key as the app-signing key.** `scripts/signing.sh`
  already produced `~/.config/beuconnect/beuconnect-release.jks`; upload that in
  Play Console → App integrity so every sideloaded install upgrades in place
  instead of asking students to uninstall. Play requires a *different* upload
  key, which `./scripts/signing.sh --upload` now creates at
  `~/.config/beuconnect/beuconnect-upload.jks` with its password in
  `upload.env` — both outside the repo, both to be backed up.
- `bundle-android.sh` signs the `.aab` with that upload key through `jarsigner`
  and fails when the key is absent, because Play rejects an unsigned bundle.
  `UNSIGNED=1` is for split-install testing only.
- Back up both keys and `signing.env` before the first upload.

## 4. Store presence

Status on 2026-11-18: the policy and the answer sheet are written, the icon,
feature graphic and five screenshots are built, and the listing copy is in
`fastlane/metadata/android/en-US/`. What is left is Console data entry, not an
asset.

| Asset / form | Spec | Status / source |
|---|---|---|
| Icon | 512×512 PNG, 32-bit | **built** — `./scripts/store-assets.sh` → `.nsh/out/play/icon-512.png`, from `icon.png` (1024²) |
| Feature graphic | 1024×500 PNG, no alpha | **built** — source `scripts/store/feature-graphic.html`, output `.nsh/out/play/feature-graphic-1024x500.png` (regeneration command in the HTML header) |
| Phone screenshots | 2–8, 1080 px wide | **built** — five in `.nsh/out/play/screenshots/` at 1080×1688: home, syllabus, previous papers, notices, holidays. `SHOTS_ONLY=home,syllabus,pyqs,notices,tools.holidays SHOTS_WIDTH=540 SHOTS_HEIGHT=844 ./scripts/shots.sh` reproduces them (the host draws at 2×), then `magick <file> -background '#FBF8F4' -alpha remove -alpha off -define png:color-type=2 <file>` drops the alpha channel Play rejects. Never ship a screen that shows a student: `students`, `students.branch`, `results`, `results.rank` and the ticket screens are out, because they render a real registration number or name |
| Tablet screenshots | optional | same sweep, wider |
| Privacy policy | public URL | **live** — `https://beu.prit.eu.org/privacy/` (deployed 2026-10-31) |
| Data safety | form | answers in `docs/DATA_SAFETY.md`; **not entered in Play Console** |
| Content rating | IARC questionnaire | Education, no UGC, no ads → everyone; **not submitted** |
| App access | no login | declare "all functionality available without an account" |
| Ads | none | declare none |
| Target audience | 18+ | avoids the Families policy entirely |
| Government app | **no** | with the disclaimer below |

Listing copy, and the disclaimer is not optional: the app is named after a
university, ships its results and is not run by it.

- Title (30): `BEUConnect — Syllabus & PYQ`
- Short (80): `Syllabus, PYQs, results, rank and attendance for BEU students. Free, offline.`
- Full: first line `Unofficial student project. Not affiliated with Bihar Engineering University.`, then what each of the six areas does, one line each, and the offline claim.
- Category: Education.

### 4.1 Data safety answers

The form is answered in `docs/DATA_SAFETY.md`, row by row, with the code that
proves each answer. That file is the source; do not keep a second copy of the
answers here.

The three that matter when a reviewer reads the listing:

- **Collected:** a registration number (User IDs), the guardian mobile for
  attendance (Phone number, shared with the college's attendance service),
  feedback text, app-activity events and a random client id. All optional, all
  for app functionality or analytics, none for ads.
- **Not collected:** name, email, address, location, contacts, camera, files,
  health, finance, messages, web browsing, ad ID, crash logs.
- **Deletion:** no account to delete; clear app data, or email
  `pritform@gmail.com` and it is removed within 30 days.

The results lookup sends a registration number to `beu.prit.eu.org/api/result`,
and attendance sends one to Supabase. Both are app functionality, both must be
in the policy in plain words, and the policy is what the reviewer reads first.

## 5. Rollout

1. Internal testing: upload the `.aab`, install **from Play** on one physical
   phone and the API 36 image. Sideloading proves nothing about splits.
2. Let the pre-launch report run — it exercises the nsh runtime on real devices
   and is the cheapest crash test available.
3. Closed testing: 12+ testers (16 recruited, churn happens) for 14 continuous
   days, only if §2 says so.
4. Apply for production access with the real numbers. Answer the questionnaire
   about what broke during the test and what changed.
5. Staged rollout 20% → 50% → 100%, a few days apart, watching Android vitals.
6. After 100%: the GitHub APK becomes the beta channel. It must never be
   referenced from inside the Play build — §3.3 is what keeps that true.

## 6. Risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| Misrepresentation / trademark | an unofficial app carrying a university's name and data | disclaimer in the first line of the description, the About screen and onboarding; no BEU logo, no "official" |
| Third-party PII | caste, phone, DOB for 1,323 students | removed from the roster 2026-10-30 (§3.4); history purge pending |
| Device & Network Abuse | GitHub APK link in the Play build | §3.3 |
| Data safety mismatch | a form that disagrees with what the code sends | §4.1 kept true per release |
| Runtime on Android 16 | `nsh 0.3.0` predates API 36 | §3.1 tested on an API 36 image before the store upload |
| Scraping the BEU portal | Play's "unauthorised access" clause applies to a service whose terms forbid it | low volume, cache in `lib/net`, no credential storage |

## 7. Order of work

The account does not exist yet, so the first row is the only one that can slip
without anyone noticing, and it is the one that sets the date.

| Date | Work |
|---|---|
| 2026-10-28 | §2.2: create the Play Console account, pay $25, submit ID + address, verify the device in the Console app |
| 2026-10-29 → 10-31 | verification clears (1–5 business days); meanwhile §3.2 AAB and §4 listing, privacy policy and Data safety |
| 2026-10-31 | upload the AAB to internal testing, install **from Play**, check on the API 36 image |
| 2026-11-01 | closed testing opens with 16 recruited testers |
| 2026-11-01 → 11-15 | 14 continuous days, 12+ opted in |
| 2026-11-15 → 11-17 | production access questionnaire, staged rollout 20% → 50% → 100% |
| after launch | history purge of the pre-2026-10-30 roster blob (§3.4), before the repo is linked from the listing |

An organisation account removes the 14 days and moves production to about
2026-11-06. Everything else is the same work.
