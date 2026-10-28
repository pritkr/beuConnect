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
Srclib: `srclibs/nsh-vendor.yml`

**The build is unusual, and this is why.**

The interface is rendered by [NativeShell](https://github.com/longbridge/nsh)
(Apache-2.0), a Rust workspace with a small Java Android runtime. Upstream ships
it as a release tarball that its installer unpacks into `~/.nsh`; the app's own
build then uses `nsh` to bundle `App.tsx` and `nsh.aar` to compile the host.

Rather than depend on that tarball, `native/scripts/build-nsh-from-source.sh`
builds both from the `v0.3.0` tag: `cargo build -p nsh-cli`,
`cargo xtask android --release` for `libnsh.so` and the runtime classes, and the
same AAR `cargo xtask dist` would write. Everything it needs comes from the two
srclibs, the SDK/NDK and the Rust toolchain; nothing is prebuilt.

The app itself is not a Gradle project. `native/scripts/build-android-host.sh`
runs aapt2, javac, d8, zipalign and apksigner directly, which is why the recipe
has a single `build:` script and no `gradle:`.

**What the recipe needs that is not obvious**

* `nsh-vendor` — `nsh` has ~700 crate dependencies and the build has no network,
  so `srclibs/nsh-vendor` carries a `cargo vendor` tree plus the config stanza
  that points cargo at it. It is a separate repository because it is ~300 MB.
  It is regenerated with `cargo vendor --locked` and tagged with the nsh tag it
  belongs to.
* rustup in `sudo:` — Debian's `rustc` is 1.85 and `nsh` wants the current
  stable. The toolchain is installed to `/opt/rust` so the unprivileged build
  user can write its package cache.
* `timeout: 10800` — the Rust compile dominates, roughly 25-40 minutes on a fast
  machine and longer in the VM. It is not cached between versions.
* `AntiFeatures: NonFreeNet` — the results screen fetches from `beu-bih.ac.in`,
  which is not free software and has no alternative endpoint. Every other screen
  is offline.

**Testing**

The same `build:` script was run outside the build server, from a clean
`v0.3.0` checkout with `~/.nsh` moved aside, and produced a working APK with
`versionCode 3` whose signer and `versionName` match the metadata.

The upstream repository is <https://github.com/pritkr/beUConnect>, licensed
AGPL-3.0-or-later.
