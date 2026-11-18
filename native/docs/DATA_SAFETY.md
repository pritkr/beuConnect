# Data safety — the Play form, answered from the code

Source of truth for **Play Console → App content → Data safety**. The form is
checked against this file, and this file is checked against the code. If a row
here disagrees with `src/lib/analytics.ts`, `src/lib/student-context.ts`,
`src/features/tools/gecs.ts` or `src/pages/api/feedback.ts`, the code wins and
this file is wrong.

- **Privacy policy URL** — `https://beu.prit.eu.org/privacy`
  (`src/pages/privacy.astro`; its results section links to
  `https://beu.prit.eu.org/terms/#results`, which is the only copy of that text)
- **Data deletion contact** — `pritform@gmail.com`
- **Last reviewed** — 2026-11-18, tree at `1.3.3` + the result corpus

## 1. The three yes/no answers

| Question | Answer | Why |
|---|---|---|
| Does the app collect or share required user data types? | **Yes** | Registration number, feedback, analytics |
| Is all collected data encrypted in transit? | **Yes** | HTTPS only; no plaintext endpoint in `lib/net.ts` |
| Do you provide a way to request deletion? | **Yes** | Email above; no account to delete, so app-storage clearing also removes it |

## 2. Data types

Play's own row names, the answer, and where the claim comes from. "Collected"
means it leaves the device; "shared" means a third party that is not acting as
our processor.

| Play row | Collected | Shared | Optional | Purpose | Evidence |
|---|---|---|---|---|---|
| Personal info → **User IDs** | Yes | **Yes** | **No** | App functionality, Analytics | `student-context.ts` `x-beu-reg` on our API; the 10-hex `student` hash to GA4; the number is also typed into BEU's portal (`results/web.tsx`, `portal.tsx`) and posted to `/api/corpus` |
| Personal info → **Phone number** | Yes | **Yes** (attendance service) | Yes | App functionality | `features/tools/gecs.ts` sends the guardian mobile to the GECS Supabase project, then drops it |
| Personal info → **Other info** | Yes | **Yes** | **No** | App functionality | free-text feedback and the optional contact in `api/feedback.ts`; plus the **result payload** stored by `/api/corpus` (see §2.1) |
| App activity → **Other actions** | Yes | No | **No** | Analytics | `lib/analytics.ts` screen and action events, on until Settings → About turns them off |
| Device or other IDs → **Device or other IDs** | Yes | **Yes** (Google, FCM) | **No** | Analytics, App functionality | the random `client_id` in `lib/analytics.ts`; the FCM token that Google issues and `NotificationSetup.java` subscribes to a topic with |
| Everything else | **No** | — | — | — | see §3 |

### 2.1 The result corpus — the row Play will ask about

Added 2026-11-18 (`docs/RESULT_CORPUS.md`). A result the student looks up is
posted to `/api/corpus` and can be read by anyone who knows the registration
number and semester (`access-control-allow-origin: *`, five-minute cache). That
is **User IDs + Other info**, collected, **shared**, and **not optional** —
there is no in-app toggle by the owner's decision; the terms of service say so
and say the way out is not to use result lookup.

The form answers follow from that:

- User IDs → *collected, shared, required for app functionality*.
- Other info → *collected, shared, app functionality*.
- Deletion → email a registration number; the corpus row is deleted with it.

Do not answer "optional" for either. Play's definition is whether the user can
use the app without it; they can use every feature except result lookup.

Rows Play offers that must stay **No**: location, name, address, race and
ethnicity, political or religious beliefs, sexual orientation, financial info,
health and fitness, messages, photos and videos, audio, calendar, contacts, web
browsing, in-app search history (search sends a word count), installed apps,
crash logs (no SDK), and performance data.

**Email address** stays *No* even though the feedback form invites a contact:
that field is free text, not an account identifier, and it is answered under
"Other info". **Files and docs** stays *No*: the attendance import reads a file
the student picks through the system picker and never uploads it. The
`WRITE_EXTERNAL_STORAGE maxSdk 28` entry in `AndroidManifest.xml` is the only
file permission and it is capped below API 29 — note it in the console's
comments if a reviewer asks.

