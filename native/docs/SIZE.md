# APK size

The Android artifact is `.nsh/out/BEUConnect.apk`, built by
`scripts/package-android.sh` and measured by `scripts/size-report.sh`; every APK
number below can be reproduced with that script. The table is the 2026-11-18
build: nsh `v0.6.0` (`5541637`), the first tagged release with
`longbridge/nsh#2060`, cross-compiling the app's own `libnsh.so`.

| | bytes | share |
|---|---|---|
| APK file | 17,733,692 | 100% |
| `lib/arm64-v8a/libnsh.so` (deflated) | 13,486,129 | 76.0% |
| `classes.dex` (deflated) | 3,127,497 | 17.6% |
| `assets/nsh/bundle.nshc` (deflated) | 724,823 | 4.1% |
| `holidays-2026.png` (deflated) | 87,237 | 0.5% |
| icons, font, manifest, `resources.arsc`, signature | 284,338 | 1.6% |
| zip directory + signing block | 23,691 | 0.1% |

Unpacked it is 43.77 MB (32.85 MB of that is the runtime), which is what a
device writes on install; downloading it takes ≈7.1 s at 20 Mbps.

The runtime is no longer a fixed prebuilt. Since `longbridge/nsh#2060` — first
tagged in `v0.6.0` — `nsh package --target android` builds `libnsh.so` from the
features the bundle can reach, so this library is 32.85 MB stripped and 13.49 MB
deflated instead of 0.5.0's 48.86 / 19.95 MB. The same app on the 0.5.0 prebuilt
was 24,143,932 B, so the trim is worth 6,426,624 B (−26.6%). `v0.6.0`'s runtime
is 216,528 B larger deflated than the `main` commit first measured here
(`589a251`), because it carries the 196 commits merged between them. The ceiling
moved with the file (see [the 18.5 MB ceiling](#the-185-mb-ceiling)).

## Where the bytes go

The APK is **one 32.27 MB shared object plus ≈4 MB of app code**. `llvm-size -A`
on the shipped `libnsh.so` (stripped, exactly what is in the APK):

| section | bytes | why it is there |
|---|---|---|
| `.text` | 21,296,332 | the Rust/QuickJS engine and everything statically linked into it |
| `.rodata` | 3,549,260 | brotli's static dictionaries, strings and embedded defaults |
| `.eh_frame` + `.eh_frame_hdr` | 3,235,216 | unwinding metadata for every function in the binary |
| `.rela.dyn` | 1,709,784 | ~70k relocations from static linking |
| `.gcc_except_table` | 1,594,708 | C++ exception landing pads |
| `.data.rel.ro` | 1,404,024 | vtables, function tables, constants |
| everything else | 58,220 | symbols, notes, got/plt, section headers |

Every section shrank with the feature set, which is the point of the change:

| section | 0.5.0 prebuilt | this build | saved |
|---|---|---|---|
| `.text` | 32,214,824 | 21,296,332 | 10,918,492 |
| `.rodata` | 5,247,804 | 3,549,260 | 1,698,544 |
| `.eh_frame` + `.eh_frame_hdr` | 4,756,424 | 3,235,216 | 1,521,208 |
| `.rela.dyn` | 2,333,736 | 1,709,784 | 623,952 |
| `.gcc_except_table` | 2,332,540 | 1,594,708 | 737,832 |
| `.data.rel.ro` | 1,912,208 | 1,404,024 | 508,184 |
| **stripped library** | **48,861,584** | **32,847,544** | **16,014,040** |

Stripping still matters: the cargo artifact is 49,035,224 B and loses 16.19 MB
of `.symtab`/`.strtab` on the way into the APK. What changed is that the input
is now built for this app — `js`, `net`, `svg`, `highlight` and `math` stay,
`shader` (wgpu), `term`, `editor`, `rich-editor`, `plot`, `emoji-picker`, `zlib`,
`crypto`, `websocket` and `updater` do not. The detector prints that decision on
every package: `→ leave out `shader`: nothing reachable uses it`.

## The packaging trick, in five lines

1. Keep one ABI (`arm64-v8a`): the universal APK ships arm64 **and** x86_64, doubling the runtime.
2. `llvm-strip --strip-unneeded libnsh.so`: 56,017,848 → 32,266,536 B, symbol names are not needed at runtime.
3. Build the host from `android/AndroidManifest.xml`, which declares `android:extractNativeLibs="true"`. That is what permits the next step; the stock manifest's `false` keeps the library stored and the APK near 100 MB.
4. Re-zip with `zip -9` so the library is deflated: 32.27 → 13.27 MB; Android extracts it at install time instead of mmapping it out of the APK.
5. `zipalign -f 4` + `apksigner`: required to install, and `resources.arsc` stays stored and aligned because Android mmaps it.

`--strip-all` on top of step 2 saved 688 B on 0.3.0 and is not worth the risk;
the deflate step is where the megabytes are (2.43:1 on this library).

## What makes the APK grow

Two things, and they are no longer the same kind of thing.

**The runtime follows the bundle's imports.** It is built per package from the
feature list the detector prints, so the next `nsh/plot` or `nsh/editor` import
adds that feature's code to `libnsh.so`, not just a few KB of JS. The measured
feature set is 13.27 MB deflated; the full prebuilt was 19.95 MB. A feature costs
its own `.text`, `.rodata` and unwind tables, so treat a new native import as a
megabyte-scale decision and re-run `./scripts/size-report.sh`.

**The bundle grows with app code.** In compressed terms it grows at roughly the
deflate ratio it already has — 1,948,528 B of bytecode became 724,800 B in the
APK, i.e. **≈2.7:1**:

```
Δ APK  ≈  Δ bundle bytecode / 2.7     (+1 MB of bytecode ≈ +370 KB of APK)
```

That ratio is not a constant: prose compresses better than code, so the same
bytecode compressed 3.7:1 before the data was packed and 3.3:1 after — treat a
code-only delta as ≈3:1. The ~2.4:1 ratio above is for the runtime; that only
applies if the feature set changes.

That leaves one way for this APK to grow without a native import: more app code,
or data embedded in it. Screen code is small — the release JS is 1.49 MB — but
anything pasted into `.tsx` (syllabus dumps, CSV rows, long copy) is compiled into
the bundle at ~1:1 raw and reaches the APK at the 2.7:1 above. Data belongs behind
the API on `beu.prit.eu.org`, cached at runtime by `src/lib/net.ts`: every 100 KB
of embedded text is ≈37 KB of APK, and a new release to fix a typo in it.

## Budget

| budget | limit | current | headroom |
|---|---|---|---|
| APK file | 18,500,000 B | 17,733,692 B (95.9%) | 766,308 B |
| bundle bytecode, as shipped | 2,350,000 B | 1,948,630 B (82.9%) | 401,370 B |

The APK ceiling moved to **18,500,000 B** on 2026-11-15, with the trimmed
runtime:

- **APK 25,600,000 → 18,500,000 B.** The library built from this app's features is
  13,486,129 B deflated instead of 19,948,514 B; the APK moved from 24,143,932 B
  to 17,717,308 B (−6,426,624 B), and the limit is the measured file plus ≈4%
  headroom for app code. Keeping 25.6 MB would have let the app spend the
  runtime's savings unnoticed.
- **Bundle stays at 2,350,000 B.** The shipped bundle is 1,894,306 B, to the byte
  what the source build produces; no data changed.

Earlier ceilings:

- **APK 15,600,000 → 25,600,000 B on 2026-11-13.** `libnsh.so` went from
  11,059,409 B deflated to 19,948,514 B (+8,889,105 B) when the prebuilt runtime
  moved from 0.3.0 to 0.5.0; the APK delta is +8,925,184 B in total, so 36 KB is
  everything else (the reloaded Firebase dex, a bundle that is 1,334 B larger).
  That growth was upstream's, not the app's, which is why the trim exists.
- **APK 12,300,000 → 15,600,000 B on 2026-11-01.** `firebase-messaging` 26.0.1
  plus its transitive Play Services, installations, datastore and protobuf code
  is `classes.dex`, now 3,093,741 B of the file. The dex is still not shrunk: the
  host links with d8 and no R8 rules, so every reachable class ships. R8 with a
  keep rule for Firebase's reflection-based init is the largest app-side lever
  left — 17.7% of the file.
- **APK 12,000,000 → 12,300,000 B on 2026-10-27.** The scoped holiday calendar
  scan replaced the governor's-office sheet: the new PNG is BEU's own notice, is
  1000×1415 and 87,696 B, and since PNG is already compressed it stores at
  87,237 B — about 82 KB more than the old file. The rest of the 132,841 B delta
  is the release channel (share sheet, update check) and the adaptive launcher
  art.
- **Bundle 2,200,000 → 2,350,000 B on 2026-10-27.** The tree crossed 2.2 MB
  before that build (source growth from the Ask AI and notes work), so the old
  limit no longer described the app it was gating. 2.35 MB restores a ~5% margin.

The 10,000,000 → 12,000,000 B move on 2026-10-27 acknowledged the 0.3.0
runtime's floor (see below). `size-report.sh` exits 1 when either budget is
exceeded; raise a limit only with a paragraph like this one.

### The 18.5 MB ceiling

The library is still 76% of the file, so the floor is set by what the app
imports, not by what it renders. With this feature set (`js`, `net`, `svg`,
`highlight`, `math`) `libnsh.so` is 13,486,129 B deflated; everything else is
4,231,179 B: `classes.dex` 3.13 MB, the bundle 0.71 MB, resources and icons
0.38 MB.

`highlight` and `math` are the two features that would not obviously be there:
they are kept because `TextView` links `nsh_part_text_view`, which carries both.
Dropping them needs a runtime change upstream (a `TextView` without syntax
highlighting and maths), not an app change, and would be worth at most a few
hundred KB. `shader` was the expensive one — wgpu, naga and their generated
shader tables — and it is already out.

### The floor 0.5.0 moved

Recorded because it explains why this app stopped waiting for upstream. The
runtime was an upstream prebuilt and 82.6% of the file; on 0.5.0 it deflated to
19,948,514 B, so deleting every app byte would still have left a 23,438,726 B
APK (24,143,932 − 705,206). The 25.6 MB ceiling was that floor plus the app's
≈4.2 MB and ≈6% headroom. The levers in the 0.3.0 table below still apply to
packaging, but none of them changes what 0.5.0's engine contained: it was
48.86 MB stripped because upstream linked roughly twice the code, not because
this app reached more of it.

Upstream's own explanation was issue
[longbridge/nsh#1853](https://github.com/longbridge/nsh/issues/1853):
`nsh-platform-android`'s `features.default` still enabled
`shader` (`wgpu`, naga), `term` (`vte`), `editor` (`ropey`, `imara-diff`),
`highlight` (`syntect`), `math` (`RaTeX` plus KaTeX fonts), `plot` and
`rich-editor`, so every Android app linked desktop components it may never use.
The fix was [#2060](https://github.com/longbridge/nsh/pull/2060), which landed on
`main` on 2026-11-15, after 0.5.1: `nsh package --target android` now builds the
app's own library and prints which features it kept. That is what this APK uses.
A released tag including it does not exist yet, so the build needs `nsh` from
source — see `docs/ANDROID.md`.

### The floor 0.3.0 moved

The APK cannot reach 10 MB on nsh 0.3.0, whatever the app does — hence the 12 MB ceiling. Deleting the
whole bundle would still leave 11,296,933 B, and the runtime is one ABI already
(armv7 is not smaller enough to help: its library deflates to 10.31 MB, so that
APK lands at ≈11.1 MB too). The four things that were tried and measured:

| attempt | result |
|---|---|
| `llvm-strip --strip-all` instead of `--strip-unneeded` | −688 B |
| strip `.eh_frame`, `.eh_frame_hdr`, `.gcc_except_table` | −1.07 MB deflated, but it removes the unwind tables the runtime panics through: not shippable without on-device testing, and still 10.91 MB |
| `armeabi-v7a` instead of `arm64-v8a` | ≈11.1 MB, and 32-bit only |
| keep app code out of the bundle | 11.30 MB floor |

Getting under 10 MB therefore would have needed **nsh built from source** with the
size flags the prebuilt does not use: `panic=abort`, `-C force-unwind-tables=no`,
a `--gc-sections` build and no SVG/WebSocket/keygen paths. The route that shipped
on 2026-11-15 is narrower and supported upstream: keep the prebuilt runtime's
flags and drop only the features the bundle cannot reach (see
[the 18.5 MB ceiling](#the-185-mb-ceiling)).

`size-report.sh` exits **1** when either budget is exceeded and prints which one. It
also builds the current tree (`nsh build App.tsx --release` into a temp dir) and
reports that bytecode against the same bundle budget, because the shipped APK can
lag the source. That check earned its keep on 2026-10-27: the bundle sat at
2,811,460 B of source bytecode while the APK on disk still carried 1,789,244 B,
and the gap was the syllabus packs — 895 KB of JSON string literals imported by
`src/features/syllabus/index.tsx`. [How the bundled data was packed](#what-the-bundled-data-costs)
is the record of that fix; the tree builds at 1,894,306 B and the shipped bundle
is the same byte count.

Before a release:

```sh
./scripts/package-android.sh      # rebuild: arm64, stripped, deflated, aligned, signed
./scripts/size-report.sh          # report + gate (exit 1 = over budget)
./scripts/size-report.sh --record # once per release, to keep the delta meaningful
```

`--no-build` skips the `nsh build` step when only the artifact matters (CI, or a
machine without `nsh`); `APK=path` measures a different artifact, e.g.
`.nsh/out/BEUConnect-x86_64.apk`. Runs are recorded in `docs/size-history.json`
(oldest first) and the report always diffs against the last one:

```json
{ "at": "2026-10-25T21:52:23Z", "apkBytes": 9675514,
  "bundle": { "bytecodeBytes": 1789244, "compressedBytes": 371664 },
  "source": { "jsBytes": 1404555, "bytecodeBytes": 2551278 },
  "budgets": { "apk": 12000000, "bundle": 2200000 }, "pass": true }
```

`source.*` is `null` when the run used `--no-build`.

## What the bundled data costs

Two generated files carry the app's corpus: the syllabus snapshot and the PYQ
catalogue. Both shipped as one huge JSON string literal per branch, and both are
now indexed rather than spelled out. The 2026-10-27 change, measured with `wc -c`
on the committed files:

| file | before | after |
|---|---|---|
| `syllabus/data/packs.ts` | 1,024,162 B | 34,939 B |
| `syllabus/data/table/` (19 chunks + index) | — | 652,275 B |
| `syllabus/data/dict.ts` | — | 35,149 B |
| `syllabus/data/decode.ts` (hand-written) | — | 7,646 B |
| **syllabus data** | **1,024,162 B** | **730,009 B** |
| `pyqs/catalog-data.ts` | 221,336 B | 97,016 B |
| **both** | **1,245,498 B** | **827,025 B** |

Source bytes only tell part of it: the compiler folds each literal into one
atom, and an atom costs one byte per character when the text is Latin-1 and two
when any single character is above U+00FF. What matters is how many distinct
characters ship, and how wide each one is stored:

| stage | chars |
|---|---|
| prose as it shipped, one JSON literal per branch and paper | 916,384 |
| …deduped: one copy per distinct content or references block | 748,311 |
| …packed by the 2,004-phrase dictionary (2 ASCII chars per phrase) | 502,134 |
| …wide characters escaped (`\x00` + a printable, 1,014 uses) | 503,148 |
| records as delimited wire text (`\|` fields, `#` semester markers) | 32,416 |
| **shipped chars** | **535,564 (−41.6%)** |

Three levers, in order of what they saved: the phrase dictionary (−246,177
characters, ≈492 KB while the text was wide), the ASCII escape (−478,812 B
measured), and dedupe (−168,073 characters). That 1,014 characters bought almost
half of the bundle's total cut is the point: one character above U+00FF (an en
dash, a `➔`, a `𝜋`) turns the whole 48 KB chunk into UTF-16 and doubles it, so
the escape is worth 500 KB and the characters it replaces are nothing. Every
chunk now measures pure ASCII. Measured bundle effect, `./scripts/size-report.sh`:

| | before | after |
|---|---|---|
| release JS | 1,539,168 B | 1,510,723 B |
| bytecode | 2,811,460 B | 1,767,224 B |

The bundle fell by 1,044,236 B (−37%) even though other work grew the tree by
≈390 KB of JS in the same window, so the data accounts for more than the net
delta. The atom arithmetic says the same thing: 916,384 characters stored as
UTF-16 cost ≈1.83 MB, 535,564 stored one byte each cost ≈0.54 MB. The escape's
own run is separable: the record before it read 2,246,036 B of bytecode on
1,494,586 B of JS, and the tree then *grew* by 16 KB of JS while the bytecode
still fell 478,812 B — so the escape alone is worth at least that.

Both formats are documented in the source that implements them:
`src/features/syllabus/data/decode.ts`, `scripts/data/wire-lib.ts`, and the
header of `scripts/pack-pyq-catalog.mjs`. `scripts/data/verify-packs.ts` decodes
the packed file and compares 36 canonical hashes against
`scripts/data/packs-snapshot.json` (342 subjects, 562,562 content chars, 934
references, 30 papers, 299 sections), so a smaller file that lost a topic fails
the gate; the catalogue packer refuses to write unless its round-trip is exact.

### Rules for new bundled data

- **Generated, never hand-written.** A pipeline writes it, a `--check` mode
  proves it current, and a verifier proves it lossless.
- **No generated file past ~50 KB of literal text.** `build-packs.ts` chunks the
  shared table at 48,000 B so no file is an unreviewable blob. The one file over
  that line is `pyqs/catalog-data.ts` (97 KB), a single `JSON.parse` payload; it
  is the next candidate for the same chunking, and the gate reports it at every
  release.
- **No new dependency and no code splitting.** `native/` has no `package.json`,
  and QuickJS loads one bundle: a dynamic `import()` saves nothing and only
  hides the bytes from the gate.
- **Structure beats spelling.** Index repeated strings, drop keys the decoder
  can imply, chunk the remainder — in that order, since each step needs the one
  before it.
- **Keep generated literals pure ASCII.** One character above U+007E makes the
  compiler store that whole literal as UTF-16, so a single `➔` in a 48 KB chunk
  costs 48 KB. `build-packs.ts` escapes all 41 wide characters it meets for
  1,014 characters total; a new generator should do the same before it ships.
- **Data pays the gate.** `./scripts/size-report.sh` after any new bundled
  asset, and a paragraph here when a number moves.

## What the custom runtime saved

The runtime is 76% of the download, so it was the only lever with a large
payoff. It is now built per package from the app's reachable features, and the
measured result is **−6,426,624 B of APK (−26.6%)**, with a 32.85 MB stripped
library instead of 0.5.0's 48.86 MB. The 0.3.0-era estimate here guessed 13–18%
of the library; the real figure on 0.5.0's doubled engine was 34% of it, because
`shader` alone is wgpu, naga and generated shader tables, and
`term`/`editor`/`rich-editor`/`plot` bring their own heavy crates.

What the estimate got right: `.text` dominates (21.3 of 32.85 MB), and the unwind
metadata shrinks only in proportion to the code that leaves — 4.5 MB of
`.eh_frame` plus `.gcc_except_table` stays because the remaining C++ (QuickJS,
brotli, the rasteriser) still unwinds. Removing it wholesale is still not
shippable, and it is no longer where the weight is.

The same mechanism is the rule from now on: an import that reaches a feature the
app does not have yet adds it back. `./scripts/size-report.sh` is the gate for
that, and `nsh package` prints the feature list it chose on every build.
