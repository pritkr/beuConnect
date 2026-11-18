# Android test plan

What a release candidate is walked through on real hardware, in the order a
student meets it. `docs/ANDROID.md` owns the toolchain (build, install, `adb`
and the four common failures); this file owns the **cases** and what counts as
evidence. The scoring lives in `docs/QA_RUBRIC.md` §8 and the defect ranking in
`docs/BLOCKERS.md`.

Run it when the APK moves: before a release, after anything touching
`src/app/**`, `src/lib/net.ts`, `nsh.json`, the Android host, or a WebView
screen. A copy-only change needs only §1, §4 and §7.

## 1. Devices

`minSdk 28` (Android 9), `targetSdk 36` (Android 16). Five slots cover the
range; the first three are mandatory for a release.

| Slot | Device / image | API | Why this one |
|---|---|---|---|
| **D1** | Small phone, 320 dp wide, 2 GB RAM (emulator `android-28` is acceptable for the floor) | 28 | The width and the API floor: old WebView, no system colour tokens, edge cases at 320 pt |
| **D2** | Pixel-class, 411 dp, 90 Hz | 34 | The reference device; what most students hold |
| **D3** | Pixel-class image with the latest platform | 36 | The target: edge-to-edge is enforced, predictive back is on, page-size and insets rules apply |
| **D4** | Tablet, 800 dp | 33 | `Body` max-width, two-pane lists, rotation |
| **D5** | Any device + `am send-trim-memory` | 34+ | Low-memory behaviour during a large table and a PDF |

The package is `org.beuconnect.app`; install with `adb install -r <apk>`
(`ANDROID.md` §3). The APK is arm64-only — an x86 emulator needs the arm64
image, not a translation layer.

## 2. Preconditions

1. Build from a clean tree: `./scripts/package-android.sh` after
   `./scripts/check.sh test` is green. Record `version` and `build` from
   `nsh.json` in the run note.
2. Reset once to reproduce a first install: `adb shell pm clear org.beuconnect.app`.
3. Network control: `adb shell cmd connectivity airplane-mode enable` and
   `... disable`; throttling on an emulator is `adb emu network speed edge`.
4. Font scale: `adb shell settings put system font_scale 1.3` (and `1.0`,
   `2.0`). `am force-stop` after changing it if the screen does not reflow.
5. Evidence: `adb exec-out screencap -p > <case>.png`, `adb logcat -d >
   <case>.log`, and `adb shell am start -W -n org.beuconnect.app/.MainActivity`
   for a cold-start number.
6. No invented data: a result lookup uses a registration number the tester
   actually owns or a published CSV row. Never paste a classmate's number.

## 3. Install and launch

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| I1 | `pm clear`, install the APK, launch | One-step welcome, no tabs, no invented name; the registration field is focused only after a tap | screen recording |
| I2 | Install over the previous APK (same key), launch | Update accepted; profile, saved subjects, cached result and More order survive | `dumpsys package org.beuconnect.app \| grep versionName` + screenshot |
| I3 | Cold start with a warm cache, `am start -W` | `TotalTime` under 3000 ms; no white flash before Home; no splash hang | `am start -W` output |
| I4 | `adb shell am kill org.beuconnect.app`, relaunch from Recents | Profile, theme, saved subjects, cached result and planner state restored; no error card | screenshot |

## 4. Navigation

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| N1 | More → every row → system back | Each row opens a real screen, back returns to More, the tab bar comes back; no "No screen for…" | walk note, one screenshot per unfamiliar screen |
| N2 | Enable predictive back, swipe from the edge on a child | The destination (More / tab root) is previewed; releasing lands there; cancelling stays | screen recording, API 36 |
| N3 | Switch tabs five times, open a child from each | Each tab lands on its own root; no stale child under a tab; re-pressing the active tab is a no-op | walk note |
| N4 | Back from a tab root | Exits the app, does not leave a blank page | screen recording |
| N5 | Open Results → portal, press back while the WebView is on BEU's page | Back pops the app's screen (not silently swallowed by the WebView) or is documented as the WebView's own history — record which | screenshot + note |

