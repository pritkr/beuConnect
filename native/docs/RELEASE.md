# Release

One command from a clean tree to a signed, verified Android artifact:

```sh
./scripts/release.sh
```

It is five existing steps in the order that makes a failure meaningful, so
nothing here needs its own logic:

| step | script | what it proves |
|---|---|---|
| 1 | `scripts/check.sh test` | types, bundle and all tests pass on one lock (no two builds race) |
| 2 | `scripts/package-android.sh` | arm64 only, `llvm-strip`, deflated runtime, `extractNativeLibs`, aligned, signed |
| 3 | `scripts/size-report.sh --no-build --record` | the APK is under **10,000,000 B**, and the run is appended to `docs/size-history.json` |
| 4 | verify | `zipalign -c`, `apksigner verify`, `unzip -t`, badging, package + version |
| 5 | ship | a copy at `dist/BEUConnect-<version>-arm64-v8a.apk` with its sha256 |

`--skip-tests` skips step 1 for iteration; never for a release.

## What "verified" means here

The checks are byte-level, not visual, so a CI run and a laptop run agree:

- **zipalign `-c -p 4`** — every entry is 4-byte aligned; `resources.arsc` is
  page-aligned and stored, because Android mmaps it.
- **apksigner verify** — the signature chain is valid for the debug keystore on
  this machine (`~/.android/debug.keystore`, alias `androiddebugkey`). A store
  release passes `--keystore` to `package-android.sh` instead.
- **`unzip -t`** — no truncated entry, which a killed build produces.
- **badging** — the package is `org.beuconnect.app` and the version matches
  `nsh.json`.
- **size gate** — `size-report.sh` exits 1 over budget, and `release.sh` refuses
  to copy an artifact at or over the ceiling even if that check is bypassed.

## Bumping the version

Two fields, one place:

```json
{ "version": "1.1.0", "build": 2 }
```

`nsh.json` is the input for `versionName` / `versionCode`; nothing else in the
app hard-codes a version except the More footer, which reads `v1.0.0` from the
markup — update that line when you bump more than the patch.

## When a step fails

| failure | cause | fix |
|---|---|---|
| `check.sh` red | a type error or a failing test | fix the tree; packaging a red tree is how a broken screen ships |
| `size-report.sh` over budget | bundle growth (the runtime is fixed) | `docs/SIZE.md` has the arithmetic; trim embedded data before screens |
| `apksigner` — no keystore | fresh machine | `keytool -genkeypair -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" -validity 10000` |
| `zipalign` missing | no build-tools | `sdkmanager "build-tools;35.0.1"` |
| install rejects the APK | `extractNativeLibs` not flipped | `package-android.sh` does it; check its log line `android:extractNativeLibs=true` |

## Installing

```sh
adb install -r dist/BEUConnect-1.0.0-arm64-v8a.apk
```

First launch opens the one-step welcome: enter the registration number and the
name is resolved from BEU's published roster (no captcha, no password). The
captcha portal is only for the marks themselves; the app opens it from a failed
lookup and captures the result the student's own browser session returns.
