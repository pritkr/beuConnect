# Screenshots — macOS visual QA

One command produces a labelled set of the native app's screens, driven by the
real macOS host, so a review can check every route without clicking through the
app by hand.

```sh
cd native
./scripts/shots.sh            # 21 screens, light, 390×844
```

Output lands in `.nsh/shots/` (gitignored):

```
shot-01-home.png            shot-11-battle.png
shot-02-syllabus.png        shot-12-attendance.png
shot-03-results.png         shot-13-routine.png
shot-04-tools.png           shot-14-holidays.png
shot-05-more.png            shot-15-data.png
shot-06-pyqs.png            shot-16-wifi.png
shot-07-notices.png         shot-17-profile.png
shot-08-calculator.png      shot-18-settings.png
shot-09-rank.png            shot-19-notifications.png
shot-10-merit.png           shot-20-feedback.png
                            shot-21-about.png
manifest.txt                logs/shots.log
```

`manifest.txt` is one row per file — `file  route  entry  scheme  viewport  bytes`
— and always describes the run that just finished. A numbered file from an older
route table (a label since renamed) can sit beside the current set in the same
gitignored folder.
Every PNG is the app window at 2×: **780×1688** for the default 390×844 frame.

A full run takes **2–5 minutes**: ≈5 s per screen on a quiet machine (a fresh
app launch, plus ~1 s per navigation press), and longer when another agent holds
the shared `.nsh` lock. Use `--only` while iterating.

The first-run intro is skipped: the script seeds `beu.onboarding`
(`{"done":true}`), the flag `src/app/shell.tsx` gates on. Without it every tab
press misses, because the app opens on “Open BEUConnect”.

## Options

| Command | What it does |
| --- | --- |
| `./scripts/shots.sh` | full set, light, 390×844 |
| `./scripts/shots.sh --only rank` | one screen (label or route name, comma separated: `--only home,tools`) |
| `./scripts/shots.sh --scheme both` | light **and** dark, dark files get `-dark` |
| `./scripts/shots.sh --dark` | dark only |
| `./scripts/shots.sh --width 320 --height 640` | narrow pass, files get `-320` |
| `./scripts/shots.sh --offline` | no live network, so every screen shows its empty/error state |
| `./scripts/shots.sh --mode run` | fallback host: `nsh run` + `screencapture`, **home only** |
| `./scripts/shots.sh --list` | the route table and its file numbers, nothing is built |

Exit codes: `0` every screen captured, `1` build/run/capture failure (nothing is
left running), `2` captured, but with a warning: a route rendered “No screen
for …”, or two routes produced pixel-identical files (a press landed on the
wrong row while the host was busy — rerun those with `--only`).

## What a good screenshot looks like

Check these in order; they are the things that broke while building this app.

1. **Header** — the app-drawn bar (macOS has no system header): dot + title,
   48 pt tall, hairline bottom border. A title that reads “Not found”, or a
   second title bar, means a registry/nav bug, not a styling nit.
2. **Tab bar** — the floating bar must sit clear of the window's bottom edge
   with all five labels readable at 10 pt. The **Tools** mark (four squares) is
   the tight one: at 390 pt it can collide with its label — if it does, that is a
   real hit-area/layout bug in `src/app/tabbar.tsx`, not a screenshot artefact.
3. **Safe area** — nothing hides under the tab bar; the last card is reachable;
   content starts below the header (no doubled top padding on macOS, where the
   inset is 0).
4. **Width** — compare 390 and `--width 320`: no clipped card edges, no
   truncated titles, quick actions stay two columns, long More entries wrap
   instead of ellipsing.
5. **Dark** — `--scheme both`: card vs background contrast, borders visible,
   muted body text still legible, the orange primary not muddy on `#0E0C0A`.
6. **Content** — real data or an honest empty state. Not `Booting`, not
   `No screen for “…”`, not a red error string, not an “In progress”
   placeholder where a shipped module should be. The home notice carousel can
   sit at `1 / 8` or `2 / 8` between runs; that is the timer, not a bug.

Screenshots use the live network (`--offline` to opt out), so a screen that is
still spinning is worth a rerun: `./scripts/shots.sh --only notices`.

## Adding a route

The table at the top of `scripts/shots.sh` is the single source of truth:

```sh
SHOTS=(
  "home|home|"                                       # label | route | presses
  "rank|results.rank|More;University rank"
)
```

- **label** — file name and filter name (`shot-09-rank.png`).
- **route** — the name in `src/app/registry.tsx`, printed in the manifest.
- **presses** — accessibility labels pressed in order. Tab roots are one press,
  More children are `More;<entry label>`. Empty means the app opens there.

Append the line in screen order, then check it:

```sh
./scripts/shots.sh --list
./scripts/shots.sh --only my-label
```

Numbering follows the table, so inserting a line renumbers the files after it.
Screens that need params (`syllabus.subject`, `notices.detail`) are not in the
set: the shell cannot deep-link, so there is no way to press your way to a
specific param without building a fixture. Drive one manually when needed (see
below) or add a route that accepts defaults.

## How it works, and why

`nsh run` cannot be driven. Its whole flag set is `--port`, `--release`,
`--limits`, `--trace`, `--fps`, `--target`, `--device`, `--name`,
`--window-size`: no steps, no deep link, no route argument. The shell also has no
deep-link support — it always starts at `home` and keeps routes in a JS stack.

The only programmatic route into the host is the test runner, with the real
platform attached, one screen per run:

