/* Minimal offline shell — caches logo + manifest-friendly responses */
const CACHE = "resumora-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/favicon.svg",
          "/favicon.ico",
          "/favicon-32x32.png",
          "/apple-touch-icon.png",
          "/icon-192.png",
          "/resumora-logo.png",
          "/manifest.webmanifest",
          "/",
        ]).catch(() => {})
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && (request.destination === "image" || url.pathname === "/" || url.pathname.endsWith(".css"))) {
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/"));
    })
  );
});
