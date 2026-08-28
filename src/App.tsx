import { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGuard from './components/AuthGuard';
import AuthChrome from './components/AuthChrome';
import LoginPage from './pages/Login';
import VideosPage from './pages/VideosPage';
import AdminRefundsPage from './pages/AdminRefunds';
import AdminSystemHealthPage from './pages/AdminSystemHealth';
import AccountPage from './pages/AccountPage';
import BilibiliOfferPage from './pages/BilibiliOffer';
import LanguageSwitcher from './components/LanguageSwitcher';
import BrandLogo from './components/BrandLogo';
import {
  getExpectedCentsForPlan,
  getStripePaymentLinkForPlan,
  getStripePriceIdForPlan,
  localize,
  SERVICE_PLANS,
} from './lib/plans.js';
import { getLang, setLang, t } from './lib/i18n.js';
import { installGlobalErrorReporting } from './lib/observability.js';
import { initAnalytics, trackPageView, trackSelectItem } from './lib/analytics.js';
import './v6-luxury.css';
import './app-shell.css';

installGlobalErrorReporting();
initAnalytics();
trackPageView(typeof window !== 'undefined' ? window.location.pathname : '/');

/** Firebase Hosting rewrite → Cloud Function createCheckoutSession (no Render). */
const CHECKOUT_BACKEND_URL = '/api/create-checkout-session';

const STUDIO_SUCCESS_URL =
  'https://client-resumora-live.web.app/studio?session_id={CHECKOUT_SESSION_ID}';
const CHECKOUT_CANCEL_URL = 'https://resumora.net/pricing';

const PLAN_ID_MAP: Record<string, string> = {
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
};

const HOME_PLAN_NAME_KEYS: Record<string, string> = {
  basic: 'plans.basic.name',
  balanced: 'plans.pro.name',
  professional: 'plans.business.name',
  advanced: 'plans.enterprise.name',
};

const HOME_CARDS = [
  { alias: 'price_29', planId: 'basic', price: '$29' },
  { alias: 'price_49', planId: 'balanced', price: '$49' },
  { alias: 'price_79', planId: 'professional', price: '$79' },
  { alias: 'price_110', planId: 'advanced', price: '$110' },
] as const;

function SiteNav({ lang, onLangChange }: { lang: string; onLangChange: (code: string) => void }) {
  const { user, loading, signOut } = useAuth();

  const linkClass =
    'inline-flex items-center justify-center min-h-11 px-3 py-2 hover:text-[#D4AF37] active:text-[#D4AF37] focus-visible:text-[#D4AF37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] transition';

  return (
    <nav className="v6-nav grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-8 py-5 sticky top-0 z-40">
      <Link
        to="/"
        className="flex items-center shrink-0 justify-self-start site-logo min-h-11 min-w-11"
      >
        <BrandLogo />
      </Link>
      <div className="main-nav-links flex flex-1 flex-wrap justify-center items-center gap-2 sm:gap-4 min-w-0">
        <Link to="/" className={linkClass}>
          {t(lang, 'nav.home')}
        </Link>
        <a href="/pricing" className={linkClass}>
          {t(lang, 'nav.pricing')}
        </a>
        {!loading && user ? (
          <Link to="/video-library" className={linkClass}>
            {t(lang, 'nav.videos')}
          </Link>
        ) : (
          <Link to="/login" className={linkClass}>
            {t(lang, 'nav.videos')}
          </Link>
        )}
        <a href="/resume-studio" className={linkClass}>
          {t(lang, 'nav.studio')}
        </a>
        {!loading && user ? (
          <>
            <Link to="/account" className={linkClass}>
              {t(lang, 'nav.account')}
            </Link>
            <button
              type="button"
              className={`${linkClass} bg-transparent border-0 cursor-pointer font-inherit`}
              onClick={() => void signOut()}
            >
              {t(lang, 'nav.signOut')}
            </button>
          </>
        ) : (
          <Link to="/login?mode=register" className={linkClass}>
            {t(lang, 'nav.register')}
          </Link>
        )}
      </div>
      <div className="header-trailing justify-self-end">
        <LanguageSwitcher lang={lang} onChange={onLangChange} />
      </div>
    </nav>
  );
}

function HomePage() {
  const [searchParams] = useSearchParams();
  const showPaywall = searchParams.get('paywall') === '1';
  const { user } = useAuth();
  const [lang, setLangState] = useState(() => getLang());
  const [selectedStripePriceId, setSelectedStripePriceId] = useState<string | null>(null);

  const handlePlanClick = (priceId: string, langOverride?: string) => {
    const activeLang = langOverride || lang;
    setSelectedStripePriceId(priceId);

    document.querySelectorAll('.pricing-plan').forEach((el) => el.classList.remove('active'));
    const activeElement = document.getElementById(`plan-${priceId}`);
    if (activeElement) activeElement.classList.add('active');

    const displayPriceMap: Record<string, string> = {
      price_29: '$29',
      price_49: '$49',
      price_79: '$79',
      price_110: '$110',
    };
    const checkoutBtn = document.getElementById('checkout-button-text');
    if (checkoutBtn) {
      checkoutBtn.innerText = `${t(activeLang, 'home.proceedPayment')} (${displayPriceMap[priceId]} ${t(activeLang, 'home.intervalOneTime')})`;
    }

    const planId = PLAN_ID_MAP[priceId] || priceId;
    if (!langOverride) {
      trackSelectItem(planId, planId);
    }
  };

  const onLangChange = (next: string) => {
    const code = setLang(next);
    setLangState(code);
    // Refresh CTA copy only — checkout endpoints/URLs stay Firebase + Stripe.
    if (selectedStripePriceId) {
      handlePlanClick(selectedStripePriceId, code);
    }
  };

  const redirectToStripe = async () => {
    if (!selectedStripePriceId) {
      alert(t(lang, 'home.selectPlanFirst'));
      return;
    }
    if (!user) {
      window.location.href = `/login?mode=register&from=${encodeURIComponent('/')}`;
      return;
    }
    console.log(
      'Sandbox checkout: if asked for a confirmation code, type `000000` to continue testing. Real emails/SMS apply in live mode.'
    );
    try {
      const planId = PLAN_ID_MAP[selectedStripePriceId];
      const priceId = getStripePriceIdForPlan(planId) || selectedStripePriceId;
      const expectedCents = getExpectedCentsForPlan(planId);
      const response = await fetch(CHECKOUT_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          planId,
          priceId,
          expectedCents,
          successUrl: STUDIO_SUCCESS_URL,
          cancelUrl: CHECKOUT_CANCEL_URL,
          firebaseUID: user.uid,
          uid: user.uid,
          customerEmail: user.email || undefined,
        }),
      });
      const session = await response.json().catch(() => ({}));
      console.log('Backend session response:', session);
      if (session.url) {
        window.location.href = session.url;
        return;
      }

      const paymentLink = getStripePaymentLinkForPlan(planId);
      if (paymentLink) {
        window.location.href = paymentLink;
        return;
      }

      alert(session.error || t(lang, 'home.checkoutFailed'));
    } catch (error) {
      console.error('Checkout Error:', error);
      try {
        const planId = PLAN_ID_MAP[selectedStripePriceId];
        const paymentLink = getStripePaymentLinkForPlan(planId);
        if (paymentLink) {
          window.location.href = paymentLink;
          return;
        }
      } catch {
        /* fall through */
      }
      alert(t(lang, 'home.checkoutError'));
    }
  };

  return (
    <div className="v6-shell min-h-screen font-sans">
      <div className="v6-mesh" aria-hidden="true" />
      <SiteNav lang={lang} onLangChange={onLangChange} />

      <main className="flex flex-col items-center w-full px-4 py-16">
        <section className="v6-hero-panel flex flex-col items-center">
          {showPaywall ? (
            <p className="mb-6 text-sm text-center border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 rounded-lg max-w-xl">
              {t(lang, 'home.paywall')}
            </p>
          ) : null}
          <h1 className="v6-heading text-4xl md:text-5xl mb-4 text-center">
            {t(lang, 'home.heroTitle')}
          </h1>
          <p className="v6-subhead text-lg text-center opacity-80 mb-10 max-w-2xl">
            {t(lang, 'home.heroSub')}
          </p>

          <div className="v6-pricing-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full mb-12">
            {HOME_CARDS.map((card) => {
              const catalog = SERVICE_PLANS.find((p) => p.id === card.planId);
              const nameKey = HOME_PLAN_NAME_KEYS[card.planId];
              const nameFromLocale = t(lang, nameKey);
              // Prefer filled locale strings; if FR/ES still placeholder (value===key), fall back to plans.js.
              const name =
                nameFromLocale && nameFromLocale !== nameKey
                  ? nameFromLocale
                  : catalog
                    ? localize(catalog.name, lang)
                    : card.planId;
              return (
                <div
                  key={card.alias}
                  id={`plan-${card.alias}`}
                  role="button"
                  tabIndex={0}
                  className="pricing-plan cursor-pointer border-2 border-gray-200/40 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 rounded-2xl p-6 text-center min-h-[44px]"
                  onClick={() => handlePlanClick(card.alias)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePlanClick(card.alias);
                    }
                  }}
                >
                  <h3 className="text-xl font-semibold mb-2 tracking-wide">{name}</h3>
                  <p className="text-3xl font-bold text-[#D4AF37]">
                    {card.price}
                    <span className="text-sm font-normal opacity-70">
                      {' '}
                      {t(lang, 'home.intervalOneTime')}
                    </span>
                  </p>
                  <div className="mt-4 text-sm opacity-75 space-y-1">
                    <p>{t(lang, 'home.featureStandard')}</p>
                    <p>{t(lang, 'home.featurePriority')}</p>
                    <p>{t(lang, 'home.featureAdvanced')}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <button
              id="checkout-button"
              onClick={redirectToStripe}
              className="v6-cta w-full px-10 py-4 rounded-full font-bold text-lg"
            >
              <span id="checkout-button-text">{t(lang, 'home.selectPlan')}</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function VideoLibraryPage() {
  // VideosPage already renders the shared SiteHeader + BrandLogo (56×56).
  // Do not wrap with SiteNav — that caused a duplicate header/logo.
  return <VideosPage />;
}

function AnalyticsRouteListener() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <AnalyticsRouteListener />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/bilibili" element={<BilibiliOfferPage />} />
        <Route path="/bilibili-offer" element={<Navigate to="/bilibili" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/refunds" element={<AdminRefundsPage />} />
        <Route path="/admin/system-health" element={<AdminSystemHealthPage />} />
        <Route
          path="/account"
          element={
            <AuthGuard requireSubscription={false}>
              <AccountPage />
            </AuthGuard>
          }
        />
        <Route path="/register" element={<Navigate to="/login?mode=register" replace />} />
        <Route path="/signup" element={<Navigate to="/login?mode=register" replace />} />
        <Route
          path="/video-library"
          element={
            <AuthGuard requireSubscription>
              <VideoLibraryPage />
            </AuthGuard>
          }
        />
        <Route path="/resume-studio" element={<Navigate to="/studio" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AuthChrome>
            <AppRoutes />
          </AuthChrome>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
