import { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { trackPageView } from './lib/analytics.js';
import { ThemeProvider } from './theme/ThemeContext';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { AppLayout } from './components/Layout';
import LoginPage from './pages/Login';
import VideosPage from './pages/VideosPage';
import AccountPage from './pages/AccountPage';
import { useLang } from './i18n/LangContext';
import { t, tFormat } from './lib/i18n.js';
import {
  CANONICAL_STRIPE_PRICE_IDS,
  getExpectedCentsForPlan,
  getStripePaymentLinkForPlan,
} from './lib/plans.js';
import './styles/tokens.css';
import './v6-luxury.css';
import './app-shell.css';

/** Live Gen2 Cloud Run checkout endpoint (not a relative /api path). */
const CHECKOUT_BACKEND_URL = 'https://createcheckoutsession-lip26fm72a-uc.a.run.app';

const PLAN_ID_MAP: Record<string, string> = {
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
};

function HomePage() {
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const showPaywall = searchParams.get('paywall') === '1';
  const [selectedStripePriceId, setSelectedStripePriceId] = useState<string | null>(null);

  const handlePlanClick = (priceId: string) => {
    setSelectedStripePriceId(priceId);
    document.querySelectorAll('.pricing-plan').forEach((el) => el.classList.remove('active'));
    const activeElement = document.getElementById(`plan-${priceId}`);
    if (activeElement) activeElement.classList.add('active');
  };

  const displayPriceMap: Record<string, string> = {
    price_29: '$29',
    price_49: '$49',
    price_79: '$79',
    price_110: '$110',
  };

  const checkoutButtonText = selectedStripePriceId
    ? tFormat(lang, 'home.proceedPaymentWithPrice', {
        price: displayPriceMap[selectedStripePriceId],
      })
    : t(lang, 'home.selectPlan');

  const redirectToStripe = async () => {
    if (!selectedStripePriceId) {
      alert(t(lang, 'home.selectPlanFirst'));
      return;
    }
    console.log(
      'Sandbox checkout: if asked for a confirmation code, type `000000` to continue testing. Real emails/SMS apply in live mode.'
    );
    try {
      const planId = PLAN_ID_MAP[selectedStripePriceId];
      const priceId =
        CANONICAL_STRIPE_PRICE_IDS[planId as keyof typeof CANONICAL_STRIPE_PRICE_IDS] ||
        selectedStripePriceId;
      const expectedCents = getExpectedCentsForPlan(planId);
      const response = await fetch(CHECKOUT_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          planId,
          priceId,
          expectedCents,
          successUrl: `${window.location.origin}/?checkout=success&plan=${encodeURIComponent(planId)}`,
          cancelUrl: `${window.location.origin}/?checkout=canceled&plan=${encodeURIComponent(planId)}`,
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

  const homePlans = [
    { id: 'price_29', price: '$29', nameKey: 'plans.basic.name' },
    { id: 'price_49', price: '$49', nameKey: 'plans.pro.name' },
    { id: 'price_79', price: '$79', nameKey: 'plans.business.name' },
    { id: 'price_110', price: '$110', nameKey: 'plans.enterprise.name' },
  ] as const;

  return (
    <section className="v6-hero-panel flex flex-col items-center w-full px-4 py-16 mx-auto">
      {showPaywall ? (
        <p className="mb-6 text-sm text-center border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/10 px-4 py-3 rounded-lg max-w-xl">
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
        {homePlans.map((plan) => (
          <div
            key={plan.id}
            id={`plan-${plan.id}`}
            className="pricing-plan cursor-pointer border-2 border-gray-200/40 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 rounded-2xl p-6 text-center"
            onClick={() => handlePlanClick(plan.id)}
          >
            <h3 className="text-xl font-semibold mb-2 tracking-wide">{t(lang, plan.nameKey)}</h3>
            <p className="text-3xl font-bold text-[color:var(--color-gold)]">
              {plan.price}{' '}
              <span className="text-sm font-normal opacity-70">
                {t(lang, 'home.intervalOneTime')}
              </span>
            </p>
            <div className="mt-4 text-sm opacity-75 space-y-1">
              <p>{t(lang, 'home.featureStandard')}</p>
              <p>{t(lang, 'home.featurePriority')}</p>
              <p>{t(lang, 'home.featureAdvanced')}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <button
          id="checkout-button"
          onClick={redirectToStripe}
          className="v6-cta w-full px-10 py-4 rounded-full font-bold text-lg"
        >
          <span id="checkout-button-text">{checkoutButtonText}</span>
        </button>
      </div>
    </section>
  );
}

function AnalyticsRouteTracker() {
  const location = useLocation();
  const skipInitial = useRef(true);
  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false;
      return;
    }
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <AnalyticsRouteTracker />
      <Routes>
        <Route element={<AppLayout shell="v6" />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute requireSubscription={false}>
                <AccountPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/video-library"
            element={
              <ProtectedRoute requireSubscription>
                <VideosPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
