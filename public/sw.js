/**
 * Resumora SW — static assets only. Never cache auth/checkout HTML (prevents redirect loops).
 * Version: 20260521-journey-v3
 */
const SW_VERSION = "20260521-journey-v3";
const BRANDING_ASSET_QUERY = "?v=20260521-journey-v3";
const CACHE = `resumora-shell-${SW_VERSION}`;

const BYPASS_HTML_PREFIXES = [
  "/login",
  "/register",
  "/studio",
  "/pricing",
  "/success",
  "/dashboard",
  "/cancel",
  "/reset-password",
  "/forgot-password",
];

const q = () => BRANDING_ASSET_QUERY;

function isHtmlNavigation(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function mustBypassHtml(pathname) {
  return BYPASS_HTML_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
          "/brand/resumora-logo-official-transparent.png" + q(),
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

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (isHtmlNavigation(request)) {
    if (mustBypassHtml(url.pathname)) {
      event.respondWith(fetch(request, { cache: "no-store", redirect: "follow" }));
      return;
    }
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() =>
        Response.error()
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
    path === "/brand/resumora-logo-official-transparent.png" ||
    path === "/brand/resumora-logo-official.jpg" ||
    path === "/brand/resumora-logo-official.png" ||
    path === "/brand/resumora-logo-original.png" ||
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

  event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request)));
});
