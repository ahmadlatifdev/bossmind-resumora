/**
 * Firebase client for resumora-live / client-resumora-live.
 * Prefers VITE_FIREBASE_* from .env.local; falls back to known web app config.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAnalytics, initializeAnalytics, isSupported } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyCZHEwXfeqiTFRyo-XCwpGUM7aFkKvgX1Q',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'resumora-live.firebaseapp.com',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'resumora-live',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'resumora-live.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    '994522492058',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    '1:994522492058:web:26ef921ce6a38003a4c323',
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ||
    import.meta.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    'G-QW15ZT1VDX',
};

export const MARKETING_DOMAIN = 'resumora.net';
export const MARKETING_ORIGIN = `https://${MARKETING_DOMAIN}`;

export const app: FirebaseApp = getApps().length
  ? (getApps()[0] as FirebaseApp)
  : initializeApp(firebaseConfig);

/** App Check (reCAPTCHA Enterprise) — site key from env only; never hard-code secrets. */
const appCheckSiteKey =
  import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY ||
  import.meta.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY ||
  '';

if (typeof window !== 'undefined' && appCheckSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    /* duplicate init on HMR */
  }
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

/** Sets Auth email-template language only (en|fr|es). Does not touch Firestore or sessions. */
export function setAuthEmailLanguage(code: 'en' | 'fr' | 'es' | string): void {
  const normalized = String(code || 'en')
    .toLowerCase()
    .slice(0, 2);
  auth.languageCode = normalized === 'fr' || normalized === 'es' ? normalized : 'en';
}

export let analytics: ReturnType<typeof getAnalytics> | null = null;

function canonicalPageLocation() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${MARKETING_ORIGIN}${path}`;
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__resumoraFirebaseApp = app;
  (window as unknown as Record<string, unknown>).__resumoraMarketingDomain = MARKETING_DOMAIN;

  isSupported()
    .then((supported) => {
      if (!supported) return;

      const analyticsConfig = {
        cookie_domain: MARKETING_DOMAIN,
        linker: { domains: [MARKETING_DOMAIN, 'www.resumora.net'] },
        page_hostname: MARKETING_DOMAIN,
        page_location: canonicalPageLocation(),
        send_page_view: true,
      };

      try {
        analytics = initializeAnalytics(app, { config: analyticsConfig });
      } catch {
        analytics = getAnalytics(app);
      }

      (window as unknown as Record<string, unknown>).__resumoraFirebaseAnalytics = analytics;
    })
    .catch(() => {});
}

export default app;
