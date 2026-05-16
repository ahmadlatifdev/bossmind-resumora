/**
 * Client-side GA4 event helper (complements gtag config in pages/_document.js).
 * Also mirrors key events to Neon via /api/analytics/track when available.
 */

export function trackGa4(eventName, params = {}) {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
  } catch {
    /* ignore */
  }
  try {
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        path: window.location?.pathname || "/",
        source: "ga4_mirror",
        meta: { event: eventName, ...params },
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
