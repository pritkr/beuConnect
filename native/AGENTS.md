# Native app (NSH)

## Principles

- **Cut taglines, helper text and secondary labels.** If a screen needs them to make sense, fix the layout.
- **Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything.**

One TSX codebase on NativeShell (QuickJS, real platform views), not a WebView
shell. Android ships; macOS is the dev host. Routes live in feature folders,
state is `signal`, data goes through `src/lib/net.ts`.

## Read what the task needs

| File | Covers |
|---|---|
| `docs/BUILD_SPEC.md` | the screen contract and definition of done |
| `docs/ARCHITECTURE.md` | routing, state, data layers, the full route table |
| `docs/OFFLINE.md` | what works offline, cache keys and budgets |
| `docs/SIZE.md` | APK bytes and what moves them |
| `docs/ANDROID.md` | host, packaging, install, device debugging |
| `docs/SHOTS.md` | screenshot QA and what a good screen looks like |
| `docs/A11Y_AUDIT.md` | contrast, touch targets, small screens |
| `docs/FDROID.md` | the self-hosted repository, repo keys, publishing |
| `docs/SITE_PARITY.md`, `docs/COMPETITORS.md` | what the app owes the site, and the market |

Skills (load with the skill tool): `beu-native` for authoring, `beu-qa` for
tests, `beu-release` for shipping, `beuconnect` for repo/site context, `beu-data`
for generated data.

Nested `AGENTS.md` files load when you read their area:

| Path | Scope |
|---|---|
| `src/app/AGENTS.md` | router, registry, shell, tab bar, More, 404 |
| `src/ui/AGENTS.md` | Ink & Ember design system |
| `src/lib/AGENTS.md` | fetch, cache, Storage, formatting |
| `src/features/AGENTS.md` | the feature-folder contract |
| `src/features/results/AGENTS.md` | live JSON, CSV, identity, captcha page |
| `src/features/pyqs/AGENTS.md` | catalog, paper parsing, PDFs, data browser |
| `src/features/syllabus/AGENTS.md` | generated syllabus/GATE packs |
| `src/features/students/AGENTS.md` | generated roster and lead joins |
| `src/features/tools/AGENTS.md` | calculators, attendance, routine, holidays |
| `qa/AGENTS.md` | tests and the offline harness |
| `scripts/AGENTS.md` | build gate and data pipelines |
| `docs/AGENTS.md` | documentation rules and ownership |
| `assets/data/AGENTS.md` | bundled generated data |
| `android/AGENTS.md` | the custom Android host |
| `notes-src/AGENTS.md` | the VVI source for Notes |

## Three commands

```sh
source ~/.config/nsh/env.sh       # once per shell
nsh run App.tsx                   # dev loop, one nsh process at a time
./scripts/check.sh test           # the gate: lint, types, build, suite
./scripts/package-android.sh      # arm64 APK in .nsh/out
```

`./qa/run-tests.sh` adds the generated push-target freshness gate before the
suite. **Never call `nsh check` / `nsh test` directly** — one `.nsh/` cache per
project, so `scripts/check.sh` serialises builds with a lock.

## Non-negotiables

1. **No dependency.** `native/` has no `package.json`; every import is bundled
   and counted against the size gate.
2. **Register the route in its own folder.** Add a `RouteDef` to
   `src/features/<area>/index.tsx`; the registry spreads `<area>Routes`. Register
   every `nav.push` target in the same change and re-run
   `bun qa/scan-push-targets.mjs`.
3. **Params only through** `param(nav, "x")` / `numParam(nav, "x")`.
   `title(params)` never throws and always returns a non-empty string.
4. **No raw `fetch`, no ad-hoc storage keys.** `src/lib/net.ts` adds timeouts,
   in-flight dedupe, caching and the `beu.` / `beu.cache.` prefixes.
5. **Theme by token.** No hex in a screen, no interpolated class names; unknown
   classes are a warning, not an error.
6. **A `List` needs height and a reactive wrapper.** `class="flex-1"` (or an
   explicit height), and `{() => <List each={rows()} … />}` so `each` re-reads.
   Never nest a `List` in a scrolling column.
7. **Storage is async.** `await` reads, `void` writes, hydrate once into a
   signal. A `Storage.getItem(...)` used as a string silently breaks persistence.
8. **`WebView` is only** the BEU captcha page and PDFs; its host must be in
   `nsh.json` `capabilities.webview.hosts`.
9. **Data honesty.** Never invent a paper, result, notice, date or rank. An
   empty state that explains itself beats a fabricated row.
10. **Generated files are never hand-edited.** `assets/data/*`,
    `syllabus/data/packs.ts` + `data/table/`, `pyqs/catalog-data.ts`,
    `pyqs/pdf-catalog.ts`, `students/roster-data.ts`, `qa/push-targets.ts`.
11. **Gate before handoff.** `./scripts/check.sh test`; theme →
    `bun scripts/contrast.ts`; visuals → `./scripts/shots.sh`; bundled data →
    `./scripts/size-report.sh`.

## Where a change goes

| Change | Location |
|---|---|
| New screen | `src/features/<area>/` + its `index.tsx` route table |
| Shared look | `src/ui/index.tsx` (foundation — its own change) |
| Navigation behaviour | `src/app/` (foundation — its own change) |
| Fetch/cache/Storage | `src/lib/` (foundation — its own change) |
| Test | `qa/` (never a feature's internals) |
| Generated data | the pipeline in `scripts/` (see `scripts/AGENTS.md`) |
