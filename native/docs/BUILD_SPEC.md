# Build spec

The contract every screen in `native/` has to meet. Site source
(`src/pages/**`, live at https://beu.prit.eu.org) is the **feature reference**
only — the app is not a skin of the site and has its own navigation, design
language and data path.

App root `native/` · entry `App.tsx` → `mount(Shell)` · framework NativeShell
(TSX on QuickJS, real platform views) · Android is the shipping target, macOS is
the dev host.

## 1. Layout of the code

```
native/
├── App.tsx                 mount(Shell) — 3 lines, do not grow it
├── nsh.json                id, version, theme tokens, capabilities
├── src/app/                router contract, registry, shell, tab bar, More, 404
├── src/ui/index.tsx        the design system; the only place that encodes the look
├── src/lib/net.ts          fetch + cache + Storage + formatting
├── src/features/<area>/    one folder per area, owns its routes and data
├── qa/                     route contract, push-target scan, mount tests
└── docs/                   this file, ARCHITECTURE, SITE_PARITY, ANDROID, SIZE
```

`src/app/**`, `src/ui/**` and `src/lib/**` are shared foundation. A feature
change does not edit them; a foundation change is its own change, with the QA
suite run afterwards.

## 2. Area scopes

Thirteen areas own the 55 registered routes (`docs/ARCHITECTURE.md` has the full
table with params).

| Area | Owns | Screens |
|---|---|---|
| **home** | `home` | greeting with the saved name, next action (class / result / setup), study and result tiles, notice pager (8 latest, auto-advance), next holiday |
| **onboarding** | `onboarding` | first run: one registration number, then the student's name and college before a profile exists |
| **syllabus** | `syllabus`, `.subject`, `.search`, `.saved`, `.gate` | branch + semester from the saved course, subject list, unit/topic rows with ticked progress, cross-subject search, saved subjects, 30 GATE papers |
| **results** | `results`, `.table`, `.rank`, `.merit`, `.battle`, `.web`, `.portal` | lookup, branch roster table, rank report, merit list, 1v1 battle, BEU's captcha page read back natively, older JSON capture |
| **pyqs** | `pyqs`, `.paper`, `.pdf`, `.gate`, `data`, `data.table` | BEU paper browser (List, virtualized), one paper parsed natively, PDF WebView, GATE index/paper/PDF, dataset index, dataset table |
| **notes** | `notes`, `.subject` | branch + semester shelf, VVI short notes with copy, handwritten PDFs in the native viewer, stale-cache line when offline |
| **planner** | `planner` | syllabus spread over the days to an exam date, topics/day, revision buffer, ticks shared with Syllabus |
| **search** | `search` | one local index over subjects, GATE papers, notices, datasets and screens, grouped results, kind filters |
| **tools** | `tools`, `.calculator`, `.attendance`, `.routine`, `.holidays`, `.wifi` + the bare aliases `attendance`/`routine`/`holidays`/`wifi` | hub, SGPA/CGPA/predict/percent, attendance with log + undo, routine today/week, 2026 holiday grid, Wi-Fi helper |
| **feedback** | `feedback` | the sheet the footer opens, the report page with what is sent and the last five |
| **students** | `students`, `.college`, `.branch`, `.student`, `.leads` | GEC Sheikhpura register by college and branch, one student card, batch CGPA leaders |
| **notices** | `notices`, `.detail`, `.announcements`, `.post`, `.search` | scraped BEU board, notice detail (native markdown), announcements, announcement post, search over both |
| **settings** | `settings`, `.profile`, `.appearance`, `.reminders`, `.storage`, `.about` | profile, light/dark/system, holiday reminders, cache size + clear, about |

The bare `attendance`, `routine`, `holidays`, `wifi` and `tools.feedback` routes
are compatibility aliases: nothing in the app pushes them, but an older link or
an external deep link must still land. `feedback` is canonical — More and search
push it with the current route attached — and `tools.feedback` is its alias.
Keep them registered; they are the same `render`, not new screens.

## 3. Rules that have already cost time here

Each one is a bug that happened, not a style preference.

### 3.1 A pushed route that is not registered

`nav.push("results.rank", …)` is a string. Nothing type-checks it, and an
unregistered name is not a crash — `shell.tsx` renders `<NotFound>` and the user
sees a dead end. `qa/push-targets.ts` is a generated list of every push target
and `qa/registry.test.ts` asserts each resolves in `ROUTE_MAP`.

> **Rule:** register the `RouteDef` in the same change that adds the push.
> Re-run `bun qa/scan-push-targets.mjs` after touching navigation, and remember
> `more` is shell-owned (never register it in a feature).

### 3.2 `View` has no `key` prop

`ViewProps` is `{ style, …CommonProps }` (`.nsh/types/nsh/types.d.ts`); `key` is
not in it. Writing `<View key={row.id}>` is a TypeScript error, and wrapping it
in a fragment does not help.

> **Rule:** keys belong to `<Each of={…} key={…}>` and nowhere else. A plain
> `.map()` over a static array needs no keys at all.

### 3.3 `Chip` has no `key` prop either

`Chip` takes `children · active · onPress · class · tone`. `Card`, `Row`, `Btn`,
`Badge` and the rest of `src/ui` are the same — plain components, no `key`.

```tsx
// wrong: TS error
{targets.map((t) => <Chip key={t} active={…}>{t}</Chip>)}

// right
<Each of={targets} key={(t) => String(t)}>{(t) => <Chip active={…}>{t()}</Chip>}</Each>
```

### 3.4 An unknown Tailwind class is only a warning

Classes resolve against Tailwind 4's scale plus the app's theme tokens. A class
that exists in neither is reported by `nsh build` as `unknown class …` and the
build still passes — so the screen looks right in code and wrong on the device,
with no failure to chase. Runtime-built names (`` `bg-${tone}-500` ``) are only
checked the first time the runtime sees them.

> **Rule:** for colour, use a token (`bg-primary/10`, `text-muted-foreground`,
> `border-border`, `bg-chart-3`); for spacing/size, a real scale value or an
> explicit arbitrary (`text-[13px]`, `rounded-[26px]`). Never build a class name
> by interpolation.

### 3.5 `NavStack` needs `class="flex-1"`

`NavStack` is a flex child inside the shell's column. Without `flex-1` it has no
height and every page renders empty under the header — it looks like a routing
bug and is a one-class bug. `shell.tsx` already passes it; a test harness or a
new shell must too.

### 3.6 `Storage` is Promise-based

`nsh/storage` returns promises: `getItem` → `Promise<string | null>`,
`setItem`/`removeItem` → `Promise<void>`. `readStore`/`writeStore` in
`src/lib/net.ts` wrap it and are also async. Treating a value as a string
(`Storage.getItem(k).length`, `if (getItem(k))`) compiles in loose code and
silently breaks persistence.

> **Rule:** `await` reads, `void` fire-and-forget writes, and never read back
> synchronously. Hydrate once in an effect, then keep the value in a signal.

### 3.7 Three more that keep recurring

- **Text lives in `<Text>`.** A raw string child of a `View` is a build error;
  every label, number and greeting goes inside `Text`, `Title`, `Muted` or
  `Label`.
- **`WebView` is not a screen.** The only two uses allowed are the result
  captcha (`results.web`, with `results.portal` as the older capture) and a PDF
  (`pyqs.gate` / `pyqs.pdf`). A page that could be native views must be native
  views.
- **A `WebView` host is a capability.** Adding a `WebView` means adding its host
  to `nsh.json` `capabilities.webview.hosts`; otherwise the navigation is
  refused before it starts.

## 4. Design rules (Ink & Ember)

- Warm paper `background`, ink `foreground`, ember `primary`, deep teal
  `accent`, amber `chart-3`; hairline `border-border`; oversized radii; no
  shadows, no decorative gradients.
- Use `src/ui/index.tsx` primitives — `Screen`, `Body`, `Row`, `Col`, `Card`,
  `Panel`, `SectionHeader`, `Title`, `Subtitle`, `Muted`, `Label`, `Btn`,
  `Chip`, `Field`, `Search`, `Badge`, `Progress`, `Stat`, `Ring`, `Marquee`,
  `Loading`, `Skeleton`, `ErrorState`, `EmptyState`, `Divider`, `Spacer`,
  `Mono`. Do not restyle around them.
- Pressables: at least 44pt (`min-h-11`), `active:` feedback — never hover-only.
- Text grows with the system font scale: `min-h`, never a fixed height around
  text. Small phones first (320pt): 16pt gutter, two columns, no wide tables.
- Every list has loading, error + retry and empty states. Offline shows the last
  cached copy, labelled as such.
- Long lists use `List` (virtualized), never `Scroll` + `.map()` over hundreds of
  rows. 30 rows is the line.

## 5. Definition of done

A screen is done when all of these are true:

1. **Route registered** in its area's `index.tsx`, exported through
   `ALL_ROUTES`, with a `title(params)` that returns a non-empty string for `{}`
   and for every real param (`qa/registry.test.ts` checks this).
2. **Every push target registered** — re-run `bun qa/scan-push-targets.mjs`; no
   dead ends from `more.tsx`, home tiles or another screen.
3. **`./scripts/check.sh test` passes** — that is `nsh check` (types + build)
   followed by `nsh test` under the one lock. Never invoke `nsh` directly while
   another build may be running.
4. **Mounts offline at 320×640.** `qa/screens.test.tsx` mounts the main screens
   with the network down and asserts the body is a real page, not `No screen for`.
   Errors must render `ErrorState` with a retry, not a blank screen.
5. **Params are read through `param`/`numParam`** and a missing/absurd param
   yields a usable screen (the table/monitor routes show a "pick one" state
   rather than crashing).
6. **Data goes through `src/lib/net`** (`fetchJson`/`fetchText`/`postJson` +
   `cacheKey`), never a bare `fetch`; the host is in `nsh.json`.
7. **Persistence is async** and keyed under the area's `KEYS` object; clearing
   the cache must not delete it.
8. **No new dependency.** `native/` has no `package.json`; anything imported is
   bundled into `assets/nsh/bundle.nshc` and counted against the size budget.
9. **APK budget respected** — `.nsh/out/BEUConnect.apk` stays under 10,000,000
   bytes after `./scripts/package-android.sh`; `./scripts/size-report.sh` is the
   check (owned by the size workstream, do not edit its script).
10. **Docs updated** — a new route gets a row in `docs/ARCHITECTURE.md` and a row
    (or a line under "app-only") in `docs/SITE_PARITY.md`; a new screen gets an
    entry in the `SHOTS` table of `scripts/shots.sh` so it can be photographed.
