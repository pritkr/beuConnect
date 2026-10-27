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
| 3 | `scripts/size-report.sh --no-build --record` | the APK is under **12,300,000 B**, and the run is appended to `docs/size-history.json` |
| 4 | verify | `zipalign -c`, `apksigner verify`, `unzip -t`, badging, package + version |
| 5 | ship | a copy at `dist/BEUConnect-<version>-arm64-v8a.apk` with its sha256, then the GitHub release |

`--skip-tests` skips step 1 for iteration; never for a release.

## What "verified" means here

The checks are byte-level, not visual, so a CI run and a laptop run agree:

- **zipalign `-c -p 4`** — every entry is 4-byte aligned; `resources.arsc` is
  page-aligned and stored, because Android mmaps it.
- **apksigner verify** — the signature chain is valid for the release keystore at
  `~/.config/beuconnect/beuconnect-release.jks` (alias `beuconnect`), sourced
  from `~/.config/beuconnect/signing.env`. Every published APK uses that key, so
  one build can replace another. A fork that generates its own key ships to a
  new install, never as an upgrade.
- **`unzip -t`** — no truncated entry, which a killed build produces.
- **badging** — the package is `org.beuconnect.app` and the version matches
  `nsh.json`.
- **size gate** — `size-report.sh` exits 1 over budget, and `release.sh` refuses
  to copy an artifact at or over the ceiling even if that check is bypassed.

## Bumping the version

Two fields, one place:

```json
{ "version": "1.2.0", "build": 3 }
```

`nsh.json` is the input for `versionName` / `versionCode`. The app's own
`APP_VERSION` / `APP_BUILD` live in `src/lib/app-info.ts`; the More footer and
the About screen read those, so `nsh.json` and `app-info.ts` are bumped together.

## When a step fails

| failure | cause | fix |
|---|---|---|
| `check.sh` red | a type error or a failing test | fix the tree; packaging a red tree is how a broken screen ships |
| `size-report.sh` over budget | bundle growth (the runtime is fixed) | `docs/SIZE.md` has the arithmetic; trim embedded data before screens |
| `apksigner` — no keystore | this machine has no release identity | restore `~/.config/beuconnect/` from the backup, or run `scripts/signing.sh` for a fork (new key = no upgrades) |
| `zipalign` missing | no build-tools | `sdkmanager "build-tools;36.1.0" "platforms;android-36"` |
| install rejects the APK | `extractNativeLibs` not flipped | `package-android.sh` does it; check its log line `android:extractNativeLibs=true` |

## Publishing the GitHub release

The public repository is `pritkr/beuconnect`; Releases is the store. The app's
update check and the share link both hard-code the newest APK:

```
https://github.com/pritkr/beuconnect/releases/latest/download/BEUConnect.apk
```

That URL only works while **the asset is named exactly `BEUConnect.apk`** and
the release is the newest non-draft, non-prerelease one. The working checkout's
own `origin` is the private `beuconnectaw`, so name the public repo explicitly:

```sh
gh release create v1.1.0 .nsh/out/BEUConnect.apk#BEUConnect.apk \
  -R pritkr/beuconnect --target main \
  --title "BEUConnect 1.1.0" --notes-file notes.md
```

Release notes are install instructions first: the APK is sideloaded, Android
asks for permission the first time, and a debug-signed install must be
uninstalled once because the signatures differ. Then check the two consumers on
a phone: **Settings → Check for updates** must say `Up to date` on the version
just released, and **Share BEUConnect** must open WhatsApp with the link.

```sh
adb install -r dist/BEUConnect-1.1.0-arm64-v8a.apk
```

First launch opens the one-step welcome: enter the registration number and the
name is resolved from BEU's published roster (no captcha, no password). The
captcha portal is only for the marks themselves; the app opens it from a failed
lookup and captures the result the student's own browser session returns.
