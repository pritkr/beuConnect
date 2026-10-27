# APK size

The Android artifact is `.nsh/out/BEUConnect.apk`, built by
`scripts/package-android.sh` and measured by `scripts/size-report.sh`; every APK
number below can be reproduced with that script. The table is the 2026-10-27
build.

| | bytes | share |
|---|---|---|
| APK file | 12,110,647 | 100% |
| `lib/arm64-v8a/libnsh.so` (deflated) | 11,059,409 | 91.3% |
| `assets/nsh/bundle.nshc` (deflated) | 683,809 | 5.6% |
| `classes.dex` (deflated) | 174,972 | 1.4% |
| `holidays-2026.png` (deflated) | 87,237 | 0.7% |
| icons, font, manifest, `resources.arsc`, signature | 88,207 | 0.7% |
| zip directory + signing block | 17,013 | 0.1% |

Unpacked it is 27.49 MB (24.70 MB of that is the runtime), which is what a
device writes on install; downloading it takes ≈4.8 s at 20 Mbps.

The numbers are nsh 0.3.0's. Under 0.2.0 the same app measured 9,675,514 B,
with a 19.85 MB runtime; 0.3.0's runtime is 24.70 MB stripped, and that alone is
why the APK needed a bigger ceiling than 10 MB (see [the floor](#the-floor-030-moved)).

## Where the bytes go

The APK is **one 24.70 MB shared object plus 2.5 MB of app code**. `llvm-size -A`
on the shipped `libnsh.so` (stripped, exactly what is in the APK; 0.3.0
figures):

| section | bytes | why it is there |
|---|---|---|
| `.text` | 16,249,376 | the Rust/QuickJS engine and everything statically linked into it |
| `.rodata` | 3,201,020 | 0.64 MB of that is brotli's static dictionaries, the rest strings and embedded defaults |
| `.eh_frame` + `.eh_frame_hdr` | 1,909,780 | unwinding metadata for every function in the binary |
| `.rela.dyn` | 1,247,808 | ~50k relocations from static linking |
| `.gcc_except_table` | 1,040,448 | C++ exception landing pads |
| `.data.rel.ro` | 1,022,768 | vtables, function tables, constants |
| everything else | 31,056 | symbols, notes, got/plt, section headers |

Under 0.2.0 the same table read `.text` 12,665,032, `.rodata` 2,996,740,
`.eh_frame` + `.eh_frame_hdr` 1,486,228, `.rela.dyn` 1,029,176,
`.gcc_except_table` 777,916, `.data.rel.ro` 865,520 — 0.3.0 grew every section,
so nothing can be recovered by trimming one feature of the app.

Stripping the unstripped 32.28 MB library removes 7.58 MB of `.symtab`/`.strtab`
— more than the app's own code weighs, which is why the runtime and not the app
is the thing to optimise.

## The packaging trick, in five lines

1. Keep one ABI (`arm64-v8a`): the universal APK ships arm64 **and** x86_64, doubling the runtime.
2. `llvm-strip --strip-unneeded libnsh.so`: 32.28 → 24.70 MB, symbol names are not needed at runtime.
3. Build the host from `android/AndroidManifest.xml`, which declares `android:extractNativeLibs="true"`. That is what permits the next step; the stock manifest's `false` keeps the library stored and the APK near 50 MB.
4. Re-zip with `zip -9` so the library is deflated: 24.70 → 11.06 MB; Android extracts it at install time instead of mmapping it out of the APK.
5. `zipalign -f 4` + `apksigner`: required to install, and `resources.arsc` stays stored and aligned because Android mmaps it.

`--strip-all` on top of step 2 saves 688 B and is not worth the risk; the
deflate step is where the megabytes are (2.23:1 on 0.3.0's library).

## What makes the APK grow

The runtime is a fixed prebuilt: a normal feature commit cannot change those
11.06 MB. **Only the bundle grows**, and it grows in compressed terms at roughly
the deflate ratio it already has — 2,532,802 B of bytecode became 684,969 B in
the APK, i.e. **≈3.7:1**:

```
Δ APK  ≈  Δ bundle bytecode / 3.7     (+1 MB of bytecode ≈ +270 KB of APK)
```

The ~2.2:1 ratio people quote is for the runtime (24.70 MB → 11.06 MB, 2.23:1);
that only applies if the runtime itself is replaced.

That leaves exactly one way for this APK to grow: more app code, or data
embedded in it. Screen code is small — the release JS is 1.48 MB — but anything
pasted into `.tsx` (syllabus dumps, CSV rows, long copy) is compiled into the
bundle at ~1:1 raw and reaches the APK at the 3.7:1 above. Data belongs behind
the API on `beu.prit.eu.org`, cached at runtime by `src/lib/net.ts`: every 100 KB
of embedded text is ≈27 KB of APK, and a new release to fix a typo in it.

## Budget

| budget | limit | current | headroom |
|---|---|---|---|
| APK file | 12,300,000 B | 12,110,647 B (98.5%) | 189,353 B |
| bundle bytecode, as shipped | 2,350,000 B | 2,236,159 B (95.2%) | 113,841 B |

Both ceilings moved on 2026-10-27 for v1.1.0, and the reasons are recordable
bytes rather than drift:

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
lag the source. That check already earned its keep: the syllabus packs used to be
895 KB of generated JSON string literals imported by
`src/features/syllabus/index.tsx`, which pushed the tree to ≈2.55 MB while the
APK on disk still carried 1.79 MB. They are now 34 KB of packed wires decoded by
`src/features/syllabus/data/decode.ts` (built by `scripts/data/build-packs.ts`,
verified by `scripts/data/verify-packs.ts`), and the tree builds at 2.00 MB.

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

## What a custom runtime could save (the remaining option)

The runtime is 92.3% of the download, so it is the only lever with a large
payoff; a build from the nsh Rust workspace without code this app never reaches
plausibly saves **13–18% of the library: ≈3.2–4.4 MB of 0.3.0's 24.70 MB, i.e.
≈1.4–2.0 MB of APK at 2.23:1** — which is roughly the 1.98 MB that stands between
11.98 and 10 MB, with little to spare. Evidence, measured on the 0.2.0 symbols and
unchanged in kind: `.text` is 16.25 MB, and `llvm-nm --print-size --demangle`
attributes ≈0.35 MiB to SVG (`usvg` 0.21, `resvg` 0.06, `svgtypes`,
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
