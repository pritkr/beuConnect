# Data safety — the Play form, answered from the code

Source of truth for **Play Console → App content → Data safety**. The form is
checked against this file, and this file is checked against the code. If a row
here disagrees with `src/lib/analytics.ts`, `src/lib/student-context.ts`,
`src/features/tools/gecs.ts` or `src/pages/api/feedback.ts`, the code wins and
this file is wrong.

- **Privacy policy URL** — `https://beu.prit.eu.org/privacy`
  (`src/pages/privacy.astro`, the same words the app links from Settings → About)
- **Data deletion contact** — `pritform@gmail.com`
- **Last reviewed** — 2026-10-31, tree at `1.2.4` + the unreleased `reg` fix

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
| Personal info → **User IDs** | Yes | No | Yes | App functionality, Analytics | `student-context.ts` `x-beu-reg` on our API; the 10-hex `student` hash to GA4 |
| Personal info → **Phone number** | Yes | **Yes** (attendance service) | Yes | App functionality | `features/tools/gecs.ts` sends the guardian mobile to the GECS Supabase project, then drops it |
| Personal info → **Other info** | Yes | No | Yes | App functionality | free-text feedback and the optional contact in `api/feedback.ts` |
| App activity → **Other actions** | Yes | No | Yes | Analytics | `lib/analytics.ts` screen and action events |
| Device or other IDs → **Device or other IDs** | Yes | No | Yes | Analytics | the random `client_id` in `lib/analytics.ts` |
| Everything else | **No** | — | — | — | see §3 |

Rows Play offers that must stay **No**: location, name, email address, address,
race and ethnicity, political or religious beliefs, sexual orientation,
financial info, health and fitness, messages, photos and videos, audio, files
and docs, calendar, contacts, web browsing, in-app search history (search sends
a word count), installed apps, crash logs (no SDK), and performance data.

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

No account, no password, no advertising SDK, no crash-reporting SDK, no
location, no contacts, no camera, no microphone, no file access, no ad ID. The
only permissions are the ones a screen visibly uses.

## 4. Deletion, in practice

There is no account and no server-side profile, so deletion is:

1. **On the phone** — Settings → Storage → clear app data, or Android Settings →
   Apps → BEUConnect → Storage → Clear data. Removes profile, saved results,
   attendance, reminders, cached packs and the analytics queue.
2. **In our systems** — email `pritform@gmail.com` with the registration number.
   Removes the GA4 hash from future reporting, any feedback thread, and a row in
   a published table if one exists. Answered within 30 days.
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
