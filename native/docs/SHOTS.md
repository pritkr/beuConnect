# Screenshots — macOS visual QA

One command produces a labelled set of the native app's screens, driven by the
real macOS host, so a review can check every route without clicking through the
app by hand.

```sh
cd native
./scripts/shots.sh            # 20 screens, light, 390×844
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
shot-09-rank.png            shot-19-feedback.png
shot-10-merit.png           shot-20-about.png
manifest.txt                logs/shots.log
```

`manifest.txt` is one row per file: `file  route  entry  scheme  viewport  bytes`.
Every PNG is the app window at 2×: **780×1688** for the default 390×844 frame.

A full run takes about **4 minutes** — each screen is a fresh app launch, and
each navigation step costs ~4 s while the host waits for the app to settle.
Use `--only` while iterating.

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
left running), `2` captured, but at least one route rendered “No screen for …”.

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
platform attached:

```sh
nsh test --target macos .nsh/shots/.plan/.shots.test.tsx
```

That generated file (written by the script, deleted afterwards) holds one
`test()` per screen, each with its own app and timeout:

```ts
const app = await open(APP, { width: 390, height: 844, network: "live" });
await app.setColorScheme("light");       // open({ colorScheme }) does NOT repaint the real host
await app.press("More");
await app.press("University rank");
await app.screenshot(`${OUT}/shot-09-rank.png`);  // writes the app window as PNG
```

Before any window opens, the script runs `nsh build App.tsx` as a preflight, so a
broken bundle fails in ~0.1 s with the real diagnostic instead of 20 cryptic
failures. If the bundle breaks *while* shooting (another agent saving a file),
the remaining screens fail fast and the script prints the same diagnostic and
exits 1.

Ad-hoc single shot, no script:

```sh
printf 'await app.setColorScheme("light")\nawait app.press("More")\nawait app.screenshot("/tmp/x.png")\n' \
  | nsh test --target macos App.tsx
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
- **`nsh test` hides build errors**: only `building App.tsx failed` with exit 1.
  `nsh build App.tsx` prints the OXC diagnostic (`[MISSING_EXPORT]`, file, line),
  which is what the preflight and the failure path show.
- **Hot reload races.** `nsh run` rebuilds on every save (*“✓ rebuilt App.tsx …
  1 device”*), and this repository is edited by several agents at once. Today
  `src/features/tools/index.tsx` and `src/features/results/*.tsx` were mid-write:
  the script reports the failing import and exits 1 instead of hanging, and the
  set is complete only once the tree builds.
- **Font warning noise.** Each launch prints `warn macOS: font family “System” is
  not available; using the system font`; the script filters it from the console
  and keeps the raw log at `.nsh/shots/logs/shots.log`.
- **GUI session required.** The host needs a logged-in window server; the
  `screencapture` fallback additionally needs Screen Recording permission for the
  terminal.
