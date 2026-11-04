import { useEffect, useState } from 'react';
import { getConsent, setConsent } from '../lib/consent.js';
import { trackPageView } from '../lib/analytics.js';

/**
 * Cookie consent banner — sticky, bottom. Non-essential analytics/tracking
 * stay disabled until the user chooses "Accept". Choice is persisted in localStorage.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getConsent()) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    setConsent('accepted');
    setVisible(false);
    trackPageView();
  };

  const decline = () => {
    setConsent('denied');
    setVisible(false);
  };

  return (
    <div
      className="cookie-consent fixed bottom-0 inset-x-0 z-50 border-t border-gray-700 bg-gray-900/95 text-gray-100 backdrop-blur"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm flex-1 opacity-90">
          We use cookies to enhance your experience, analyze site traffic, and provide core
          functionality. See our{' '}
          <a className="underline underline-offset-2" href="/privacy">
            Privacy Policy
          </a>{' '}
          for details.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={accept}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-[color:var(--color-gold)] text-black hover:opacity-90"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={decline}
            className="px-4 py-2 rounded-full text-sm font-semibold border border-gray-500 hover:border-gray-300"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
