import { initializeApp } from "firebase/app";
import { getAnalytics, initializeAnalytics, isSupported } from "firebase/analytics";

/** Firebase web config for project resumora-live (client-resumora-live / resumora.net) */
const firebaseConfig = {
  apiKey: "AIzaSyCZHEwXfeqiTFRyo-XCwpGUM7aFkKvgX1Q",
  authDomain: "resumora-live.firebaseapp.com",
  projectId: "resumora-live",
  storageBucket: "resumora-live.firebasestorage.app",
  messagingSenderId: "994522492058",
  appId: "1:994522492058:web:26ef921ce6a38003a4c323",
  measurementId: "G-QW15ZT1VDX",
};

export const MARKETING_DOMAIN = "resumora.net";
export const MARKETING_ORIGIN = `https://${MARKETING_DOMAIN}`;

export const app = initializeApp(firebaseConfig);

export let analytics = null;

function canonicalPageLocation() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${MARKETING_ORIGIN}${path}`;
}

if (typeof window !== "undefined") {
  window.__resumoraFirebaseApp = app;
  window.__resumoraMarketingDomain = MARKETING_DOMAIN;

  isSupported()
    .then((supported) => {
      if (!supported) return;

      const analyticsConfig = {
        cookie_domain: MARKETING_DOMAIN,
        linker: { domains: [MARKETING_DOMAIN, "www.resumora.net"] },
        page_hostname: MARKETING_DOMAIN,
        page_location: canonicalPageLocation(),
        send_page_view: true,
      };

      try {
        analytics = initializeAnalytics(app, { config: analyticsConfig });
      } catch {
        analytics = getAnalytics(app);
      }

      window.__resumoraFirebaseAnalytics = analytics;
    })
    .catch(() => {});
}

export default app;
