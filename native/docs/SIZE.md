# APK size

The Android artifact is `.nsh/out/BEUConnect.apk`, built by
`scripts/package-android.sh` and measured by `scripts/size-report.sh`; every APK
number below can be reproduced with that script. The table is the 2026-11-13
build on nsh 0.5.0.

| | bytes | share |
|---|---|---|
| APK file | 24,143,932 | 100% |
| `lib/arm64-v8a/libnsh.so` (deflated) | 19,948,514 | 82.6% |
| `classes.dex` (deflated) | 3,093,741 | 12.8% |
| `assets/nsh/bundle.nshc` (deflated) | 705,206 | 2.9% |
| `holidays-2026.png` (deflated) | 87,237 | 0.4% |
| icons, font, manifest, `resources.arsc`, signature | 284,343 | 1.2% |
| zip directory + signing block | 24,891 | 0.1% |

Unpacked it is 59.67 MB (48.86 MB of that is the runtime), which is what a
device writes on install; downloading it takes ≈9.7 s at 20 Mbps.

The numbers are nsh 0.5.0's. The runtime doubled between 0.3.0 and 0.5.0 —
24.70 → 48.86 MB stripped, 11.06 → 19.95 MB deflated — while the app's own bytes
moved by 36 KB. That runtime is why the APK ceiling moved from 15.6 MB to 25.6 MB
(see [the floor](#the-floor-050-moved)); nothing in the app can recover it.

## Where the bytes go

The APK is **one 48.86 MB shared object plus ≈4 MB of app code**. `llvm-size -A`
on the shipped `libnsh.so` (stripped, exactly what is in the APK; 0.5.0
figures):

| section | bytes | why it is there |
|---|---|---|
| `.text` | 32,214,824 | the Rust/QuickJS engine and everything statically linked into it |
| `.rodata` | 5,247,804 | brotli's static dictionaries, strings and embedded defaults |
| `.eh_frame` + `.eh_frame_hdr` | 4,756,424 | unwinding metadata for every function in the binary |
| `.rela.dyn` | 2,333,736 | ~95k relocations from static linking |
| `.gcc_except_table` | 2,332,540 | C++ exception landing pads |
| `.data.rel.ro` | 1,912,208 | vtables, function tables, constants |
| everything else | 64,048 | symbols, notes, got/plt, section headers |

Under 0.3.0 the same table read `.text` 16,249,376, `.rodata` 3,201,020,
`.eh_frame` + `.eh_frame_hdr` 1,909,780, `.rela.dyn` 1,247,808,
`.gcc_except_table` 1,040,448, `.data.rel.ro` 1,022,768 — 0.5.0 grew every
section, so nothing can be recovered by trimming one feature of the app.

Stripping the unstripped 73.25 MB library removes 24.39 MB of `.symtab`/`.strtab`
— more than the app's own code weighs, which is why the runtime and not the app
is the thing to optimise.

## The packaging trick, in five lines

1. Keep one ABI (`arm64-v8a`): the universal APK ships arm64 **and** x86_64, doubling the runtime.
2. `llvm-strip --strip-unneeded libnsh.so`: 73.25 → 48.86 MB, symbol names are not needed at runtime.
3. Build the host from `android/AndroidManifest.xml`, which declares `android:extractNativeLibs="true"`. That is what permits the next step; the stock manifest's `false` keeps the library stored and the APK near 100 MB.
4. Re-zip with `zip -9` so the library is deflated: 48.86 → 19.95 MB; Android extracts it at install time instead of mmapping it out of the APK.
5. `zipalign -f 4` + `apksigner`: required to install, and `resources.arsc` stays stored and aligned because Android mmaps it.

`--strip-all` on top of step 2 saves 688 B and is not worth the risk; the
deflate step is where the megabytes are (2.45:1 on 0.5.0's library).

## What makes the APK grow

The runtime is a fixed prebuilt: a normal feature commit cannot change those
11.06 MB. **Only the bundle grows**, and it grows in compressed terms at roughly
the deflate ratio it already has — 2,236,157 B of bytecode became 683,802 B in
the APK, i.e. **≈3.3:1**:

```
Δ APK  ≈  Δ bundle bytecode / 3.3     (+1 MB of bytecode ≈ +310 KB of APK)
```

That ratio is not a constant: prose compresses better than code, so the same
bytecode compressed 3.7:1 before the data was packed and 3.3:1 after — treat a
code-only delta as ≈3:1. The ~2.2:1 ratio people quote is for the runtime
(24.70 MB → 11.06 MB, 2.23:1); that only applies if the runtime itself is
replaced.

That leaves exactly one way for this APK to grow: more app code, or data
embedded in it. Screen code is small — the release JS is 1.49 MB — but anything
pasted into `.tsx` (syllabus dumps, CSV rows, long copy) is compiled into the
bundle at ~1:1 raw and reaches the APK at the 3.3:1 above. Data belongs behind
the API on `beu.prit.eu.org`, cached at runtime by `src/lib/net.ts`: every 100 KB
of embedded text is ≈31 KB of APK, and a new release to fix a typo in it.

## Budget

| budget | limit | current | headroom |
|---|---|---|---|
| APK file | 25,600,000 B | 24,143,932 B (94.3%) | 1,456,068 B |
| bundle bytecode, as shipped | 2,350,000 B | 1,894,305 B (80.6%) | 455,695 B |

The APK ceiling moved to **25,600,000 B** on 2026-11-13 for nsh 0.5.0, because
the runtime's growth is not the app's to pay down:

- **APK 15,600,000 → 25,600,000 B.** `libnsh.so` went from 11,059,409 B deflated
  to 19,948,514 B (+8,889,105 B) when the runtime moved from 0.3.0 to 0.5.0; the
  APK delta is +8,925,184 B in total, so 36 KB is everything else (the reloaded
  Firebase dex, a bundle that is 1,334 B larger). The limit is the measured file
  plus ≈6% headroom for app code.
- **Bundle stays at 2,350,000 B.** The shipped bundle is 1,894,305 B and the
  source build is 1,894,305 B; the 0.5.0 prop migration changed no data.

Earlier ceilings moved on 2026-11-01, 2026-10-27 and before, and the reasons are
recordable bytes rather than drift:

- **APK 12,300,000 → 15,600,000 B.** `firebase-messaging` 26.0.1 plus its
  transitive Play Services, installations, datastore and protobuf code is
  `classes.dex`, now 3,051,587 B of the file; the delta is +3,075,333 B while
  `libnsh.so` stays at 11,059,409 B. The dex is not shrunk: the host links with
  d8 and no R8 rules, so every reachable class ships. R8 with a keep rule for
  Firebase's reflection-based init is the next real lever; it is deliberately
  not part of this release.

Both earlier ceilings moved on 2026-10-27 for v1.1.0, and the reasons are
recordable bytes rather than drift:

- **APK 12,000,000 → 12,300,000 B.** The scoped holiday calendar scan replaced
  the governor's-office sheet: the new PNG is BEU's own notice, is 1000×1415 and
  87,696 B, and since PNG is already compressed it stores at 87,237 B — about
  82 KB more than the old file. The rest of the 132,841 B delta is the release
  channel (share sheet, update check) and the adaptive launcher art.
- **Bundle 2,200,000 → 2,350,000 B.** The tree crossed 2.2 MB before this build
  (source growth from the Ask AI and notes work), so the old limit no longer
  described the app it was gating. 2.35 MB restores a ~5% margin.

The APK ceiling was itself raised from 10,000,000 B to 12,000,000 B earlier on
2026-10-27: the 0.3.0 runtime alone is 11,059,409 B deflated, so 10 MB was
unreachable by any app-side change (see the floor below). `size-report.sh`
exits 1 when either budget is exceeded; raise a limit only with a paragraph
like this one.

### The floor 0.5.0 moved

The runtime is an upstream prebuilt and 82.6% of the file. On 0.5.0 it deflates
to 19,948,514 B, so deleting every app byte would still leave a 23,438,726 B APK
(24,143,932 − 705,206); the 25.6 MB ceiling is that floor plus the app's ≈4.2 MB
and ≈6% headroom. The levers in the 0.3.0 table below still apply to packaging,
but none of them changes what 0.5.0's engine contains: it is 48.86 MB stripped
because upstream linked roughly twice the code, not because this app reaches more
of it.

Upstream's own explanation is issue
[longbridge/nsh#1853](https://github.com/longbridge/nsh/issues/1853), open on
2026-11-12: `nsh-platform-android`'s `features.default` still enables
`shader` (`wgpu`, naga), `term` (`vte`), `editor` (`ropey`, `imara-diff`),
`highlight` (`syntect`), `math` (`RaTeX` plus KaTeX fonts), `plot` and
`rich-editor`, so every Android app links desktop components it may never use.
The reporter measured a minimal app at a 49 MB `libnsh.so`, the same number this
app ships. There is no released build with those features trimmed; the fix is to
make them opt-in. Until that lands, a custom runtime is the only route, and it
belongs in `build-nsh-from-source.sh` (the F-Droid path), not in the app.

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

Getting under 10 MB therefore needs **nsh built from source** with the size flags
the prebuilt does not use: `panic=abort`, `-C force-unwind-tables=no`, a
`--gc-sections` build and no SVG/WebSocket/keygen paths. That is the only lever
left, and it needs the nsh Rust workspace, which is not on this machine — see
`docs/BUILD_SPEC.md` for the app side of the decision.

`size-report.sh` exits **1** when either budget is exceeded and prints which one. It
also builds the current tree (`nsh build App.tsx --release` into a temp dir) and
reports that bytecode against the same bundle budget, because the shipped APK can
lag the source. That check earned its keep on 2026-10-27: the bundle sat at
2,811,460 B of source bytecode while the APK on disk still carried 1,789,244 B,
and the gap was the syllabus packs — 895 KB of JSON string literals imported by
`src/features/syllabus/index.tsx`. [How the bundled data was packed](#what-the-bundled-data-costs)
is the record of that fix; the tree now builds at 1,767,224 B, so the next
package moves the shipped bundle from 2,236,157 B to ≈1.77 MB.

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

## What a custom runtime could save (the remaining option)

The runtime is 82.6% of the download, so it is the only lever with a large
payoff; the measurement below is 0.3.0's, and it says a build from the nsh Rust
workspace without code this app never reaches plausibly saves **13–18% of the
library**. On 0.3.0's 24.70 MB that was ≈3.2–4.4 MB; on 0.5.0's 48.86 MB it is
≈6.4–8.8 MB, i.e. ≈2.6–3.6 MB of APK at 2.45:1 — real, but not enough to undo a
runtime that grew by 24 MB. Evidence, measured on the 0.2.0/0.3.0 symbols
(0.5.0 keeps the same components at roughly twice the size): `.text` was
16.25 MB, and `llvm-nm --print-size --demangle` attributes ≈0.35 MiB to SVG (`usvg` 0.21, `resvg` 0.06, `svgtypes`,
`roxmltree`, `simplecss`) and 0.14 MiB to a WebSocket client plus syntax
highlighting (`syntect` 0.07, `tungstenite` 0.07) — the app imports only `nsh`
and `nsh/base`, uses `Canvas` (so the rasteriser stays), renders no SVG and opens
no socket beyond `fetch`; 0.30 MiB is the RSA/keygen path (`crypto-bigint` 0.24,
`rsa` 0.06, `crypto-primes`) that only `nsh keygen/certify` uses and the app
never calls; 0.64 MiB of `.rodata` is brotli's static dictionary, which shrinks
if only the decode half is linked; and `.eh_frame` + `.eh_frame_hdr` (1.82 MiB)
plus `.gcc_except_table` (0.99 MiB) are unwind metadata that `panic=abort` and
`-C force-unwind-tables=no` remove for most of the binary.

Claiming any of it needs nsh built from source. `nsh package` has no flag for a
runtime of your own and only the prebuilt runtime is on this machine, so this is
a project, not a build step — it needs the nsh Rust workspace, a cargo+NDK
Android cross-build, and a device to prove the result still runs.