### Why the registration number is "User IDs", not "Other info"

It identifies one student across sessions and is the join key for a result. The
raw number never reaches GA4 — the `reg` event parameter was removed in the
unreleased fix and only the hash rides along (`docs/ANALYTICS.md`, "Privacy
rules the code enforces"). It does reach our own API as a header and BEU's
portal as a query parameter, which is the app's core function.

### Why the guardian mobile counts as shared

It is not stored or logged by us, but it is sent to the college's attendance
service, which is a separate controller — not a processor acting for us. Play's
definition of sharing covers that. Declaring it is the safe and honest answer;
under-declaring is what gets apps pulled.

## 3. What the app does not have

No account, no advertising SDK, no crash-reporting SDK, no location, no
contacts, no camera, no microphone, no ad ID, and no access to your files
beyond one file you pick yourself for attendance import.

Two things are exceptions a reviewer may ask about, and both are local:

- **Campus Wi-Fi.** `src/features/tools/wifi-auto.ts` ships the campus's shared
  Omada account (`24105157049` / `123456`, editable on the screen) and the
  Android runner stores what you enter in app preferences so it can sign back in
  while the app is closed. It goes to the campus portal and nowhere else.
- **Storage permission.** `WRITE_EXTERNAL_STORAGE` is declared with
  `maxSdkVersion="28"` only, for devices older than API 29; it is not requested
  on any current Android.

## 4. Deletion, in practice

There is no account and no server-side profile, so deletion is:

1. **On the phone** — Settings → Storage → clear app data, or Android Settings →
   Apps → BEUConnect → Storage → Clear data. Removes profile, saved results,
   attendance, reminders, cached packs and the analytics queue.
2. **In our systems** — email `pritform@gmail.com` with the registration number.
   Removes the GA4 hash from future reporting, any feedback thread, the
   `corpus_rows` row for that number, and a row in a published table if one
   exists. Answered within 30 days.
3. **In GA4** — the hash cannot be deleted per-user from a GA4 property without
   User-ID deletion tooling; the honest answer is that the row stops being
   useful and the property's retention (14 months) expires it. Say this in the
   reply rather than promising an instant wipe.

## 5. Before every release

Run these and re-read §2 against the diff:

```sh
# the raw number must not appear in any analytics param
grep -rn '"reg"\|reg:' src/lib/analytics.ts src/lib/student-context.ts

# the forwarder must build its body from the JSON, never the headers
grep -rn "x-beu-reg" ../src/pages/api ../src/worker 2>/dev/null

# every outbound host is one the policy names
grep -rnE 'https://[a-z0-9.-]+' src/lib/net.ts src/features/tools/gecs.ts | sort -u

# the policy still names every one of them
grep -nE 'https://' ../src/pages/privacy.astro

# the corpus answers stay as they are: required, shared, and stated in one place
grep -n 'access-control-allow-origin' ../src/pages/api/corpus.ts
grep -n 'on by default' ../src/pages/terms.astro
```

A new host, a new event parameter carrying a string, or a new permission is a
Data safety change, not just a code change.

## 6. Open items

- **GA4 dimension `reg`** still exists in the property (Admin → Custom
  definitions). The sender is removed in the unreleased fix; the dimension must
  be deleted so no
  old values are joined into new reports. Historical values expire with the
  property's retention.
- **Privacy policy** — live since 2026-10-31:
  `https://beu.prit.eu.org/privacy/` returns 200, 46,538 bytes, canonical
  `https://beu.prit.eu.org/privacy/`, and the mail link resolves to the contact
  above. The footer links to it from every page. Re-check the URL after any
  deploy that touches `src/layouts/Layout.astro` or the page's frontmatter.
- **The listing's privacy field** takes the URL above, not the repository.
