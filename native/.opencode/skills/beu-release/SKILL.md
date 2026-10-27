---
name: BEU Release
description: "Ship the BEUConnect Android APK: check, slim arm64 package, size gate, signature verification, install, and screenshot QA. Use for release builds, version bumps, APK size regressions, install failures, or visual verification."
---

# BEU Release

One command from a clean tree to a verified artifact:

```sh
./scripts/release.sh
```

It runs, in order: `check.sh test` → `package-android.sh` → `size-report.sh
--record` → byte checks (`zipalign -c`, `apksigner verify`, `unzip -t`,
badging) → a copy at `dist/BEUConnect-<version>-arm64-v8a.apk` with its sha256.
`--skip-tests` exists for iteration; never for a release.

## Before a release

- `source ~/.config/nsh/env.sh` (JDK 21, SDK, NDK, adb).
- `adb devices` shows the target, if installing.
- `nsh.json` `version` and `build` are bumped. The More footer also prints the
  version; update it when the bump is more than a patch.
- No half-edited feature folders. `package-android.sh` refuses a tree that does
  not compile, but a compiling half-feature still ships.

## Build and install

```sh
./scripts/package-android.sh            # arm64-v8a → .nsh/out/BEUConnect.apk
./scripts/package-android.sh x86_64     # Intel emulator
./scripts/package-android.sh all        # universal, ~50 MB, testing only
INSTALL=1 ./scripts/package-android.sh  # build + adb install + launch
./scripts/android.sh shot               # screencap to /tmp/beuconnect.png
./scripts/android.sh log                # nsh + AndroidRuntime logcat
```

The Android host is BEUConnect's own (`build-android-host.sh`), not the stock
one: it registers `PdfPage` (PdfRenderer, native viewer) and the Ask AI share
component. Do not switch the release path back to plain `nsh package`.

## Size

```sh
./scripts/size-report.sh              # budgets + where the bytes went
./scripts/size-report.sh --record     # append to docs/size-history.json
./scripts/size-report.sh --no-build   # shipped APK only
```

The APK is one ABI, `llvm-strip`ped, deflated, aligned and signed. ~93% of the
download is the nsh runtime, so app-code/data trimming moves little; bundled
data is still the part you control. Do not restate the budget in new docs — the
numbers live in `scripts/size-report.sh`, `scripts/release.sh` and
`docs/SIZE.md`.

## Version

Two fields, one place: `nsh.json` `version` / `build`. The package id is
`org.beuconnect.app`; the activity is `com.longbridge.nsh.MainActivity`. Nothing
else hard-codes them, except the More footer's display string.

## Visual QA

```sh
./scripts/shots.sh                     # 20 screens, light, 390×844, ~4 min
./scripts/shots.sh --only rank,tools   # iterate
./scripts/shots.sh --scheme both       # light + dark
./scripts/shots.sh --width 320 --height 640 --offline
./scripts/shots.sh --list              # route table, nothing built
```

Output: `.nsh/shots/` + `manifest.txt`. Exit `2` means a route rendered
“No screen for …” — a registry/nav bug, not a styling nit. `docs/SHOTS.md` lists
what a good screenshot must show.

## When it fails

| Failure | Cause | Fix |
|---|---|---|
| `check.sh` red | type/test failure | fix the tree; never package red |
| `size-report` over budget | bundle/data growth | trim bundled data; `docs/SIZE.md` |
| `missing: … apksigner` | SDK/build-tools not on PATH | source `~/.config/nsh/env.sh` |
| `apksigner` no keystore | fresh machine | create `~/.android/debug.keystore` (docs/ANDROID.md) |
| install rejects APK | `extractNativeLibs` not flipped | the packaging script does it; check its log |
| blank screen after install | shipped from a mid-edit tree | re-run `./scripts/check.sh test`, repackage |
| PDF page blank | stock host instead of the custom host | use `package-android.sh` / `release.sh` |

## Signing

Debug builds use `~/.android/debug.keystore` (alias `androiddebugkey`). A store
release overrides `KEYSTORE`, `KEY_ALIAS`, `KEY_PASS`; never commit a keystore,
`.env`, `.dev.vars` or a token.
