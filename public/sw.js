// PragmaOS Service Worker — offline cache for visited pages.
// Strategy: network-first with cache fallback (stale-while-revalidate).

const CACHE_NAME = "pragmaos-v1";
const STATIC_ASSETS = [
  "/static/js/alpine.min.js",
  "/static/css/phosphor-regular.css",
  "/static/css/phosphor-bold.css",
  "/manifest.json",
];

// Install: pre-cache static assets.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {})),
  );
  self.skipWaiting();
});

// Activate: clean up old caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for static assets.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Skip non-GET requests.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin requests (API calls, Supabase, etc).
  if (url.origin !== self.location.origin) return;

  // Skip API calls — always need fresh data.
  if (url.pathname.startsWith("/api/")) return;

  // Static assets: cache-first.
  if (url.pathname.startsWith("/static/") || url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return resp;
        });
      }),
    );
    return;
  }

  // Navigation requests (HTML pages): network-first with cache fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          // Cache successful HTML responses.
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return resp;
        })
        .catch(() => {
          // Offline: try cache, then show offline page.
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match("/offline.html");
          });
        }),
    );
    return;
  }
});

// Allow page to trigger skipWaiting.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
