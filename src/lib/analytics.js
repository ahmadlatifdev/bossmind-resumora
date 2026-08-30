/**
 * GA4 helpers via the gtag snippet in index.html / MPA HTML.
 * Optional VITE_GA_MEASUREMENT_ID reinforces config when present (public G- ID only).
 * No-ops when gtag is unavailable (SSR, blockers, tests).
 * Never send secrets, full emails, or payment IDs to analytics.
 */

function getGtag() {
  if (typeof window === 'undefined') return null;
  return typeof window.gtag === 'function' ? window.gtag : null;
}

let measurementConfigured = false;

/** Ensure gtag config uses Vite measurement ID when the HTML snippet is absent. */
export function ensureGaConfigured() {
  if (measurementConfigured || typeof window === 'undefined') return;
  const gtag = getGtag();
  const mid = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
  if (!gtag || !mid || !/^G-[A-Z0-9]+$/i.test(mid)) {
    measurementConfigured = true;
    return;
  }
  gtag('config', mid, {
    cookie_domain: 'resumora.net',
    linker: { domains: ['resumora.net', 'www.resumora.net'] },
  });
  measurementConfigured = true;
}

/**
 * @param {string} [pagePath]
 */
export function trackPageView(pagePath) {
  ensureGaConfigured();
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
 * Pricing card / plan selection (GA4 select_item).
 * @param {{ itemId: string, itemName: string, priceLabel?: string, index?: number }} payload
 */
export function trackSelectItem(payload) {
  ensureGaConfigured();
  const gtag = getGtag();
  if (!gtag) return;
  gtag('event', 'select_item', {
    item_list_id: 'resumora_plans',
    item_list_name: 'Resumora plans',
    items: [
      {
        item_id: String(payload.itemId || ''),
        item_name: String(payload.itemName || payload.itemId || ''),
        index: Number(payload.index) || 0,
        // Display label only (e.g. $29) — never Stripe price_ secrets
        price: payload.priceLabel || undefined,
      },
    ],
  });
}

/**
 * Lead / chat engagement (GA4 generate_lead). Do not pass PII.
 * @param {{ method?: string, leadType?: string }} [payload]
 */
export function trackGenerateLead(payload = {}) {
  ensureGaConfigured();
  const gtag = getGtag();
  if (!gtag) return;
  gtag('event', 'generate_lead', {
    currency: 'USD',
    method: payload.method || 'client_chat',
    lead_type: payload.leadType || 'support_or_review',
  });
}

/**
 * @param {{ title?: string, src?: string, lang?: string }} [payload]
 */
export function trackVideoStart(payload = {}) {
  ensureGaConfigured();
  const gtag = getGtag();
  if (!gtag) return;
  gtag('event', 'video_start', {
    video_title: payload.title || '',
    video_url: payload.src || '',
    language: payload.lang || '',
  });
}
