# BEUConnect

The fastest way to be a BEU student: syllabus split into topics, previous-year
papers, results that render properly, rank, merit, calculators, attendance,
routine and notices. Free, no account, no ads, and it works offline.

Two halves, one repository:

| Path | What it is |
|---|---|
| `native/` | The Android app — NativeShell TSX on real platform views, not a WebView shell |
| `src/` | The Astro site behind [beu.prit.eu.org](https://beu.prit.eu.org), including its result API |

## Download

**[BEUConnect.apk](https://github.com/pritkr/beuconnect/releases/latest/download/BEUConnect.apk)**

Android will ask you to allow installs from your browser or WhatsApp the first
time. The link always serves the newest release, and the app itself checks for
updates: **Settings → Check for updates**.

Requirements: Android 8 or newer, arm64 phone.

## Build it

The site:

```sh
bun install
bun dev          # localhost:4321
bun run build    # production build
```

The app:

```sh
source ~/.config/nsh/env.sh   # NativeShell, JDK, Android SDK
cd native
nsh run App.tsx               # live dev loop
./scripts/check.sh test       # lint, types, build, suite
./scripts/package-android.sh  # arm64 APK in .nsh/out
```

NativeShell is required for the app; `native/docs/ANDROID.md` covers the host,
signing and install. Start with `native/docs/ARCHITECTURE.md` for the route
table, `native/docs/OFFLINE.md` for what works without a connection, and
`native/docs/SIZE.md` for what moves the APK's 12 MB.

## What is not in this repository

The shipped app carries GEC Sheikhpura's student register so that browsing works
offline. **That register, the college result tables, guardian contact data and
the scraped paper archive are personal or third-party data and are not
published here.** The modules that read them are stubbed or absent:

- `native/src/features/students/roster-data.ts` is a stub — the roster screens
  compile and show an empty state.
- `native/assets/data/students-gecs.json`, `public/data/`, `beu_dataset/`,
  `guardianno/` and the PDF corpora are excluded.

The live app still has every feature: the published APK ships the register, and
results, notices and papers come from the site API at runtime. A clone of this
repository builds, but its roster screens start empty until you supply the data.

## Privacy

No account, no analytics, no advertising, no tracking SDK. Profile, saved
results, read marks and attendance stay in the device's storage. The app talks
only to `beu.prit.eu.org` (its own API) and `beu-bih.ac.in` (the official result
portal, opened only when you solve its captcha yourself). Feedback is sent only
when you tap Send feedback.

## License

[GNU Affero General Public License v3.0](LICENSE). You may use, change and share
this code; if you run a modified version as a network service, section 13
requires you to offer its source to the people using it.

Icons: [Boxicons](https://boxicons.com), MIT. University notices, papers and
result data belong to Bihar Engineering University.

Not an official BEU app. Made by students, for students.
