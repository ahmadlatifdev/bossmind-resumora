/**
 * GA4 (gtag) helper — measurement ID is public by design (G-…).
 * Never send PII (email, name, uid, phone) to Analytics.
 */
const GA_ID =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    (import.meta.env.VITE_GA_MEASUREMENT_ID ||
      import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ||
      import.meta.env.VITE_GA_ID)) ||
  '';

let initialized = false;

function safeId() {
  const id = String(GA_ID || '').trim();
  return /^G-[A-Z0-9]+$/i.test(id) ? id : '';
}

export function getGaMeasurementId() {
  return safeId();
}

export function initAnalytics() {
  const id = safeId();
  if (!id || typeof window === 'undefined' || initialized) return false;
  if (window.gtag && window.__resumoraGaReady) {
    initialized = true;
    return true;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id, {
    anonymize_ip: true,
    send_page_view: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  window.__resumoraGaReady = true;
  initialized = true;
  return true;
}

export function trackPageView(path, title) {
  if (!safeId() || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const page_path = String(path || window.location.pathname || '/').slice(0, 200);
  window.gtag('event', 'page_view', {
    page_path,
    page_title: String(title || document.title || '').slice(0, 120),
    page_location: `${window.location.origin}${page_path}`,
  });
}

/**
 * Generic event — strips accidental PII-shaped keys.
 */
export function trackEvent(name, params = {}) {
  if (!safeId() || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const blocked = /email|uid|user_id|phone|password|name|customer/i;
  const clean = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (blocked.test(k)) continue;
    if (typeof v === 'string') clean[k] = v.slice(0, 100);
    else if (typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
  }
  window.gtag('event', String(name).slice(0, 40), clean);
}

/** Ecommerce-style plan selection (no price_ IDs or PII). */
export function trackSelectItem(planId, planName) {
  if (!safeId() || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const item_id = String(planId || 'unknown').slice(0, 40);
  window.gtag('event', 'select_item', {
    item_list_id: 'resumora_plans',
    item_list_name: 'Resumora plans',
    items: [
      {
        item_id,
        item_name: String(planName || item_id).slice(0, 80),
        item_category: 'subscription_plan',
      },
    ],
  });
}

export function trackVideoStart(videoId, videoLang) {
  trackEvent('video_start', {
    video_id: String(videoId || 'unknown').slice(0, 60),
    video_language: String(videoLang || 'en').slice(0, 8),
  });
}
