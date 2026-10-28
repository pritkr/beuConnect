# F-Droid metadata (self-hosted repository)

`metadata/org.beuconnect.app.yml` is the app metadata `fdroid update` reads when
`scripts/publish-fdroid.sh` builds the repository served at
<https://pritkr.github.io/beuconnect-fdroid/repo>.

| Field | Why it matters |
|---|---|
| `AllowedAPKSigningKeys` | The publish script refuses an APK whose signer is not this SHA-256. |
| `ArchivePolicy: 0 versions` | One APK in the repo; older builds are not kept. |
| `UpdateCheckMode: None` | Versions are published by the script, never guessed from tags. |
| `Summary` | Shared with the fastlane listing; keep both in sync. |

Edit the listing copy in `fastlane/metadata/android/en-US/` — that is the single
source for the store text, and the publish script copies its graphics into the
repository.

This is **not** an fdroiddata submission. The recipe for the main F-Droid
repository is in `fdroiddata/`, and `docs/FDROID.md` §5 explains what it needs.
