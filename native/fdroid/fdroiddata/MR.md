# Merge request text

Paste this into the fdroiddata MR. Keep it short; the metadata carries the
detail.

---

**New app: BEUConnect**

BEUConnect is the student app for Bihar Engineering University: the syllabus,
previous year papers, notes, notices, college rosters, results with rank, and an
offline planner/attendance tracker. Most screens read data bundled in the APK;
only the results screen uses the network, against BEU's own portal.

Metadata: `metadata/org.beuconnect.app.yml`
Srclib: `srclibs/nsh.yml`

**The build is unusual, and this is why.**

The interface is rendered by [NativeShell](https://github.com/longbridge/nsh)
(Apache-2.0), a Rust workspace with a small Java Android runtime. Upstream ships
it as a release tarball that its installer unpacks into `~/.nsh`; the app's own
build then uses `nsh` to bundle `App.tsx` and `nsh.aar` to compile the host.

Rather than depend on that tarball, `native/scripts/build-nsh-from-source.sh`
builds both from the `v0.3.0` tag: `cargo build -p nsh-cli`,
`cargo xtask android --release` for `libnsh.so` and the runtime classes, and the
same AAR `cargo xtask dist` would write. Everything it needs comes from the nsh
srclib, the SDK/NDK and the Rust toolchain; nothing is prebuilt.

The app itself is not a Gradle project. `native/scripts/build-android-host.sh`
runs aapt2, javac, d8, zipalign and apksigner directly, which is why the recipe
has a single `build:` script and no `gradle:`.

**What the recipe needs that is not obvious**

* srclib `nsh@v0.3.0` — the runtime is built from the upstream tag, not taken
  from the installer's tarball. `cargo fetch --locked` runs in `prebuild:`, so
  the ~700 crates land in `CARGO_HOME` outside the source tree and never reach
  the scanner.
* rustup in `sudo:` — Debian's `rustc` is 1.85 and `nsh` wants the current
  stable. The toolchain is installed to `/opt/rust` so the unprivileged build
  user can write its package cache, and `RUSTUP_TOOLCHAIN` is exported so
  rustup does not fetch a second, newer one mid-build.
* `timeout: 10800` — the Rust compile dominates, roughly 25-40 minutes on a fast
  machine and longer in the VM. It is not cached between versions.
* `AntiFeatures: NonFreeNet` — the results screen fetches from `beu-bih.ac.in`,
  which is not free software and has no alternative endpoint. Every other screen
  is offline.

**Testing**

`fdroid build org.beuconnect.app` (fdroidserver 2.4.5, no build server) rebuilt
it from the tag into `unsigned/org.beuconnect.app_4.apk`: 12,079,237 bytes,
unsigned, `versionCode 4`, `versionName 1.1.2`, arm64-v8a. The source scan ran
over the app tree and the whole nsh checkout and reported nothing. The same
script produces the signed releases at
<https://github.com/pritkr/beUConnect/releases>.

The upstream repository is <https://github.com/pritkr/beUConnect>, licensed
AGPL-3.0-or-later.
