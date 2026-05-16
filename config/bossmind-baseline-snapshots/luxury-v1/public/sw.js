/**
 * Offline shell — precaches versioned branding assets (see config/branding-asset-version.json).
 * HTML/navigation: network-first (never serve stale homepage/pricing from cache).
 */
const BRANDING_ASSET_QUERY = "?v=20260516-rs4";
const CACHE = "resumora-shell-20260516-rs4";

const q = () => BRANDING_ASSET_QUERY;

function isHtmlNavigation(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/favicon.svg" + q(),
          "/icon.svg" + q(),
          "/favicon.ico" + q(),
          "/favicon-32x32.png" + q(),
          "/favicon-16x16.png" + q(),
          "/apple-touch-icon.png" + q(),
          "/icon-192.png" + q(),
          "/icon-512.png" + q(),
          "/android-chrome-192x192.png" + q(),
          "/android-chrome-512x512.png" + q(),
          "/resumora-logo.png" + q(),
          "/og-resumora-brand.png" + q(),
          "/manifest.webmanifest",
        ]).catch(() => {})
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key.startsWith("resumora-shell-") && key !== CACHE) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHtmlNavigation(request)) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/"))
      )
    );
    return;
  }

  const path = url.pathname;
  const isBrandAsset =
    path.startsWith("/favicon") ||
    path === "/icon.svg" ||
    path.startsWith("/icon-") ||
    path.startsWith("/android-chrome") ||
    path === "/apple-touch-icon.png" ||
    path === "/resumora-logo.png" ||
    path === "/og-resumora-brand.png" ||
    path === "/manifest.webmanifest" ||
    path === "/api/branding-manifest";

  if (isBrandAsset) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          if (res.ok) {
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => res)
      .catch(() => caches.match(request))
  );
});