```sh
./scripts/check.sh test-only --target macos .nsh/shots/.plan/.shots.test.tsx
```

The plan is rewritten before each screen, so it holds exactly one `test()` for
the screen being shot, with its own app and timeout:

```ts
const app = await open(APP, { width: 390, height: 844, network: "live", storage: SEED });
await app.setColorScheme("light");       // open({ colorScheme }) does NOT repaint the real host
await app.press("More");
await app.press("University rank");
await app.screenshot(`${OUT}/shot-09-rank.png`);  // writes the app window as PNG
```

One process per screen, not one for the whole set, for three reasons: progress
is visible as it goes, a wedged host cannot take the remaining screens down,
and every `nsh` call must go through `scripts/check.sh`, which serialises the
shared `.nsh` build cache with a lock (parallel agents build the same tree). The
lock wait is counted in `SHOTS_SCREEN_TIMEOUT` (300 s per screen); the screen's
own test gets `SHOTS_TEST_TIMEOUT` (40 s).

A screen that produces no PNG is logged with its real diagnostic (file, symbol,
line — for example `<Presets> names nothing in scope` in
`src/features/tools/calculator.tsx`) and collected into one **retry pass** at the
end. A *compile* error stops the pass immediately and queues the remaining
screens: every one of them would print the same error. A module saved mid-write
is usually settled a few seconds later, so the retry is what makes a sweep
survive a repo that several agents are editing at once; a screen that still has
no PNG after the retry fails the run with exit 1 and the hint to rerun when
`./scripts/check.sh` passes.

Ad-hoc single shot, no script (still through the lock wrapper; stdin runs get
one 30 s budget, so this is one screen only):

```sh
printf 'await app.setColorScheme("light")\nawait app.press("More")\nawait app.screenshot("/tmp/x.png")\n' \
  | ./scripts/check.sh test-only --target macos App.tsx
```

## Limitations found on this machine

These are measured, not guessed — they shape the script.

- **No in-app capture API.** `.nsh/types/nsh/*` has no screenshot/window-capture
  call. The only one is `App.screenshot()` from `nsh/test`, and it needs a real
  platform: headless runs fail with *“a screenshot needs a real platform, which
  draws the app: run the test with `--target`”*.
- **`nsh run` windows are invisible to automation.** No steps, no API to read
  the view tree, no route injection. `--mode run` therefore captures **home
  only** via `screencapture -x -o -l <windowid>`.
- **Window discovery needs Swift.** PyObjC is not installed (`import Quartz`
  fails) and a JXA `CGWindowListCopyWindowInfo` + `ObjC.deepUnwrap` returns no
  usable array; `swift` (Xcode CLT) reading `CGWindowListCopyWindowInfo` works.
  The dev host's owner is `nsh-macos-host`; the window title is `nsh.json`'s
  `name` (`BEUConnect`).
- **A busy host can move the list under the tap.** While another agent's
  `nsh test` held the lock, two routes came out **byte-identical** (rank and
  Routine twice), which no pair of screens should. The script hashes every PNG,
  prints the pair, re-shoots a file identical to an earlier screen, and exits 2
  if it happens again; rerun that label with `--only rank`.
- **Every host window is titled `BEUConnect`.** Dev hosts (`nsh run`) and test
  hosts share the title, so with another one on screen a capture cannot be
  proven to be this run’s window. The script warns when another `nsh run` /
  `nsh test` is alive before it starts; for a set that has to be trusted, close
  other hosts and do not run two sweeps at once.
- **`screencapture` includes chrome.** For `--window-size 390x844` the window is
  390×872, so a `-l` capture is 780×1744 with the title bar. The test runner's
  screenshot is exactly the 390×844 content, hence the default mode.
- **One app per stdin step run.** `nsh test App.tsx` with steps on stdin works,
  but the whole run has a single 30 s budget and `dispose()` ends the host
  (*“the host left”*), so it cannot loop over screens.
- **Test files must live inside the app.** `nsh test /tmp/x.test.tsx` fails with
  *“no app around it (an App.tsx or nsh.json)”*; `open()` paths resolve relative
  to the test file (absolute paths also work). `.nsh/**` is not discovered by
  `nsh test .`, so the generated plan only runs when named explicitly. A file
  not ending in `.test.tsx` is treated as an app entry, not a test file.
- **Timeouts are milliseconds.** `test(name, body, timeout)` defaults to 30 000;
  `40` means 40 ms, not 40 s. The script passes seconds × 1000.
- **`open({ colorScheme })` is not the host appearance.** It changes what the
  app reads, not how macOS paints; `app.setColorScheme()` is required.
- **Build errors are only readable in file mode.** A test *file* prints the full
  OXC diagnostic (`[MISSING_EXPORT]`, file, line, snippet) when `open(APP)`
  fails; stdin entry mode prints only `building App.tsx failed`.
- **The tree is edited while you shoot.** Several agents share this checkout and
  `nsh` rebuilds on every save. A module saved mid-write (`tools/index.tsx`,
  `results/rank.tsx`, `notices/api.ts` all were on 2026-10-28) fails that screen
  with the real compile error — never a hang — and the retry pass picks it up
  once the file settles. If it is still broken, the run exits 1.
- **Font warning noise.** Each launch prints `warn macOS: font family “System” is
  not available; using the system font`; the script filters it from the console
  and keeps the raw log at `.nsh/shots/logs/shots.log`.
- **GUI session required.** The host needs a logged-in window server; the
  `screencapture` fallback additionally needs Screen Recording permission for the
  terminal.
