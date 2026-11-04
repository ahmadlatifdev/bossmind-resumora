/**
 * Cookie consent storage helpers — single source of truth for non-essential
 * tracking consent. Analytics/tracking gate on `hasCookieConsent()`.
 */

const CONSENT_KEY = 'cookieConsent';

/**
 * @returns {'accepted' | 'denied' | null}
 */
export function getConsent() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param {'accepted' | 'denied'} value
 */
export function setConsent(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* localStorage unavailable — ignore */
  }
}

export function hasCookieConsent() {
  return getConsent() === 'accepted';
}
