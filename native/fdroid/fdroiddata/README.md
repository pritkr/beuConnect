# fdroiddata — the merge request for the main F-Droid repository

`metadata/org.beuconnect.app.yml` in this directory is the recipe for
<https://gitlab.com/fdroid/fdroiddata>. It is not the file that builds the
self-hosted repository — that one is `../metadata/org.beuconnect.app.yml`, and
it only carries a version and a signing key.

## What has to exist before the MR is opened

| Thing | Where | State |
|---|---|---|
| A tag whose tree builds unsigned | `github.com/pritkr/beUConnect` → `v1.1.1` | needs `build-nsh-from-source.sh` and `SIGN=0` in `build-android-host.sh` |
| Vendored nsh crates | `github.com/pritkr/nsh-vendor` | not created yet, see below |
| A green `fdroid build` | local, no build server needed | see below |

A recipe that has never built is rejected, so the MR waits on the third row.

## Running the recipe locally

`fdroid build` without `--server` runs the same `build:` script that the build
server runs, against the SDK on this machine. That is enough to prove the recipe
before it is proposed.

```sh
mkdir -p /tmp/fdroid-check && cd /tmp/fdroid-check
mkdir -p metadata srclibs
cp …/native/fdroid/fdroiddata/org.beuconnect.app.yml metadata/
cp …/native/fdroid/fdroiddata/srclibs/nsh-vendor.yml srclibs/

cat > config.yml <<'EOF'
sdk_path: ~/Library/Android/sdk
repo_url: https://example.invalid/fdroid/repo
repo_name: localcheck
EOF

fdroid build org.beuconnect.app -l --verbose
```

Point `srclibs/nsh-vendor.yml` at a local clone (`file:///…`) while the GitHub
repository does not exist yet.

What it cannot check: the `sudo:` packages, and whether the platform and NDK the
build server has match the ones here. `native/scripts/build-android-host.sh`
picks the newest platform it finds rather than pinning `android-36`, so a build
server that stops at 35 still builds.

## Regenerating the vendored crates

`nsh` pulls ~700 crates. The build server has no network, so they have to be in
the tree before `cargo` runs. The recipe copies a `vendor/` directory and
appends a `vendor.toml` into the nsh checkout's `.cargo/config.toml`.

```sh
git clone --depth 1 --branch v0.3.0 https://github.com/longbridge/nsh /tmp/nsh
cd /tmp/nsh
# Reads the local cargo cache once the tag has been built here at least once.
cargo vendor --locked vendor > /tmp/nsh-vendor/vendor.toml
```

`vendor.toml` holds the `[source.crates-io] replace-with` stanza `cargo vendor`
prints; nothing is hand-written. Commit both to `pritkr/nsh-vendor`, tag the
commit with the **nsh** tag it belongs to (`v0.3.0`), and bump
`srclibs: nsh-vendor@<tag>` only when the nsh tag moves.

`vendor/` is around 300 MB. That is why it is a separate srclib and not a
directory in the app repository.

## Opening the MR

```sh
git clone https://gitlab.com/<you>/fdroiddata && cd fdroiddata
git remote add upstream https://gitlab.com/fdroid/fdroiddata
git fetch upstream
git checkout -b org.beuconnect.app upstream/master

cp …/org.beuconnect.app.yml metadata/
cp …/srclibs/nsh-vendor.yml srclibs/
fdroid rewritemeta org.beuconnect.app
fdroid lint org.beuconnect.app

git add metadata/org.beuconnect.app.yml srclibs/nsh-vendor.yml
git commit -m "New app: BEUConnect"
git push origin org.beuconnect.app
```

The MR description is `MR.md`. Fill in `commit:` in the metadata with the tag's
commit hash first — a tag name is not accepted there.
