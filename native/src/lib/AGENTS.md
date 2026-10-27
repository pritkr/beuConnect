# `src/lib` — network, cache, formatting

Shared foundation. A feature change does not edit these files; a change here is
its own change, with the suite run afterwards.

## Rules

- **`src/lib/net.ts` is the only place that calls `fetch`.** Screens use
  `fetchText` / `fetchJson` / `postJson`.
- **Every request has a timeout** (20 s default). A hung BEU server must not
  freeze a screen.
- **Cache with a key and a max age.** `cacheKey` persists the last good copy;
  `cacheMaxAge: 0` means "any age" and is how saved results and rosters survive
  a dead connection. `revalidate: true` serves the copy now and refreshes behind
  the screen.
- **Retries live in callers.** `fetchText` does not retry; results retries only
  `status 0`, notices and PYQs retry once with a sleep.
- **Errors are `NetError`.** Render `httpMessage(status)` through `ErrorState`,
  never a stack trace.
- **Storage is async.** `readStore` / `writeStore` / `removeStore` add `beu.`;
  `putCache` / `getCache` add `beu.cache.` and enforce `CACHE_BUDGET`. Never
  invent a key in a screen without adding it to the area's `KEYS`.
- **Cache entries are `{ at, value }`.** `src/lib/cache.ts` owns eviction and
  the budget; do not write cache rows directly.
- **Formatting is shared.** Dates, numbers and bytes go through `net.ts` /
  `bytes.ts` so two screens cannot disagree.

## Checklist for a new endpoint

1. Host is already allowlisted in `nsh.json`, or add it (network vs webview).
2. `fetchJson` / `fetchText` with a stable `cacheKey` and a sensible max age.
3. Parse and normalise in the feature's own `data.ts`, not here.
4. On failure, return the last copy if it is usable; otherwise surface a
   retryable `ErrorState`.
5. Do not loop over semesters, batches or colleges without a user action behind
   it.