## 5. Layout, theme and text

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| L1 | 320 dp device, 1.0 scale, walk the five tabs and More | Nothing clipped, no horizontal scroll, every door visible | screenshots |
| L2 | Same, font scale 1.3 | Tab labels, buttons and list rows still fit; no ellipsis that hides a word | screenshots |
| L3 | Font scale 2.0 | Record what breaks; only clipping of decorative text is minor, a hidden action is major | screenshots |
| L4 | Appearance → Dark, walk Home, Syllabus, Results, Tools, Settings | Readable contrast, no white flash on relaunch, no hardcoded light surface | screenshots |
| L5 | Rotate on D2 and D4 with a list scrolled and a row expanded | The screen stays, scroll position survives (the manifest handles config changes in-process); if a screen cannot rotate, that is recorded, not assumed | screen recording |
| L6 | Open the longest subject name and the longest college name | Header truncates to one line; the body shows the full name | screenshot |
| L7 | Holidays month grid at 320 dp | Cells are narrow but readable; this is the accepted exception in `docs/A11Y_AUDIT.md` S4 | screenshot |
| L8 | Syllabus → a subject → Topics at 320 dp | Unit cards stack vertically, full width, one per row; each unit's topics sit beneath it — never a horizontal rail that runs off the screen | screenshot |

## 6. Offline and slow networks

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| O1 | Warm cache, airplane mode, cold start | Home, the last notices, the saved result and the notes shelf render; the screen says it is offline/cached rather than claiming new data | screenshots |
| O2 | Load Notices, enable airplane mode, pull to refresh | The copy stays on screen; the failure is a note with retry, not a blank page | screen recording |
| O3 | Throttle to `edge`, open a result and a paper | Loading state visible; no UI freeze; timeout produces the error state within the net layer's budget | screen recording |
| O4 | Fresh install, airplane mode | Every screen opens to an explanatory empty/error state; nothing crashes, nothing invents data | walk note |
| O5 | Download an offline pack, kill the network mid-download | The pack is either complete or absent; a retry works; storage accounting matches | screenshot of Settings → Offline data |

## 7. WebView surfaces

Only two things may be a WebView: BEU's result page (captcha) and a PDF
(`AGENTS.md` non-negotiable 8). Every host is in `nsh.json`.

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| W1 | Results → the portal link → BEU's page | The page loads; the Turnstile widget is visible; no host-blocked error | screenshot |
| W2 | Solve the captcha with a real registration number | The app captures the result, swaps to the native result view, and "Open in Results" carries it to rank/battle | screen recording |
| W3 | Wait 10 s without touching the captcha | The screen says the challenge did not load (the `nocaptcha` probe), not a silent spinner | screenshot |
| W4 | Open a notice PDF | Pages draw natively on Android; scrolling is continuous; back returns to the notice | screen recording |
| W5 | Open a PYQ/notes PDF | Same as W4; the file opens, not an external browser, unless the host is not allowlisted — then the screen says so | screenshot |
| W6 | Rotate and background/foreground inside W1 and W4 | The WebView/PDF restores; no blank white card | screen recording |

`ANDROID.md` §4.4 is the first stop when W1 says "The BEU page did not load."

## 8. Accessibility and input

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| A1 | TalkBack on Home, then a long list | Every actionable row is announced with its label and role, in reading order; no unlabelled icon button | screen recording + note |
| A2 | TalkBack at font 1.3 | Announcements do not overlap or truncate mid-word | screen recording |
| A3 | Thumb-test the More chevrons, chips, the tab bar and the result actions | Each target is at least 44 × 44 pt; no dead 24 pt target | note |
| A4 | Keyboard: focus the registration field at the bottom of Results, then the feedback message box and its optional registration/contact fields | The keyboard opens over the tab bar (never under it); the field stays visible; back closes the keyboard before it pops the screen. The feedback sheet stays above the keyboard, its handle and title stay on screen, and the taller form scrolls under them | screen recording |

## 9. Performance and stability

| ID | Steps | Expected | Evidence |
|---|---|---|---|
| P1 | Ten-minute walk: every tab, every More row, a PDF, a result | No ANR, no crash, no jank that drops a tap; `logcat` has no `ANR in org.beuconnect.app` | `adb logcat -d` |
| P2 | Open the largest result table, fling to the end, open a student, back | The list stays responsive during CSV parse; scroll position and expansion survive back | screen recording |
| P3 | `am send-trim-memory <pid> RUNNING_CRITICAL` while a PDF is open, then return | No OOM kill; the screen either keeps the page or reloads it with a visible state | `logcat` + screenshot |
| P4 | Background the app for 30 minutes, return | State restored; no duplicated stack entries | screenshot |

## 10. Recording the run

For each case write `pass`, `fail` or `untested` — never leave a case implied.
A failure names the case id, the device slot, the build, and the observed text
or screenshot, then goes into `docs/BLOCKERS.md` at the severity the rubric
defines. A case that could not be run (no real registration number, no captcha
that day) is `untested`, and the release note says so.

Release is blocked when any case in §3, §4, §7 or §9 fails, or when a §5/§6/§8
failure hides an action. Everything else can ship as a listed minor.
