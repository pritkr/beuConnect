# fdroiddata — the merge request for the main F-Droid repository

`metadata/org.beuconnect.app.yml` in this directory is the recipe for
<https://gitlab.com/fdroid/fdroiddata>. It is not the file that builds the
self-hosted repository — that one is `../metadata/org.beuconnect.app.yml`, and
it only carries a version and a signing key.

## What has to exist before the MR is opened

| Thing | Where | State |
|---|---|---|
| A tag whose tree builds unsigned | `github.com/pritkr/beUConnect` → `v1.1.2` | needs `build-nsh-from-source.sh`, `SIGN=0` and no `bun` in the build path |
| A green `fdroid build` | local, no build server needed | see below |

A recipe that has never built is rejected, so the MR waits on the second row.

## Running the recipe locally

`fdroid build` without `--server` runs the same `sudo:`-less `build:` script that
the build server runs, against the SDK on this machine, and writes the unsigned
APK to `unsigned/`. That is enough to prove the recipe before it is proposed.

```sh
mkdir -p /tmp/fdroid-check && cd /tmp/fdroid-check
mkdir -p metadata
cp …/native/fdroid/fdroiddata/org.beuconnect.app.yml metadata/

cat > config.yml <<'EOF'
sdk_path: /Users/you/Library/Android/sdk
ndk_paths:
  28.2.13676358: /Users/you/Library/Android/sdk/ndk/28.2.13676358
repo_url: https://example.invalid/fdroid/repo
repo_name: localcheck
EOF

fdroid build -l --verbose org.beuconnect.app
```

The `ndk_paths` key must be the version string the recipe asks for — `fdroid`
matches on it, and an empty match fails the build before anything compiles. On
the build server that mapping comes from the server's own config.

Point `srclibs/nsh.yml`… there is no srclib file for `nsh`: `srclibs: nsh@v0.3.0`
uses fdroiddata's main repository, so a local run clones
`https://github.com/longbridge/nsh` at that tag, which takes a few minutes.

What it cannot check: the `sudo:` packages, the JDK the server carries, and
whether its SDK has `platforms/android-36` (nsh compiles its Java runtime against
it). `native/scripts/build-android-host.sh` picks the newest platform it finds
rather than pinning one, so the APK side is tolerant; `cargo xtask android` is
not.

## Opening the MR

```sh
git clone https://gitlab.com/<you>/fdroiddata && cd fdroiddata
git remote add upstream https://gitlab.com/fdroid/fdroiddata
git fetch upstream
git checkout -b org.beuconnect.app upstream/master

cp …/org.beuconnect.app.yml metadata/
fdroid rewritemeta org.beuconnect.app
fdroid lint org.beuconnect.app

git add metadata/org.beuconnect.app.yml
git commit -m "New app: BEUConnect"
git push origin org.beuconnect.app
```

The MR description is `MR.md`. Fill in `commit:` in the metadata with the tag's
commit hash first — a tag name is not accepted there.
