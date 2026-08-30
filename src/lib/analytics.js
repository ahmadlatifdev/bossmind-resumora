/**
 * GA4 helpers via the gtag snippet in index.html / MPA HTML.
 * No-ops when gtag is unavailable (SSR, blockers, tests).
 */

function getGtag() {
  if (typeof window === 'undefined') return null;
  return typeof window.gtag === 'function' ? window.gtag : null;
}

/**
 * @param {string} [pagePath]
 */
export function trackPageView(pagePath) {
  const gtag = getGtag();
  if (!gtag) return;
  const path =
    pagePath ||
    (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/');
  gtag('event', 'page_view', {
    page_path: path,
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
  });
}

/**
 * @param {{ title?: string, src?: string, lang?: string }} [payload]
 */
export function trackVideoStart(payload = {}) {
  const gtag = getGtag();
  if (!gtag) return;
  gtag('event', 'video_start', {
    video_title: payload.title || '',
    video_url: payload.src || '',
    language: payload.lang || '',
  });
}
