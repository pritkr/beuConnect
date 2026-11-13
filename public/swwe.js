/* BEUConnect service worker.
 *
 * Cache policies, nothing clever:
 *   navigations    network first, last copy on disk, styled offline page last
 *   /_astro/*      cache first — those filenames carry a content hash
 *   everything else passes straight through
 *
 * Plus delivery: a Web Push message becomes a notification here, because this
 * is the only code that runs when the site is closed. `push` renders it and
 * `notificationclick` focuses a tab (navigating it to the notice) or opens one.
 *
 * Cache Storage ignores `Cache-Control`, so a rule here is the only thing
 * deciding what survives a lost connection.
 */
const VERSION = "v4";
const PAGES = `beu-pages-${VERSION}`;
const ASSETS = `beu-assets-${VERSION}`;
const DATA = `beu-data-${VERSION}`;

/* Rank tables are regenerated now and then, so the newest copy is fetched in
   the background while the last one is served. Bounded so a curious student
   cannot fill the phone with CSVs. `/api/rank` is the same data as JSON, so it
   rides the same rule — a shared result link opened offline still shows where
   it ranked. */
const DATA_LIMIT = 30;
const DATA_MAX_BYTES = 512 * 1024;

/* Self-contained so it renders with no network and no stylesheet. Same
   palette as theme.css, and it honours the theme the person already chose. */
const OFFLINE_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#151b18">
<title>Offline · BEUConnect</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #151b18; --surface: #1d2520; --paper: #f6f2e8;
    --muted: #a8a294; --line: #3a443d; --accent: #f0a63c; --ink: #1a1206;
  }
  html[data-theme="light"] {
    color-scheme: light;
    --bg: #f6f2e8; --surface: #fffaf0; --paper: #1a1206;
    --muted: #6b6455; --line: #ded5c3; --accent: #935400; --ink: #fffaf0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding:
      calc(2rem + env(safe-area-inset-top, 0px))
      max(1.5rem, env(safe-area-inset-right, 0px))
      calc(2rem + env(safe-area-inset-bottom, 0px))
      max(1.5rem, env(safe-area-inset-left, 0px));
    background: var(--bg);
    color: var(--paper);
    font-family: "Public Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 22rem; }
  h1 {
    margin: 0 0 0.75rem;
    font-family: "Instrument Serif", Georgia, "Times New Roman", serif;
    font-size: 2.1rem;
    font-weight: 400;
    line-height: 1.15;
  }
  p { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.95rem; line-height: 1.6; }
  button {
    min-height: 2.75rem;
    padding: 0 1rem;
    border: 1px solid transparent;
    border-radius: 4px;
    background: var(--accent);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
</head>
<body>
  <main>
    <h1>You're offline</h1>
    <p>Pages you have already opened still work. Everything else needs a connection — try again once you're back.</p>
    <button type="button" onclick="location.reload()">Try again</button>
  </main>
  <script>
    try {
      var saved = localStorage.getItem("beu_theme");
      if (saved === "light" || saved === "dark") {
        document.documentElement.dataset.theme = saved;
      } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        document.documentElement.dataset.theme = "light";
      }
    } catch (error) {}
  </script>
</body>
</html>`;

const settable = (response) => Boolean(response && response.ok && response.type === "basic");

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PAGES);
        // A cold install should still have a first screen to show offline.
        await cache.add(new Request("/", { cache: "reload" }));
      } catch (error) {
        // First visit already offline: nothing to pre-cache, keep going.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== PAGES && key !== ASSETS && key !== DATA)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (settable(response)) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (settable(response)) cache.put(request, response.clone());
  return response;
}

async function storeData(request, event) {
  const response = await fetch(request);
  if (!settable(response)) return response;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > DATA_MAX_BYTES) return response;

  const cache = await caches.open(DATA);
  event.waitUntil(
    (async () => {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      if (keys.length > DATA_LIMIT) {
        await Promise.all(
          keys.slice(0, keys.length - DATA_LIMIT).map((key) => cache.delete(key)),
        );
      }
    })(),
  );
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(DATA);
  const cached = await cache.match(request);
  if (cached) {
    event.waitUntil(storeData(request, event).catch(() => undefined));
    return cached;
  }
  return storeData(request, event);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/swwe.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_astro/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/data/") || url.pathname === "/api/rank") {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

/* ------------------------------------------------------------------ push */

/* The payload the worker sends:
 *   { id, title, body, url, route, params }
 * `url` is a site path. `route`/`params` exist for the Android app; a browser
 * only needs the path, and it is the same one the app's route resolves to. */

function pushPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch (error) {
    return {};
  }
}

function noticePath(data) {
  if (typeof data.url === "string" && data.url.startsWith("/")) return data.url;
  return "/notices/";
}

self.addEventListener("push", (event) => {
  const data = pushPayload(event);
  const title = typeof data.title === "string" && data.title ? data.title : "BEUConnect";
  const body = typeof data.body === "string" ? data.body : "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // The wordmark on a transparent field; the launcher icons are square and
      // read as a white block at notification size.
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      tag: typeof data.id === "string" ? data.id : undefined,
      // A repeated tag replaces the old notification silently rather than
      // buzzing again for the same circular.
      renotify: false,
      data: { url: noticePath(data), id: data.id || "" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/notices/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        // Focus first: a student tapping a notification while the site is open
        // expects that tab to move, not a second one to appear behind it.
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(target);
          } catch (error) {
            // A tab that refuses navigation still got focused.
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
